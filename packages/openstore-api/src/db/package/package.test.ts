import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { Package } from '.';
import { Architecture, Channel, AppType, DEFAULT_CHANNEL, ChannelArchitecture, PackageType, SourceStore } from './types';
import { serializeRatings } from './methods';
import { Ratings } from '../review/constants';
import { UserError } from '../../exceptions';
import { type TestPackage } from '../../tests/factory';

describe('Package', () => {
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
      });
    });

    test('handles types and type', () => {
      assert.deepEqual(Package.parseRequestFilters({
        query: { type: AppType.APP, types: AppType.WEBAPP },
      } as any).types, [AppType.WEBAPP, AppType.APP]);
    });

    test('adds arch all when the arch is not all', () => {
      assert.deepEqual(Package.parseRequestFilters({
        query: { architecture: Architecture.ARMHF, channel: Channel.FOCAL },
      } as any).architectures, [Architecture.ARMHF, Architecture.ALL]);
    });

    test('does not throw an error when arch is not specified but channel is', () => {
      assert.equal(Package.parseRequestFilters({
        query: { channel: Channel.FOCAL },
      } as any).channel, Channel.FOCAL);
    });

    test('throws an error when channel is not specified but arch is', () => {
      assert.throws(() => Package.parseRequestFilters({
        query: { architecture: Architecture.ARMHF },
      } as any), UserError);
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
          $in: [
            `${Channel.FOCAL}:${Architecture.ARMHF}:ubuntu-16.04`,
            `${Channel.FOCAL}:${Architecture.ALL}:ubuntu-16.04`,
          ],
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
  });

  describe('serialization', () => {
    const now = (new Date()).toISOString();
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
          'http://local.open-store.io/api/v3/apps/app.id/download/focal/armhf',
        );
      });

      test('generates a download url with a version', () => {
        assert.equal(
          package1.getDownloadUrl(Channel.FOCAL, Architecture.ARMHF, '1.0.0'),
          'http://local.open-store.io/api/v3/apps/app.id/download/focal/armhf/1.0.0',
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
              download_url: 'http://local.open-store.io/api/v3/apps/app.id/download/focal/arm64/1.0.0',
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
            },
            {
              architecture: Architecture.ARMHF,
              channel: Channel.FOCAL,
              created_date: now,
              download_sha512: 'shasum',
              download_url: 'http://local.open-store.io/api/v3/apps/app.id/download/focal/armhf/1.0.0',
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
              download_url: 'http://local.open-store.io/api/v3/apps/app.id/download/focal/armhf/1.0.0',
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
            },
            {
              architecture: Architecture.ARM64,
              channel: Channel.FOCAL,
              created_date: now,
              download_sha512: 'shasum',
              download_url: 'http://local.open-store.io/api/v3/apps/app.id/download/focal/arm64/1.0.0',
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
            },
          ],
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
            download_url: 'http://local.open-store.io/api/v3/apps/app.id/download/focal/arm64/1.0.0',
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
          },
          {
            architecture: Architecture.ARM64,
            channel: Channel.FOCAL,
            created_date: now,
            download_sha512: 'shasum',
            download_url: 'http://local.open-store.io/api/v3/apps/app.id/download/focal/arm64/1.0.1',
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
          },
        ]);

        // Only the latest supported framwork will show in the download links
        assert.deepEqual(serialized.downloads, [
          {
            architecture: Architecture.ARM64,
            channel: Channel.FOCAL,
            created_date: now,
            download_sha512: 'shasum',
            download_url: 'http://local.open-store.io/api/v3/apps/app.id/download/focal/arm64/1.0.0',
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
          },
        ]);

        const serialized2 = package1.serialize(Architecture.ARM64, DEFAULT_CHANNEL, ['ubuntu-sdk-20.04'], 4);
        assert.deepEqual(serialized2.downloads, [
          {
            architecture: Architecture.ARM64,
            channel: Channel.FOCAL,
            created_date: now,
            download_sha512: 'shasum',
            download_url: 'http://local.open-store.io/api/v3/apps/app.id/download/focal/arm64/1.0.1',
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
        assert.deepEqual(serializeRatings([
          { name: Ratings.THUMBS_UP, count: 10 } as any,
          { name: Ratings.THUMBS_DOWN, count: 10 } as any,
        ]), {
          THUMBS_UP: 10,
          THUMBS_DOWN: 10,
          HAPPY: 0,
          NEUTRAL: 0,
          BUGGY: 0,
        });
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

      const { revisionData: rev3 } = package1.getLatestRevision(
        Channel.FOCAL,
        Architecture.ARM64,
        undefined,
        ['ubuntu-sdk-16.04', 'ubuntu-sdk-20.04'],
      );
      assert.equal(rev3?.version, '1.0.4');
      assert.equal(rev3?.architecture, Architecture.ARM64);
      assert.equal(rev3?.channel, Channel.FOCAL);
      assert.equal(rev3?.framework, 'ubuntu-sdk-20.04');

      const { revisionData: rev4 } = package1.getLatestRevision(
        Channel.FOCAL,
        Architecture.ARM64,
        undefined,
        ['ubuntu-sdk-20.04', 'ubuntu-touch-24.04-1.x'],
      );
      assert.equal(rev4?.version, '2.0.0');
      assert.equal(rev4?.architecture, Architecture.ARM64);
      assert.equal(rev4?.channel, Channel.FOCAL);
      assert.equal(rev4?.framework, 'ubuntu-touch-24.04-1.x');
    });

    test('with a different frameworks using the same version', () => {
      // Same version as the ubuntu-touch-24.04-1.x framework
      package1.createNextRevision('2.0.0', Channel.FOCAL, Architecture.ARMHF, 'ubuntu-sdk-20.04', 'url', 'shasum', 10, 8);
      package1.createNextRevision('2.0.0', Channel.FOCAL, Architecture.ARM64, 'ubuntu-sdk-20.04', 'url', 'shasum', 10, 8);

      const { revisionData: rev1 } = package1.getLatestRevision(
        Channel.FOCAL,
        Architecture.ARM64,
        undefined,
        ['ubuntu-sdk-20.04', 'ubuntu-touch-24.04-1.x'],
      );
      assert.equal(rev1?.version, '2.0.0');
      assert.equal(rev1?.architecture, Architecture.ARM64);
      assert.equal(rev1?.channel, Channel.FOCAL);
      assert.equal(rev1?.framework, 'ubuntu-touch-24.04-1.x');

      const { revisionData: rev2 } = package1.getLatestRevision(
        Channel.FOCAL,
        Architecture.ARM64,
        undefined,
        ['ubuntu-sdk-16.04', 'ubuntu-sdk-20.04'],
      );
      assert.equal(rev2?.version, '2.0.0');
      assert.equal(rev2?.architecture, Architecture.ARM64);
      assert.equal(rev2?.channel, Channel.FOCAL);
      assert.equal(rev2?.framework, 'ubuntu-sdk-20.04');
    });

    test('it works with invalid versions', () => {
      package1.createNextRevision('...invalid!!', Channel.FOCAL, Architecture.ARM64, 'ubuntu-sdk-20.04', 'url', 'shasum', 10, 8);
      package1.createNextRevision('...invalid!!', Channel.FOCAL, Architecture.ARM64, 'ubuntu-touch-24.04-1.x', 'url', 'shasum', 10, 8);

      const { revisionData: rev1 } = package1.getLatestRevision(
        Channel.FOCAL,
        Architecture.ARM64,
        undefined,
        ['ubuntu-sdk-20.04', 'ubuntu-touch-24.04-1.x'],
      );
      assert.equal(rev1?.version, '...invalid!!');
      assert.equal(rev1?.architecture, Architecture.ARM64);
      assert.equal(rev1?.channel, Channel.FOCAL);
      assert.equal(rev1?.framework, 'ubuntu-touch-24.04-1.x');

      const { revisionData: rev2 } = package1.getLatestRevision(
        Channel.FOCAL,
        Architecture.ARM64,
        undefined,
        ['ubuntu-sdk-16.04', 'ubuntu-sdk-20.04'],
      );
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

        const { revisionData: rev2 } = package1.getLatestRevision(
          Channel.FOCAL, Architecture.ARM64, undefined, ['ubuntu-sdk-16.04', 'ubuntu-touch-24.04-1.x'],
        );
        assert.equal(rev2?.version, '1.0.0-24.04-1.x');
        assert.equal(rev2?.architecture, Architecture.ARM64);
        assert.equal(rev2?.channel, Channel.FOCAL);
        assert.equal(rev2?.framework, 'ubuntu-touch-24.04-1.x');

        const { revisionData: rev3 } = package1.getLatestRevision(
          Channel.FOCAL, Architecture.ARM64, undefined, ['ubuntu-sdk-16.04', 'ubuntu-touch-24.04-1.x', 'ubuntu-touch-24.04-2.x'],
        );
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
});
