// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'fs/promises';
import assert from 'node:assert/strict';
import { test, describe, beforeEach, before, after } from 'node:test';
import path from 'path';

import request from 'supertest';
import { type App } from 'supertest/types';

import * as api from '.';
import { Discover } from '../db/discover';
import { Package } from '../db/package';
import {
  Architecture,
  Channel,
  ChannelArchitecture,
  AppType,
  PackageType,
  SnapChannel,
  SnapConfinement,
  SourceStore,
} from '../db/package/types';
import { RatingCount } from '../db/rating_count';
import factory from '../tests/factory';
import { cleanMongoose, closeMongoose, waitForMongoose } from '../tests/utils';
import { config } from '../utils/config';

function discoverAppIds(res: request.Response): string[] {
  const categories: Array<{ apps: Array<{ id: string }> }> = res.body.data.categories;
  return categories.flatMap((category) => category.apps.map((app) => app.id));
}

describe('Discover API', () => {
  const route = '/api/v4/discover/';
  const v5Route = '/api/v5/discover/';
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
    assert.equal(mockFn.mock.callCount(), 3);
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
      snap_data: { channels: [SnapChannel.STABLE], confinement: SnapConfinement.STRICT, base: 'core22' },
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

  test('v5 includes snap packages when package_types=snap is requested', async () => {
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
      snap_data: { channels: [SnapChannel.STABLE], confinement: SnapConfinement.STRICT, base: 'core22' },
      banner: 'test.svg',
    });

    const snapRoute = `${v5Route}?package_types=${PackageType.SNAP}`;
    const res = await request(app).get(snapRoute).expect(200);

    assert.ok(res.body.success);

    const appIds = discoverAppIds(res);
    assert.ok(appIds.includes('snap.firefox'));
    assert.ok(!appIds.includes('test.app.2')); // click packages are filtered out

    // Cache hit must keep the snap scoped payload
    const res2 = await request(app).get(snapRoute).expect(200);
    assert.ok(discoverAppIds(res2).includes('snap.firefox'));
  });

  test('v5 only selects categories that have apps for the requested package type', async (t) => {
    const snapPackage = {
      published: true,
      architectures: [Architecture.ALL],
      channels: [Channel.FOCAL],
      channel_architectures: [ChannelArchitecture.FOCAL_ALL],
      device_compatibilities: [`${ChannelArchitecture.FOCAL_ALL}:ubuntu-sdk-20.04`],
      published_date: new Date().toISOString(),
      types: [AppType.APP],
      package_type: PackageType.SNAP,
      source_store: SourceStore.SNAPCRAFT,
      snap_data: { channels: [SnapChannel.STABLE], confinement: SnapConfinement.STRICT, base: 'core22' },
      banner: 'test.svg',
    };
    const clickPackage = {
      ...snapPackage,
      package_type: PackageType.CLICK,
      source_store: undefined,
      snap_data: undefined,
    };

    await Promise.all([
      factory.package({ ...snapPackage, id: 'snap.available' }),
      factory.package({ ...clickPackage, id: 'click.only.1' }),
      factory.package({ ...clickPackage, id: 'click.only.2' }),
      factory.package({ ...clickPackage, id: 'click.only.3' }),
    ]);

    await Discover.updateDiscoverData(
      [],
      [
        { name: 'Snap Category', tagline: 'Snap apps', referral: 'SnapCategory', ids: ['snap.available'] },
        { name: 'Click Category 1', tagline: 'Click apps', referral: 'ClickCategory1', ids: ['click.only.1'] },
        { name: 'Click Category 2', tagline: 'Click apps', referral: 'ClickCategory2', ids: ['click.only.2'] },
        { name: 'Click Category 3', tagline: 'Click apps', referral: 'ClickCategory3', ids: ['click.only.3'] },
      ],
    );

    // Make the category shuffle deterministic: with this RNG the first category
    // is the one left out when only three of the four categories are picked.
    t.mock.method(Math, 'random', () => 0);

    const res = await request(app).get(`${v5Route}?package_types=${PackageType.SNAP}`).expect(200);

    const categoryNames = res.body.data.categories.map((category: { name: string }) => category.name);
    assert.ok(categoryNames.includes('Snap Category'));
    assert.ok(!categoryNames.includes('Click Category 1'));
  });

  test('v5 returns the minimal payload', async () => {
    const res = await request(app).get(v5Route).expect(200);

    assert.ok(res.body.success);
    assert.equal(res.body.data.highlight, undefined);
    assert.ok(res.body.data.highlights.length > 0);
    assert.ok(res.body.data.categories.length > 0);

    const slimKeys = ['icon', 'id', 'name', 'package_type', 'published_date', 'ratings', 'tagline', 'types'].sort();

    for (const category of res.body.data.categories) {
      assert.deepEqual(Object.keys(category).sort(), ['apps', 'name', 'referral', 'tagline']);
      for (const app of category.apps) {
        assert.deepEqual(Object.keys(app).sort(), slimKeys);
        assert.equal(app.manifest, undefined);
        assert.equal(app.downloads, undefined);
        assert.equal(app.version_changelogs, undefined);
      }
    }

    for (const highlight of res.body.data.highlights) {
      assert.deepEqual(Object.keys(highlight).sort(), ['app', 'description', 'id', 'image', 'publisher']);
      assert.equal(highlight.id, 'test.highlight.app');
      assert.ok(highlight.image);
      assert.equal(typeof highlight.publisher, 'string');
      assert.deepEqual(Object.keys(highlight.app).sort(), slimKeys);
    }
  });

  test('v4 and v5 caches are isolated', async () => {
    const v4res = await request(app).get(route).expect(200);
    const v5res = await request(app).get(v5Route).expect(200);

    assert.ok(v4res.body.data.highlight);
    assert.ok(v4res.body.data.categories[0].ids);
    assert.equal(v5res.body.data.highlight, undefined);
    assert.equal(v5res.body.data.categories[0].ids, undefined);

    // Second round trips: both are now cache hits and must keep their own shapes
    const v4res2 = await request(app).get(route).expect(200);
    const v5res2 = await request(app).get(v5Route).expect(200);
    assert.ok(v4res2.body.data.highlight);
    assert.equal(v5res2.body.data.highlight, undefined);
  });
});
