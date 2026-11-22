// SPDX-License-Identifier: AGPL-3.0-or-later
import crypto from 'node:crypto';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { XMLParser } from 'fast-xml-parser';

import { App } from './app';
import { parseAppstream } from './appstream';
import type { AppstreamExportData } from './appstream';
import { parseIniAs, parseJsonAs, parseQmlImports, parseXmlAs } from './parse.utils';
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
import { extractFiles, extractOne, isPathSafe, listDataTarGz, readFileRegular, runInSandbox, stripLeading } from './utils';

const accountXmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '_',
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
});

export { App } from './app';
export type { QmlImport, Apparmor, Hooks } from './app';
export type { Manifest } from './schemas';
export type { AppstreamExportData } from './appstream';

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
  appstream?: AppstreamExportData;
}

function populateTopLevel(manifest: Manifest, data: ParsedData): void {
  let maintainerEmail = '';
  let maintainer = '';
  if (manifest.maintainer) {
    const match = manifest.maintainer.match(/<.*>/);
    if (match && match.length === 1) {
      maintainerEmail = match[0].replace('<', '').replace('>', '').trim();
    }

    maintainer = manifest.maintainer.replace(/<.*>/, '').trim();
    try {
      const decoded = Buffer.from(maintainer, 'latin1').toString('utf8');
      if (!decoded.includes('\uFFFD')) {
        maintainer = decoded;
      }
    } catch {
      // ignore encoding errors
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
}

function applyDesktop(app: App, desktop: App['desktop'], data: ParsedData): string | undefined {
  app.desktop = desktop;

  if (app.desktop.exec?.startsWith('webapp-container')) {
    let url: string | null = null;
    const exec = app.desktop.exec.replace(/  +/g, ' ').replace('webapp-container', '').trim();
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
    return app.desktop.icon;
  }

  return undefined;
}

function dedupeAndFinalize(data: ParsedData): ParsedData {
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

async function processExtractedFile(
  tarName: string,
  filename: string,
  content: Buffer,
  data: ParsedData,
): Promise<{ appIconRelPath?: string }> {
  let appIconRelPath: string | undefined;

  let handled = false;
  for (const app of data.apps) {
    if (app.hooks.desktop === filename) {
      handled = true;
      const parsed = parseIniAs(content, desktopSchema) ?? {};
      const iconRel = applyDesktop(app, parsed, data);
      if (iconRel) {
        appIconRelPath = iconRel.startsWith('./') ? iconRel : `./${iconRel}`;
      }
      break;
    }

    if (app.hooks.apparmor === filename) {
      handled = true;
      app.apparmor = parseJsonAs(content, apparmorSchema) ?? {};
      break;
    }

    if (app.hooks['content-hub'] === filename) {
      handled = true;
      app.contentHub = parseJsonAs(content, contentHubSchema) ?? {};
      break;
    }

    if (app.hooks.urls === filename) {
      handled = true;
      app.urlDispatcher = parseJsonAs(content, urlDispatcherSchema) ?? [];
      break;
    }

    if (app.hooks['push-helper'] === filename) {
      handled = true;
      app.pushHelper = parseJsonAs(content, pushHelperSchema) ?? {};
      break;
    }

    if (app.hooks['account-service'] === filename) {
      handled = true;
      app.accountService = parseXmlAs(content, accountSchema, accountXmlParser) ?? {};
      break;
    }

    if (app.hooks['account-application'] === filename) {
      handled = true;
      app.accountApplication = parseXmlAs(content, accountSchema, accountXmlParser) ?? {};
      break;
    }
  }

  if (handled) {
    return {
      appIconRelPath,
    };
  }

  if (tarName === './webapp-properties.json') {
    const webappProperties = parseJsonAs(content, webappPropertiesSchema);
    if (webappProperties) {
      data.webappProperties = webappProperties;
      if (Array.isArray(webappProperties.scripts) && webappProperties.scripts.length > 0) {
        data.webappInject = true;
      }
    }
  } else if (tarName.endsWith('.qml')) {
    const imports = parseQmlImports(content.toString());
    for (const app of data.apps) {
      app.qmlImports = app.qmlImports.concat(imports);
    }
  } else if (
    (tarName.startsWith('./usr/share/metainfo/') || tarName.startsWith('./usr/share/appdata/')) &&
    (tarName.endsWith('.metainfo.xml') || tarName.endsWith('.appdata.xml')) &&
    !data.appstream
  ) {
    const appstream = parseAppstream(content);
    if (appstream) {
      data.appstream = appstream;
    }
  }

  return { appIconRelPath };
}

type Options = {
  extractIcon?: boolean;
  parseQmlImports?: boolean;
};

export default async function parseClickPackage(filepath: string, options: Options = {}): Promise<ParsedData> {
  const { extractIcon = false, parseQmlImports = false } = options;
  const workDir = await mkdtemp(path.join(tmpdir(), 'click-parser-'));
  const sandboxInput = path.join(workDir, 'input.click');

  try {
    await copyFile(filepath, sandboxInput);
    await runInSandbox('ar', ['x', 'input.click'], workDir);

    const manifestStr = (await runInSandbox('tar', ['-xOf', 'control.tar.gz', './manifest'], workDir, { maxBuffer: 1024 * 1024 })).stdout;

    let rawManifest: unknown;
    try {
      rawManifest = JSON.parse(manifestStr);
    } catch {
      throw new Error('Manifest file is not in a json format');
    }

    const manifest = manifestSchema.parse(rawManifest);
    if (!manifest.hooks || Object.keys(manifest.hooks).length === 0) {
      throw new Error('Manifest file does not have any hooks in it');
    }

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
    data.manifest = manifest;

    for (const [name, hook] of Object.entries(manifest.hooks)) {
      data.apps.push(new App(name, hook));
    }

    const listing = await listDataTarGz(workDir);
    for (const entry of listing.files) {
      const filename = stripLeading(entry);
      if (filename && isPathSafe(filename)) {
        data.files.push(filename);
      }
    }

    data.languages = Array.from(listing.moLanguages);

    const needed = new Set<string>();
    for (const app of data.apps) {
      for (const hookPath of Object.values(app.hooks)) {
        if (hookPath) {
          needed.add(`./${hookPath}`);
        }
      }
    }
    if (listing.hasWebappProperties) {
      needed.add('./webapp-properties.json');
    }
    if (listing.metainfoFile) {
      needed.add(listing.metainfoFile);
    }

    if (parseQmlImports) {
      for (const qml of listing.qmlFiles) {
        needed.add(qml);
      }
    }

    const neededMembers = Array.from(needed);
    await extractFiles(workDir, neededMembers);

    let iconTarName: string | undefined;
    for (const tarName of neededMembers) {
      const filename = stripLeading(tarName);
      const filePath = path.join(workDir, filename);
      const content = await readFileRegular(filePath);
      const { appIconRelPath } = await processExtractedFile(tarName, filename, content, data);
      if (appIconRelPath) {
        iconTarName = appIconRelPath;
      }
    }

    if (extractIcon && iconTarName && listing.files.includes(iconTarName)) {
      await extractOne(workDir, iconTarName);
      try {
        const iconPath = path.join(workDir, stripLeading(iconTarName));
        const iconBytes = await readFileRegular(iconPath);
        const write = path.join('/tmp', `${crypto.randomUUID()}${path.extname(iconPath).toLowerCase()}`);
        await writeFile(write, iconBytes);
        data.icon = write;
      } catch (err) {
        console.error(err);
      }
    }

    populateTopLevel(manifest, data);
    return dedupeAndFinalize(data);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
