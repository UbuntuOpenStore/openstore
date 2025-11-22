import { test, describe, beforeEach, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { cleanMongoose, closeMongoose, waitForMongoose } from '../../tests/utils';
import factory from '../../tests/factory';
import * as api from '..';
import { type App } from 'supertest/types';

import { Discover } from '../../db/discover';

describe('Admin API - Discover Management', () => {
  const route = '/api/v4/admin/discover';
  let app: App;
  let adminApiKey: string;
  let regularApiKey: string;

  const testHighlights = [
    { id: 'test.app1', description: 'Test app 1' },
    { id: 'test.app2', description: 'Test app 2' },
  ];

  const testCategories = [
    { name: 'Test Category 1', tagline: 'Test tagline 1', referral: 'Games', ids: ['app1', 'app2'] },
    { name: 'Test Category 2', tagline: 'Test tagline 2', referral: '', ids: ['app3', 'app4'] },
  ];

  before(async () => {
    await waitForMongoose();
    app = api.setup();
  });

  after(async () => {
    await closeMongoose();
  });

  beforeEach(async () => {
    await cleanMongoose();

    // Create admin user
    const adminUser = await factory.user({ role: 'admin' });
    adminApiKey = adminUser.apikey;

    // Create regular user
    const regularUser = await factory.user({ role: 'community' });
    regularApiKey = regularUser.apikey;

    // Seed discover data
    await Discover.updateDiscoverData(testHighlights, testCategories);
  });

  describe('GET /api/v4/admin/discover', () => {
    test('returns discover data for admin users', async () => {
      const res = await request(app)
        .get(`${route}?apikey=${adminApiKey}`)
        .expect(200);

      assert.ok(res.body.success);
      assert.equal(res.body.data.highlights.length, 2);
      assert.equal(res.body.data.categories.length, 2);
    });

    test('returns 403 for non-admin users', async () => {
      const res = await request(app)
        .get(`${route}?apikey=${regularApiKey}`)
        .expect(403);

      assert.equal(res.body.success, false);
    });

    test('returns 401 for unauthenticated requests', async () => {
      await request(app)
        .get(route)
        .expect(401);
    });
  });

  describe('PUT /api/v4/admin/discover', () => {
    test('updates discover data for admin users', async () => {
      const newHighlights = [
        { id: 'new.app', description: 'New app' },
      ];
      const newCategories = [
        { name: 'New Category', tagline: 'New tagline', referral: '', ids: ['new1', 'new2'] },
      ];

      const res = await request(app)
        .put(`${route}?apikey=${adminApiKey}`)
        .send({ highlights: newHighlights, categories: newCategories })
        .expect(200);

      assert.ok(res.body.success);
      assert.equal(res.body.data.highlights.length, 1);
      assert.equal(res.body.data.categories.length, 1);
      assert.equal(res.body.data.highlights[0].id, 'new.app');
      assert.equal(res.body.data.categories[0].name, 'New Category');
    });

    test('returns 403 for non-admin users', async () => {
      const res = await request(app)
        .put(`${route}?apikey=${regularApiKey}`)
        .send({ highlights: [], categories: [] })
        .expect(403);

      assert.equal(res.body.success, false);
    });

    test('returns 400 for invalid highlights', async () => {
      const res = await request(app)
        .put(`${route}?apikey=${adminApiKey}`)
        .send({ highlights: 'invalid', categories: [] })
        .expect(400);

      assert.equal(res.body.success, false);
    });

    test('returns 400 for invalid categories', async () => {
      const res = await request(app)
        .put(`${route}?apikey=${adminApiKey}`)
        .send({ highlights: [], categories: 'invalid' })
        .expect(400);

      assert.equal(res.body.success, false);
    });

    test('returns 400 for missing highlight id', async () => {
      const res = await request(app)
        .put(`${route}?apikey=${adminApiKey}`)
        .send({ highlights: [{ description: 'No id' }], categories: [] })
        .expect(400);

      assert.equal(res.body.success, false);
    });

    test('returns 400 for missing category name', async () => {
      const res = await request(app)
        .put(`${route}?apikey=${adminApiKey}`)
        .send({ highlights: [], categories: [{ tagline: 'No name', ids: [] }] })
        .expect(400);

      assert.equal(res.body.success, false);
    });

    test('returns 400 for empty highlight id', async () => {
      const res = await request(app)
        .put(`${route}?apikey=${adminApiKey}`)
        .send({ highlights: [{ id: '', description: 'Empty id' }], categories: [] })
        .expect(400);

      assert.equal(res.body.success, false);
      assert.ok(res.body.message.includes('Highlight id cannot be empty'));
    });

    test('returns 400 for empty category ids array', async () => {
      const res = await request(app)
        .put(`${route}?apikey=${adminApiKey}`)
        .send({ highlights: [], categories: [{ name: 'Test', tagline: 'Test', ids: [] }] })
        .expect(400);

      assert.equal(res.body.success, false);
      assert.ok(res.body.message.includes('Category must have at least one id'));
    });

    test('returns 400 for empty highlights array', async () => {
      const res = await request(app)
        .put(`${route}?apikey=${adminApiKey}`)
        .send({ highlights: [], categories: testCategories })
        .expect(400);

      assert.equal(res.body.success, false);
      assert.ok(res.body.message.includes('Must have at least one highlight'));
    });

    test('returns 400 for empty categories array', async () => {
      const res = await request(app)
        .put(`${route}?apikey=${adminApiKey}`)
        .send({ highlights: testHighlights, categories: [] })
        .expect(400);

      assert.equal(res.body.success, false);
      assert.ok(res.body.message.includes('Must have at least one category'));
    });

    test('accepts category with default empty referral', async () => {
      const newHighlights = [{ id: 'test.app', description: 'Test app' }];
      const newCategories = [{ name: 'New Category', tagline: 'New tagline', ids: ['app1'] }];

      const res = await request(app)
        .put(`${route}?apikey=${adminApiKey}`)
        .send({ highlights: newHighlights, categories: newCategories })
        .expect(200);

      assert.ok(res.body.success);
      assert.equal(res.body.data.categories[0].referral, '');
    });
  });
});
