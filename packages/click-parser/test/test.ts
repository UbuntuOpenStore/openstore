import assert from 'node:assert';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { test, describe } from 'node:test';
import path from 'path';

import { parseAppstream } from '../src/appstream';
import parse from '../src/index';

async function clickParserTempDirs(): Promise<string[]> {
  const entries = await fs.readdir(tmpdir());
  return entries.filter((name) => name.startsWith('click-parser-'));
}

describe('click-parser', () => {
  test('parses a click package from the temporary directory without changing the input', async () => {
    const uploadDir = await fs.mkdtemp(path.join(tmpdir(), 'click-upload-'));
    const filepath = path.join(uploadDir, 'upload.click');
    const fixture = path.join(__dirname, 'test-qml.bhdouglass_1.0.0_all.click');

    try {
      await fs.copyFile(fixture, filepath);

      const data = await parse(filepath);

      assert.equal(data.name, 'test-qml.bhdouglass');
      assert.equal(data.version, '1.0.0');
      assert.deepEqual(await fs.readFile(filepath), await fs.readFile(fixture));
    } finally {
      await fs.rm(uploadDir, { recursive: true, force: true });
    }
  });

  test('parse qml click package', async () => {
    const data = await parse(path.join(__dirname, 'test-qml.bhdouglass_1.0.0_all.click'), { parseQmlImports: true });

    const appstream = data.appstream;
    delete data.appstream;

    assert.deepEqual(data, {
      apps: [
        {
          name: 'test-qml',
          type: 'app',
          features: ['content_hub', 'url_dispatcher', 'account_service'],
          desktop: {
            name: 'Test QML',
            exec: 'qmlscene %U qml/Main.qml',
            icon: 'assets/logo.svg',
            terminal: 'false',
            type: 'Application',
            'x-lomiri-touch': 'true',
          },
          apparmor: {
            policy_groups: [],
            policy_version: 20.04,
          },
          contentHub: {
            source: ['pictures'],
          },
          urlDispatcher: [
            {
              protocol: 'http',
              'domain-suffix': 'example.com',
            },
          ],
          pushHelper: {},
          qmlImports: [
            {
              module: 'QtQuick',
              version: '2.7',
            },
            {
              module: 'Lomiri.Components',
              version: '1.3',
            },
            {
              module: 'QtQuick.Layouts',
              version: '1.3',
            },
            {
              module: 'Qt.labs.settings',
              version: '1.0',
            },
          ],
          accountService: {
            service: {
              name: 'test-qml',
              type: 'test-qml.bhdouglass',
              provider: 'facebook',
            },
          },
          accountApplication: {
            application: {
              services: {
                service: {
                  id: 'test-qml.bhdouglass',
                  description: 'Post your pictures to Facebook',
                },
              },
            },
          },
          webappProperties: {},
          webappUrl: undefined,
          webappInject: false,
          hooks: {
            'account-application': 'account-application.xml',
            'account-service': 'account-service.xml',
            apparmor: 'test-qml.apparmor',
            'content-hub': 'content-hub.json',
            desktop: 'test-qml.desktop',
            urls: 'url-dispatcher.json',
          },
        },
        {
          name: 'test-qml-push-helper',
          type: 'push',
          features: ['push_helper'],
          desktop: {},
          apparmor: {
            policy_groups: ['push-notification-client'],
            policy_version: 20.04,
            template: 'ubuntu-push-helper',
          },
          contentHub: {},
          urlDispatcher: [],
          pushHelper: {
            exec: 'pushHelper',
            app_id: 'test-qml.bhdouglass',
          },
          qmlImports: [
            {
              module: 'QtQuick',
              version: '2.7',
            },
            {
              module: 'Lomiri.Components',
              version: '1.3',
            },
            {
              module: 'QtQuick.Layouts',
              version: '1.3',
            },
            {
              module: 'Qt.labs.settings',
              version: '1.0',
            },
          ],
          accountService: {},
          accountApplication: {},
          webappProperties: {},
          webappUrl: undefined,
          webappInject: false,
          hooks: {
            apparmor: 'push-helper-apparmor.json',
            'push-helper': 'push-helper.json',
          },
        },
      ],
      architecture: 'all',
      description: 'A short description of your app',
      files: [
        'account-application.xml',
        'account-service.xml',
        'assets/',
        'assets/logo.svg',
        'content-hub.json',
        'org.gnome.Weather.appdata.xml',
        'push-helper-apparmor.json',
        'push-helper.json',
        'pushHelper',
        'qml/',
        'qml/Main.qml',
        'test-qml.apparmor',
        'test-qml.desktop',
        'url-dispatcher.json',
        'usr/',
        'usr/share/',
        'usr/share/metainfo/',
        'usr/share/metainfo/org.gnome.Weather.appdata.xml',
      ],
      framework: 'ubuntu-sdk-20.04.1',
      icon: undefined,
      iconpath: 'assets/logo.svg',
      maintainer: 'Brian Douglass',
      maintainerEmail: 'bhdouglass@gmail.com',
      name: 'test-qml.bhdouglass',
      permissions: ['push-notification-client'],
      title: 'Test QML',
      types: ['app', 'push'],
      urls: ['http://example.com'],
      version: '1.0.0',
      languages: [],
      installedSize: 174,
      webappInject: false,
      webappProperties: {},
      manifest: {
        architecture: 'all',
        description: 'A short description of your app',
        framework: 'ubuntu-sdk-20.04.1',
        hooks: {
          'test-qml': {
            'account-application': 'account-application.xml',
            'account-service': 'account-service.xml',
            apparmor: 'test-qml.apparmor',
            'content-hub': 'content-hub.json',
            desktop: 'test-qml.desktop',
            urls: 'url-dispatcher.json',
          },
          'test-qml-push-helper': {
            apparmor: 'push-helper-apparmor.json',
            'push-helper': 'push-helper.json',
          },
        },
        'installed-size': '174',
        maintainer: 'Brian Douglass <bhdouglass@gmail.com>',
        name: 'test-qml.bhdouglass',
        title: 'Test QML',
        version: '1.0.0',
      },
    });

    assert.ok(appstream, 'appstream data should exist');
    assert.equal(appstream?.name.find((n) => n.lang === 'en')?.text, 'Weather');

    const expectedEnDesc = [
      'A small application that allows you to monitor the current weather conditions for your city, or anywhere in the world.',
      /* eslint-disable-next-line max-len */
      'It provides access to detailed forecasts, up to 7 days, with hourly details for the current and next day, using various internet services.',
      /* eslint-disable-next-line max-len */
      'It also optionally integrates with the GNOME Shell, allowing you to see the current conditions of the most recently searched cities by just typing the name in the Activities Overview.',
    ].join('\n\n');

    const enDesc = appstream?.description.find((d) => d.lang === 'en');
    assert.ok(enDesc, 'English description should exist');
    assert.equal(enDesc?.text, expectedEnDesc);
    assert.ok((appstream?.description.length ?? 0) > 1, 'localized descriptions should exist for multiple languages');
  });

  test('parse html5 click package', async () => {
    const data = await parse(path.join(__dirname, 'test-html.bhdouglass_1.0.0_all.click'));

    assert.equal(data.apps.length, 1);
    assert.equal(data.apps[0].type, 'app');
  });

  test('parse webapp click package', async () => {
    const data = await parse(path.join(__dirname, '/test-webapp.bhdouglass_0.1_all.click'));

    assert.equal(data.apps.length, 1);
    assert.equal(data.apps[0].type, 'webapp');
    assert.equal(data.apps[0].webappInject, true);
    assert.equal(data.apps[0].webappUrl, 'http://example.com');
    assert.deepEqual(data.apps[0].webappProperties, {
      includes: ['http://example.com:*/*'],
      name: 'ExtendedWebappProperties',
      scripts: ['inject.js'],
      domain: '',
      homepage: '',
      /* eslint-disable-next-line max-len */
      'user-agent-override':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Ubuntu Chromium/39.0.2171.65 Chrome/39.0.2171.65 Safari/537.36',
    });
  });

  test('parse appstream metainfo xml', async () => {
    const rawData = await fs.readFile(path.join(__dirname, 'org.freedesktop.appstream.cli.metainfo.xml'));
    const data = parseAppstream(rawData);

    assert.ok(data, 'appstream data should be parsed');

    assert.equal(data.name.find((n) => n.lang === 'en')?.text, 'AppStream CLI');
    assert.equal(data.name.find((n) => n.lang === 'de')?.text, 'AppStream CLI');
    assert.ok(data.name.length > 1, 'name should have multiple localizations');

    assert.equal(data.summary.find((s) => s.lang === 'en')?.text, 'An utility to work with AppStream metadata');
    assert.equal(data.summary.find((s) => s.lang === 'de')?.text, 'Ein Dienstprogramm zum Arbeiten mit AppStream-Metadaten');

    assert.equal(data.project_license, 'LGPL-2.1+');

    // First paragraph (en) — plain text
    const enChunks = data.description.find((d) => d.lang === 'en')?.text.split('\n\n');
    assert.ok(enChunks, 'English description should exist');
    assert.ok(enChunks[0].startsWith('AppStream is a metadata specification'), 'first paragraph should match');
    // Second paragraph (en) contains <em>appstreamcli</em> → *appstreamcli*
    assert.ok(enChunks[1].includes('*appstreamcli*'), 'em tag should be rendered as bold markdown');
    assert.ok(data.description.length > 1, 'description should have multiple localizations');

    assert.deepEqual(data.urls, [
      { type: 'homepage', url: 'https://www.freedesktop.org/wiki/Distributions/AppStream/' },
      { type: 'bugtracker', url: 'https://github.com/ximion/appstream/issues' },
      { type: 'help', url: 'https://www.freedesktop.org/software/appstream/docs/chap-AppStream-ManualPages.html' },
      { type: 'vcs-browser', url: 'https://github.com/ximion/appstream/' },
    ]);

    assert.ok(data.releases.length > 0, 'releases should be present');
    assert.equal(data.releases[0].version, '1.0.2');
    assert.ok((data.releases[0].description.find((d) => d.lang === 'en')?.text.length ?? 0) > 0, 'release description should be present');

    assert.deepEqual(data.content_rating, { type: 'oars-1.1', content_attributes: [] });
  });

  test('parseAppstream screenshot environment filtering', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<component type="desktop-application">
  <id>test.app</id>
  <name>Test App</name>
  <summary>Test</summary>
  <screenshots>
    <screenshot type="default" environment="lomiri">
      <image>https://example.com/lomiri.png</image>
    </screenshot>
    <screenshot environment="lomiri:dark">
      <image>https://example.com/lomiri-dark.png</image>
    </screenshot>
    <screenshot environment="lomiri:light">
      <image>https://example.com/lomiri-light.png</image>
    </screenshot>
    <screenshot environment="gnome">
      <image>https://example.com/gnome.png</image>
    </screenshot>
    <screenshot environment="plasma">
      <image>https://example.com/plasma.png</image>
    </screenshot>
  </screenshots>
</component>`;
    const data = parseAppstream(Buffer.from(xml));
    assert.ok(data, 'appstream data should be parsed');
    assert.deepEqual(
      data.screenshots,
      ['https://example.com/lomiri.png', 'https://example.com/lomiri-dark.png', 'https://example.com/lomiri-light.png'],
      'only lomiri environment screenshots should be included',
    );
  });

  test('parseAppstream screenshots with no environment attribute', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<component type="desktop-application">
  <id>test.app</id>
  <name>Test App</name>
  <summary>Test</summary>
  <screenshots>
    <screenshot type="default">
      <image>https://example.com/screenshot1.png</image>
    </screenshot>
    <screenshot>
      <image>https://example.com/screenshot2.png</image>
    </screenshot>
  </screenshots>
</component>`;
    const data = parseAppstream(Buffer.from(xml));
    assert.ok(data, 'appstream data should be parsed');
    assert.deepEqual(
      data.screenshots,
      ['https://example.com/screenshot1.png', 'https://example.com/screenshot2.png'],
      'all screenshots should be included when no environment is specified',
    );
  });

  describe('temp dir cleanup', () => {
    test('removes temp dir on successful parse', async () => {
      const before = await clickParserTempDirs();
      await parse(path.join(__dirname, 'test-html.bhdouglass_1.0.0_all.click'));
      const after = await clickParserTempDirs();
      assert.deepEqual(after, before, 'no click-parser-* temp dir should remain after success');
    });

    test('removes temp dir when input file does not exist', async () => {
      const before = await clickParserTempDirs();
      const missing = path.join(tmpdir(), `definitely-missing-${Date.now()}-${Math.random()}.click`);
      await assert.rejects(() => parse(missing));
      const after = await clickParserTempDirs();
      assert.deepEqual(after, before, 'no click-parser-* temp dir should remain after ar failure');
    });

    test('removes temp dir when file is not a valid click package', async () => {
      const bogus = path.join(tmpdir(), `bogus-${Date.now()}-${Math.random()}.click`);
      await fs.writeFile(bogus, 'definitely not an ar archive or a click package\n');
      const before = await clickParserTempDirs();
      try {
        await assert.rejects(() => parse(bogus));
      } finally {
        await fs.unlink(bogus).catch(() => {});
      }
      const after = await clickParserTempDirs();
      assert.deepEqual(after, before, 'no click-parser-* temp dir should remain after extraction failure');
    });

    test('removes temp dir when manifest is not valid JSON', async () => {
      // Build a click file where the ar step succeeds (single member) but the
      // "control.tar.gz" payload is gzipped text that is not JSON. The error
      // path can be either the tar extraction (text is not a valid tar) or
      // the JSON.parse step inside parseClickPackage, depending on which
      // fails first; we just assert that the call rejects.
      const zlib = await import('node:zlib');
      const tmpClick = path.join(tmpdir(), `bad-manifest-${Date.now()}-${Math.random()}.click`);
      const controlBytes = zlib.gzipSync(Buffer.from('not a manifest, just some text\n'));
      const arHeader = (name: string, size: number) => {
        const nameBuf = Buffer.alloc(16, 0x20);
        nameBuf.write(name, 0, 'ascii');
        const sizeStr = size.toString().padEnd(10, ' ') + '`\n';
        return Buffer.concat([
          nameBuf,
          Buffer.from('0           '), // mtime
          Buffer.from('0     '), // uid
          Buffer.from('0     '), // gid
          Buffer.from('100644  '), // mode
          Buffer.from(sizeStr),
        ]);
      };
      const controlHeader = arHeader('control.tar.gz', controlBytes.length);
      const clickBytes = Buffer.concat([Buffer.from('!<arch>\n'), controlHeader, controlBytes]);

      await fs.writeFile(tmpClick, clickBytes);
      const before = await clickParserTempDirs();
      try {
        await assert.rejects(() => parse(tmpClick));
      } finally {
        await fs.unlink(tmpClick).catch(() => {});
      }
      const after = await clickParserTempDirs();
      assert.deepEqual(after, before, 'no click-parser-* temp dir should remain after manifest parse failure');
    });
  });
});
