import assert from 'node:assert';
import path from 'path';
import { test, describe } from 'node:test';

import parse from '../src/index';

describe('click-parser', () => {
  test('parse qml click package', async () => {
    const data = await parse(path.join(__dirname, 'test-qml.bhdouglass_1.0.0_all.click'));

    delete data.appstream; // TODO come back to this later

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
      'user-agent-override': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Ubuntu Chromium/39.0.2171.65 Chrome/39.0.2171.65 Safari/537.36',
    });
  });
});
