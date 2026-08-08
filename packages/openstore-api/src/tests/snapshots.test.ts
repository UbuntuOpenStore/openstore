import assert from 'node:assert/strict';
import { test, describe, before, after } from 'node:test';

import axios from 'axios';
import request from 'supertest';
import { type App } from 'supertest/types';

import * as api from '../api';
import { closeMongoose, waitForMongoose } from './utils';

describe('Snapshots', () => {
  let app: App;

  const testRoute = async function (route: string) {
    const localRes = await request(app).get(route).expect(200);
    const prodRes = await axios.get(`https://open-store.io${route}`);

    assert.deepEqual(localRes.body, prodRes.data);
  };

  before(async () => {
    await waitForMongoose();

    app = api.setup();
  });

  after(async () => {
    await closeMongoose();
  });

  if (process.env.SNAPSHOT_TEST === 'true') {
    describe('apps', () => {
      test('app list query matches with prod', async () => {
        await testRoute('/api/v4/apps?limit=30&skip=0&sort=-published_date');
      });

      test('fullcircle app matches with prod', async () => {
        await testRoute('/api/v4/apps/fullcircle.bhdouglass?channel=xenia');
      });

      test('fullcircle reviews matches with prod', async () => {
        await testRoute('/api/v4/apps/fullcircle.bhdouglass/reviews');
      });

      test('gmail webapp matches with prod', async () => {
        await testRoute('/api/v4/apps/googlemail.josele13?channel=xenia');
      });

      test('gmail reviews matches with prod', async () => {
        await testRoute('/api/v4/apps/googlemail.josele13/reviews');
      });

      // This fails due to the randomized nature of the discover endpoint.
      // TODO maybe make a parameter to return the non-randomized data?
      /*
      test('discover matches with prod', async () => {
        await testRoute('/api/v4/discover');
      });
      */

      test('categories matches with prod', async () => {
        await testRoute('/api/v4/categories');
      });

      // TODO test revisions api
    });
  }
});
