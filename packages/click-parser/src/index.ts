import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import tarstream from 'tar-stream';
import xml2js from 'xml2js';
import zlib from 'node:zlib';

import { App } from './app';
import { isJson } from './utils';

export { App } from './app';
export type { QmlImport, Apparmor, Hooks } from './app';

interface ArFile {
    name: string;
    fileData: Buffer;
}

export interface ParsedData {
    apps: App[];
    architecture: string;
    description: string;
    framework: string | null;
    icon: string | null;
    iconpath?: string | null;
    maintainer: string | null;
    maintainerEmail: string | null;
    name: string | null;
    permissions: string[];
    title: string | null;
    types: string[];
    urls: string[];
    version: string | null;
    installedSize: number | null;
    webappInject: boolean;
    webappProperties: Record<string, unknown>;
    languages: string[];
    files: string[];
    manifest?: Record<string, unknown>;
}

function parseArArchive(buffer: Buffer): ArFile[] {
    const MAGIC = '!<arch>\n';
    if (buffer.slice(0, 8).toString('ascii') !== MAGIC) {
        throw new Error('Not a valid AR archive');
    }

    const files: ArFile[] = [];
    let offset = 8;
    while (offset < buffer.length) {
        if (offset + 60 > buffer.length) {
            break;
        }

        const name = buffer.slice(offset, offset + 16).toString('ascii').trimEnd();
        const size = parseInt(buffer.slice(offset + 48, offset + 58).toString('ascii').trim(), 10);
        offset += 60;

        const fileData = buffer.slice(offset, offset + size);
        offset += size;

        if (size % 2 !== 0) {
            offset += 1; // pad to even byte boundary
        }

        files.push({ name, fileData });
    }

    return files;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    }
    return Buffer.concat(chunks);
}

async function parseJsonFile(stream: Readable): Promise<Record<string, unknown> | undefined> {
    const str = (await streamToBuffer(stream)).toString();
    return isJson(str) ? (JSON.parse(str) as Record<string, unknown>) : undefined;
}

async function parseXmlFile(stream: Readable): Promise<Record<string, unknown> | undefined> {
    const str = (await streamToBuffer(stream)).toString();
    try {
        return (await xml2js.parseStringPromise(str, {
            explicitArray: false,
            mergeAttrs: true,
            normalizeTags: true,
            normalize: true,
        })) as Record<string, unknown>;
    }
    catch {
        return undefined;
    }
}

async function parseIniFile(stream: Readable): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {};
    const other: string[] = [];

    for (const line of (await streamToBuffer(stream)).toString().split('\n')) {
        const lline = line.toLowerCase().trim();
        if (!(lline[0] === '[' && lline[lline.length - 1] === ']') && lline.length > 0) {
            const pos = lline.indexOf('=');
            if (pos > -1) {
                data[lline.substring(0, pos).trim()] = line.trim().substring(pos + 1).trim();
            }
            else {
                other.push(line);
            }
        }
    }

    if (other.length > 0) {
        data.other = other;
    }

    return data;
}

// TODO detect indicators

async function extractIcon(fileData: Buffer, data: ParsedData): Promise<ParsedData> {
    let iconpath = data.iconpath as string;
    if (!iconpath.startsWith('./')) {
        iconpath = `./${iconpath}`;
    }

    const write = path.join('/tmp', `${crypto.randomUUID()}${path.extname(iconpath).toLowerCase()}`);

    try {
        let iconBuffer: Buffer | null = null;
        const extract = tarstream.extract();

        extract.on('entry', (header, stream, cb) => {
            streamToBuffer(stream as unknown as Readable).then((buf) => {
                if (header.name === iconpath) {
                    iconBuffer = buf;
                }
                cb();
            }, cb);
        });

        await pipeline(Readable.from(fileData), zlib.createUnzip(), extract as unknown as NodeJS.WritableStream);

        if (iconBuffer) {
            await fs.writeFile(write, iconBuffer);
            data.icon = write;
        }
    }
    catch (err) {
        console.error(err);
    }

    return data;
}

interface QmlImportResult {
    module: string;
    version: string | null;
}

function parseQmlImports(str: string): QmlImportResult[] {
    return str.split('\n').filter((line) => line.trim().startsWith('import ')).map((line) => {
        const tokens = line.split(' ');
        const module = tokens[1].replace(/"/g, '');
        const isJs = module.endsWith('.js');
        return { module, version: isJs ? null : tokens[2] };
    });
}

async function parseData(fileData: Buffer, data: ParsedData, icon: boolean): Promise<ParsedData> {
    const extract = tarstream.extract();

    extract.on('entry', (header: tarstream.Headers, stream: NodeJS.ReadableStream, cb: tarstream.EntryCallback) => {
        (async () => {
            const filename = header.name.replace('./', '');
            if (filename) {
                data.files.push(filename);
            }

            let handled = false;

            // Check per-app hook files — break after the first match across all apps
            for (const app of data.apps) {
                const scopeIni = `${data.name}_${app.name}.ini`;

                if (app.hooks.desktop && header.name === `./${app.hooks.desktop}`) {
                    handled = true;
                    const json = await parseIniFile(stream as unknown as Readable);
                    app.desktop = (json || {}) as Record<string, string>;

                    if (app.desktop.exec && (app.desktop.exec as string).startsWith('webapp-container')) {
                        /*
                        Check the arguments to webapp-container, if they contain
                        an external url as the main url then assume it's a webapp.
                        */
                        let url: string | null = null;
                        const exec = (app.desktop.exec as string).replace(/  +/g, ' ').replace('webapp-container', '').trim();
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
                        data.iconpath = app.desktop.icon as string;
                    }
                    break;
                }

                if (app.hooks.apparmor && header.name === `./${app.hooks.apparmor}`) {
                    handled = true;
                    app.apparmor = ((await parseJsonFile(stream as unknown as Readable)) || {}) as App['apparmor'];
                    break;
                }

                if (app.hooks['content-hub'] && header.name === `./${app.hooks['content-hub']}`) {
                    handled = true;
                    app.contentHub = ((await parseJsonFile(stream as unknown as Readable)) || {}) as Record<string, string[]>;
                    break;
                }

                if (app.hooks.urls && header.name === `./${app.hooks.urls}`) {
                    handled = true;
                    app.urlDispatcher = ((await parseJsonFile(stream as unknown as Readable)) as unknown as Array<Record<string, string>>) || [];
                    break;
                }

                if (app.hooks['push-helper'] && header.name === `./${app.hooks['push-helper']}`) {
                    handled = true;
                    app.pushHelper = ((await parseJsonFile(stream as unknown as Readable)) || {}) as Record<string, string>;
                    break;
                }

                if (app.hooks['account-service'] && header.name === `./${app.hooks['account-service']}`) {
                    handled = true;
                    app.accountService = (await parseXmlFile(stream as unknown as Readable)) || {};
                    break;
                }

                if (app.hooks['account-application'] && header.name === `./${app.hooks['account-application']}`) {
                    handled = true;
                    app.accountApplication = (await parseXmlFile(stream as unknown as Readable)) || {};
                    break;
                }

                if (app.type === 'scope' && header.name.endsWith(scopeIni)) {
                    handled = true;
                    const json = await parseIniFile(stream as unknown as Readable);
                    app.scopeIni = (json || {}) as Record<string, string>;
                    if (app.scopeIni.icon) {
                        // Assume the icon is relative to the ini file
                        data.iconpath = header.name.replace(scopeIni, app.scopeIni.icon as string).replace('./', '');
                    }
                    break;
                }
            }

            // Global file handlers — stream is read once; relevant data applied to all matching apps
            if (!handled) {
                if (header.name === './webapp-properties.json') {
                    const str = (await streamToBuffer(stream as unknown as Readable)).toString();
                    if (isJson(str)) {
                        const webappProperties = JSON.parse(str) as Record<string, unknown>;
                        data.webappProperties = webappProperties;
                        if (Array.isArray(webappProperties.scripts) && webappProperties.scripts.length > 0) {
                            data.webappInject = true;
                        }
                    }
                }
                else if (header.name.endsWith('.qml')) {
                    // Collect QML imports from all .qml files across all apps.
                    const str = (await streamToBuffer(stream as unknown as Readable)).toString();
                    const imports = parseQmlImports(str);

                    for (const app of data.apps) {
                        app.qmlImports = app.qmlImports.concat(imports);
                    }
                }
                else if (header.name.includes('LC_MESSAGES') && header.name.includes('.mo')) {
                    const langs = header.name.split('/');
                    const pos = langs.indexOf('LC_MESSAGES');
                    if (pos >= 1) {
                        const lang = langs[pos - 1].trim();
                        if (lang && !data.languages.includes(lang)) {
                            data.languages.push(lang);
                        }
                    }
                    await streamToBuffer(stream as unknown as Readable); // drain
                }
                else {
                    await streamToBuffer(stream as unknown as Readable); // drain
                }
            }
        })().then(() => cb(), cb);
    });

    await pipeline(Readable.from(fileData), zlib.createUnzip(), extract as unknown as NodeJS.WritableStream);

    if (icon && data.iconpath) {
        return extractIcon(fileData, data);
    }

    return data;
}

interface Manifest {
    hooks?: Record<string, Record<string, string>>;
    maintainer?: string;
    architecture?: string;
    description?: string;
    framework?: string;
    name?: string;
    title?: string;
    version?: string;
    'installed-size'?: string;
    [key: string]: unknown;
}

async function parseControl(control: Buffer, fileData: Buffer, icon: boolean): Promise<ParsedData> {
    const data: ParsedData & { manifest?: Manifest } = {
        apps: [],
        architecture: 'all',
        description: '',
        framework: null,
        icon: null,
        iconpath: null,
        maintainer: null,
        maintainerEmail: null,
        name: null,
        permissions: [],
        title: null,
        types: [],
        urls: [],
        version: null,
        installedSize: null,
        webappInject: false,
        webappProperties: {},
        languages: [],
        files: [],
    };

    const extract = tarstream.extract();

    extract.on('entry', (header: tarstream.Headers, stream: NodeJS.ReadableStream, cb: tarstream.EntryCallback) => {
        (async () => {
            if (header.name === './manifest') {
                const manifestStr = (await streamToBuffer(stream as unknown as Readable)).toString();

                if (!isJson(manifestStr)) {
                    throw new Error('Manifest file is not in a json format');
                }

                data.manifest = JSON.parse(manifestStr) as Manifest;

                if (!data.manifest.hooks || Object.keys(data.manifest.hooks).length === 0) {
                    throw new Error('Manifest file does not have any hooks in it');
                }

                for (const [name, hook] of Object.entries(data.manifest.hooks)) {
                    const app = new App(name, hook);
                    if (hook.desktop) {
                        app.type = 'app';
                    }
                    else if (hook.scope) {
                        app.type = 'scope';
                    }
                    else if (hook['push-helper']) {
                        app.type = 'push';
                    }
                    data.apps.push(app);
                }
            }
            else {
                await streamToBuffer(stream as unknown as Readable); // drain
            }
        })().then(() => cb(), cb);
    });

    await pipeline(Readable.from(control), zlib.createUnzip(), extract as unknown as NodeJS.WritableStream);

    const manifest = data.manifest as Manifest;

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
    data.framework = manifest.framework ?? null;
    data.maintainer = maintainer;
    data.maintainerEmail = maintainerEmail;
    data.name = manifest.name ?? null;
    data.title = manifest.title ?? null;
    data.version = manifest.version ?? null;

    if (manifest['installed-size']) {
        data.installedSize = parseInt(manifest['installed-size'], 10);
    }

    return parseData(fileData, data, icon);
}

export default function parseClickPackage(
    filepath: string,
    iconOrCallback: boolean | ((err: unknown, data?: ParsedData) => void) = false,
    callback?: (err: unknown, data?: ParsedData) => void,
): Promise<ParsedData> {
    let icon: boolean = iconOrCallback as boolean;
    if (typeof iconOrCallback === 'function' && !callback) {
        callback = iconOrCallback;
        icon = false;
    }

    const promise = (async () => {
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

        const data = await parseControl(controlFile, dataFile, icon);

        for (const app of data.apps) {
            if (!data.types.includes(app.type)) {
                data.types.push(app.type);
            }

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

            const apparmor = app.apparmor as { policy_groups?: string[]; template?: string };
            if (apparmor?.policy_groups) {
                for (const permission of apparmor.policy_groups) {
                    if (!data.permissions.includes(permission)) {
                        data.permissions.push(permission);
                    }
                }
            }

            if (apparmor?.template === 'unconfined') {
                data.permissions.push('unconfined');
            }

            if (app.urlDispatcher && Array.isArray(app.urlDispatcher)) {
                for (const ud of app.urlDispatcher as Array<{ protocol?: string; 'domain-suffix'?: string }>) {
                    if (ud.protocol) {
                        let url = `${ud.protocol}://`;
                        if (ud['domain-suffix']) {
                            url += ud['domain-suffix'];
                        }
                        if (!data.urls.includes(url)) {
                            data.urls.push(url);
                        }
                    }
                }
            }

            // Deduplicate imports using a Set for O(1) lookups
            const seen = new Set<string>();
            app.qmlImports = app.qmlImports.filter((qmlImport) => {
                const key = qmlImport.module + qmlImport.version;
                if (seen.has(key)) {
                    return false;
                }
                seen.add(key);
                return true;
            });
        }

        delete data.iconpath;
        delete data.manifest;
        delete (data as Partial<ParsedData>).webappInject;
        delete (data as Partial<ParsedData>).webappProperties;

        return data;
    })();

    if (callback) {
        const cb = callback;
        promise.then(
            (data) => cb(null, data),
            (err: unknown) => cb(err),
        );
    }

    return promise;
}

