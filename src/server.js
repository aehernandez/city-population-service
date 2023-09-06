'use strict';
import Fastify from 'fastify';
import cluster from 'cluster';
import populationRoute, {hydatePopulation} from '#src/routes/population.js';

// Parse required environment configuration options

const numWorkers = parseInt(process.env.FASTIFY_CLUSTER_WORKERS ?? 1);
if (numWorkers === undefined) {
  console.error(`Could not parse FASTIFY_CLUSTER_WORKERS value ${process.env.FASTIFY_CLUSTER_WORKERS}`);
  process.exit(1);
}

const port = parseInt(process.env.FASTIFY_PORT ?? 5555);
if (port === undefined) {
  console.error(`Could not parse FASTIFY_PORT value ${process.env.FASTIFY_PORT}`);
  process.exit(1);
}

if (cluster.isPrimary) {
  console.log(`Running ${numWorkers} workers on port ${port}.`);

  await hydatePopulation();

  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  cluster.on(
      'exit',
      (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died with code ${code}`);
      },
  );
} else {
  // eslint-disable-next-line new-cap
  const fastify = Fastify({logger: false});

  fastify.register(populationRoute);

  fastify.listen({port}, function(err, _) {
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    }
  });

  console.log(`Worker ${cluster.worker.id} ready.`);
}
