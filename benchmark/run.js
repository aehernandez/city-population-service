'use strict';
/* eslint-disable require-jsdoc */
/**
 * Benchmark the local server by load testing it with bulk connections.
 *
 * We use a small set of real data to simulate users generating GET and PUT
 * requests. The small set of random data is randomly but deterministically
 * chosen so subsequant tests are identical.
 *
 * Please note, the result of the test will vary based on the machine the
 * benchmark is being run on.
 */

import autocannon from 'autocannon';
import seedrandom from 'seedrandom';
import * as fs from 'node:fs/promises';
import csv from 'csv-parser';

const port = 5555;

// Load static data
const file = await fs.open('static/city_populations.csv', 'r');
const populationData = await new Promise((resolve, reject) => {
  const result = [];
  file.createReadStream()
      .pipe(csv(['city', 'state', 'population']))
      .on('data', (data) => {
        const {city, state, population} = data;
        const populationValue = parseInt(population);

        if (isNaN(populationValue)) {
          console.warn(`CSV Parsing: On parsed line "${city}, ${state}, ${population}" expected last value to be an integer. Skipping line.`);
          return;
        }

        result.push({state, city, population});
      })
      .on('end', () => resolve(result))
      .on('error', (error) => reject(error));
});

// Seed our deterministic random number generator
const random = seedrandom('benchmark');
function seededRandomInt(from, to) {
  return Math.floor(random() * (to - from)) + from;
}

function getRandomSampleData() {
  const index = seededRandomInt(0, 24);
  return populationData[index];
}

const instance = autocannon({
  url: `http://localhost:${port}`,
  connections: 100,
  requests: [
    {
      method: 'GET', // POST for creating a product
      setupRequest: (req, context) => {
        const {state, city, population} = getRandomSampleData();

        context.state = state;
        context.city = city;
        context.population = population;

        req.path = `/api/population/state/${state}/city/${city}`.replace(' ', '%20');
        return req;
      },
      onResponse: (status, body, context) => {
        if (!JSON.stringify(status).startsWith('2') && status != 400) {
          console.error(`ERROR: Received code ${status} with body ${body}. Failing early.`);
          process.exit(1);
        }
      },
    },
    {
      method: 'PUT',
      setupRequest: (req, context) => {
        const {state, city, population} = context;
        req.path = `/api/population/state/${state}/city/${city}`.replace(' ', '%20');
        req.headers['Content-Type'] = 'application/json';
        req.body = JSON.stringify(population);
        return req;
      },
      onResponse: (status, body, context) => {
        if (!JSON.stringify(status).startsWith('2')) {
          console.error(`ERROR: Received code ${status} with body ${body}. Failing early.`);
          process.exit(1);
        }
      },
    },
  ],
}, console.log);

process.once('SIGINT', () => {
  instance.stop();
});

// render the results
autocannon.track(instance, {renderProgressBar: true});
