import assert from 'node:assert/strict';
import { test, describe, beforeEach, before, after } from 'node:test';

import factory from '../../tests/factory';
import '../index';
import { cleanMongoose, closeMongoose, waitForMongoose } from '../../tests/utils';
import { PackageSearch } from './search-meilisearch';
import {
  AppType,
  Architecture,
  Channel,
  ChannelArchitecture,
  PackageType,
  SnapChannel,
  SnapConfinement,
  type HydratedPackage,
} from './types';

describe('PackageSearch.convert', () => {
  const search = new PackageSearch();

  before(async () => {
    await waitForMongoose();
  });

  after(async () => {
    await closeMongoose();
  });

  beforeEach(async () => {
    await cleanMongoose();
  });

  test('copies all PROPERTIES from the package', async () => {
    const pkg = await factory.package({
      id: 'com.example.app',
      name: 'Test App',
      architectures: [Architecture.ARMHF, Architecture.ARM64],
      author: 'Test Author',
      category: 'Games & Fun',
      channels: [Channel.FOCAL],
      channel_architectures: [ChannelArchitecture.FOCAL_ARMHF, ChannelArchitecture.FOCAL_ARM64],
      device_compatibilities: ['focal:armhf:ubuntu-sdk-20.04'],
      description: 'A test app',
      icon: 'icon.png',
      keywords: ['test', 'EXAMPLE'],
      license: 'GNU GPL v3',
      nsfw: false,
      published_date: '2024-01-01',
      tagline: 'A tagline',
      types: [AppType.APP],
      updated_date: '2024-06-01',
      calculated_rating: 50,
      package_type: PackageType.CLICK,
    });
    const doc = search.convert(pkg as HydratedPackage);

    assert.equal(doc.id, 'com___example___app');
    assert.equal(doc.name, 'Test App');
    assert.deepEqual(doc.architectures, [Architecture.ARMHF, Architecture.ARM64]);
    assert.equal(doc.author, 'Test Author');
    assert.deepEqual(doc.channels, [Channel.FOCAL]);
    assert.deepEqual(doc.channel_architectures, [ChannelArchitecture.FOCAL_ARMHF, ChannelArchitecture.FOCAL_ARM64]);
    assert.deepEqual(doc.device_compatibilities, ['focal:armhf:ubuntu-sdk-20.04']);
    assert.equal(doc.description, 'A test app');
    assert.equal(doc.icon, 'icon.png');
    assert.equal(doc.license, 'GNU GPL v3');
    assert.equal(doc.published_date, '2024-01-01');
    assert.equal(doc.tagline, 'A tagline');
    assert.deepEqual(doc.types, [AppType.APP]);
    assert.equal(doc.updated_date, '2024-06-01');
    assert.equal(doc.calculated_rating, 50);
    assert.equal(doc.package_type, PackageType.CLICK);
    assert.equal(doc.originalId, 'com.example.app');
    assert.equal(doc.search_name, 'Test App');
    assert.deepEqual(doc.snap_data_channels, []);
    assert.equal(doc.category, 'games___fun');
  });

  test('extracts snap_data_channels from snap_data', async () => {
    const doc = search.convert(
      (await factory.package({
        id: 'test.app',
        name: 'Test',
        snap_data: { channels: [SnapChannel.STABLE, SnapChannel.EDGE], confinement: SnapConfinement.STRICT, base: 'core22' },
      })) as HydratedPackage,
    );

    assert.deepEqual(doc.snap_data_channels, ['stable', 'edge']);
  });

  test('handles empty category', async () => {
    const doc = search.convert((await factory.package({ id: 'test.app', name: 'Test', category: '' })) as HydratedPackage);

    assert.equal(doc.category, '');
  });

  test('coerces nsfw to boolean', async () => {
    assert.equal(search.convert((await factory.package({ id: 'b', name: 'T', nsfw: null })) as HydratedPackage).nsfw, false);
    assert.equal(search.convert((await factory.package({ id: 'c', name: 'T', nsfw: undefined })) as HydratedPackage).nsfw, false);
  });

  test('normalizes keywords to lowercase and trims', async () => {
    const doc = search.convert(
      (await factory.package({
        id: 'test.app',
        name: 'Test',
        keywords: [' TEST ', 'Example', '  foo  '],
      })) as HydratedPackage,
    );

    assert.deepEqual(doc.keywords, ['test', 'example', 'foo']);
  });

  test('filters out empty keywords', async () => {
    const doc = search.convert(
      (await factory.package({
        id: 'test.app',
        name: 'Test',
        keywords: ['test', '', '  ', 'valid'],
      })) as HydratedPackage,
    );

    assert.deepEqual(doc.keywords, ['test', 'valid']);
  });

  test('defaults keywords to empty array when missing', async () => {
    assert.deepEqual(search.convert((await factory.package({ id: 'a', name: 'T', keywords: undefined })) as HydratedPackage).keywords, []);
  });

  describe('rating_bucket', () => {
    test('is 0 when calculated_rating is 0', async () => {
      assert.equal(
        search.convert((await factory.package({ id: 'a', name: 'T', calculated_rating: 0 })) as HydratedPackage).rating_bucket,
        0,
      );
    });

    test('is 0 when calculated_rating is undefined', async () => {
      assert.equal(
        search.convert((await factory.package({ id: 'a', name: 'T', calculated_rating: undefined })) as HydratedPackage).rating_bucket,
        0,
      );
    });

    test('is 1 when rating is between 1 and 24', async () => {
      assert.equal(
        search.convert((await factory.package({ id: 'a', name: 'T', calculated_rating: 1 })) as HydratedPackage).rating_bucket,
        1,
      );
      assert.equal(
        search.convert((await factory.package({ id: 'b', name: 'T', calculated_rating: 24 })) as HydratedPackage).rating_bucket,
        1,
      );
    });

    test('uses logarithmic scale for ratings >= 25', async () => {
      assert.equal(
        search.convert((await factory.package({ id: 'a', name: 'T', calculated_rating: 25 })) as HydratedPackage).rating_bucket,
        2,
      );
      assert.equal(
        search.convert((await factory.package({ id: 'a', name: 'T', calculated_rating: 50 })) as HydratedPackage).rating_bucket,
        3,
      );
      assert.equal(
        search.convert((await factory.package({ id: 'b', name: 'T', calculated_rating: 100 })) as HydratedPackage).rating_bucket,
        4,
      );
      assert.equal(
        search.convert((await factory.package({ id: 'c', name: 'T', calculated_rating: 200 })) as HydratedPackage).rating_bucket,
        5,
      );
    });
  });

  test('sets falsy PROPERTIES to null', async () => {
    const doc = search.convert((await factory.package({ id: 'test.app', name: '', tagline: '', description: '' })) as HydratedPackage);

    assert.equal(doc.name, null);
    assert.equal(doc.tagline, null);
    assert.equal(doc.description, null);
  });
});
