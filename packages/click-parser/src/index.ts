import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createGzipDecoder, unpackTar } from 'modern-tar';

import { App } from './app';
import type { QmlImport } from './app';
import {
  apparmorSchema,
  contentHubSchema,
  accountSchema,
  manifestSchema,
  pushHelperSchema,
  urlDispatcherSchema,
  webappPropertiesSchema,
  desktopSchema,
} from './schemas';
import type { Manifest } from './schemas';
import { bufferToWebReadableStream, parseArArchive, parseIniAs, parseJsonAs, parseXmlAs } from './utils';

export { App } from './app';
export type { QmlImport, Apparmor, Hooks } from './app';
export type { Manifest } from './schemas';

export interface ParsedData {
  apps: App[];
  architecture: string;
  description: string;
  framework?: string;
  icon?: string;
  iconpath?: string;
  maintainer?: string;
  maintainerEmail?: string;
  name?: string;
  permissions: string[];
  title?: string;
  types: string[];
  urls: string[];
  version?: string;
  installedSize?: number;
  webappInject: boolean;
  webappProperties: Record<string, unknown>;
  languages: string[];
  files: string[];
  manifest?: Manifest;
}

async function extractIcon(fileData: Buffer, data: ParsedData): Promise<ParsedData> {
  if (!data.iconpath) {
    return data;
  }

  let iconpath = data.iconpath;
  if (!iconpath.startsWith('./')) {
    iconpath = `./${iconpath}`;
  }

  const write = path.join('/tmp', `${crypto.randomUUID()}${path.extname(iconpath).toLowerCase()}`);

  try {
    const entries = await unpackTar(bufferToWebReadableStream(fileData).pipeThrough(createGzipDecoder()));
    const iconEntry = entries.find((e) => e.header.name === iconpath);
    if (iconEntry?.data) {
      await fs.writeFile(write, iconEntry.data);
      data.icon = write;
    }
  }
  catch (err) {
    console.error(err);
  }

  return data;
}

function parseQmlImports(str: string): QmlImport[] {
  return str.split('\n').filter((line) => line.trim().startsWith('import ')).map((line) => {
    const tokens = line.split(' ');
    const module = tokens[1].replace(/"/g, '');
    const isJs = module.endsWith('.js');
    return { module, version: isJs ? undefined : tokens[2] };
  });
}

async function parseData(fileData: Buffer, data: ParsedData, icon: boolean): Promise<ParsedData> {
  const entries = await unpackTar(bufferToWebReadableStream(fileData).pipeThrough(createGzipDecoder()));
  const languagesSet = new Set<string>(data.languages);

  for (const entry of entries) {
    const filename = entry.header.name.replace('./', '');
    if (filename) {
      data.files.push(filename);
    }

    let handled = false;

    // Check per-app hook files — break after the first match across all apps
    for (const app of data.apps) {
      if (app.hooks.desktop && entry.header.name === `./${app.hooks.desktop}`) {
        handled = true;
        app.desktop = parseIniAs(entry.data, desktopSchema) ?? {};

        if (app.desktop.exec?.startsWith('webapp-container')) {
          /*
          Check the arguments to webapp-container, if they contain
          an external url as the main url then assume it's a webapp.
          */
          let url: string | null = null;
          const exec = app.desktop.exec.replace(/  +/g, ' ').replace('webapp-container', '').trim();
          // Match spaces not encased in quotes: http://stackoverflow.com/a/16261693
          const execSplit = exec.match(/(?:[^\s"]+|"[^"]*")+/g);
          if (execSplit) {
            for (const value of execSplit) {
              if (value && (value.startsWith('http://') || value.startsWith('https://'))) {
                url = value;
              }
            }
          }
          if (url) {
            app.type = 'webapp';
            app.webappUrl = url;
          }
        }

        if (app.desktop.icon) {
          data.iconpath = app.desktop.icon;
        }

        break;
      }

      if (app.hooks.apparmor && entry.header.name === `./${app.hooks.apparmor}`) {
        handled = true;
        app.apparmor = parseJsonAs(entry.data, apparmorSchema) ?? {};
        break;
      }

      if (app.hooks['content-hub'] && entry.header.name === `./${app.hooks['content-hub']}`) {
        handled = true;
        app.contentHub = parseJsonAs(entry.data, contentHubSchema) ?? {};
        break;
      }

      if (app.hooks.urls && entry.header.name === `./${app.hooks.urls}`) {
        handled = true;
        app.urlDispatcher = parseJsonAs(entry.data, urlDispatcherSchema) ?? [];
        break;
      }

      if (app.hooks['push-helper'] && entry.header.name === `./${app.hooks['push-helper']}`) {
        handled = true;
        app.pushHelper = parseJsonAs(entry.data, pushHelperSchema) ?? {};
        break;
      }

      if (app.hooks['account-service'] && entry.header.name === `./${app.hooks['account-service']}`) {
        handled = true;
        app.accountService = await parseXmlAs(entry.data, accountSchema) ?? {};
        break;
      }

      if (app.hooks['account-application'] && entry.header.name === `./${app.hooks['account-application']}`) {
        handled = true;
        app.accountApplication = await parseXmlAs(entry.data, accountSchema) ?? {};
        break;
      }
    }

    // Global file handlers — data is available directly; relevant data applied to all matching apps
    if (!handled) {
      if (entry.header.name === './webapp-properties.json') {
        const webappProperties = parseJsonAs(entry.data, webappPropertiesSchema);
        if (webappProperties) {
          data.webappProperties = webappProperties;
          if (Array.isArray(webappProperties.scripts) && webappProperties.scripts.length > 0) {
            data.webappInject = true;
          }
        }
      }
      else if (entry.header.name.endsWith('.qml')) {
        // Collect QML imports from all .qml files across all apps.
        const str = entry.data ? Buffer.from(entry.data).toString() : '';
        const imports = parseQmlImports(str);

        for (const app of data.apps) {
          app.qmlImports = app.qmlImports.concat(imports);
        }
      }
      else if (entry.header.name.includes('LC_MESSAGES') && entry.header.name.includes('.mo')) {
        const langs = entry.header.name.split('/');
        const pos = langs.indexOf('LC_MESSAGES');
        if (pos >= 1) {
          const lang = langs[pos - 1].trim();
          if (lang) {
            languagesSet.add(lang);
          }
        }
      }
    }
  }

  data.languages = Array.from(languagesSet);

  if (icon && data.iconpath) {
    return await extractIcon(fileData, data);
  }

  return data;
}

async function parseControl(control: Buffer, fileData: Buffer, icon: boolean): Promise<ParsedData> {
  const data: ParsedData = {
    apps: [],
    architecture: 'all',
    description: '',
    framework: undefined,
    icon: undefined,
    iconpath: undefined,
    maintainer: undefined,
    maintainerEmail: undefined,
    name: undefined,
    permissions: [],
    title: undefined,
    types: [],
    urls: [],
    version: undefined,
    installedSize: undefined,
    webappInject: false,
    webappProperties: {},
    languages: [],
    files: [],
  };

  const entries = await unpackTar(bufferToWebReadableStream(control).pipeThrough(createGzipDecoder()));

  for (const entry of entries) {
    if (entry.header.name === './manifest' && entry.data) {
      const manifestStr = Buffer.from(entry.data).toString();

      let rawManifest: unknown;
      try {
        rawManifest = JSON.parse(manifestStr);
      }
      catch {
        throw new Error('Manifest file is not in a json format');
      }

      data.manifest = manifestSchema.parse(rawManifest);

      if (!data.manifest.hooks || Object.keys(data.manifest.hooks).length === 0) {
        throw new Error('Manifest file does not have any hooks in it');
      }

      for (const [name, hook] of Object.entries(data.manifest.hooks)) {
        const app = new App(name, hook);
        data.apps.push(app);
      }
    }
  }

  const manifest = data.manifest!;

  let maintainerEmail = '';
  let maintainer = '';
  if (manifest.maintainer) {
    const match = manifest.maintainer.match(/<.*>/);
    if (match && match.length === 1) {
      maintainerEmail = match[0].replace('<', '').replace('>', '').trim();
    }

    maintainer = manifest.maintainer.replace(/<.*>/, '').trim();
    try {
      // Ensure that special characters are properly encoded
      const decoded = Buffer.from(maintainer, 'latin1').toString('utf8');
      if (!decoded.includes('\uFFFD')) {
        maintainer = decoded;
      }
    }
    catch {
      // ignore encoding errors, keep original maintainer string
    }
  }

  if (manifest.architecture) {
    data.architecture = manifest.architecture;
  }

  data.description = manifest.description ?? '';
  data.framework = manifest.framework;
  data.maintainer = maintainer;
  data.maintainerEmail = maintainerEmail;
  data.name = manifest.name;
  data.title = manifest.title;
  data.version = manifest.version;

  if (manifest['installed-size']) {
    data.installedSize = parseInt(manifest['installed-size'], 10);
  }

  return await parseData(fileData, data, icon);
}

export default async function parseClickPackage(
  filepath: string,
  extractIcon: boolean = false,
): Promise<ParsedData> {
  const fileBuffer = await fs.readFile(filepath);
  const arFiles = parseArArchive(fileBuffer);

  let dataFile: Buffer | null = null;
  let controlFile: Buffer | null = null;

  for (const file of arFiles) {
    if (file.name === 'data.tar.gz') {
      dataFile = file.fileData;
    }
    else if (file.name === 'control.tar.gz') {
      controlFile = file.fileData;
    }
  }

  if (dataFile === null || controlFile === null) {
    throw new Error('Malformed click package');
  }

  const data = await parseControl(controlFile, dataFile, extractIcon);

  const typesSet = new Set<string>(data.types);
  const permissionsSet = new Set<string>(data.permissions);
  const urlsSet = new Set<string>(data.urls);

  for (const app of data.apps) {
    typesSet.add(app.type);

    if (Object.keys(app.contentHub).length > 0) {
      app.features.push('content_hub');
    }

    if (Object.keys(app.urlDispatcher).length > 0) {
      app.features.push('url_dispatcher');
    }

    if (Object.keys(app.pushHelper).length > 0) {
      app.features.push('push_helper');
    }

    if (Object.keys(app.accountService).length > 0) {
      app.features.push('account_service');
    }

    if (app.type === 'webapp') {
      app.webappProperties = data.webappProperties;
      app.webappInject = data.webappInject;
    }

    const apparmor = app.apparmor;
    if (apparmor?.policy_groups) {
      for (const permission of apparmor.policy_groups) {
        permissionsSet.add(permission);
      }
    }

    if (apparmor?.template === 'unconfined') {
      permissionsSet.add('unconfined');
    }

    if (app.urlDispatcher && Array.isArray(app.urlDispatcher)) {
      for (const ud of app.urlDispatcher as Array<{ protocol?: string; 'domain-suffix'?: string }>) {
        if (ud.protocol) {
          let url = `${ud.protocol}://`;
          if (ud['domain-suffix']) {
            url += ud['domain-suffix'];
          }
          urlsSet.add(url);
        }
      }
    }

    // Deduplicate QML imports
    const seen = new Set<string>();
    app.qmlImports = app.qmlImports.filter((qmlImport) => {
      const key = qmlImport.module + (qmlImport.version ?? '');
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  data.types = Array.from(typesSet);
  data.permissions = Array.from(permissionsSet);
  data.urls = Array.from(urlsSet);

  return data;
}
