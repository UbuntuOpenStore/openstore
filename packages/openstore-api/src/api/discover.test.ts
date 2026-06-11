import fs from 'fs/promises';
import assert from 'node:assert/strict';
import { test, describe, beforeEach, before, after } from 'node:test';
import path from 'path';

import request from 'supertest';
import { type App } from 'supertest/types';

import * as api from '.';
import { Discover } from '../db/discover';
import { Package } from '../db/package';
import { Architecture, Channel, ChannelArchitecture, AppType, PackageType, SourceStore } from '../db/package/types';
import { RatingCount } from '../db/rating_count';
import factory from '../tests/factory';
import { cleanMongoose, closeMongoose, waitForMongoose } from '../tests/utils';
import { config } from '../utils/config';

describe('Discover API', () => {
  const route = '/api/v3/discover/';
  let app: App;

  before(async () => {
    await waitForMongoose();

    app = api.setup();
  });

  after(async () => {
    await closeMongoose();
  });

  beforeEach(async () => {
    await cleanMongoose();

    // Clean up cache files
    const cacheDir = path.join(config.cache_dir, 'discover');
    try {
      const files = await fs.readdir(cacheDir);
      await Promise.all(files.map((file) => fs.unlink(path.join(cacheDir, file))));
    } catch {
      // Don't worry about errors
    }

    // Test data for discover
    const testHighlights = [
      {
        id: 'test.highlight.app',
        description: 'A test highlight app',
      },
    ];

    const testCategories = [
      {
        name: 'Test Category 1',
        tagline: 'Test tagline 1',
        referral: 'TestCategory1',
        ids: ['test.app.1'],
      },
      {
        name: 'Test Category 2',
        tagline: 'Test tagline 2',
        referral: 'TestCategory2',
        ids: ['test.app.2', 'test.app.3', 'test.app.4'],
      },
    ];

    // Seed database with discover data
    await Discover.updateDiscoverData(testHighlights, testCategories);

    await Promise.all([
      factory.package({
        published: true,
        id: 'test.highlight.app',
        architectures: [Architecture.ALL],
        channels: [Channel.FOCAL],
        channel_architectures: [ChannelArchitecture.FOCAL_ALL],
        device_compatibilities: [`${ChannelArchitecture.FOCAL_ALL}:ubuntu-sdk-20.04`],
        published_date: new Date().toISOString(),
        types: [AppType.APP],
        banner: 'test.svg',
      }),
      factory.package({
        published: true,
        id: 'test.app.2',
        architectures: [Architecture.ALL],
        channels: [Channel.FOCAL],
        channel_architectures: [ChannelArchitecture.FOCAL_ALL],
        device_compatibilities: [`${ChannelArchitecture.FOCAL_ALL}:ubuntu-sdk-20.04`],
        published_date: '2021-01-01T13:35:16.095Z',
        updated_date: '2021-01-01T13:35:16.095Z',
        types: [AppType.APP],
        banner: 'test.svg',
      }),
      factory.package({
        published: true,
        id: 'test.app.3',
        architectures: [Architecture.ALL],
        channels: [Channel.FOCAL],
        channel_architectures: [ChannelArchitecture.FOCAL_ALL],
        device_compatibilities: [`${ChannelArchitecture.FOCAL_ALL}:ubuntu-sdk-16.04`],
        published_date: '2021-01-01T13:35:16.095Z',
        updated_date: '2021-01-01T13:35:16.095Z',
        types: [AppType.APP],
        banner: 'test.svg',
      }),
      factory.package({
        published: true,
        id: 'test.app.4',
        architectures: [Architecture.ALL],
        channels: [Channel.FOCAL],
        channel_architectures: [ChannelArchitecture.FOCAL_ALL],
        device_compatibilities: [`${ChannelArchitecture.FOCAL_ALL}:ubuntu-sdk-16.04`],
        published_date: new Date().toISOString(),
        types: [AppType.APP],
        banner: 'test.svg',
      }),
    ]);
  });

  test('returns a nice error', async (t) => {
    const mockFn = t.mock.method(Package, 'findByFilters', () => {
      throw new Error();
    });

    const res = await request(app).get(route).expect(500);
    assert.equal(res.body.success, false);
    assert.equal(mockFn.mock.callCount(), 1);
  });

  test('returns data', async (t) => {
    const getCountsByIdsSpy = t.mock.method(RatingCount, 'getCountsByIds');

    const res = await request(app).get(route).expect(200);

    assert.ok(res.body.success);
    assert.ok(res.body.data.highlight);
    assert.ok(res.body.data.highlights.length > 0);
    assert.ok(res.body.data.categories.length > 0);
    assert.equal(res.body.data.categories[0].ids.length, 4); // Category 0 is the new/updated apps

    assert.equal(getCountsByIdsSpy.mock.callCount(), 0);

    // Cache hit
    const res2 = await request(app).get(route).expect(200);

    assert.ok(res2.body.success);
    assert.ok(res2.body.data.highlight);
    assert.ok(res2.body.data.highlights.length > 0);
    assert.ok(res2.body.data.categories.length > 0);
    assert.equal(res.body.data.categories[0].ids.length, 4); // Category 0 is the new/updated apps

    // Verify that ratings get refreshed on a cache hit
    assert.equal(getCountsByIdsSpy.mock.callCount(), 1);
  });

  test('returns data for the latest supported framework', async (t) => {
    const getCountsByIdsSpy = t.mock.method(RatingCount, 'getCountsByIds');

    const frameworkRoute = `${route}?channel=${Channel.FOCAL}&architecture=${Architecture.ARM64}&frameworks=ubuntu-sdk-16.04`;
    const res = await request(app).get(frameworkRoute).expect(200);

    assert.ok(res.body.success);
    assert.equal(res.body.data.categories[0].ids.length, 2); // Category 0 is the new/updated apps

    assert.equal(getCountsByIdsSpy.mock.callCount(), 0);

    // Cache hit
    const res2 = await request(app).get(frameworkRoute).expect(200);

    assert.ok(res2.body.success);
    assert.equal(res.body.data.categories[0].ids.length, 2); // Category 0 is the new/updated apps

    // Verify that ratings get refreshed on a cache hit
    assert.equal(getCountsByIdsSpy.mock.callCount(), 1);
  });

  test('returns data for the multiple supported framework', async (t) => {
    const getCountsByIdsSpy = t.mock.method(RatingCount, 'getCountsByIds');

    const frameworkRoute = `${route}?channel=${Channel.FOCAL}&architecture=${Architecture.ARM64}&frameworks=ubuntu-sdk-16.04,ubuntu-sdk-20.04`;
    const res = await request(app).get(frameworkRoute).expect(200);

    assert.ok(res.body.success);
    assert.equal(res.body.data.categories[0].ids.length, 4); // Category 0 is the new/updated apps

    assert.equal(getCountsByIdsSpy.mock.callCount(), 0);

    // Cache hit
    const res2 = await request(app).get(frameworkRoute).expect(200);

    assert.ok(res2.body.success);
    assert.equal(res.body.data.categories[0].ids.length, 4); // Category 0 is the new/updated apps

    // Verify that ratings get refreshed on a cache hit
    assert.equal(getCountsByIdsSpy.mock.callCount(), 1);
  });

  test('excludes snap packages from discover', async () => {
    await factory.package({
      published: true,
      id: 'snap.firefox',
      name: 'Firefox Snap',
      architectures: [Architecture.ALL],
      channels: [Channel.FOCAL],
      channel_architectures: [ChannelArchitecture.FOCAL_ALL],
      device_compatibilities: [`${ChannelArchitecture.FOCAL_ALL}:ubuntu-sdk-20.04`],
      published_date: new Date().toISOString(),
      types: [AppType.APP],
      package_type: PackageType.SNAP,
      source_store: SourceStore.SNAPCRAFT,
      banner: 'test.svg',
    });

    const res = await request(app).get(route).expect(200);

    assert.ok(res.body.success);

    for (const category of res.body.data.categories) {
      for (const app of category.apps) {
        assert.notEqual(app.id, 'snap.firefox');
      }
    }

    for (const highlight of res.body.data.highlights) {
      assert.notEqual(highlight.app.id, 'snap.firefox');
    }
  });
});
