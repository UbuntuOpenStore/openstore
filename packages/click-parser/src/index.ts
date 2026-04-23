import crypto from 'node:crypto';
import fs from 'fs';
import path from 'path';
import { Readable } from 'node:stream';
import tarstream from 'tar-stream';
import xml2js from 'xml2js';
import zlib from 'zlib';

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

// TODO detect indicators

function extractIcon(fileData: Buffer, data: ParsedData, callback: (err: unknown, data?: ParsedData) => void): void {
    let iconpath = data.iconpath as string;
    if (iconpath.indexOf('./') !== 0) {
        iconpath = `./${data.iconpath}`;
    }

    const write = path.join('/tmp', `${crypto.randomUUID()}${path.extname(data.iconpath as string).toLowerCase()}`);
    const f = fs.createWriteStream(write)
        .on('finish', () => {
            data.icon = write;
            callback(null, data);
        });

    let found = false;
    const iconExtract = tarstream.extract();
    iconExtract.on('entry', (header, stream, cb) => {
        if (header.name === iconpath) {
            found = true;
            stream.pipe(f);
            stream.on('end', cb);
        }
        else {
            stream.on('end', cb);
            stream.resume();
        }
    });
    iconExtract.on('finish', () => {
        if (!found) {
            callback(null, data);
        }
    });

    Readable.from(fileData)
        .on('error', (err) => {
            console.error(err);
            callback(null, data);
        })
        .pipe(zlib.createUnzip())
        .pipe(iconExtract);
}

function parseJsonFile(stream: NodeJS.ReadableStream, callback: (data?: Record<string, unknown>) => void): void {
    let data = '';
    stream.on('data', (fdata: Buffer) => {
        data += fdata.toString();
    });
    stream.on('end', () => {
        if (isJson(data)) {
            callback(JSON.parse(data) as Record<string, unknown>);
        }
        else {
            callback();
        }
    });
}

function parseXmlFile(stream: NodeJS.ReadableStream, callback: (data?: Record<string, unknown>) => void): void {
    let data = '';
    stream.on('data', (fdata: Buffer) => {
        data += fdata.toString();
    });
    stream.on('end', () => {
        xml2js.parseString(
            data,
            {
                explicitArray: false,
                mergeAttrs: true,
                normalizeTags: true,
                normalize: true,
            },
            (err, result) => {
                if (err) {
                    callback();
                }
                else {
                    callback(result as Record<string, unknown>);
                }
            }
        );
    });
}

function parseIniFile(stream: NodeJS.ReadableStream, callback: (data: Record<string, unknown>) => void): void {
    let fileData = '';
    stream.on('data', (fdata: Buffer) => {
        fileData += fdata.toString();
    });
    stream.on('end', () => {
        const data: Record<string, unknown> = {};
        const desktop = fileData.split('\n');

        const other: string[] = [];
        desktop.forEach((line) => {
            const lline = line.toLowerCase().trim();
            if (!(lline[0] === '[' && lline[lline.length - 1] === ']') && lline.length > 0) {
                const pos = lline.indexOf('=');
                if (pos > -1) {
                    const key = lline.substring(0, pos).trim();
                    const value = line
                        .trim()
                        .substring(pos + 1)
                        .trim();
                    data[key] = value;
                }
                else {
                    other.push(line);
                }
            }
        });

        if (other.length > 0) {
            data.other = other;
        }

        callback(data);
    });
}

interface QmlImportResult {
    module: string;
    version: string | null;
}

function parseQmlImports(str: string): QmlImportResult[] {
    const split = str.split('\n');
    return split.filter((line) => line.trim().startsWith('import ')).map((line) => {
        const tokens = line.split(' ');
        const module = tokens[1].replace(/"/g, '');
        const isJs = module.endsWith('.js');
        const version = isJs ? null : tokens[2];

        return {
            module,
            version,
        };
    });
}

function parseData(
    fileData: Buffer,
    data: ParsedData,
    icon: boolean,
    callback: (err: unknown, data?: ParsedData) => void,
): void {
    let potentialOgraWebapp = false;

    Readable.from(fileData)
        .pipe(zlib.createUnzip())
        .pipe(tarstream.extract())
        .on('entry', (header: tarstream.Headers, stream: NodeJS.ReadableStream, cb: tarstream.EntryCallback) => {
            const filename = header.name.replace('./', '');
            if (filename) {
                data.files.push(filename);
            }

            let found = false;
            data.apps.forEach((app) => {
                const scopeIni = `${data.name}_${app.name}.ini`;

                if (app.hooks.desktop && header.name === `./${app.hooks.desktop}`) {
                    found = true;
                    parseIniFile(stream, (json) => {
                        app.desktop = (json || {}) as Record<string, string>;

                        if (app.desktop.exec) {
                            if ((app.desktop.exec as string).indexOf('webapp-container') === 0) {
                                /*
                                Check the arguments to webapp-container, if they contain
                                an external url as the main url the assume it's a webapp.
                                */

                                let url: string | null = null;
                                const exec = (app.desktop.exec as string).replace('  ', ' ').replace('webapp-container', '').trim();

                                // Match spaces not encased in quotes: http://stackoverflow.com/a/16261693
                                const execSplit = exec.match(/(?:[^\s"]+|"[^"]*")+/g);
                                if (execSplit) {
                                    execSplit.forEach((value) => {
                                        if (
                                            value && (
                                                value.substring(0, 7) === 'http://' ||
                                                value.substring(0, 8) === 'https://'
                                            )
                                        ) {
                                            url = value;
                                        }
                                    });
                                }

                                if (url) {
                                    app.type = 'webapp';
                                    app.webappUrl = url;
                                }
                            }
                        }

                        if (app.desktop.icon) {
                            data.iconpath = app.desktop.icon as string;
                        }

                        cb();
                    });
                }
                else if (app.hooks.apparmor && header.name === `./${app.hooks.apparmor}`) {
                    found = true;
                    parseJsonFile(stream, (json) => {
                        app.apparmor = (json || {}) as App['apparmor'];
                        cb();
                    });
                }
                else if (app.hooks['content-hub'] && header.name === `./${app.hooks['content-hub']}`) {
                    found = true;
                    parseJsonFile(stream, (json) => {
                        app.contentHub = (json || {}) as Record<string, string[]>;
                        cb();
                    });
                }
                else if (app.hooks.urls && header.name === `./${app.hooks.urls}`) {
                    found = true;
                    parseJsonFile(stream, (json) => {
                        app.urlDispatcher = (json as unknown as Array<Record<string, string>>) || [];
                        cb();
                    });
                }
                else if (app.hooks['push-helper'] && header.name === `./${app.hooks['push-helper']}`) {
                    found = true;
                    parseJsonFile(stream, (json) => {
                        app.pushHelper = (json || {}) as Record<string, string>;
                        cb();
                    });
                }
                else if (app.hooks['account-service'] && header.name === `./${app.hooks['account-service']}`) {
                    found = true;
                    parseXmlFile(stream, (json) => {
                        app.accountService = json || {};
                        cb();
                    });
                }
                else if (app.hooks['account-application'] && header.name === `./${app.hooks['account-application']}`) {
                    found = true;
                    parseXmlFile(stream, (json) => {
                        app.accountApplication = json || {};
                        cb();
                    });
                }
                else if (app.type === 'scope' && header.name.indexOf(scopeIni, header.name.length - scopeIni.length) !== -1) {
                    found = true;
                    parseIniFile(stream, (json) => {
                        app.scopeIni = (json || {}) as Record<string, string>;

                        if (app.scopeIni.icon) {
                            // Assume the icon is relative to the ini file
                            data.iconpath = header.name.replace(scopeIni, app.scopeIni.icon as string).replace('./', '');
                        }

                        cb();
                    });
                }
                else if ((app.type === 'app' || app.type === 'webapp+') && header.name === './config.js') {
                    /*
                      Detect the Ogra's alternate webapp container.
                      Detect both the presence of a config.js file and
                      Main.qml file with certain parameters.
                      */

                    stream.on('data', (fdata: Buffer) => {
                        const str = fdata.toString();

                        if (
                            str.indexOf('var webappName') >= 0 &&
                            str.indexOf('var webappUrl') >= 0 &&
                            str.indexOf('var webappUrlPattern') >= 0
                        ) {
                            if (potentialOgraWebapp) {
                                app.type = 'webapp+';
                            }
                            else {
                                potentialOgraWebapp = true;
                            }
                        }

                        cb();
                    });
                }
                else if ((app.type === 'app' || app.type === 'webapp+') && header.name === './qml/Main.qml') {
                    // Detect the Ogra's alternate webapp container http://bazaar.launchpad.net/~ogra/alternate-webapp-container/trunk/files

                    stream.on('data', (fdata: Buffer) => {
                        const str = fdata.toString();

                        if (str.indexOf('WebView') >= 0 || str.indexOf('WebEngineView') >= 0) {
                            if (potentialOgraWebapp) {
                                app.type = 'webapp+';
                            }
                            else {
                                potentialOgraWebapp = true;
                            }
                        }

                        app.qmlImports = app.qmlImports.concat(parseQmlImports(str));

                        cb();
                    });
                }
                else if (header.name.endsWith('.qml')) {
                    stream.on('data', (fdata: Buffer) => {
                        const str = fdata.toString();
                        app.qmlImports = app.qmlImports.concat(parseQmlImports(str));

                        cb();
                    });
                }
            });

            if (!found) {
                if (header.name === './webapp-properties.json') {
                    stream.on('data', (fdata: Buffer) => {
                        let webappProperties: string | Record<string, unknown> = fdata.toString();
                        if (isJson(webappProperties)) {
                            webappProperties = JSON.parse(webappProperties) as Record<string, unknown>;
                            data.webappProperties = webappProperties;
                            if (
                                (webappProperties.scripts as unknown[]) &&
                                (webappProperties.scripts as unknown[]).length > 0
                            ) {
                                data.webappInject = true;
                            }
                        }

                        cb();
                    });
                }
                else if (header.name.indexOf('LC_MESSAGES') >= 0 && header.name.indexOf('.mo') >= 0) {
                    const langs = header.name.split('/');
                    const pos = langs.indexOf('LC_MESSAGES');
                    let lang: string | null = null;
                    if (pos >= 1) {
                        lang = langs[pos - 1].trim();
                    }

                    if (lang && data.languages.indexOf(lang) === -1) {
                        data.languages.push(lang);
                    }

                    cb();
                }
                else {
                    cb();
                }
            }

            stream.resume();
        })
        .on('error', (err) => {
            console.error(err);
            callback(err);
        })
        .on('finish', () => {
            if (icon && data.iconpath) {
                extractIcon(fileData, data, callback);
            }
            else {
                callback(null, data);
            }
        });
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

function parseControl(
    control: Buffer,
    fileData: Buffer,
    icon: boolean,
    callback: (err: unknown, data?: ParsedData) => void,
): void {
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

    Readable.from(control)
        .pipe(zlib.createUnzip())
        .pipe(tarstream.extract())
        .on('entry', (header: tarstream.Headers, stream: NodeJS.ReadableStream, cb: tarstream.EntryCallback) => {
            if (header.name === './manifest') {
                let manifest = '';
                stream.on('data', (fdata: Buffer) => {
                    manifest += fdata.toString();
                });

                stream.on('end', () => {
                    if (isJson(manifest)) {
                        data.manifest = JSON.parse(manifest) as Manifest;

                        if (!data.manifest.hooks || Object.keys(data.manifest.hooks).length === 0) {
                            cb(new Error('Manifest file does not have any hooks in it'));
                        }
                        else {
                            Object.keys(data.manifest.hooks).forEach((name) => {
                                const hook = (data.manifest as Manifest).hooks![name];
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
                            });

                            cb();
                        }
                    }
                    else {
                        cb(new Error('Manifest file is not in a json format'));
                    }
                });
            }
            else {
                cb();
            }

            stream.resume();
        })
        .on('error', (err: Error) => {
            callback(err);
        })
        .on('finish', () => {
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
                catch (e) {
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

            parseData(fileData, data, icon, callback);
        });
}

export default function parseClickPackage(
    filepath: string,
    iconOrCallback: boolean | ((err: unknown, data?: ParsedData) => void) = false,
    callback?: (err: unknown, data?: ParsedData) => void,
): Promise<ParsedData> {
    return new Promise((resolve, reject) => {
        let icon: boolean = iconOrCallback as boolean;
        if (typeof iconOrCallback === 'function' && !callback) {
            callback = iconOrCallback;
            icon = false;
        }

        let dataFile: Buffer | null = null;
        let controlFile: Buffer | null = null;

        const arFiles = parseArArchive(fs.readFileSync(filepath));
        arFiles.forEach((file) => {
            if (file.name === 'data.tar.gz') {
                dataFile = file.fileData;
            }
            else if (file.name === 'control.tar.gz') {
                controlFile = file.fileData;
            }
        });

        if (dataFile === null || controlFile === null) {
            const err = new Error('Malformed click package');
            reject(err);
            if (callback) {
                callback(err);
            }
        }
        else {
            parseControl(controlFile, dataFile, icon, (err, data) => {
                if (err) {
                    reject(err);
                    if (callback) {
                        callback(err);
                    }
                }
                else if (!data) {
                    const noDataErr = new Error('Control data is undefined');
                    reject(noDataErr);
                    if (callback) {
                        callback(noDataErr);
                    }
                }
                else {
                    data.apps.forEach((app) => {
                        if (data.types.indexOf(app.type) === -1) {
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
                        if (apparmor && apparmor.policy_groups) {
                            data.permissions = data.permissions.concat(apparmor.policy_groups.filter((permission) => {
                                return data.permissions.indexOf(permission) < 0;
                            }));
                        }

                        if (apparmor && apparmor.template === 'unconfined') {
                            data.permissions.push('unconfined');
                        }

                        if (app.urlDispatcher && Array.isArray(app.urlDispatcher)) {
                            (app.urlDispatcher as Array<{ protocol?: string; 'domain-suffix'?: string }>).forEach((ud) => {
                                let url = '';
                                if (ud.protocol) {
                                    url = `${ud.protocol}://`;
                                    if (ud['domain-suffix']) {
                                        url += ud['domain-suffix'];
                                    }

                                    if (data.urls.indexOf(url) === -1) {
                                        data.urls.push(url);
                                    }
                                }
                            });
                        }

                        // Deduplicate imports
                        const qmlImportMatch: string[] = [];
                        const qmlImports = app.qmlImports.filter((qmlImport) => {
                            const key = qmlImport.module + qmlImport.version;
                            if (!qmlImportMatch.includes(key)) {
                                qmlImportMatch.push(key);
                                return true;
                            }
                            return false;
                        });

                        app.qmlImports = qmlImports;
                    });

                    delete data.iconpath;
                    delete data.manifest;
                    delete (data as Partial<ParsedData>).webappInject;
                    delete (data as Partial<ParsedData>).webappProperties;

                    resolve(data);
                    if (callback) {
                        callback(null, data);
                    }
                }
            });
        }
    });
}
