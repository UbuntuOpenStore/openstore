// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test, describe, mock } from 'node:test';

import { Architecture, PackageType, SourceStore, SnapChannel } from '../db/package/types';
import {
  fetchSnapDetailsV2,
  transformSnapToPackage,
  parseSnapYaml,
  discoverSnaps,
  CATEGORY_MAPPING,
  ARCH_MAPPING,
  PREFIX_CHARS,
  VOWELS,
  type SnapV2Response,
} from './snap-scraper';

describe('Snap Scraper Utils', () => {
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
      assert.deepEqual(firstRevision?.snap_data?.connections, []);

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
    test('should search using q= prefix parameter', async () => {
      const queriesUsed: string[] = [];
      const mockFetch = mock.fn(async (url: string) => {
        const urlObj = new URL(url);
        assert.ok(urlObj.searchParams.has('q'), 'Should use q= parameter');
        queriesUsed.push(urlObj.searchParams.get('q')!);
        return {
          ok: true,
          json: async () => ({ results: [] }),
        };
      }) as any;

      await discoverSnaps(mockFetch, async () => {});

      // Should search for each character in PREFIX_CHARS
      for (const char of PREFIX_CHARS) {
        assert.ok(queriesUsed.includes(char), `Should have searched for prefix "${char}"`);
      }
    });

    test('should recurse using vowels after a consonant when 100 results are returned', async () => {
      const queriesUsed: string[] = [];
      const fullPage = Array.from({ length: 100 }, (_, i) => ({ name: `snap-${i}`, 'snap-id': `id-${i}` }));

      const mockFetch = mock.fn(async (url: string) => {
        const urlObj = new URL(url);
        const q = urlObj.searchParams.get('q')!;
        queriesUsed.push(q);
        // Return full page for consonant 't', empty for everything else
        const results = q === 't' ? fullPage : [];
        return {
          ok: true,
          json: async () => ({ results }),
        };
      }) as any;

      await discoverSnaps(mockFetch, async () => {});

      // 't' is a consonant so second chars should only be vowels
      for (const c of Array.from(VOWELS)) {
        assert.ok(queriesUsed.includes(`t${c}`), `Should recurse into "t${c}" (vowel after consonant)`);
      }
      // Should NOT use a consonant as the second char after a consonant
      assert.ok(!queriesUsed.includes('tb'), 'Should not recurse into "tb" (consonant after consonant)');
      assert.ok(!queriesUsed.includes('tt'), 'Should not recurse into "tt" (consonant after consonant)');
    });

    test('should recurse using consonants after a vowel when 100 results are returned', async () => {
      const queriesUsed: string[] = [];
      const fullPage = Array.from({ length: 100 }, (_, i) => ({ name: `snap-${i}`, 'snap-id': `id-${i}` }));

      const mockFetch = mock.fn(async (url: string) => {
        const urlObj = new URL(url);
        const q = urlObj.searchParams.get('q')!;
        queriesUsed.push(q);
        // Return full page for vowel 'a', empty for everything else
        const results = q === 'a' ? fullPage : [];
        return {
          ok: true,
          json: async () => ({ results }),
        };
      }) as any;

      await discoverSnaps(mockFetch, async () => {});

      // 'a' is a vowel so second chars should only be non-vowels
      assert.ok(queriesUsed.includes('ab'), 'Should recurse into "ab" (consonant after vowel)');
      assert.ok(queriesUsed.includes('at'), 'Should recurse into "at" (consonant after vowel)');
      // Should NOT use a vowel as the second char after a vowel
      assert.ok(!queriesUsed.includes('aa'), 'Should not recurse into "aa" (vowel after vowel)');
      assert.ok(!queriesUsed.includes('ae'), 'Should not recurse into "ae" (vowel after vowel)');
    });

    test('should not recurse deeper than 2 characters', async () => {
      const queriesUsed: string[] = [];
      const fullPage = Array.from({ length: 100 }, (_, i) => ({ name: `snap-${i}`, 'snap-id': `id-${i}` }));

      const mockFetch = mock.fn(async (url: string) => {
        const urlObj = new URL(url);
        const q = urlObj.searchParams.get('q')!;
        queriesUsed.push(q);
        // Always return a full page to see if recursion goes beyond 2 chars
        return {
          ok: true,
          json: async () => ({ results: fullPage }),
        };
      }) as any;

      await discoverSnaps(mockFetch, async () => {});

      const maxPrefixLength = Math.max(...queriesUsed.map((q) => q.length));
      assert.equal(maxPrefixLength, 2, 'Should not recurse beyond 2-character prefixes');
    });

    test('should not recurse when fewer than 100 results are returned', async () => {
      const queriesUsed: string[] = [];

      const mockFetch = mock.fn(async (url: string) => {
        const urlObj = new URL(url);
        queriesUsed.push(urlObj.searchParams.get('q')!);
        return {
          ok: true,
          json: async () => ({ results: [{ name: 'snap1', 'snap-id': 'id1' }] }),
        };
      }) as any;

      await discoverSnaps(mockFetch, async () => {});

      // Only the initial PREFIX_CHARS queries should have been made — no recursion
      assert.equal(queriesUsed.length, PREFIX_CHARS.length);
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

  describe('parseSnapYaml', () => {
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

      const { permissions } = parseSnapYaml(snapYaml);
      assert.deepEqual(permissions, ['audio-playback', 'network', 'x11']);
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

      const { permissions } = parseSnapYaml(snapYaml);
      assert.deepEqual(permissions, ['network', 'wayland', 'x11']);
    });

    test('should return ["unknown"] when no apps or plugs defined', () => {
      assert.deepEqual(parseSnapYaml('name: myapp\nversion: 1.0').permissions, ['unknown']);
      assert.deepEqual(parseSnapYaml('name: myapp\napps:\n  myapp:\n    command: bin/myapp').permissions, ['unknown']);
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

      assert.deepEqual(parseSnapYaml(snapYaml).permissions, ['unconfined']);
    });

    test('should return ["unknown"] on invalid YAML', () => {
      assert.deepEqual(parseSnapYaml('invalid: yaml: {{{').permissions, ['unknown']);
    });
    test('should extract slots from snap.yaml', () => {
      const snapYaml = [
        'name: myapp',
        'slots:',
        '  my-slot:',
        '    interface: content',
        '    content: my-shared-data',
        '  other-slot:',
        '    interface: dbus',
        '    bus: session',
      ].join('\n');

      const { connections } = parseSnapYaml(snapYaml);
      assert.equal(connections.length, 2);
      assert.equal(connections[0].name, 'my-slot');
      assert.equal(connections[0].interface, 'content');
      assert.equal(connections[0].type, 'slot');
      assert.equal(connections[1].name, 'other-slot');
      assert.equal(connections[1].interface, 'dbus');
      assert.equal(connections[1].type, 'slot');
    });

    test('should extract plugs with default-provider', () => {
      const snapYaml = [
        'name: myapp',
        'plugs:',
        '  shared-content:',
        '    interface: content',
        '    content: shared-data',
        '    default-provider: other-snap',
        '    target: $SNAP/data',
      ].join('\n');

      const { connections } = parseSnapYaml(snapYaml);
      assert.equal(connections.length, 1);
      assert.deepEqual(connections[0], {
        name: 'shared-content',
        interface: 'content',
        type: 'plug',
        snap: 'other-snap',
        label: '',
      });
    });

    test('should extract both slots and plugs with default-provider', () => {
      const snapYaml = [
        'name: myapp',
        'plugs:',
        '  content-plug:',
        '    interface: content',
        '    content: remote-data',
        '    default-provider: remote-snap',
        'slots:',
        '  content-slot:',
        '    interface: content',
        '    content: local-data',
      ].join('\n');

      const { connections } = parseSnapYaml(snapYaml);
      assert.equal(connections.length, 2);
      assert.deepEqual(connections[0], {
        name: 'content-plug',
        interface: 'content',
        type: 'plug',
        snap: 'remote-snap',
        label: '',
      });
      assert.equal(connections[1].name, 'content-slot');
      assert.equal(connections[1].interface, 'content');
      assert.equal(connections[1].type, 'slot');
    });

    test('should ignore simple plugs without default-provider', () => {
      const snapYaml = ['name: myapp', 'plugs:', '  simple-plug: null', '  other-plug:', '    interface: some-iface'].join('\n');

      const { connections } = parseSnapYaml(snapYaml);
      assert.equal(connections.length, 0);
    });

    test('should return empty connections on invalid YAML', () => {
      assert.deepEqual(parseSnapYaml('invalid: yaml: {{{').connections, []);
    });

    test('should extract label from content interface connections', () => {
      const snapYaml = [
        'name: myapp',
        'plugs:',
        '  content-plug:',
        '    interface: content',
        '    content: my-content',
        '    default-provider: content-snap',
        '    label: my-label',
      ].join('\n');

      const { connections } = parseSnapYaml(snapYaml);
      assert.equal(connections.length, 1);
      assert.equal(connections[0].label, 'my-label');
    });

    test('should return empty connections when no plugs or slots defined', () => {
      const snapYaml = 'name: myapp\nversion: 1.0';
      assert.deepEqual(parseSnapYaml(snapYaml).connections, []);
    });
  });
});
