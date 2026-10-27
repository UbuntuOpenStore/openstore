// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'fs/promises';
import assert from 'node:assert/strict';
import { test, describe, beforeEach, after } from 'node:test';
import os from 'os';

import type { AppstreamExportData } from 'click-parser';

import { Package } from '.';
import '../index';
import { UserError, ValidationError } from '../../exceptions';
import { type TestPackage } from '../../tests/factory';
import { cleanMongoose, closeMongoose, waitForMongoose } from '../../tests/utils';
import { getAppstreamLocalizedString, mapSpdxLicense, mapAppstreamCategory } from '../../utils/appstream-helpers';
import { config } from '../../utils/config';
import { CHANGELOG_MAX_LENGTH, DESCRIPTION_MAX_LENGTH, PACKAGEKIT_NAME_MAX_LENGTH, TEXT_MAX_LENGTH } from '../../utils/limits';
import { Ratings } from '../review/constants';
import { serializeRatings } from './methods';
import { Architecture, Channel, AppType, DEFAULT_CHANNEL, ChannelArchitecture, PackageType, SourceStore } from './types';

describe('Package', () => {
  after(async () => {
    await closeMongoose();
  });

  describe('publishing without revisions', () => {
    beforeEach(async () => {
      await waitForMongoose();
      await cleanMongoose();
    });

    test('fails to save a published click package with no revisions', async () => {
      const pkg = new Package({ id: 'app.norevisions.click', name: 'No Revisions Click', published: true });

      await assert.rejects(() => pkg.save(), UserError);
    });

    test('fails to save a published snap package with no revisions', async () => {
      const pkg = new Package({
        id: 'app.norevisions.snap',
        name: 'No Revisions Snap',
        published: true,
        package_type: PackageType.SNAP,
      });

      await assert.rejects(() => pkg.save(), UserError);
    });

    test('allows a published packagekit package with no revisions', async () => {
      const pkg = new Package({
        id: 'app.norevisions.packagekit',
        name: 'No Revisions Packagekit',
        published: true,
        package_type: PackageType.PACKAGEKIT,
        channel_architectures: [ChannelArchitecture.FOCAL_ALL],
      });

      await pkg.save();
      assert.equal(pkg.package_type, PackageType.PACKAGEKIT);
      assert.equal(!!pkg.published, true);
    });
  });

  describe('parseRequestFilters', () => {
    test('parses a request', () => {
      const parsed = Package.parseRequestFilters({
        query: {
          types: AppType.APP,
          type: AppType.APP,
          architecture: Architecture.ALL,
          limit: '100',
          skip: '20',
          sort: '-published_date',
          apps: 'foo.bar',
          frameworks: 'ubuntu-16.04',
          category: 'Category',
          author: 'Author',
          search: 'term',
          channel: Channel.FOCAL,
          nsfw: 'false',
        },
      } as any);

      assert.deepEqual(parsed, {
        types: [AppType.APP],
        packageTypes: [PackageType.CLICK],
        architectures: [Architecture.ALL],
        limit: 100,
        skip: 20,
        sort: '-published_date',
        ids: ['foo.bar'],
        frameworks: ['ubuntu-16.04'],
        category: 'Category',
        author: 'Author',
        search: 'term',
        channel: Channel.FOCAL,
        nsfw: [null, false],
        publisherId: '',
        published: undefined,
        lomiri_compatible: undefined,
      });
    });

    test('handles types and type', () => {
      assert.deepEqual(
        Package.parseRequestFilters({
          query: { type: AppType.APP, types: AppType.WEBAPP },
        } as any).types,
        [AppType.WEBAPP, AppType.APP],
      );
    });

    test('adds arch all when the arch is not all', () => {
      assert.deepEqual(
        Package.parseRequestFilters({
          query: { architecture: Architecture.ARMHF, channel: Channel.FOCAL },
        } as any).architectures,
        [Architecture.ARMHF, Architecture.ALL],
      );
    });

    test('does not throw an error when arch is not specified but channel is', () => {
      assert.equal(
        Package.parseRequestFilters({
          query: { channel: Channel.FOCAL },
        } as any).channel,
        Channel.FOCAL,
      );
    });

    test('throws an error when channel is not specified but arch is', () => {
      assert.throws(
        () =>
          Package.parseRequestFilters({
            query: { architecture: Architecture.ARMHF },
          } as any),
        UserError,
      );
    });

    test('defaults to click package type when not specified', () => {
      const parsed = Package.parseRequestFilters({
        query: {},
      } as any);
      assert.deepEqual(parsed.packageTypes, [PackageType.CLICK]);
    });

    test('uses the provided default package types when not specified', () => {
      const parsed = Package.parseRequestFilters({ query: {} } as any, [PackageType.CLICK, PackageType.SNAP, PackageType.PACKAGEKIT]);
      assert.deepEqual(parsed.packageTypes, [PackageType.CLICK, PackageType.SNAP, PackageType.PACKAGEKIT]);
    });

    test('an explicit package_type overrides the provided default package types', () => {
      const parsed = Package.parseRequestFilters(
        {
          query: { package_type: PackageType.SNAP },
        } as any,
        [PackageType.CLICK, PackageType.SNAP, PackageType.PACKAGEKIT],
      );
      assert.deepEqual(parsed.packageTypes, [PackageType.SNAP]);
    });

    test('handles package_type parameter', () => {
      const parsed = Package.parseRequestFilters({
        query: { package_type: PackageType.SNAP },
      } as any);
      assert.deepEqual(parsed.packageTypes, [PackageType.SNAP]);
    });

    test('handles multiple package_types', () => {
      const parsed = Package.parseRequestFilters({
        query: { package_type: `${PackageType.CLICK},${PackageType.SNAP}` },
      } as any);
      assert.deepEqual(parsed.packageTypes, [PackageType.CLICK, PackageType.SNAP]);
    });

    test('handles both package_type and package_types', () => {
      const parsed = Package.parseRequestFilters({
        query: { package_type: PackageType.CLICK, package_types: PackageType.SNAP },
      } as any);
      assert.deepEqual(parsed.packageTypes, [PackageType.SNAP, PackageType.CLICK]);
    });

    test('defaults sort to relevance when not specified', () => {
      const parsed = Package.parseRequestFilters({ query: {} } as any);
      assert.equal(parsed.sort, 'relevance');
    });

    test('accepts valid sort values', () => {
      const validSorts = [
        'relevance',
        'name',
        '-name',
        'calculated_rating',
        '-calculated_rating',
        'published_date',
        '-published_date',
        'updated_date',
        '-updated_date',
      ];

      for (const sort of validSorts) {
        const parsed = Package.parseRequestFilters({ query: { sort } } as any);
        assert.equal(parsed.sort, sort, `sort "${sort}" should be accepted`);
      }
    });

    test('falls back to relevance for invalid sort values', () => {
      const invalidSorts = ['asdf', '-invalid', 'downloads', '-downloads', 'created_date'];

      for (const sort of invalidSorts) {
        const parsed = Package.parseRequestFilters({ query: { sort } } as any);
        assert.equal(parsed.sort, 'relevance', `sort "${sort}" should fall back to relevance`);
      }
    });

    test('falls back to relevance for empty sort value', () => {
      const parsed = Package.parseRequestFilters({ query: { sort: '' } } as any);
      assert.equal(parsed.sort, 'relevance');
    });

    test('falls back to relevance for sort from body', () => {
      const parsed = Package.parseRequestFilters({ query: {}, body: { sort: 'invalid' } } as any);
      assert.equal(parsed.sort, 'relevance');
    });
  });

  describe('parseFilters', () => {
    test('parses filters, with arch/channel/frameworks specified', () => {
      const parsed = Package.parseFilters({
        types: [AppType.APP, AppType.WEBAPP],
        ids: ['foo.bar'],
        frameworks: ['ubuntu-16.04'],
        architectures: [Architecture.ARMHF, Architecture.ALL],
        category: 'Category',
        author: 'Author',
        channel: Channel.FOCAL,
        search: 'term',
        nsfw: [true],
        publisherId: 'foobar',
        published: true,
      });

      assert.deepEqual(parsed, {
        types: { $in: [AppType.APP, AppType.WEBAPP] },
        id: { $in: ['foo.bar'] },
        device_compatibilities: {
          $in: [`${Channel.FOCAL}:${Architecture.ARMHF}:ubuntu-16.04`, `${Channel.FOCAL}:${Architecture.ALL}:ubuntu-16.04`],
        },
        category: 'Category',
        author: 'Author',
        $text: { $search: 'term' },
        nsfw: { $in: [true] },
        maintainer: 'foobar',
        published: true,
      });
    });

    test('parses filters, with arch/channel specified', () => {
      const parsed = Package.parseFilters({
        architectures: [Architecture.ARMHF, Architecture.ALL],
        channel: Channel.FOCAL,
      });

      assert.deepEqual(parsed, {
        channel_architectures: { $in: [ChannelArchitecture.FOCAL_ARMHF, ChannelArchitecture.FOCAL_ALL] },
      });
    });

    test('parses package_types filter', () => {
      const parsed = Package.parseFilters({
        packageTypes: [PackageType.CLICK, PackageType.SNAP],
      });

      assert.deepEqual(parsed, {
        $or: [
          {
            package_type: {
              $ne: 'snap',
            },
          },
          {
            'snap_data.channels': 'stable',
          },
        ],
        package_type: { $in: [PackageType.CLICK, PackageType.SNAP] },
      });
    });
  });

  describe('serialization', () => {
    const now = new Date().toISOString();
    let package1: TestPackage;

    beforeEach(() => {
      package1 = new Package({
        id: 'app.id',
        name: 'Best App Ever',
        channels: [DEFAULT_CHANNEL],
        architectures: [Architecture.ARMHF, Architecture.ARM64],
        author: 'Jill',
        category: 'Category',
        description: 'A good app',
        keywords: ['best', 'good'],
        license: 'GNU LGPL v3',
        nsfw: false,
        published_date: now,
        tagline: 'such wow',
        types: [AppType.APP],
        updated_date: now,
        changelog: 'some changes',
        donate_url: 'https://example.com/donate',
        languages: ['en_US'],
        maintainer: 'jill.id',
        maintainer_name: 'Jill',
        source: 'https://example.com/source',
        support_url: 'https://example.com/support',
        video_url: 'https://example.com/video',
        translation_url: 'https://example.com/translations',
        icon: 'icon.png',
      });
    });

    describe('iconUrl', () => {
      test('generates an icon url', () => {
        package1.createNextRevision('1.0.0', Channel.FOCAL, Architecture.ARMHF, 'ubuntu-sdk-20.04', 'url', 'shasum', 10, 8);
        assert.equal(package1.icon_url, 'http://local.open-store.io/icons/app.id/app.id-1.0.0.png');
      });

      test('generates an icon url with no version info', () => {
        assert.equal(package1.icon_url, 'http://local.open-store.io/icons/app.id/app.id-0.0.0.png');
      });
    });

    describe('downloadUrl', () => {
      test('generates a download url without a version', () => {
        assert.equal(
          package1.getDownloadUrl(Channel.FOCAL, Architecture.ARMHF),
          'http://local.open-store.io/api/v4/apps/app.id/download/focal/armhf',
        );
      });

      test('generates a download url with a version', () => {
        assert.equal(
          package1.getDownloadUrl(Channel.FOCAL, Architecture.ARMHF, '1.0.0'),
          'http://local.open-store.io/api/v4/apps/app.id/download/focal/armhf/1.0.0',
        );
      });
    });

    describe('serialize', () => {
      test('serializes slimly', () => {
        const serialized = package1.serializeSlim();

        assert.deepEqual(serialized, {
          id: 'app.id',
          name: 'Best App Ever',
          icon: 'http://local.open-store.io/icons/app.id/app.id-0.0.0.png',
          channels: [DEFAULT_CHANNEL],
          architectures: [Architecture.ARMHF, Architecture.ARM64],
          author: 'Jill',
          publisher: 'Jill',
          publisher_id: 'jill.id',
          category: 'Category',
          description: 'A good app',
          framework: '',
          keywords: ['best', 'good'],
          license: 'GNU LGPL v3',
          nsfw: false,
          published_date: now,
          tagline: 'such wow',
          types: ['app'],
          updated_date: now,
          package_type: 'click',
          source_store: 'openstore',
          ratings: {
            BUGGY: 0,
            HAPPY: 0,
            NEUTRAL: 0,
            THUMBS_DOWN: 0,
            THUMBS_UP: 0,
          },
        });
      });

      test('serializes for discover (slim)', () => {
        const serialized = package1.serializeDiscoverSlim();

        assert.deepEqual(serialized, {
          id: 'app.id',
          name: 'Best App Ever',
          tagline: 'such wow',
          icon: 'http://local.open-store.io/icons/app.id/app.id-0.0.0.png',
          types: ['app'],
          package_type: 'click',
          published_date: now,
          ratings: {
            BUGGY: 0,
            HAPPY: 0,
            NEUTRAL: 0,
            THUMBS_DOWN: 0,
            THUMBS_UP: 0,
          },
        });
      });

      test('serializes fully', () => {
        package1.channel_architectures = [ChannelArchitecture.FOCAL_ARMHF, ChannelArchitecture.FOCAL_ARM64];
        package1.device_compatibilities = [
          `${ChannelArchitecture.FOCAL_ARMHF}:ubuntu-sdk-20.04`,
          `${ChannelArchitecture.FOCAL_ARM64}:ubuntu-sdk-20.04`,
        ];
        package1.createNextRevision('1.0.0', Channel.FOCAL, Architecture.ARMHF, 'ubuntu-sdk-20.04', 'url', 'shasum', 10, 8);
        package1.createNextRevision('1.0.0', Channel.FOCAL, Architecture.ARM64, 'ubuntu-sdk-20.04', 'url', 'shasum', 10, 8);

        package1.revisions[0].created_date = now;
        package1.revisions[1].created_date = now;
        package1.updated_date = now;
        package1.banner = 'test.svg';

        const serialized = package1.serialize(Architecture.ARMHF, DEFAULT_CHANNEL, [], 4);

        assert.deepEqual(serialized, {
          id: 'app.id',
          name: 'Best App Ever',
          icon: 'http://local.open-store.io/icons/app.id/app.id-1.0.0.png',
          banner: 'http://local.open-store.io/banners/test.svg',
          channels: [DEFAULT_CHANNEL],
          architecture: '',
          architectures: [Architecture.ARMHF, Architecture.ARM64],
          channel_architectures: [ChannelArchitecture.FOCAL_ARMHF, ChannelArchitecture.FOCAL_ARM64],
          device_compatibilities: [
            `${ChannelArchitecture.FOCAL_ARMHF}:ubuntu-sdk-20.04`,
            `${ChannelArchitecture.FOCAL_ARM64}:ubuntu-sdk-20.04`,
          ],
          author: 'Jill',
          publisher: 'Jill',
          publisher_id: 'jill.id',
          category: 'Category',
          description: 'A good app',
          framework: '',
          keywords: ['best', 'good'],
          license: 'GNU LGPL v3',
          nsfw: false,
          published_date: now,
          tagline: 'such wow',
          types: ['app'],
          updated_date: now,
          package_type: PackageType.CLICK,
          source_store: SourceStore.OPENSTORE,
          snap_data: {
            base: undefined,
            channels: [],
            confinement: undefined,
          },
          calculated_rating: 0,
          ratings: {
            BUGGY: 0,
            HAPPY: 0,
            NEUTRAL: 0,
            THUMBS_DOWN: 0,
            THUMBS_UP: 0,
          },
          changelog: 'some changes',
          version_changelogs: [],
          donate_url: 'https://example.com/donate',
          review_exceptions: [],
          downloads: [
            {
              architecture: Architecture.ARM64,
              channel: Channel.FOCAL,
              created_date: now,
              download_sha512: 'shasum',
              download_url: 'http://local.open-store.io/api/v4/apps/app.id/download/focal/arm64/1.0.0',
              downloads: 0,
              downloadSize: 8,
              installedSize: 10240,
              filesize: 10240,
              framework: 'ubuntu-sdk-20.04',
              revision: 2,
              version: '1.0.0',
              permissions: [],
              read_paths: [],
              write_paths: [],
              desktop_names: [],
              snap_data: undefined,
              content_rating: {
                content_attributes: [],
              },
            },
            {
              architecture: Architecture.ARMHF,
              channel: Channel.FOCAL,
              created_date: now,
              download_sha512: 'shasum',
              download_url: 'http://local.open-store.io/api/v4/apps/app.id/download/focal/armhf/1.0.0',
              downloads: 0,
              downloadSize: 8,
              installedSize: 10240,
              filesize: 10240,
              framework: 'ubuntu-sdk-20.04',
              revision: 1,
              version: '1.0.0',
              permissions: [],
              read_paths: [],
              write_paths: [],
              desktop_names: [],
              snap_data: undefined,
              content_rating: {
                content_attributes: [],
              },
            },
          ],
          filesize: 10240,
          languages: ['en_US'],
          latestDownloads: 0,
          locked: false,
          maintainer: 'jill.id',
          maintainer_name: 'Jill',
          manifest: { hooks: {} },
          published: false,
          screenshots: [],
          source: 'https://example.com/source',
          support_url: 'https://example.com/support',
          video_url: 'https://example.com/video',
          translation_url: 'https://example.com/translations',
          totalDownloads: 0,
          type_override: '',
          revision: -1,
          permissions: [],
          read_paths: [],
          write_paths: [],
          desktop_names: [],
          version: '1.0.0',
          download: null,
          download_sha512: '',
          revisions: [
            {
              architecture: Architecture.ARMHF,
              channel: Channel.FOCAL,
              created_date: now,
              download_sha512: 'shasum',
              download_url: 'http://local.open-store.io/api/v4/apps/app.id/download/focal/armhf/1.0.0',
              downloads: 0,
              downloadSize: 8,
              installedSize: 10240,
              filesize: 10240,
              framework: 'ubuntu-sdk-20.04',
              revision: 1,
              version: '1.0.0',
              permissions: [],
              read_paths: [],
              write_paths: [],
              desktop_names: [],
              snap_data: undefined,
              content_rating: {
                content_attributes: [],
              },
            },
            {
              architecture: Architecture.ARM64,
              channel: Channel.FOCAL,
              created_date: now,
              download_sha512: 'shasum',
              download_url: 'http://local.open-store.io/api/v4/apps/app.id/download/focal/arm64/1.0.0',
              downloads: 0,
              downloadSize: 8,
              installedSize: 10240,
              filesize: 10240,
              framework: 'ubuntu-sdk-20.04',
              revision: 2,
              version: '1.0.0',
              permissions: [],
              read_paths: [],
              write_paths: [],
              desktop_names: [],
              snap_data: undefined,
              content_rating: {
                content_attributes: [],
              },
            },
          ],
          content_rating: {
            type: '',
            content_attributes: [],
          },
        });
      });

      test('serializes with the latest supported framework in the downloads', () => {
        package1.channel_architectures = [ChannelArchitecture.FOCAL_ARM64];
        package1.device_compatibilities = [
          `${ChannelArchitecture.FOCAL_ARM64}:ubuntu-sdk-16.04`,
          `${ChannelArchitecture.FOCAL_ARM64}:ubuntu-sdk-20.04`,
        ];
        package1.createNextRevision('1.0.0', Channel.FOCAL, Architecture.ARM64, 'ubuntu-sdk-16.04', 'url', 'shasum', 10, 8);
        package1.createNextRevision('1.0.1', Channel.FOCAL, Architecture.ARM64, 'ubuntu-sdk-20.04', 'url', 'shasum', 10, 8);

        package1.revisions[0].created_date = now;
        package1.revisions[1].created_date = now;
        package1.updated_date = now;

        const serialized = package1.serialize(Architecture.ARM64, DEFAULT_CHANNEL, ['ubuntu-sdk-16.04'], 4);

        // All revisions are serialized in the revisions, event unsupported frameworks
        assert.deepEqual(serialized.revisions, [
          {
            architecture: Architecture.ARM64,
            channel: Channel.FOCAL,
            created_date: now,
            download_sha512: 'shasum',
            download_url: 'http://local.open-store.io/api/v4/apps/app.id/download/focal/arm64/1.0.0',
            downloads: 0,
            downloadSize: 8,
            installedSize: 10240,
            filesize: 10240,
            framework: 'ubuntu-sdk-16.04',
            revision: 1,
            version: '1.0.0',
            permissions: [],
            read_paths: [],
            write_paths: [],
            desktop_names: [],
            snap_data: undefined,
            content_rating: {
              content_attributes: [],
            },
          },
          {
            architecture: Architecture.ARM64,
            channel: Channel.FOCAL,
            created_date: now,
            download_sha512: 'shasum',
            download_url: 'http://local.open-store.io/api/v4/apps/app.id/download/focal/arm64/1.0.1',
            downloads: 0,
            downloadSize: 8,
            installedSize: 10240,
            filesize: 10240,
            framework: 'ubuntu-sdk-20.04',
            revision: 2,
            version: '1.0.1',
            permissions: [],
            read_paths: [],
            write_paths: [],
            desktop_names: [],
            snap_data: undefined,
            content_rating: {
              content_attributes: [],
            },
          },
        ]);

        // Only the latest supported framwork will show in the download links
        assert.deepEqual(serialized.downloads, [
          {
            architecture: Architecture.ARM64,
            channel: Channel.FOCAL,
            created_date: now,
            download_sha512: 'shasum',
            download_url: 'http://local.open-store.io/api/v4/apps/app.id/download/focal/arm64/1.0.0',
            downloads: 0,
            downloadSize: 8,
            installedSize: 10240,
            filesize: 10240,
            framework: 'ubuntu-sdk-16.04',
            revision: 1,
            version: '1.0.0',
            permissions: [],
            read_paths: [],
            write_paths: [],
            desktop_names: [],
            snap_data: undefined,
            content_rating: {
              content_attributes: [],
            },
          },
        ]);

        const serialized2 = package1.serialize(Architecture.ARM64, DEFAULT_CHANNEL, ['ubuntu-sdk-20.04'], 4);
        assert.deepEqual(serialized2.downloads, [
          {
            architecture: Architecture.ARM64,
            channel: Channel.FOCAL,
            created_date: now,
            download_sha512: 'shasum',
            download_url: 'http://local.open-store.io/api/v4/apps/app.id/download/focal/arm64/1.0.1',
            downloads: 0,
            downloadSize: 8,
            installedSize: 10240,
            filesize: 10240,
            framework: 'ubuntu-sdk-20.04',
            revision: 2,
            version: '1.0.1',
            permissions: [],
            read_paths: [],
            write_paths: [],
            desktop_names: [],
            snap_data: undefined,
            content_rating: {
              content_attributes: [],
            },
          },
        ]);
      });

      test('uses desktop_names_override when set', () => {
        const testPkg = new Package({
          id: 'test.app',
          name: 'Test App',
          channels: [DEFAULT_CHANNEL],
          architectures: [Architecture.ARMHF],
          author: 'Test',
          channel_architectures: [ChannelArchitecture.FOCAL_ARMHF],
          device_compatibilities: [`${ChannelArchitecture.FOCAL_ARMHF}:ubuntu-sdk-20.04`],
        });

        testPkg.createNextRevision(
          '1.0.0',
          Channel.FOCAL,
          Architecture.ARMHF,
          'ubuntu-sdk-20.04',
          'url',
          'shasum',
          10,
          8,
          undefined, // permissions
          undefined, // readPaths
          undefined, // writePaths
          ['app.desktop', 'other.desktop'], // desktopNames
        );

        assert.equal(testPkg.revisions.length, 1);
        assert.deepEqual(testPkg.revisions[0].desktop_names, ['app.desktop', 'other.desktop']);

        let serialized = testPkg.serialize(Architecture.ARMHF, DEFAULT_CHANNEL, [], 4);
        assert.deepEqual(serialized.desktop_names, ['app.desktop', 'other.desktop']);

        testPkg.desktop_names_override = ['custom.desktop'];
        serialized = testPkg.serialize(Architecture.ARMHF, DEFAULT_CHANNEL, [], 4);
        assert.deepEqual(serialized.desktop_names, ['custom.desktop']);
      });
    });

    describe('serializeRatings', () => {
      test('formats ratings', () => {
        assert.deepEqual(
          serializeRatings([{ name: Ratings.THUMBS_UP, count: 10 } as any, { name: Ratings.THUMBS_DOWN, count: 10 } as any]),
          {
            THUMBS_UP: 10,
            THUMBS_DOWN: 10,
            HAPPY: 0,
            NEUTRAL: 0,
            BUGGY: 0,
          },
        );
      });
    });
  });

  describe('getLatestRevision', () => {
    let package1: TestPackage;

    beforeEach(() => {
      package1 = new Package({
        id: 'app.id',
        name: 'Best App Ever',
        channels: [DEFAULT_CHANNEL],
        architectures: [Architecture.ARMHF, Architecture.ARM64],
      });

      // First version
      package1.createNextRevision('1.0.0', Channel.FOCAL, Architecture.ARMHF, 'ubuntu-sdk-16.04', 'url', 'shasum', 10, 8);
      package1.createNextRevision('1.0.0', Channel.FOCAL, Architecture.ARM64, 'ubuntu-sdk-16.04', 'url', 'shasum', 10, 8);
      package1.createNextRevision('1.0.0', Channel.XENIAL, Architecture.ARMHF, 'ubuntu-sdk-16.04', 'url', 'shasum', 10, 8);
      package1.createNextRevision('1.0.0', Channel.XENIAL, Architecture.ARM64, 'ubuntu-sdk-16.04', 'url', 'shasum', 10, 8);

      // Second version
      package1.createNextRevision('1.0.1', Channel.FOCAL, Architecture.ARMHF, 'ubuntu-sdk-16.04', 'url', 'shasum', 10, 8);
      package1.createNextRevision('1.0.1', Channel.FOCAL, Architecture.ARM64, 'ubuntu-sdk-16.04', 'url', 'shasum', 10, 8);
      package1.createNextRevision('1.0.1', Channel.XENIAL, Architecture.ARMHF, 'ubuntu-sdk-16.04', 'url', 'shasum', 10, 8);
      package1.createNextRevision('1.0.1', Channel.XENIAL, Architecture.ARM64, 'ubuntu-sdk-16.04', 'url', 'shasum', 10, 8);

      // Third version, dropped xenial
      package1.createNextRevision('1.0.2', Channel.FOCAL, Architecture.ARMHF, 'ubuntu-sdk-20.04', 'url', 'shasum', 10, 8);
      package1.createNextRevision('1.0.2', Channel.FOCAL, Architecture.ARM64, 'ubuntu-sdk-20.04', 'url', 'shasum', 10, 8);

      // Four version
      package1.createNextRevision('1.0.3', Channel.FOCAL, Architecture.ARMHF, 'ubuntu-sdk-20.04', 'url', 'shasum', 10, 8);
      package1.createNextRevision('1.0.3', Channel.FOCAL, Architecture.ARM64, 'ubuntu-sdk-20.04', 'url', 'shasum', 10, 8);

      // Fifth version, supports the new framework
      package1.createNextRevision('2.0.0', Channel.FOCAL, Architecture.ARMHF, 'ubuntu-touch-24.04-1.x', 'url', 'shasum', 10, 8);
      package1.createNextRevision('2.0.0', Channel.FOCAL, Architecture.ARM64, 'ubuntu-touch-24.04-1.x', 'url', 'shasum', 10, 8);

      // Sixth version, a fix to the old framework version
      package1.createNextRevision('1.0.4', Channel.FOCAL, Architecture.ARMHF, 'ubuntu-sdk-20.04', 'url', 'shasum', 10, 8);
      package1.createNextRevision('1.0.4', Channel.FOCAL, Architecture.ARM64, 'ubuntu-sdk-20.04', 'url', 'shasum', 10, 8);
    });

    test('gets the latest revision for an arch/channel/framework', () => {
      const { revisionData: rev1 } = package1.getLatestRevision(Channel.XENIAL, Architecture.ARM64, undefined, ['ubuntu-sdk-16.04']);
      assert.equal(rev1?.version, '1.0.1');
      assert.equal(rev1?.architecture, Architecture.ARM64);
      assert.equal(rev1?.channel, Channel.XENIAL);
      assert.equal(rev1?.framework, 'ubuntu-sdk-16.04');

      const { revisionData: rev2 } = package1.getLatestRevision(Channel.FOCAL, Architecture.ARM64, undefined, ['ubuntu-sdk-16.04']);
      assert.equal(rev2?.version, '1.0.1');
      assert.equal(rev2?.architecture, Architecture.ARM64);
      assert.equal(rev2?.channel, Channel.FOCAL);
      assert.equal(rev2?.framework, 'ubuntu-sdk-16.04');

      const { revisionData: rev3 } = package1.getLatestRevision(Channel.FOCAL, Architecture.ARM64, undefined, [
        'ubuntu-sdk-16.04',
        'ubuntu-sdk-20.04',
      ]);
      assert.equal(rev3?.version, '1.0.4');
      assert.equal(rev3?.architecture, Architecture.ARM64);
      assert.equal(rev3?.channel, Channel.FOCAL);
      assert.equal(rev3?.framework, 'ubuntu-sdk-20.04');

      const { revisionData: rev4 } = package1.getLatestRevision(Channel.FOCAL, Architecture.ARM64, undefined, [
        'ubuntu-sdk-20.04',
        'ubuntu-touch-24.04-1.x',
      ]);
      assert.equal(rev4?.version, '2.0.0');
      assert.equal(rev4?.architecture, Architecture.ARM64);
      assert.equal(rev4?.channel, Channel.FOCAL);
      assert.equal(rev4?.framework, 'ubuntu-touch-24.04-1.x');
    });

    test('with a different frameworks using the same version', () => {
      // Same version as the ubuntu-touch-24.04-1.x framework
      package1.createNextRevision('2.0.0', Channel.FOCAL, Architecture.ARMHF, 'ubuntu-sdk-20.04', 'url', 'shasum', 10, 8);
      package1.createNextRevision('2.0.0', Channel.FOCAL, Architecture.ARM64, 'ubuntu-sdk-20.04', 'url', 'shasum', 10, 8);

      const { revisionData: rev1 } = package1.getLatestRevision(Channel.FOCAL, Architecture.ARM64, undefined, [
        'ubuntu-sdk-20.04',
        'ubuntu-touch-24.04-1.x',
      ]);
      assert.equal(rev1?.version, '2.0.0');
      assert.equal(rev1?.architecture, Architecture.ARM64);
      assert.equal(rev1?.channel, Channel.FOCAL);
      assert.equal(rev1?.framework, 'ubuntu-touch-24.04-1.x');

      const { revisionData: rev2 } = package1.getLatestRevision(Channel.FOCAL, Architecture.ARM64, undefined, [
        'ubuntu-sdk-16.04',
        'ubuntu-sdk-20.04',
      ]);
      assert.equal(rev2?.version, '2.0.0');
      assert.equal(rev2?.architecture, Architecture.ARM64);
      assert.equal(rev2?.channel, Channel.FOCAL);
      assert.equal(rev2?.framework, 'ubuntu-sdk-20.04');
    });

    test('it works with invalid versions', () => {
      package1.createNextRevision('...invalid!!', Channel.FOCAL, Architecture.ARM64, 'ubuntu-sdk-20.04', 'url', 'shasum', 10, 8);
      package1.createNextRevision('...invalid!!', Channel.FOCAL, Architecture.ARM64, 'ubuntu-touch-24.04-1.x', 'url', 'shasum', 10, 8);

      const { revisionData: rev1 } = package1.getLatestRevision(Channel.FOCAL, Architecture.ARM64, undefined, [
        'ubuntu-sdk-20.04',
        'ubuntu-touch-24.04-1.x',
      ]);
      assert.equal(rev1?.version, '...invalid!!');
      assert.equal(rev1?.architecture, Architecture.ARM64);
      assert.equal(rev1?.channel, Channel.FOCAL);
      assert.equal(rev1?.framework, 'ubuntu-touch-24.04-1.x');

      const { revisionData: rev2 } = package1.getLatestRevision(Channel.FOCAL, Architecture.ARM64, undefined, [
        'ubuntu-sdk-16.04',
        'ubuntu-sdk-20.04',
      ]);
      assert.equal(rev2?.version, '...invalid!!');
      assert.equal(rev2?.architecture, Architecture.ARM64);
      assert.equal(rev2?.channel, Channel.FOCAL);
      assert.equal(rev2?.framework, 'ubuntu-sdk-20.04');
    });

    describe('when version numbers differ by framework', () => {
      let package1: TestPackage;

      beforeEach(() => {
        package1 = new Package({
          id: 'app.id',
          name: 'Best App Ever',
          channels: [DEFAULT_CHANNEL],
          architectures: [Architecture.ARMHF, Architecture.ARM64],
        });

        package1.createNextRevision('1.0.0-24.04-2.x', Channel.FOCAL, Architecture.ARM64, 'ubuntu-touch-24.04-2.x', 'url', 'shasum', 10, 8);

        package1.createNextRevision('1.0.0-24.04-1.x', Channel.FOCAL, Architecture.ARM64, 'ubuntu-touch-24.04-1.x', 'url', 'shasum', 10, 8);

        package1.createNextRevision('1.0.0-20.04', Channel.FOCAL, Architecture.ARM64, 'ubuntu-sdk-20.04', 'url', 'shasum', 10, 8);
      });

      test('gets the latest revision for an arch/channel/framework', () => {
        const { revisionData: rev1 } = package1.getLatestRevision(Channel.FOCAL, Architecture.ARM64, undefined, ['ubuntu-sdk-20.04']);
        assert.equal(rev1?.version, '1.0.0-20.04');
        assert.equal(rev1?.architecture, Architecture.ARM64);
        assert.equal(rev1?.channel, Channel.FOCAL);
        assert.equal(rev1?.framework, 'ubuntu-sdk-20.04');

        const { revisionData: rev2 } = package1.getLatestRevision(Channel.FOCAL, Architecture.ARM64, undefined, [
          'ubuntu-sdk-16.04',
          'ubuntu-touch-24.04-1.x',
        ]);
        assert.equal(rev2?.version, '1.0.0-24.04-1.x');
        assert.equal(rev2?.architecture, Architecture.ARM64);
        assert.equal(rev2?.channel, Channel.FOCAL);
        assert.equal(rev2?.framework, 'ubuntu-touch-24.04-1.x');

        const { revisionData: rev3 } = package1.getLatestRevision(Channel.FOCAL, Architecture.ARM64, undefined, [
          'ubuntu-sdk-16.04',
          'ubuntu-touch-24.04-1.x',
          'ubuntu-touch-24.04-2.x',
        ]);
        assert.equal(rev3?.version, '1.0.0-24.04-2.x');
        assert.equal(rev3?.architecture, Architecture.ARM64);
        assert.equal(rev3?.channel, Channel.FOCAL);
        assert.equal(rev3?.framework, 'ubuntu-touch-24.04-2.x');
      });
    });
  });

  describe('video_url transformation', () => {
    let pkg: TestPackage;
    beforeEach(() => {
      pkg = new Package({
        id: 'app.id',
        name: 'Test',
        channels: [DEFAULT_CHANNEL],
        architectures: [Architecture.ARMHF],
        author: 'Author',
        video_url: '',
      });
    });

    test('transforms YouTube watch URL', async () => {
      await pkg.updateFromBody({ video_url: 'https://www.youtube.com/watch?v=abcdefghijk&pp=oihergn' });
      assert.equal(pkg.video_url, 'https://www.youtube.com/embed/abcdefghijk');
    });

    test('transforms YouTube short URL', async () => {
      await pkg.updateFromBody({ video_url: 'https://youtu.be/abcdefghijk?si=oqneib' });
      assert.equal(pkg.video_url, 'https://www.youtube.com/embed/abcdefghijk');
    });

    test('transforms YouTube embed URL', async () => {
      await pkg.updateFromBody({ video_url: 'https://www.youtube.com/embed/abcdefghijk?si=oeagn' });
      assert.equal(pkg.video_url, 'https://www.youtube.com/embed/abcdefghijk');
    });

    test('transforms Vimeo URL', async () => {
      await pkg.updateFromBody({ video_url: 'https://vimeo.com/123456789?fl=wc' });
      assert.equal(pkg.video_url, 'https://player.vimeo.com/video/123456789');
    });

    test('transforms Vimeo embed URL', async () => {
      await pkg.updateFromBody({ video_url: 'https://player.vimeo.com/video/123456789?h=0984532' });
      assert.equal(pkg.video_url, 'https://player.vimeo.com/video/123456789');
    });

    test('transforms PeerTube URL', async () => {
      await pkg.updateFromBody({ video_url: 'https://peer.tube/w/abcdefghijk' });
      assert.equal(pkg.video_url, 'https://peer.tube/videos/embed/abcdefghijk');
    });

    test('transforms PeerTube embed URL', async () => {
      await pkg.updateFromBody({ video_url: 'https://peer.tube/videos/embed/abcdefghijk' });
      assert.equal(pkg.video_url, 'https://peer.tube/videos/embed/abcdefghijk');
    });

    test('transforms Rumble embed URL', async () => {
      await pkg.updateFromBody({ video_url: 'https://rumble.com/embed/v3abcd/?pub=4' });
      assert.equal(pkg.video_url, 'https://rumble.com/embed/v3abcd/');
    });

    test('transforms Rumble normal URL', async () => {
      await pkg.updateFromBody({ video_url: 'https://rumble.com/v3abcd-foo-bar.html?e9s=src_v1_asdf' });
      assert.equal(pkg.video_url, 'https://rumble.com/embed/v3abcd/');
    });

    test('empty or invalid URL returns empty', async () => {
      await pkg.updateFromBody({ video_url: '' });
      assert.equal(pkg.video_url, '');

      await pkg.updateFromBody({ video_url: 'https://notavideosite.com/xyz' });
      assert.equal(pkg.video_url, '');
    });
  });

  describe('text field limits', () => {
    test('updateFromBody rejects text fields that exceed the limits', async () => {
      const pkg = new Package({ id: 'app.limitcheck', name: 'App' });

      await assert.rejects(() => pkg.updateFromBody({ name: 'a'.repeat(TEXT_MAX_LENGTH + 1) }), ValidationError);
      await assert.rejects(() => pkg.updateFromBody({ tagline: 'a'.repeat(TEXT_MAX_LENGTH + 1) }), ValidationError);
      await assert.rejects(() => pkg.updateFromBody({ description: 'a'.repeat(DESCRIPTION_MAX_LENGTH + 1) }), ValidationError);
      await assert.rejects(() => pkg.updateFromBody({ keywords: ['a'.repeat(TEXT_MAX_LENGTH + 1)] }), ValidationError);
      await assert.rejects(
        () => pkg.updateFromBody({ version_changelogs: [{ version: '1.0.0', changelog: 'a'.repeat(CHANGELOG_MAX_LENGTH + 1) }] }),
        ValidationError,
      );
      for (const field of ['source', 'support_url', 'donate_url', 'video_url', 'translation_url'] as const) {
        await assert.rejects(() => pkg.updateFromBody({ [field]: 'a'.repeat(TEXT_MAX_LENGTH + 1) }), ValidationError);
      }
    });

    test('updateFromBody leaves existing over-limit fields alone when they are not being updated', async () => {
      const pkg = new Package({
        id: 'app.legacy',
        name: 'Legacy',
        description: 'a'.repeat(DESCRIPTION_MAX_LENGTH + 1),
      });

      await pkg.updateFromBody({ screenshots: [] });

      assert.equal(pkg.name, 'Legacy');
      assert.equal(pkg.description?.length, DESCRIPTION_MAX_LENGTH + 1);
    });
  });

  describe('appstream-helpers', () => {
    describe('getAppstreamLocalizedString', () => {
      test('returns english string', () => {
        assert.equal(
          getAppstreamLocalizedString([
            { text: 'English', lang: 'en' },
            { text: 'Deutsch', lang: 'de' },
          ]),
          'English',
        );
      });

      test('falls back to first item when no english', () => {
        assert.equal(getAppstreamLocalizedString([{ text: 'Deutsch', lang: 'de' }]), 'Deutsch');
      });

      test('returns undefined for empty array', () => {
        assert.equal(getAppstreamLocalizedString([]), undefined);
        assert.equal(getAppstreamLocalizedString(undefined), undefined);
      });
    });

    describe('mapSpdxLicense', () => {
      test('maps licences', () => {
        assert.equal(mapSpdxLicense('GPL-3.0'), 'GNU GPL v3');
        assert.equal(mapSpdxLicense('GPL-3.0-only'), 'GNU GPL v3');
        assert.equal(mapSpdxLicense('GPL-3.0-or-later'), 'GNU GPL v3');
        assert.equal(mapSpdxLicense('MIT'), 'MIT/X/Expat License');
        assert.equal(mapSpdxLicense('BSD-2-Clause'), 'BSD License (Simplified)');
        assert.equal(mapSpdxLicense('BSD-3-Clause'), 'BSD License (Simplified)');
        assert.equal(mapSpdxLicense('LicenseRef-proprietary'), 'Proprietary');
      });

      test('handles compound SPDX expressions (OR)', () => {
        assert.equal(mapSpdxLicense('GPL-2.0-or-later OR MIT'), 'GNU GPL v2');
      });

      test('handles compound SPDX expressions (AND)', () => {
        assert.equal(mapSpdxLicense('MIT AND Apache-2.0'), 'MIT/X/Expat License');
      });

      test('returns Other Open Source for unknown identifiers', () => {
        assert.equal(mapSpdxLicense('LicenseRef-custom'), 'Other Open Source');
        assert.equal(mapSpdxLicense(''), 'Other Open Source');
      });
    });

    describe('mapAppstreamCategory', () => {
      test('maps correctly', () => {
        assert.equal(mapAppstreamCategory(['Development']), 'Developer Tools');
        assert.equal(mapAppstreamCategory(['AudioVideo']), 'Music & Audio');
      });

      test('returns first match when multiple categories', () => {
        assert.equal(mapAppstreamCategory(['UnknownCategory', 'Education']), 'Education & Reference');
      });

      test('returns undefined for unrecognised categories', () => {
        assert.equal(mapAppstreamCategory(['UnknownCategory']), undefined);
        assert.equal(mapAppstreamCategory([]), undefined);
      });
    });
  });

  describe('updateFromClick with AppStream data', () => {
    let pkg: TestPackage;

    const makeAppstream = (overrides: Partial<AppstreamExportData> = {}): AppstreamExportData => ({
      name: [{ text: 'AppStream Name', lang: 'en' }],
      summary: [{ text: 'AppStream Summary', lang: 'en' }],
      description: [{ text: 'AppStream Description', lang: 'en' }],
      keywords: [
        { text: 'keyword1', lang: 'en' },
        { text: 'keyword2', lang: 'en' },
      ],
      urls: [
        { type: 'homepage', url: 'https://home.example.com' },
        { type: 'donation', url: 'https://donate.example.com' },
        { type: 'translate', url: 'https://translate.example.com' },
      ],
      project_license: 'MIT',
      categories: ['Development'],
      screenshots: [],
      releases: [{ version: '1.0.0', description: [{ text: 'Initial release', lang: 'en' }] }],
      ...overrides,
    });

    const makeClickData = (appstream?: AppstreamExportData) => ({
      apps: [],
      architecture: 'armhf',
      description: 'Click description',
      framework: 'ubuntu-sdk-20.04',
      maintainer: 'test@example.com',
      name: 'app.id',
      title: 'Click Title',
      version: '1.0.0',
      permissions: [],
      types: ['app'],
      urls: [],
      installedSize: 100,
      webappInject: false,
      webappProperties: {},
      languages: ['en'],
      files: [],
      appstream,
    });

    beforeEach(() => {
      pkg = new Package({
        id: 'app.id',
        name: 'Old Name',
        description: 'Old description',
        tagline: 'Old tagline',
        keywords: ['old'],
        license: 'Proprietary',
        category: 'Utilities',
        support_url: 'https://old.example.com',
        donate_url: 'https://old.donate.com',
        translation_url: 'https://old.translate.com',
        screenshots: [],
        version_changelogs: [],
      });
    });

    test('overwrites mapped fields from AppStream data', async () => {
      await pkg.updateFromClick(makeClickData(makeAppstream()));

      assert.equal(pkg.name, 'AppStream Name');
      assert.equal(pkg.tagline, 'AppStream Summary');
      assert.equal(pkg.description, 'AppStream Description');
      assert.deepEqual(pkg.keywords, ['keyword1', 'keyword2']);
      assert.equal(pkg.support_url, 'https://home.example.com');
      assert.equal(pkg.donate_url, 'https://donate.example.com');
      assert.equal(pkg.translation_url, 'https://translate.example.com');
      assert.equal(pkg.license, 'MIT/X/Expat License');
      assert.equal(pkg.category, 'Developer Tools');
      assert.deepEqual(
        pkg.version_changelogs?.map((vc) => ({ version: vc.version, changelog: vc.changelog })),
        [{ version: '1.0.0', changelog: 'Initial release' }],
      );
    });

    test('leaves existing values unchanged when no AppStream data', async () => {
      await pkg.updateFromClick(makeClickData(undefined));

      assert.equal(pkg.name, 'Old Name');
      assert.equal(pkg.description, 'Old description');
      assert.equal(pkg.tagline, 'Old tagline');
      assert.deepEqual(pkg.keywords, ['old']);
      assert.equal(pkg.license, 'Proprietary');
      assert.equal(pkg.category, 'Utilities');
      assert.equal(pkg.support_url, 'https://old.example.com');
    });

    test('only takes english keywords', async () => {
      const appstream = makeAppstream({
        keywords: [
          { text: 'english-keyword', lang: 'en' },
          { text: 'deutsches-schlüsselwort', lang: 'de' },
        ],
      });

      await pkg.updateFromClick(makeClickData(appstream));

      assert.deepEqual(pkg.keywords, ['english-keyword']);
    });

    test('does not overwrite category when no matching AppStream category', async () => {
      const appstream = makeAppstream({ categories: ['UnknownXDGCategory'] });
      await pkg.updateFromClick(makeClickData(appstream));

      assert.equal(pkg.category, 'Utilities');
    });

    test('does not overwrite URLs when they are invalid', async () => {
      const appstream = makeAppstream({
        urls: [{ type: 'homepage', url: 'not-a-valid-url' }],
      });

      await pkg.updateFromClick(makeClickData(appstream));

      assert.equal(pkg.support_url, 'https://old.example.com');
    });

    test('screenshots from AppStream replace all existing screenshots', async (t) => {
      const pngData = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );

      t.mock.method(globalThis, 'fetch', async () => ({
        ok: true,
        headers: { get: () => 'image/png' },
        arrayBuffer: async () => pngData.buffer,
      }));

      const tmpDir = await fs.mkdtemp(`${os.tmpdir()}/openstore-test-`);
      const originalScreenshotDir = config.screenshot_dir;
      config.screenshot_dir = tmpDir;

      try {
        // Pre-existing screenshot that should be replaced
        const existingScreenshot = 'app.id-screenshot-existing.png';
        await fs.writeFile(`${tmpDir}/${existingScreenshot}`, pngData);
        pkg.screenshots = [existingScreenshot];

        const appstream = makeAppstream({
          screenshots: ['https://example.com/screenshot1.png', 'https://example.com/screenshot2.png'],
        });

        await pkg.updateFromClick(makeClickData(appstream));

        // All existing screenshots replaced by the 2 AppStream ones
        assert.equal(pkg.screenshots.length, 2);
        assert.ok(!pkg.screenshots.includes(existingScreenshot), 'old screenshot replaced');
        assert.ok(!pkg.screenshots[0].startsWith('https://'), 'screenshot should be a filename not a URL');
        assert.ok(pkg.screenshots[0].includes('app.id-screenshot-'), 'filename follows naming convention');
      } finally {
        config.screenshot_dir = originalScreenshotDir;
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    test('re-uploading with AppStream replaces previous AppStream screenshots', async (t) => {
      const pngData = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );

      t.mock.method(globalThis, 'fetch', async () => ({
        ok: true,
        headers: { get: () => 'image/png' },
        arrayBuffer: async () => pngData.buffer,
      }));

      const tmpDir = await fs.mkdtemp(`${os.tmpdir()}/openstore-test-`);
      const originalScreenshotDir = config.screenshot_dir;
      config.screenshot_dir = tmpDir;

      try {
        // First upload
        const appstream1 = makeAppstream({ screenshots: ['https://example.com/v1.png'] });
        await pkg.updateFromClick(makeClickData(appstream1));

        assert.equal(pkg.screenshots.length, 1);
        const firstFile = pkg.screenshots[0];

        // Second upload replaces everything
        const appstream2 = makeAppstream({ screenshots: ['https://example.com/v2.png'] });
        await pkg.updateFromClick(makeClickData(appstream2));

        assert.equal(pkg.screenshots.length, 1, 'one new screenshot');
        assert.ok(!pkg.screenshots.includes(firstFile), 'previous screenshot replaced');
      } finally {
        config.screenshot_dir = originalScreenshotDir;
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    test('skips re-downloading screenshots when URLs are unchanged', async (t) => {
      const pngData = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );

      const fetchMock = t.mock.method(globalThis, 'fetch', async () => ({
        ok: true,
        headers: { get: () => 'image/png' },
        arrayBuffer: async () => pngData.buffer,
      }));

      const tmpDir = await fs.mkdtemp(`${os.tmpdir()}/openstore-test-`);
      const originalScreenshotDir = config.screenshot_dir;
      config.screenshot_dir = tmpDir;

      try {
        const appstream = makeAppstream({ screenshots: ['https://example.com/shot.png'] });

        // First upload downloads the screenshot
        await pkg.updateFromClick(makeClickData(appstream));
        assert.equal(fetchMock.mock.callCount(), 1, 'fetch called on first upload');
        const firstFile = pkg.screenshots[0];

        // Second upload with same URLs — should skip re-downloading
        await pkg.updateFromClick(makeClickData(appstream));
        assert.equal(fetchMock.mock.callCount(), 1, 'fetch not called again when URLs unchanged');
        assert.equal(pkg.screenshots[0], firstFile, 'same filename kept');
      } finally {
        config.screenshot_dir = originalScreenshotDir;
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('createPackageKit', () => {
    beforeEach(async () => {
      await waitForMongoose();
      await cleanMongoose();
    });

    test('creates a published packagekit package with the expected defaults', async () => {
      const pkg = await Package.createPackageKit('packagekit.gimp');

      assert.equal(pkg.id, 'packagekit.gimp');
      assert.equal(pkg.name, 'gimp');
      assert.equal(pkg.package_type, PackageType.PACKAGEKIT);
      assert.equal(!!pkg.published, true);
      assert.deepEqual(pkg.channel_architectures, [ChannelArchitecture.FOCAL_ALL]);
      assert.equal(pkg.maintainer, null);
      assert.equal(pkg.revisions.length, 0);
      assert.equal(await Package.countDocuments({ id: 'packagekit.gimp' }), 1);
    });

    test('returns the existing package instead of failing on a duplicate', async () => {
      const first = await Package.createPackageKit('packagekit.gimp');
      const second = await Package.createPackageKit('packagekit.gimp');

      assert.equal(second._id.toString(), first._id.toString());
      assert.equal(await Package.countDocuments({ id: 'packagekit.gimp' }), 1);
    });

    test('rejects invalid ids', async () => {
      const invalidIds = [
        'packagekit.',
        'packagekit.Invalid',
        'packagekit.has space',
        'something.else',
        `packagekit.${'a'.repeat(PACKAGEKIT_NAME_MAX_LENGTH + 1)}`,
      ];

      for (const id of invalidIds) {
        await assert.rejects(() => Package.createPackageKit(id), UserError);
        assert.equal(await Package.findOneByFilters(id), null);
      }
    });
  });
});
