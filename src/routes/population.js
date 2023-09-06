'use strict';
import managerFactory from '#src/components/population-manager.js';
import cluster from 'cluster';

/**
 * Load initial data into the population manager
 */
async function hydatePopulation() {
  const manager = await managerFactory();

  if (cluster.isPrimary) {
    console.log('Loading from local storage.');
    // First, load from persistant storage
    await manager.loadFromStorage();

    // Secondly, if a path to CSV is provided load that data
    // Data from disk is taken as a source of truth over persistent data.
    if (process.env.POPULATION_DATA_PATH) {
      console.log(`Loading CSV from ${process.env.POPULATION_DATA_PATH}.`);
      await manager.loadCsv(process.env.POPULATION_DATA_PATH);
    } else {
      console.log('Skipping CSV load since POPULATION_DATA_PATH was not provided.');
    }
  }
}

/**
 * Population API Routes
 * @param {*} fastify
 * @param {*} _
 */
async function routes(fastify, _) {
  const manager = await managerFactory();

  fastify.get('/api/population/state/:state/city/:city', async function(request, reply, _) {
    const {state, city} = request.params;
    const population = await manager.get(city, state);

    if (population === undefined) {
      reply.code(400);
      return {error: `${city}, ${state} could not be found.`};
    }

    reply.code(200);
    return {population};
  });

  fastify.put('/api/population/state/:state/city/:city', async function(request, reply, opts) {
    const {state, city} = request.params;
    const populationString = request.body;
    const population = parseInt(populationString);

    if (population === undefined) {
      return reply.code(400).send({error: `Could not parse request body "${request.body.raw}" as an Integer.`});
    }

    const exists = await manager.get(city, state) !== undefined;
    await manager.set(city, state, population);

    const code = exists ? 200 : 201;
    return reply.code(code).send();
  });
}

export default routes;
export {hydatePopulation};
