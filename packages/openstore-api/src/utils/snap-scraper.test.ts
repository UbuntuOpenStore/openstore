import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchSnaps,
  fetchSnapDetailsV2,
  fetchSnapDetailsV1,
  transformSnapToPackage,
  discoverSnaps,
  CATEGORY_MAPPING,
  ARCH_MAPPING,
  type SnapV2Response,
  type SnapV1Response,
} from './snap-scraper';
import { Architecture, PackageType, SourceStore } from '../db/package/types';

describe('Snap Scraper Utils', () => {
  describe('fetchSnaps', () => {
    test('should fetch and return snap search results', async () => {
      const mockResponse = {
        results: [
          { name: 'vlc', 'snap-id': 'id1' },
          { name: 'firefox', 'snap-id': 'id2' },
        ],
      };

      const mockFetch = mock.fn(async () => ({
        ok: true,
        json: async () => mockResponse,
      })) as any;

      const results = await fetchSnaps('vlc', undefined, mockFetch);

      assert.equal(results.length, 2);
      assert.equal(results[0].name, 'vlc');
      assert.equal(results[1].name, 'firefox');
      assert.equal(mockFetch.mock.calls.length, 1);
    });

    test('should respect limit parameter', async () => {
      const mockResponse = {
        results: [
          { name: 'vlc', 'snap-id': 'id1' },
          { name: 'firefox', 'snap-id': 'id2' },
          { name: 'chrome', 'snap-id': 'id3' },
        ],
      };

      const mockFetch = mock.fn(async () => ({
        ok: true,
        json: async () => mockResponse,
      })) as any;

      const results = await fetchSnaps('browser', 2, mockFetch);

      assert.equal(results.length, 2);
    });

    test('should deduplicate snaps with same snap-id', async () => {
      const mockResponse = {
        results: [
          { name: 'vlc', 'snap-id': 'id1' },
          { name: 'vlc-duplicate', 'snap-id': 'id1' },
        ],
      };

      const mockFetch = mock.fn(async () => ({
        ok: true,
        json: async () => mockResponse,
      })) as any;

      const results = await fetchSnaps('vlc', undefined, mockFetch);

      assert.equal(results.length, 1);
      assert.equal(results[0].name, 'vlc');
    });

    test('should return empty array on 404', async () => {
      const mockFetch = mock.fn(async () => ({
        ok: false,
        status: 404,
      })) as any;

      const results = await fetchSnaps('nonexistent', undefined, mockFetch);

      assert.equal(results.length, 0);
    });

    test('should return empty array on 400', async () => {
      const mockFetch = mock.fn(async () => ({
        ok: false,
        status: 400,
      })) as any;

      const results = await fetchSnaps('invalid', undefined, mockFetch);

      assert.equal(results.length, 0);
    });

    test('should throw on other errors', async () => {
      const mockFetch = mock.fn(async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })) as any;

      await assert.rejects(
        async () => await fetchSnaps('vlc', undefined, mockFetch),
        { message: /Failed to fetch snaps/ },
      );
    });
  });

  describe('fetchSnapDetailsV2', () => {
    test('should fetch v2 snap details', async () => {
      const mockV2Data: SnapV2Response = {
        name: 'vlc',
        'snap-id': 'RT9mcUhVsRYrDLG8qnvGiy26NKvv6Qkd',
        'default-track': null,
        snap: {
          license: 'GPL-2.0+',
          name: 'vlc',
          publisher: {
            'display-name': 'VideoLAN',
            id: 'publisher-id',
            username: 'videolan',
            validation: 'verified',
          },
          'snap-id': 'RT9mcUhVsRYrDLG8qnvGiy26NKvv6Qkd',
          'store-url': 'https://snapcraft.io/vlc',
          summary: 'The ultimate media player',
          title: 'VLC',
        },
        'channel-map': [
          {
            channel: {
              architecture: 'amd64',
              name: 'stable',
              'released-at': '2024-03-26T06:49:08.798382+00:00',
              risk: 'stable',
              track: 'latest',
            },
            'created-at': '2023-10-31T02:24:08.237334+00:00',
            download: {
              'sha3-384': 'abc123',
              size: 336699392,
              url: 'https://example.com/vlc.snap',
            },
            revision: 3777,
            type: 'app',
            version: '3.0.20-1-g2617de71b6',
          },
        ],
      };

      const mockFetch = mock.fn(async () => ({
        ok: true,
        json: async () => mockV2Data,
      })) as any;

      const result = await fetchSnapDetailsV2('vlc', mockFetch);

      assert.equal(result.name, 'vlc');
      assert.equal(result.snap.title, 'VLC');
      assert.equal(result['channel-map'].length, 1);
    });

    test('should throw on error', async () => {
      const mockFetch = mock.fn(async () => ({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })) as any;

      await assert.rejects(
        async () => await fetchSnapDetailsV2('nonexistent', mockFetch),
        { message: /Failed to fetch v2 details/ },
      );
    });
  });

  describe('fetchSnapDetailsV1', () => {
    test('should fetch v1 snap details', async () => {
      const mockV1Data: SnapV1Response = {
        name: 'vlc.videolan',
        package_name: 'vlc',
        title: 'VLC',
        summary: 'The ultimate media player',
        description: 'VLC is the VideoLAN projects media player.',
        icon_url: 'https://example.com/icon.png',
        last_updated: '2024-01-15T10:00:00Z',
        screenshot_urls: ['https://example.com/screenshot1.png'],
        base: 'core18',
        confinement: 'strict',
        license: 'GPL-2.0+',
        publisher: 'VideoLAN',
        developer_name: 'VideoLAN',
        developer_id: 'dev-id',
        developer_validation: 'verified',
        version: '3.0.20',
        revision: 3777,
        architecture: ['amd64'],
        apps: ['vlc'],
        channel: 'stable',
        release: ['16'],
        binary_filesize: 336699392,
        download_url: 'https://example.com/vlc.snap',
        anon_download_url: 'https://example.com/vlc.snap',
        download_sha3_384: 'abc123',
        download_sha512: 'def456',
        snap_id: 'RT9mcUhVsRYrDLG8qnvGiy26NKvv6Qkd',
        common_ids: ['org.videolan.vlc'],
        contact: 'https://www.videolan.org/support/',
        links: {
          contact: ['https://www.videolan.org/support/'],
          website: ['https://www.videolan.org/vlc/'],
        },
        origin: 'videolan',
      };

      const mockFetch = mock.fn(async () => ({
        ok: true,
        json: async () => mockV1Data,
      })) as any;

      const result = await fetchSnapDetailsV1('vlc', 'amd64', mockFetch);

      assert.equal(result.name, 'vlc.videolan');
      assert.equal(result.description.length > 0, true);
      assert.equal(result.screenshot_urls.length, 1);
    });

    test('should throw on error', async () => {
      const mockFetch = mock.fn(async () => ({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })) as any;

      await assert.rejects(
        async () => await fetchSnapDetailsV1('nonexistent', 'amd64', mockFetch),
        { message: /Failed to fetch v1 details/ },
      );
    });
  });

  describe('transformSnapToPackage', () => {
    test('should transform v2 and v1 data to package format', () => {
      const v2Data: SnapV2Response = {
        name: 'vlc',
        'snap-id': 'RT9mcUhVsRYrDLG8qnvGiy26NKvv6Qkd',
        'default-track': null,
        snap: {
          license: 'GPL-2.0+',
          name: 'vlc',
          publisher: {
            'display-name': 'VideoLAN',
            id: 'publisher-id',
            username: 'videolan',
            validation: 'verified',
          },
          'snap-id': 'RT9mcUhVsRYrDLG8qnvGiy26NKvv6Qkd',
          'store-url': 'https://snapcraft.io/vlc',
          summary: 'The ultimate media player',
          title: 'VLC',
        },
        'channel-map': [
          {
            channel: {
              architecture: 'amd64',
              name: 'stable',
              'released-at': '2024-03-26T06:49:08.798382+00:00',
              risk: 'stable',
              track: 'latest',
            },
            'created-at': '2023-10-31T02:24:08.237334+00:00',
            download: {
              'sha3-384': 'abc123',
              size: 336699392,
              url: 'https://example.com/vlc.snap',
            },
            revision: 3777,
            type: 'app',
            version: '3.0.20-1-g2617de71b6',
          },
          {
            channel: {
              architecture: 'arm64',
              name: 'stable',
              'released-at': '2024-03-26T06:49:08.798382+00:00',
              risk: 'stable',
              track: 'latest',
            },
            'created-at': '2023-10-31T02:24:08.237334+00:00',
            download: {
              'sha3-384': 'xyz789',
              size: 320000000,
              url: 'https://example.com/vlc-arm64.snap',
            },
            revision: 3778,
            type: 'app',
            version: '3.0.20-1-g2617de71b6',
          },
        ],
      };

      const v1Data: SnapV1Response = {
        name: 'vlc.videolan',
        package_name: 'vlc',
        title: 'VLC',
        summary: 'The ultimate media player',
        description: 'VLC is the VideoLAN projects media player. Very detailed description here.',
        icon_url: 'https://example.com/icon.png',
        last_updated: '2024-01-15T10:00:00Z',
        screenshot_urls: ['https://example.com/screenshot1.png', 'https://example.com/screenshot2.png'],
        base: 'core18',
        confinement: 'strict',
        license: 'GPL-2.0+',
        publisher: 'VideoLAN',
        developer_name: 'VideoLAN',
        developer_id: 'dev-id',
        developer_validation: 'verified',
        version: '3.0.20',
        revision: 3777,
        architecture: ['amd64'],
        apps: ['vlc'],
        channel: 'stable',
        release: ['16'],
        binary_filesize: 336699392,
        download_url: 'https://example.com/vlc.snap',
        anon_download_url: 'https://example.com/vlc.snap',
        download_sha3_384: 'abc123',
        download_sha512: 'def456',
        snap_id: 'RT9mcUhVsRYrDLG8qnvGiy26NKvv6Qkd',
        common_ids: ['org.videolan.vlc'],
        contact: 'https://www.videolan.org/support/',
        support_url: 'https://www.videolan.org/support/',
        links: {
          contact: ['https://www.videolan.org/support/'],
          website: ['https://www.videolan.org/vlc/'],
        },
        origin: 'videolan',
      };

      const result = transformSnapToPackage(v2Data, v1Data, 'music-and-audio');

      assert.equal(result.id, 'snap.vlc');
      assert.equal(result.name, 'VLC');
      assert.equal(result.tagline, 'The ultimate media player');
      assert.equal(result.description, 'VLC is the VideoLAN projects media player. Very detailed description here.');
      assert.equal(result.package_type, PackageType.SNAP);
      assert.equal(result.source_store, SourceStore.SNAPCRAFT);
      assert.equal(result.external_id, 'vlc');

      assert.equal(result.category, 'Music & Audio');

      assert.equal(result.license, 'GNU GPL v2');

      assert.equal(result.architectures?.length, 2);
      assert.ok(result.architectures?.includes(Architecture.AMD64));
      assert.ok(result.architectures?.includes(Architecture.ARM64));

      assert.equal(result.channel_architectures?.length, 2);
      assert.ok(result.channel_architectures?.includes('focal:amd64' as any));
      assert.ok(result.channel_architectures?.includes('focal:arm64' as any));

      assert.equal(result.device_compatibilities?.length, 2);
      assert.ok(result.device_compatibilities?.includes('focal:amd64:ubuntu-touch-24.04-1.x'));
      assert.ok(result.device_compatibilities?.includes('focal:arm64:ubuntu-touch-24.04-1.x'));

      assert.equal(result.revisions?.length, 2);

      assert.equal(result.snap_data?.confinement, 'strict');
      assert.equal(result.snap_data?.base, 'core18');
      assert.equal(result.snap_data?.channels.length, 1);
      assert.ok(result.snap_data?.channels.includes('stable'));

      assert.equal(result.screenshots?.length, 2);
      assert.equal(result.icon, 'https://example.com/icon.png');

      assert.equal(result.author, 'VideoLAN');
      assert.equal(result.maintainer_name, 'VideoLAN');

      assert.equal(result.support_url, 'https://www.videolan.org/support/');
      assert.equal(result.source, 'https://www.videolan.org/vlc/');
    });

    test('should handle v2-only data (no v1)', () => {
      const v2Data: SnapV2Response = {
        name: 'test-snap',
        'snap-id': 'test-id',
        'default-track': null,
        snap: {
          license: 'MIT',
          name: 'test-snap',
          publisher: {
            'display-name': 'Test Publisher',
            id: 'pub-id',
            username: 'testpub',
            validation: 'unproven',
          },
          'snap-id': 'test-id',
          'store-url': 'https://snapcraft.io/test-snap',
          summary: 'A test snap',
          title: 'Test Snap',
        },
        'channel-map': [
          {
            channel: {
              architecture: 'amd64',
              name: 'stable',
              'released-at': '2024-01-01T00:00:00.000000+00:00',
              risk: 'stable',
              track: 'latest',
            },
            'created-at': '2024-01-01T00:00:00.000000+00:00',
            download: {
              'sha3-384': 'abc',
              size: 10000000,
              url: 'https://example.com/test.snap',
            },
            revision: 1,
            type: 'app',
            version: '1.0.0',
          },
        ],
      };

      const result = transformSnapToPackage(v2Data, null, 'utilities');

      assert.equal(result.id, 'snap.test-snap');
      assert.equal(result.name, 'Test Snap');
      assert.equal(result.description, 'A test snap'); // Falls back to summary
      assert.equal(result.screenshots?.length, 0);
      assert.equal(result.icon, '');
      assert.equal(result.snap_data?.confinement, 'strict'); // Default
      assert.equal(result.snap_data?.base, ''); // No v1 data
    });

    test('should map unknown category to Utilities', () => {
      const v2Data: SnapV2Response = {
        name: 'test',
        'snap-id': 'test-id',
        'default-track': null,
        snap: {
          license: 'MIT',
          name: 'test',
          publisher: {
            'display-name': 'Test',
            id: 'id',
            username: 'test',
            validation: 'unproven',
          },
          'snap-id': 'test-id',
          'store-url': 'https://snapcraft.io/test',
          summary: 'Test',
          title: 'Test',
        },
        'channel-map': [
          {
            channel: {
              architecture: 'amd64',
              name: 'stable',
              'released-at': '2024-01-01T00:00:00.000000+00:00',
              risk: 'stable',
              track: 'latest',
            },
            'created-at': '2024-01-01T00:00:00.000000+00:00',
            download: {
              'sha3-384': 'abc',
              size: 10000000,
              url: 'https://example.com/test.snap',
            },
            revision: 1,
            type: 'app',
            version: '1.0.0',
          },
        ],
      };

      const result = transformSnapToPackage(v2Data, null, 'unknown-category');

      assert.equal(result.category, 'Utilities');
    });

    test('should handle multiple channels (stable, beta, edge)', () => {
      const v2Data: SnapV2Response = {
        name: 'multi-channel',
        'snap-id': 'mc-id',
        'default-track': null,
        snap: {
          license: 'MIT',
          name: 'multi-channel',
          publisher: {
            'display-name': 'Test',
            id: 'id',
            username: 'test',
            validation: 'unproven',
          },
          'snap-id': 'mc-id',
          'store-url': 'https://snapcraft.io/multi-channel',
          summary: 'Multi channel snap',
          title: 'Multi Channel',
        },
        'channel-map': [
          {
            channel: {
              architecture: 'amd64',
              name: 'stable',
              'released-at': '2024-01-01T00:00:00.000000+00:00',
              risk: 'stable',
              track: 'latest',
            },
            'created-at': '2024-01-01T00:00:00.000000+00:00',
            download: { 'sha3-384': 'abc', size: 10000000, url: 'https://example.com/test.snap' },
            revision: 1,
            type: 'app',
            version: '1.0.0',
          },
          {
            channel: {
              architecture: 'amd64',
              name: 'beta',
              'released-at': '2024-01-02T00:00:00.000000+00:00',
              risk: 'beta',
              track: 'latest',
            },
            'created-at': '2024-01-02T00:00:00.000000+00:00',
            download: { 'sha3-384': 'def', size: 10000001, url: 'https://example.com/test.snap' },
            revision: 2,
            type: 'app',
            version: '1.1.0-beta',
          },
          {
            channel: {
              architecture: 'amd64',
              name: 'edge',
              'released-at': '2024-01-03T00:00:00.000000+00:00',
              risk: 'edge',
              track: 'latest',
            },
            'created-at': '2024-01-03T00:00:00.000000+00:00',
            download: { 'sha3-384': 'ghi', size: 10000002, url: 'https://example.com/test.snap' },
            revision: 3,
            type: 'app',
            version: '1.2.0-dev',
          },
        ],
      };

      const result = transformSnapToPackage(v2Data, null, 'games');

      assert.equal(result.snap_data?.channels.length, 3);
      assert.ok(result.snap_data?.channels.includes('stable'));
      assert.ok(result.snap_data?.channels.includes('beta'));
      assert.ok(result.snap_data?.channels.includes('edge'));
      assert.equal(result.revisions?.length, 3);
    });

    test('should map SPDX licenses to OpenStore licenses', () => {
      const createV2Data = (license: string): SnapV2Response => ({
        name: 'test',
        'snap-id': 'test-id',
        'default-track': null,
        snap: {
          license,
          name: 'test',
          publisher: {
            'display-name': 'Test',
            id: 'id',
            username: 'test',
            validation: 'unproven',
          },
          'snap-id': 'test-id',
          'store-url': 'https://snapcraft.io/test',
          summary: 'Test',
          title: 'Test',
        },
        'channel-map': [{
          channel: {
            architecture: 'amd64',
            name: 'stable',
            'released-at': '2024-01-01T00:00:00.000000+00:00',
            risk: 'stable',
            track: 'latest',
          },
          'created-at': '2024-01-01T00:00:00.000000+00:00',
          download: { 'sha3-384': 'abc', size: 10000000, url: 'https://example.com/test.snap' },
          revision: 1,
          type: 'app',
          version: '1.0.0',
        }],
      });

      assert.equal(transformSnapToPackage(createV2Data('GPL-3.0'), null, 'utilities').license, 'GNU GPL v3');
      assert.equal(transformSnapToPackage(createV2Data('GPL-3.0+'), null, 'utilities').license, 'GNU GPL v3');
      assert.equal(transformSnapToPackage(createV2Data('GPL-3.0-or-later'), null, 'utilities').license, 'GNU GPL v3');
      assert.equal(transformSnapToPackage(createV2Data('GPL-2.0'), null, 'utilities').license, 'GNU GPL v2');
      assert.equal(transformSnapToPackage(createV2Data('GPL-2.0+'), null, 'utilities').license, 'GNU GPL v2');
      assert.equal(transformSnapToPackage(createV2Data('LGPL-3.0'), null, 'utilities').license, 'GNU LGPL v3');
      assert.equal(transformSnapToPackage(createV2Data('LGPL-2.1'), null, 'utilities').license, 'GNU LGPL v2.1');
      assert.equal(transformSnapToPackage(createV2Data('AGPL-3.0'), null, 'utilities').license, 'GNU Affero GPL v3');
      assert.equal(transformSnapToPackage(createV2Data('AGPL-3.0-only'), null, 'utilities').license, 'GNU Affero GPL v3');
      assert.equal(transformSnapToPackage(createV2Data('Apache-2.0'), null, 'utilities').license, 'Apache License');
      assert.equal(transformSnapToPackage(createV2Data('MIT'), null, 'utilities').license, 'MIT/X/Expat License');
      assert.equal(transformSnapToPackage(createV2Data('BSD-3-Clause'), null, 'utilities').license, 'BSD License (Simplified)');
      assert.equal(transformSnapToPackage(createV2Data('MPL-2.0'), null, 'utilities').license, 'Mozilla Public License');
      assert.equal(transformSnapToPackage(createV2Data('EPL-2.0'), null, 'utilities').license, 'Eclipse Public License');
      assert.equal(transformSnapToPackage(createV2Data('Proprietary'), null, 'utilities').license, 'Proprietary');
      assert.equal(transformSnapToPackage(createV2Data('unset'), null, 'utilities').license, 'Other Open Source');
      assert.equal(transformSnapToPackage(createV2Data(''), null, 'utilities').license, 'Other Open Source');
    });
  });

  describe('discoverSnaps', () => {
    test('should discover snaps across multiple search terms', async () => {
      let callCount = 0;
      const mockFetch = mock.fn(async (url: string) => {
        callCount++;
        // Return different results for different search terms
        const results = callCount === 1
          ? [{ name: 'snap1', 'snap-id': 'id1' }]
          : [{ name: 'snap2', 'snap-id': 'id2' }];

        return {
          ok: true,
          json: async () => ({ results }),
        };
      }) as any;

      const results = await discoverSnaps(10, mockFetch);

      assert.ok(results.length > 0);
      assert.ok(mockFetch.mock.calls.length > 1); // Should make multiple calls
    });

    test('should deduplicate across search terms', async () => {
      const mockFetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({
          results: [
            { name: 'vlc', 'snap-id': 'same-id' },
          ],
        }),
      })) as any;

      const results = await discoverSnaps(5, mockFetch);

      // All results have the same snap-id, so should only get 1 unique snap
      assert.equal(results.length, 1);
    });
  });

  describe('Category Mapping', () => {
    test('should have mappings for common Snapcraft categories', () => {
      assert.equal(CATEGORY_MAPPING.games, 'Games');
      assert.equal(CATEGORY_MAPPING.development, 'Developer Tools');
      assert.equal(CATEGORY_MAPPING.productivity, 'Productivity');
      assert.equal(CATEGORY_MAPPING['music-and-audio'], 'Music & Audio');
    });
  });

  describe('Architecture Mapping', () => {
    test('should map Snapcraft architectures to OpenStore architectures', () => {
      assert.equal(ARCH_MAPPING.amd64, Architecture.AMD64);
      assert.equal(ARCH_MAPPING.arm64, Architecture.ARM64);
      assert.equal(ARCH_MAPPING.armhf, Architecture.ARMHF);
      assert.equal(ARCH_MAPPING.all, Architecture.ALL);
    });
  });
});
