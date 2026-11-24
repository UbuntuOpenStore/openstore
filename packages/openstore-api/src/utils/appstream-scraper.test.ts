// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { test, describe, mock } from 'node:test';
import { createGunzip, gzipSync } from 'node:zlib';

import { pack as createTar } from 'tar-stream';

import { AppType, Architecture, SourceStore } from '../db/package/types';
import { withAbortTimeout } from './abort-timeout';
import {
  APPSTREAM_COMPONENT_TYPES,
  appIdFromComponent,
  compileAllowlist,
  extractIconEntries,
  fetchAppstreamStream,
  getMediaBaseUrl,
  iconSources,
  isWantedComponent,
  mergeComponents,
  parseAppstreamDocuments,
  resolveMediaUrl,
  transformComponent,
  type AppstreamDoc,
  type AppstreamPackageData,
} from './appstream-scraper';
import { CHANGELOG_MAX_LENGTH, DESCRIPTION_MAX_LENGTH, KEYWORDS_MAX_COUNT } from './limits';

const MEDIA_BASE_URL = 'https://appstream.ubuntu.com/media/noble';

function dep11Fixture(): string {
  return [
    'File: DEP-11',
    'Origin: Ubuntu',
    `MediaBaseUrl: ${MEDIA_BASE_URL}`,
    '---',
    'Type: desktop-application',
    'ID: org.gnome.gedit.desktop',
    'Package: gedit',
    'Name:',
    '  C: gedit',
    '---',
    'Type: desktop-application',
    'ID: libreoffice-writer.desktop',
    'Package: libreoffice-writer',
    'Name:',
    '  C: LibreOffice Writer',
    '---',
    'Type: font',
    'ID: fonts-freefont.desktop',
    'Name:',
    '  C: FreeFont',
    '',
  ].join('\n');
}

function iconTarBuffer(): Promise<Buffer> {
  const pack = createTar();
  const chunks: Buffer[] = [];
  pack.on('data', (chunk: unknown) => chunks.push(chunk as Buffer));
  const done = new Promise<Buffer>((resolve, reject) => {
    pack.on('end', () => resolve(Buffer.concat(chunks)));
    pack.on('error', reject);
  });

  pack.entry({ name: 'app.png', mtime: new Date('2022-01-01T00:00:00Z') }, 'old');
  pack.entry({ name: 'other.png', mtime: new Date('2023-01-01T00:00:00Z') }, 'other');
  pack.entry({ name: 'app.png', mtime: new Date('2024-01-01T00:00:00Z') }, 'new');
  pack.finalize();
  return done;
}

describe('AppStream scraper utils', () => {
  test('keeps only desktop applications', () => {
    assert.deepEqual(APPSTREAM_COMPONENT_TYPES, ['desktop-application']);
  });

  describe('compileAllowlist', () => {
    test('compiles unanchored patterns', () => {
      const patterns = compileAllowlist(['^org\\.gnome\\.', 'gedit']);
      assert.equal(patterns.length, 2);
      assert.ok(patterns[0].test('org.gnome.gedit'));
      assert.ok(!patterns[0].test('org.kde.gedit'));
      assert.ok(patterns[1].test('prefix-gedit-suffix'));
    });

    test('names the bad pattern and regex error', () => {
      assert.throws(
        () => compileAllowlist(['valid', '(']),
        (err: Error) => err.message.includes('"("') && /invalid regular expression/i.test(err.message),
      );
    });
  });

  describe('appIdFromComponent', () => {
    test('strips only a trailing .desktop', () => {
      assert.equal(appIdFromComponent({ ID: 'org.gnome.gedit.desktop' }), 'org.gnome.gedit');
      assert.equal(appIdFromComponent({ ID: 'org.gnome.gedit' }), 'org.gnome.gedit');
      assert.equal(appIdFromComponent({ ID: 'foo.desktop.desktop' }), 'foo.desktop');
      assert.equal(appIdFromComponent({ ID: 'foo.desktop.exe' }), 'foo.desktop.exe');
      assert.equal(appIdFromComponent({}), undefined);
    });
  });

  describe('isWantedComponent', () => {
    test('filters by type, ID, Name and allowlist', () => {
      const component: AppstreamDoc = {
        Type: 'desktop-application',
        ID: 'org.gnome.gedit.desktop',
        Name: { C: 'gedit' },
      };
      assert.ok(isWantedComponent(component, []));
      assert.ok(isWantedComponent({ ...component, Name: 'gedit' }, []));
      assert.ok(!isWantedComponent({ ...component, Type: 'font' }, []));
      assert.ok(!isWantedComponent({ ...component, ID: undefined }, []));
      assert.ok(!isWantedComponent({ ...component, Name: {} }, []));
      assert.ok(isWantedComponent(component, compileAllowlist(['^org\\.gnome\\.'])));
      assert.ok(!isWantedComponent(component, compileAllowlist(['^org\\.kde\\.'])));
    });
  });

  describe('getMediaBaseUrl and resolveMediaUrl', () => {
    test('reads the header URL', () => {
      assert.equal(getMediaBaseUrl({ File: 'DEP-11', MediaBaseUrl: MEDIA_BASE_URL }), MEDIA_BASE_URL);
      assert.equal(getMediaBaseUrl({}), '');
    });

    test('keeps absolute URLs and joins relative ones', () => {
      assert.equal(resolveMediaUrl(MEDIA_BASE_URL, 'https://cdn.example.com/a.png'), 'https://cdn.example.com/a.png');
      assert.equal(resolveMediaUrl(MEDIA_BASE_URL, '//cdn.example.com/a.png'), '//cdn.example.com/a.png');
      assert.equal(resolveMediaUrl(MEDIA_BASE_URL, 'icons/a.png'), `${MEDIA_BASE_URL}/icons/a.png`);
      assert.equal(resolveMediaUrl(MEDIA_BASE_URL, '/icons/a.png'), `${MEDIA_BASE_URL}/icons/a.png`);
      assert.equal(resolveMediaUrl(`${MEDIA_BASE_URL}/`, 'icons/a.png'), `${MEDIA_BASE_URL}/icons/a.png`);
    });
  });

  describe('fetchAppstreamStream', () => {
    test('fetches plainly and decompresses the body', async () => {
      const body = Readable.toWeb(Readable.from([gzipSync(dep11Fixture())])) as unknown as ReadableStream;
      const mockFetch = mock.fn(async () => ({ ok: true, status: 200, statusText: 'OK', body })) as any;

      const stream = await fetchAppstreamStream('https://example.com/Components-amd64.yml.gz', mockFetch);
      const text = await new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString()));
        stream.on('error', reject);
      });

      assert.ok(text.startsWith('File: DEP-11'));
      assert.equal(mockFetch.mock.calls.length, 1);
      const args = mockFetch.mock.calls[0].arguments;
      assert.equal(args[0], 'https://example.com/Components-amd64.yml.gz');
      assert.equal(args[1].headers, undefined);
    });

    test('throws on a non-2xx response', async () => {
      const mockFetch = mock.fn(async () => ({ ok: false, status: 404, statusText: 'Not Found', body: null })) as any;
      await assert.rejects(async () => fetchAppstreamStream('https://example.com/missing.yml.gz', mockFetch), /404/);
    });

    test('forwards the caller signal to fetch', async () => {
      const body = Readable.toWeb(Readable.from([gzipSync(dep11Fixture())])) as unknown as ReadableStream;
      const mockFetch = mock.fn(async () => ({ ok: true, status: 200, statusText: 'OK', body })) as any;
      const controller = new AbortController();

      await fetchAppstreamStream('https://example.com/Components-amd64.yml.gz', mockFetch, controller.signal);

      assert.equal(mockFetch.mock.calls[0].arguments[1].signal, controller.signal);
    });

    test('a caller timeout covers the body download', async () => {
      const mockFetch = mock.fn(async (_url: string, options: { signal: AbortSignal }) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            options.signal.addEventListener('abort', () => controller.error(new Error('network aborted')), { once: true });
          },
        });
        return { ok: true, status: 200, statusText: 'OK', body };
      }) as any;

      await assert.rejects(
        withAbortTimeout(
          10,
          async (signal) => {
            const stream = await fetchAppstreamStream('https://example.com/slow.yml.gz', mockFetch, signal);
            for await (const chunk of stream) {
              assert.ok(chunk);
            }
          },
          'Timed out fetching slow',
        ),
        /Timed out fetching slow/i,
      );
    });
  });

  describe('parseAppstreamDocuments', () => {
    test('yields the header and every document from a gzipped stream', async () => {
      const stream = Readable.from([gzipSync(dep11Fixture())]).pipe(createGunzip());
      const documents: AppstreamDoc[] = [];
      for await (const document of parseAppstreamDocuments(stream)) {
        documents.push(document);
      }

      assert.equal(documents.length, 4);
      assert.equal(documents[0].File, 'DEP-11');
      assert.equal(documents[0].MediaBaseUrl, MEDIA_BASE_URL);
      assert.equal(documents[1].ID, 'org.gnome.gedit.desktop');
      assert.equal(documents[2].ID, 'libreoffice-writer.desktop');
      assert.equal(documents[3].Type, 'font');
    });

    test('yields a document without waiting for the end of the stream', { timeout: 2000 }, async () => {
      const stream = new Readable({
        read() {
          this.push('File: DEP-11\nMediaBaseUrl: https://example.com\n---\n');
        },
      });
      const iterator = parseAppstreamDocuments(stream);
      try {
        const first = await iterator.next();
        assert.equal(first.value?.File, 'DEP-11');
      } finally {
        await iterator.return(undefined);
        stream.destroy();
      }
    });

    test('accepts duplicate locale keys in localized maps', async () => {
      const yaml = [
        '---',
        'Type: desktop-application',
        'ID: dup.desktop',
        'Package: dup',
        'Name:',
        '  C: Dup',
        'Keywords:',
        '  C:',
        '  - game',
        '  ca_ES:',
        '  - joc',
        '  ca_ES:',
        '  - estrategia',
        '',
      ].join('\n');
      const documents: AppstreamDoc[] = [];
      for await (const document of parseAppstreamDocuments(Readable.from([yaml]))) {
        documents.push(document);
      }

      assert.equal(documents.length, 1);
      assert.deepEqual(documents[0].Keywords, { C: ['game'], ca_ES: ['estrategia'] });
    });

    test('rejects duplicate non-locale keys', async () => {
      const yaml = ['---', 'Type: desktop-application', 'ID: first.desktop', 'ID: second.desktop', 'Name:', '  C: Dup', ''].join('\n');

      await assert.rejects(async () => {
        for await (const _document of parseAppstreamDocuments(Readable.from([yaml]))) {
          // Drain the generator so the parse error is thrown.
        }
      }, /Map keys must be unique/);
    });

    test('accepts real DEP-11 documents and skips malformed ones', async (t) => {
      const warning = t.mock.method(console, 'warn', () => {});
      // Verbatim excerpt from Ubuntu noble main/dep11/Components-amd64.yml.gz.
      const fixture = await readFile(path.join(__dirname, '../tests/fixtures/dep11-noble.yml'), 'utf8');
      const invalid = '---\nType: desktop-application\nID: broken.desktop\nName: 42\nScreenshots: nope\n';
      const documents: AppstreamDoc[] = [];
      for await (const document of parseAppstreamDocuments(Readable.from([fixture, invalid]))) {
        documents.push(document);
      }

      assert.deepEqual(
        documents.map((document) => document.ID),
        [undefined, 'libreoffice-writer.desktop', 'org.freedesktop.ibus.engine.table.cangjie', 'htop.desktop', 'gstreamer1.0-gtk3'],
      );
      assert.equal(warning.mock.calls.length, 1);

      const writer = documents.find((document) => document.ID === 'libreoffice-writer.desktop');
      assert.ok(writer);
      const data = transformComponent(writer, {
        mediaBaseUrl: getMediaBaseUrl(documents[0]),
        architectures: [Architecture.AMD64],
      });
      assert.equal(data?.name, 'LibreOffice Writer');
      assert.equal(data?.id, 'packagekit.libreoffice-writer');
      assert.equal(data?.license, 'Mozilla Public License');
      assert.equal(data?.source, 'http://www.libreoffice.org/discover/writer/');
    });
  });

  describe('transformComponent', () => {
    test('maps all AppStream fields', () => {
      const component: AppstreamDoc = {
        Type: 'desktop-application',
        ID: 'org.libreoffice.writer.desktop',
        Package: 'libreoffice-writer',
        Name: { C: 'LibreOffice Writer', en: 'Writer (en)', fr: 'Writer (fr)' },
        Summary: { C: 'Write documents' },
        Description: { C: '<p>Create and edit documents.</p><ul><li>Write</li><li>Export to PDF</li></ul>' },
        DeveloperName: { C: 'The Document Foundation' },
        ProjectLicense: 'MPL-2.0',
        Categories: ['Office', 'WordProcessor'],
        Keywords: {
          C: Array.from({ length: KEYWORDS_MAX_COUNT + 3 }, (_unused, index) => `keyword-${index}`),
        },
        Url: {
          homepage: 'https://example.org/home',
          help: 'https://example.org/help',
          bugtracker: 'https://example.org/bugs',
          donation: 'https://example.org/donate',
          translate: 'https://example.org/translate',
        },
        Screenshots: [
          { 'source-image': { url: 'shot-2.png', width: 1280, height: 720 } },
          { default: true, 'source-image': { url: 'https://cdn.example.com/shot-1.png' } },
        ],
        ContentRating: {
          'oars-1.0': { 'violence-cartoon': 'none' },
          'oars-1.1': { 'violence-cartoon': 'mild', 'social-chat': 'none' },
        },
        Releases: [
          { version: '7.4', type: 'release', 'unix-timestamp': 1700000000, Description: { C: '<p>New features.</p>' } },
          { version: '7.3', 'unix-timestamp': 1600000000, description: '<p>Old fixes.</p>' },
          { version: '7.2', 'unix-timestamp': 1500000000, Description: { C: '' } },
        ],
      };

      const result = transformComponent(component, {
        mediaBaseUrl: MEDIA_BASE_URL,
        architectures: [Architecture.AMD64, Architecture.ARM64],
      });

      assert.deepEqual(result, {
        id: 'packagekit.org.libreoffice.writer',
        name: 'LibreOffice Writer',
        tagline: 'Write documents',
        description: 'Create and edit documents.\n- Write\n- Export to PDF',
        category: 'Productivity',
        keywords: Array.from({ length: KEYWORDS_MAX_COUNT }, (_unused, index) => `keyword-${index}`),
        license: 'Mozilla Public License',
        source: 'https://example.org/home',
        support_url: 'https://example.org/help',
        donate_url: 'https://example.org/donate',
        translation_url: 'https://example.org/translate',
        author: 'The Document Foundation',
        maintainer_name: 'The Document Foundation',
        screenshots: ['https://cdn.example.com/shot-1.png', `${MEDIA_BASE_URL}/shot-2.png`],
        types: [AppType.APP],
        nsfw: false,
        external_id: 'libreoffice-writer',
        source_store: SourceStore.OS,
        architectures: [Architecture.AMD64, Architecture.ARM64],
        device_compatibilities: [],
        updated_date: new Date(1700000000 * 1000).toISOString(),
        changelog: 'New features.',
        version_changelogs: [
          { version: '7.4', changelog: 'New features.' },
          { version: '7.3', changelog: 'Old fixes.' },
          { version: '7.2', changelog: '' },
        ],
        packagekit_data: {
          content_rating: {
            type: 'oars-1.1',
            content_attributes: [
              { id: 'violence-cartoon', value: 'mild' },
              { id: 'social-chat', value: 'none' },
            ],
          },
        },
      });
    });

    test('uses fallbacks and omits fields with no source data', () => {
      const result = transformComponent(
        {
          ID: 'org.example.app.desktop',
          Package: 'example',
          Name: [{ lang: 'en', text: 'Example' }],
          Summary: 'Summary',
          Description: { C: 'Plain text' },
          Categories: ['UnknownCategory'],
          Url: { bugtracker: 'https://example.org/bugs' },
          ContentRating: { 'oars-1.0': {} },
        },
        { mediaBaseUrl: MEDIA_BASE_URL, architectures: [Architecture.ARMHF] },
      );

      assert.ok(result !== undefined);
      assert.equal(result.name, 'Example');
      assert.equal(result.tagline, 'Summary');
      assert.equal(result.description, 'Plain text');
      assert.equal(result.category, 'Utilities');
      assert.deepEqual(result.keywords, []);
      assert.equal(result.support_url, 'https://example.org/bugs');
      assert.deepEqual(result.screenshots, []);
      assert.equal(result.changelog, '');
      assert.deepEqual(result.version_changelogs, []);
      assert.ok(!('updated_date' in result));
      assert.deepEqual(result.packagekit_data, {
        content_rating: { type: 'oars-1.0', content_attributes: [] },
      });
    });

    test('caps descriptions, changelogs and releases', () => {
      const result = transformComponent(
        {
          ID: 'org.example.app.desktop',
          Name: { C: 'Example' },
          Description: { C: 'x'.repeat(DESCRIPTION_MAX_LENGTH + 50) },
          Releases: Array.from({ length: 12 }, (_unused, index) => ({
            version: `1.${index}`,
            'unix-timestamp': 1500000000 + index,
            Description: { C: 'y'.repeat(CHANGELOG_MAX_LENGTH + 50) },
          })),
        },
        { mediaBaseUrl: MEDIA_BASE_URL, architectures: [] },
      );

      assert.ok(result !== undefined);
      assert.ok(result.description !== undefined);
      const changelogs = result.version_changelogs ?? [];
      assert.equal(result.description.length, DESCRIPTION_MAX_LENGTH);
      assert.equal(changelogs.length, 10);
      assert.equal(changelogs[0].version, '1.11');
      assert.equal(changelogs[0].changelog.length, CHANGELOG_MAX_LENGTH);
      assert.equal(result.updated_date, new Date(1500000011 * 1000).toISOString());
    });

    test('returns undefined without an ID or Name', () => {
      assert.equal(transformComponent({ Name: { C: 'x' } }, { mediaBaseUrl: '', architectures: [] }), undefined);
      assert.equal(transformComponent({ ID: 'org.example.app.desktop' }, { mediaBaseUrl: '', architectures: [] }), undefined);
    });
  });

  describe('mergeComponents', () => {
    test('unions architectures and keeps the first non-empty scalar', () => {
      const first: AppstreamPackageData = {
        id: 'packagekit.org.example.app',
        name: 'First name',
        tagline: '',
        architectures: [Architecture.AMD64],
        screenshots: ['https://example.com/first.png'],
      } as AppstreamPackageData;
      const second: AppstreamPackageData = {
        id: 'packagekit.org.example.other',
        name: 'Second name',
        tagline: 'Second tagline',
        architectures: [Architecture.AMD64, Architecture.ARM64],
        screenshots: ['https://example.com/second.png'],
      } as AppstreamPackageData;

      const merged = mergeComponents([first, second]);

      assert.equal(merged.id, 'packagekit.org.example.app');
      assert.equal(merged.name, 'First name');
      assert.equal(merged.tagline, 'Second tagline');
      assert.deepEqual(merged.architectures, [Architecture.AMD64, Architecture.ARM64]);
      assert.deepEqual(merged.screenshots, ['https://example.com/first.png']);
    });

    test('throws for an empty list', () => {
      assert.throws(() => mergeComponents([]), /no appstream components/i);
    });
  });

  describe('iconSources', () => {
    test('reads cached and remote entries from an object', () => {
      assert.deepEqual(
        iconSources({
          Icon: {
            cached: [
              { name: 'app.png', width: 48, height: 48 },
              { name: 'app.png', width: 128, height: 128 },
            ],
            remote: [{ url: 'icons/128/app.png', width: 128, height: 128 }],
            stock: 'accessories-text-editor',
          },
        }),
        { cachedNames: ['app.png'], remoteUrl: 'icons/128/app.png' },
      );
    });

    test('reads cached and remote entries from an array', () => {
      assert.deepEqual(
        iconSources({
          Icon: [
            { type: 'cached', name: 'app.png' },
            { type: 'cached', name: 'app.png' },
            { type: 'remote', url: 'icons/app.png' },
            { type: 'stock', name: 'text-editor' },
          ],
        }),
        { cachedNames: ['app.png'], remoteUrl: 'icons/app.png' },
      );
      assert.deepEqual(iconSources({}), { cachedNames: [] });
    });
  });

  describe('extractIconEntries', () => {
    test('yields each name once with the newest mtime', async () => {
      const entries = [];
      for await (const entry of extractIconEntries(Readable.from([await iconTarBuffer()]))) {
        entries.push(entry);
      }

      assert.equal(entries.length, 2);
      const app = entries.find((entry) => entry.name === 'app.png');
      assert.equal(app?.contents.toString(), 'new');
      assert.equal(app?.mtime.toISOString(), '2024-01-01T00:00:00.000Z');
      assert.equal(entries.find((entry) => entry.name === 'other.png')?.contents.toString(), 'other');
    });
  });
});
