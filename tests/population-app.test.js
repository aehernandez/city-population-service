/* eslint-disable require-jsdoc */
/* eslint-disable new-cap */

'use strict';
import Fastify from 'fastify';
import populationRoute from '#src/routes/population.js';
import populationManagerFactory from '#src/components/population-manager.js';

const manager = await populationManagerFactory();

afterEach(() => {
  return manager.clear();
});

function build() {
  const fastify = Fastify({logger: false});
  fastify.register(populationRoute);
  return fastify;
}

it('tests GET on missing city', async () => {
  const app = build();

  const state = 'alabama';
  const city = 'huntsville';
  const response = await app.inject({
    method: 'GET',
    url: `/api/population/state/${state}/city/${city}`,
  });
  expect(response.statusCode).toBe(400);
});

it('tests adding new city', async () => {
  const app = build();

  const state = 'alabama';
  const city = 'huntsville';
  const population = 100;

  let response = await app.inject({
    method: 'PUT',
    url: `/api/population/state/${state}/city/${city}`,
    body: population,
  });

  expect(response.statusCode).toBe(201);

  response = await app.inject({
    method: 'GET',
    url: `/api/population/state/${state}/city/${city}`,
  });

  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.body)).toMatchObject({population});
});

it('tests adding existing city', async () => {
  const app = build();

  const state = 'alabama';
  const city = 'huntsville';

  let response = await app.inject({
    method: 'PUT',
    url: `/api/population/state/${state}/city/${city}`,
    body: 100,
  });

  expect(response.statusCode).toBe(201);

  response = await app.inject({
    method: 'PUT',
    url: `/api/population/state/${state}/city/${city}`,
    body: 200,
  });

  expect(response.statusCode).toBe(200);

  response = await app.inject({
    method: 'GET',
    url: `/api/population/state/${state}/city/${city}`,
  });

  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.body)).toMatchObject({population: 200});
});
