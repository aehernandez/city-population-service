'use strict';
import csv from 'csv-parser';
import * as fs from 'node:fs/promises';
import sharedMemoryController from 'cluster-shared-memory';
import storage from 'node-persist';

await storage.init({
  dir: process.env.POPULATION_PERSIST_DIR ?? '.persist-population',
  logging: false,
});

/**
 * Convert city, state values into an internal key
 * @param {string} state
 * @param {string} city
 * @return {string} value
 */
function toKey(state, city) {
  return JSON.stringify([state.toLowerCase(), city.toLowerCase()]);
}

/**
 * Load a CSV and return mapped population values
 * @param {string} path to the CSV file
 * @return {Object} a mapping of (state,city) keys to population values
 */
async function loadCsv(path) {
  const file = await fs.open(path, 'r');

  const result = {};

  await new Promise((resolve, reject) =>
    file.createReadStream()
        .pipe(csv(['city', 'state', 'population']))
        .on('data', (data) => {
          const {city, state, population} = data;
          const populationValue = parseInt(population);

          if (isNaN(populationValue)) {
            console.warn(`CSV Parsing: On parsed line "${city}, ${state}, ${population}" expected last value to be an integer. Skipping line.`);
            return;
          }

          result[toKey(state, city)] = populationValue;
        })
        .on('end', () => resolve())
        .on('error', (error) => reject(error)),
  );

  return result;
}

/**
 * PopulationManager factory acts as the interface layer between cached memory
 * and storage. Use populationManagerFactory to obtain instances of this class.
 */
class PopulationManager {
  /**
   * @constructs
   */
  constructor() {
    this.memory_ = sharedMemoryController;
    this.storage_ = storage;
  }

  /**
   * Get population value
   * @param {string} city
   * @param {string} state
   * @return {number|undefined}
   */
  async get(city, state) {
    const key = toKey(state, city);
    return await this.memory_.get(key);
  }

  /**
   * Set population valuue
   * @param {string} city
   * @param {string} state
   * @param {number} population
   */
  async set(city, state, population) {
    const key = toKey(state, city);
    this.set_(key, population);
  }

  /**
   * Load CSV data into persistant and cached storage.
   * @param {string} path to CSV
   */
  async loadCsv(path) {
    const result = await loadCsv(path);
    for (const [key, value] of Object.entries(result)) {
      this.set_(key, value);
    }
  }

  /**
   * Eagerly load all data from persistent storage.
   * While this loads to a longer start-up time, the cost of reading from
   * disk is done at start-up rather than while servicing a client request
   */
  async loadFromStorage() {
    const keys = await this.storage_.keys();
    for (const key of keys) {
      const population = await this.storage_.getItem(key);
      await this.memory_.set(key, population);
    }
  }

  /**
   * Remove all cached and persistent data from the manager.
   */
  async clear() {
    const keys = await this.storage_.keys();
    for (const key of keys) {
      await this.memory_.remove(key);
    }
    await this.storage_.clear();
  }

  /**
   * Internal population setter
   * @param {string} key
   * @param {number} population
   */
  async set_(key, population) {
    await this.memory_.set(key, population);

    // Wait for the new key to be set, this is a background process
    await this.memory_.mutex(key, async () => {
      await this.storage_.setItem(key, population);
    });
  }
}

/**
 * Call the function anywhere to obtain a valid Population Manager.
 * @return {PopulationManager}
 */
async function populationManagerFactory() {
  return new PopulationManager();
}

export default populationManagerFactory;
