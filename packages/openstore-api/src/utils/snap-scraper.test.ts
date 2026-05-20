import assert from 'node:assert/strict';
import { test, describe, mock } from 'node:test';

import { Architecture, PackageType, SourceStore, SnapChannel } from '../db/package/types';
import {
  fetchSnaps,
  fetchSnapDetailsV2,
  transformSnapToPackage,
  parseSnapYamlPlugs,
  discoverSnaps,
  CATEGORY_MAPPING,
  ARCH_MAPPING,
  type SnapV2Response,
} from './snap-scraper';

describe('Snap Scraper Utils', () => {
  describe('fetchSnaps', () => {
    test('should fetch and return snaps by category', async () => {
      const mockResponse = {
        results: [
          { name: 'vlc', 'snap-id': 'id1' },
          { name: 'firefox', 'snap-id': 'id2' },
        ],
      };

      const mockFetch = mock.fn(async (url: string) => {
        assert.ok(url.includes('category=games'));
        return {
          ok: true,
          json: async () => mockResponse,
        };
      }) as any;

      const results = await fetchSnaps('games', undefined, mockFetch);

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

      const results = await fetchSnaps('productivity', 2, mockFetch);

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

      const results = await fetchSnaps('entertainment', undefined, mockFetch);

      assert.equal(results.length, 1);
      assert.equal(results[0].name, 'vlc');
    });

    test('should return empty array on 404', async () => {
      const mockFetch = mock.fn(async () => ({
        ok: false,
        status: 404,
      })) as any;

      const results = await fetchSnaps('nonexistent-category', undefined, mockFetch);

      assert.equal(results.length, 0);
    });

    test('should return empty array on 400', async () => {
      const mockFetch = mock.fn(async () => ({
        ok: false,
        status: 400,
      })) as any;

      const results = await fetchSnaps('invalid-category', undefined, mockFetch);

      assert.equal(results.length, 0);
    });

    test('should throw on other errors', async () => {
      const mockFetch = mock.fn(async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })) as any;

      await assert.rejects(async () => await fetchSnaps('games', undefined, mockFetch), { message: /Failed to fetch snaps/ });
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
            confinement: 'strict',
            base: 'core18',
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

      await assert.rejects(async () => await fetchSnapDetailsV2('nonexistent', mockFetch), { message: /Failed to fetch v2 details/ });
    });
  });

  describe('transformSnapToPackage', () => {
    test('should transform v2 data to package format', () => {
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
          categories: [{ featured: false, name: 'music-and-audio' }],
          description: 'VLC is the VideoLAN projects media player. Very detailed description here.',
          media: [
            { type: 'icon', url: 'https://example.com/icon.png', width: 256, height: 256 },
            { type: 'screenshot', url: 'https://example.com/screenshot1.png', width: 1280, height: 720 },
            { type: 'screenshot', url: 'https://example.com/screenshot2.png', width: 1280, height: 720 },
          ],
          links: {
            contact: ['https://www.videolan.org/support/'],
            website: ['https://www.videolan.org/vlc/'],
          },
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
            confinement: 'strict',
            base: 'core18',
            'snap-yaml': 'name: vlc\napps:\n  vlc:\n    command: bin/vlc\n    plugs:\n    - network\n    - x11\n    - audio-playback\n',
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
            confinement: 'strict',
            base: 'core18',
          },
        ],
      };

      const result = transformSnapToPackage(v2Data);

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
      const firstRevision = (result.revisions as any)?.[0];
      assert.deepEqual(firstRevision?.permissions, ['audio-playback', 'network', 'x11']);

      assert.equal(result.snap_data?.confinement, 'strict');
      assert.equal(result.snap_data?.base, 'core18');
      assert.equal(result.snap_data?.channels.length, 1);
      assert.ok(result.snap_data?.channels.includes(SnapChannel.STABLE));

      assert.equal(result.screenshots?.length, 2);
      assert.equal(result.icon, 'https://example.com/icon.png');

      assert.equal(result.author, 'VideoLAN');
      assert.equal(result.maintainer_name, 'VideoLAN');

      assert.equal(result.support_url, 'https://www.videolan.org/support/');
      assert.equal(result.source, 'https://www.videolan.org/vlc/');
    });

    test('should fall back to summary when description is missing', () => {
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
            confinement: 'strict',
            base: 'core22',
          },
        ],
      };

      const result = transformSnapToPackage(v2Data);

      assert.equal(result.id, 'snap.test-snap');
      assert.equal(result.name, 'Test Snap');
      assert.equal(result.description, 'A test snap'); // Falls back to summary
      assert.equal(result.screenshots?.length, 0);
      assert.equal(result.icon, '');
      assert.equal(result.snap_data?.confinement, 'strict');
      assert.equal(result.snap_data?.base, 'core22');
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
          categories: [{ featured: false, name: 'unknown-category' }],
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
            confinement: 'strict',
            base: 'core22',
          },
        ],
      };

      const result = transformSnapToPackage(v2Data);

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
            confinement: 'strict',
            base: 'core22',
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
            confinement: 'strict',
            base: 'core22',
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
            confinement: 'strict',
            base: 'core22',
          },
        ],
      };

      const result = transformSnapToPackage(v2Data);

      assert.equal(result.snap_data?.channels.length, 3);
      assert.ok(result.snap_data?.channels.includes(SnapChannel.STABLE));
      assert.ok(result.snap_data?.channels.includes(SnapChannel.BETA));
      assert.ok(result.snap_data?.channels.includes(SnapChannel.EDGE));
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
            confinement: 'strict',
            base: 'core22',
          },
        ],
      });

      assert.equal(transformSnapToPackage(createV2Data('GPL-3.0')).license, 'GNU GPL v3');
      assert.equal(transformSnapToPackage(createV2Data('GPL-3.0+')).license, 'GNU GPL v3');
      assert.equal(transformSnapToPackage(createV2Data('GPL-3.0-or-later')).license, 'GNU GPL v3');
      assert.equal(transformSnapToPackage(createV2Data('GPL-2.0')).license, 'GNU GPL v2');
      assert.equal(transformSnapToPackage(createV2Data('GPL-2.0+')).license, 'GNU GPL v2');
      assert.equal(transformSnapToPackage(createV2Data('LGPL-3.0')).license, 'GNU LGPL v3');
      assert.equal(transformSnapToPackage(createV2Data('LGPL-2.1')).license, 'GNU LGPL v2.1');
      assert.equal(transformSnapToPackage(createV2Data('AGPL-3.0')).license, 'GNU Affero GPL v3');
      assert.equal(transformSnapToPackage(createV2Data('AGPL-3.0-only')).license, 'GNU Affero GPL v3');
      assert.equal(transformSnapToPackage(createV2Data('Apache-2.0')).license, 'Apache License');
      assert.equal(transformSnapToPackage(createV2Data('MIT')).license, 'MIT/X/Expat License');
      assert.equal(transformSnapToPackage(createV2Data('BSD-3-Clause')).license, 'BSD License (Simplified)');
      assert.equal(transformSnapToPackage(createV2Data('MPL-2.0')).license, 'Mozilla Public License');
      assert.equal(transformSnapToPackage(createV2Data('EPL-2.0')).license, 'Eclipse Public License');
      assert.equal(transformSnapToPackage(createV2Data('Proprietary')).license, 'Proprietary');
      assert.equal(transformSnapToPackage(createV2Data('unset')).license, 'Other Open Source');
      assert.equal(transformSnapToPackage(createV2Data('')).license, 'Other Open Source');
    });
  });

  describe('discoverSnaps', () => {
    test('should discover snaps across multiple categories', async () => {
      let callCount = 0;
      const mockFetch = mock.fn(async (url: string) => {
        callCount++;
        // Verify URL contains category parameter
        assert.ok(url.includes('category='));

        // Return different results for different categories
        const results = callCount === 1 ? [{ name: 'snap1', 'snap-id': 'id1' }] : [{ name: 'snap2', 'snap-id': 'id2' }];

        return {
          ok: true,
          json: async () => ({ results }),
        };
      }) as any;

      const results = await discoverSnaps(10, mockFetch);

      assert.ok(results.length > 0);
      assert.ok(mockFetch.mock.calls.length > 1); // Should make multiple calls for different categories
    });

    test('should deduplicate across categories', async () => {
      const mockFetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({
          results: [{ name: 'vlc', 'snap-id': 'same-id' }],
        }),
      })) as any;

      const results = await discoverSnaps(5, mockFetch);

      // All results have the same snap-id, so should only get 1 unique snap
      assert.equal(results.length, 1);
    });

    test('should iterate through all categories from CATEGORY_MAPPING', async () => {
      const categoriesUsed = new Set<string>();
      const mockFetch = mock.fn(async (url: string) => {
        const urlObj = new URL(url);
        const category = urlObj.searchParams.get('category');
        if (category) {
          categoriesUsed.add(category);
        }

        return {
          ok: true,
          json: async () => ({ results: [] }),
        };
      }) as any;

      await discoverSnaps(undefined, mockFetch);

      const expectedCategories = Object.keys(CATEGORY_MAPPING);
      assert.equal(categoriesUsed.size, expectedCategories.length);

      expectedCategories.forEach((cat) => {
        assert.ok(categoriesUsed.has(cat), `Category ${cat} should be used`);
      });
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

  describe('parseSnapYamlPlugs', () => {
    test('should extract plugs from app definitions', () => {
      const snapYaml = [
        'name: myapp',
        'apps:',
        '  myapp:',
        '    command: bin/myapp',
        '    plugs:',
        '    - network',
        '    - x11',
        '    - audio-playback',
      ].join('\n');

      const plugs = parseSnapYamlPlugs(snapYaml);
      assert.deepEqual(plugs, ['audio-playback', 'network', 'x11']);
    });

    test('should deduplicate plugs across multiple apps', () => {
      const snapYaml = [
        'name: myapp',
        'apps:',
        '  app1:',
        '    command: bin/app1',
        '    plugs:',
        '    - network',
        '    - x11',
        '  app2:',
        '    command: bin/app2',
        '    plugs:',
        '    - network',
        '    - wayland',
      ].join('\n');

      const plugs = parseSnapYamlPlugs(snapYaml);
      assert.deepEqual(plugs, ['network', 'wayland', 'x11']);
    });

    test('should return ["unknown"] when no apps or plugs defined', () => {
      assert.deepEqual(parseSnapYamlPlugs('name: myapp\nversion: 1.0'), ['unknown']);
      assert.deepEqual(parseSnapYamlPlugs('name: myapp\napps:\n  myapp:\n    command: bin/myapp'), ['unknown']);
    });

    test('should return ["unconfined"] for classic confinement', () => {
      const snapYaml = [
        'name: myapp',
        'confinement: classic',
        'apps:',
        '  myapp:',
        '    command: bin/myapp',
        '    plugs:',
        '    - network',
      ].join('\n');

      assert.deepEqual(parseSnapYamlPlugs(snapYaml), ['unconfined']);
    });

    test('should return ["unknown"] on invalid YAML', () => {
      assert.deepEqual(parseSnapYamlPlugs('invalid: yaml: {{{'), ['unknown']);
    });
  });
});
