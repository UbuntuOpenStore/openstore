// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test, describe, beforeEach, after } from 'node:test';

import '../db';
import { Architecture, AppType, ChannelArchitecture, DEFAULT_CHANNEL, type HydratedPackage, PackageType } from '../db/package/types';
import factory from '../tests/factory';
import { cleanMongoose, closeMongoose, waitForMongoose } from '../tests/utils';
import { getCategoryApps, getNewAndUpdatedApps } from './discover-helpers';

describe('discover helpers', () => {
  after(async () => {
    await closeMongoose();
  });

  describe('getNewAndUpdatedApps', () => {
    beforeEach(async () => {
      await waitForMongoose();
      await cleanMongoose();
    });

    const discoverableApp = (data: { id: string; published_date: string; updated_date: string }) =>
      factory.package({
        published: true,
        types: [AppType.APP],
        channel_architectures: [ChannelArchitecture.FOCAL_ALL],
        ...data,
      });

    const iso = (day: string, hour: number, minute = 0) =>
      `2026-11-${day}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00.000Z`;

    const fillCategories = async () => {
      const categories = [
        { name: 'New Apps', apps: [] as string[] },
        { name: 'Updated Apps', apps: [] as string[] },
      ];

      await getNewAndUpdatedApps(categories, DEFAULT_CHANNEL, Architecture.ARM64, [], [PackageType.CLICK], (app) => app.id);

      return {
        newApps: categories.find(({ name }) => name === 'New Apps')!.apps,
        updatedApps: categories.find(({ name }) => name === 'Updated Apps')!.apps,
      };
    };

    test('fills the New Apps category with apps ordered by most recently published', async () => {
      await Promise.all([
        discoverableApp({ id: 'app.newest', published_date: iso('11', 10), updated_date: iso('11', 10) }),
        discoverableApp({ id: 'app.newer', published_date: iso('10', 10), updated_date: iso('10', 10) }),
        discoverableApp({ id: 'app.oldest', published_date: '2020-01-01T00:00:00.000Z', updated_date: iso('11', 9) }),
      ]);

      const { newApps } = await fillCategories();

      assert.deepEqual(newApps, ['app.newest', 'app.newer', 'app.oldest']);
    });

    test('fills the Updated Apps category with recently updated apps that are not shown in New Apps', async () => {
      await Promise.all([
        // Twelve apps published today, one per hour, none updated since
        // publishing
        ...Array.from({ length: 12 }, (_, index) =>
          discoverableApp({
            id: `app.new${(12 - index).toString().padStart(2, '0')}`,
            published_date: iso('11', 12 - index),
            updated_date: iso('11', 12 - index),
          }),
        ),
        // A thirteenth app published at 06:00 that also received an update
        // afterwards, making it the most recently updated app overall while
        // still belonging to New Apps
        discoverableApp({ id: 'app.published-and-updated', published_date: iso('11', 6), updated_date: iso('11', 12, 30) }),
        discoverableApp({ id: 'app.updated', published_date: '2020-01-01T00:00:00.000Z', updated_date: iso('10', 0) }),
        discoverableApp({ id: 'app.updated.less', published_date: '2019-01-01T00:00:00.000Z', updated_date: iso('09', 0) }),
        discoverableApp({ id: 'app.never-updated', published_date: '2018-01-01T00:00:00.000Z', updated_date: '2018-01-01T00:00:00.000Z' }),
      ]);

      const { newApps, updatedApps } = await fillCategories();

      assert.deepEqual(updatedApps, ['app.updated', 'app.updated.less']);
      assert.ok(
        newApps.every((id) => !updatedApps.includes(id)),
        'expected no app to appear in both categories',
      );
    });

    test('caps each category at eight apps', async () => {
      await Promise.all([
        // Fifteen apps published on the 11th, one per hour
        ...Array.from({ length: 15 }, (_, index) =>
          discoverableApp({
            id: `app.new.${(15 - index).toString().padStart(2, '0')}`,
            published_date: iso('11', 15 - index),
            updated_date: iso('11', 15 - index),
          }),
        ),
        // Twelve apps published long ago and updated on the 12th, one per
        // hour, which is more recent than any of the publishes above
        ...Array.from({ length: 12 }, (_, index) =>
          discoverableApp({
            id: `app.updated.${(13 - index).toString().padStart(2, '0')}`,
            published_date: '2015-01-01T00:00:00.000Z',
            updated_date: iso('12', 13 - index),
          }),
        ),
      ]);

      const { newApps, updatedApps } = await fillCategories();

      assert.equal(newApps.length, 8);
      assert.equal(newApps[0], 'app.new.15');
      assert.equal(updatedApps.length, 8);
      assert.equal(updatedApps[0], 'app.updated.13');
      assert.ok(
        newApps.every((id) => !updatedApps.includes(id)),
        'expected no app to appear in both categories',
      );
    });

    test('fills the static categories created by getCategoryApps', async () => {
      // Eleven apps published today fill the New Apps category so that the
      // older app below does not fit into it
      await Promise.all([
        ...Array.from({ length: 11 }, (_, index) =>
          discoverableApp({
            id: `app.published.${(11 - index).toString().padStart(2, '0')}`,
            published_date: iso('11', 11 - index),
            updated_date: iso('11', 11 - index),
          }),
        ),
        discoverableApp({ id: 'app.updated', published_date: '2020-01-01T00:00:00.000Z', updated_date: iso('12', 10) }),
      ]);

      const serializeApp = (app: HydratedPackage) => app.id;
      const categories = await getCategoryApps([], DEFAULT_CHANNEL, Architecture.ARM64, [], [PackageType.CLICK], serializeApp);
      await getNewAndUpdatedApps(categories, DEFAULT_CHANNEL, Architecture.ARM64, [], [PackageType.CLICK], serializeApp);

      assert.deepEqual(
        categories.map(({ name, tagline }) => ({ name, tagline })),
        [
          { name: 'New Apps', tagline: 'Exciting new apps' },
          { name: 'Updated Apps', tagline: 'Apps with recent updates' },
          { name: 'Most Loved', tagline: 'Apps with the highest ratings' },
        ],
      );
      assert.deepEqual(
        categories.map(({ apps }) => apps),
        [
          [
            'app.published.11',
            'app.published.10',
            'app.published.09',
            'app.published.08',
            'app.published.07',
            'app.published.06',
            'app.published.05',
            'app.published.04',
          ],
          ['app.updated'],
          [],
        ],
      );
    });
  });
});
