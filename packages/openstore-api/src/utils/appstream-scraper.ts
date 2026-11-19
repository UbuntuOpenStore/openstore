// SPDX-License-Identifier: AGPL-3.0-or-later
import { createInterface } from 'node:readline';
import { pipeline, Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';

import { extract as tarExtract } from 'tar-stream';
import { parse as parseYaml, YAMLParseError, type ParsedNode } from 'yaml';

import { AppType, type ContentRating, Architecture, SourceStore, type IPackage } from '../db/package/types';
import { mapAppstreamCategory, mapSpdxLicense } from './appstream-helpers';
import { appstreamDocSchema, type AppstreamDoc } from './appstream.schema';
import { CHANGELOG_MAX_LENGTH, DESCRIPTION_MAX_LENGTH, KEYWORDS_MAX_COUNT } from './limits';
import { sanitize } from './sanitize';

export const APPSTREAM_COMPONENT_TYPES: string[] = ['desktop-application'];

const LOCALE_KEY = /^(?:C|[a-z]{2,3}(?:[-_@][A-Za-z0-9]+)*)$/;

function isDuplicateKey(a: ParsedNode, b: ParsedNode): boolean {
  const keyA = 'value' in a && typeof a.value === 'string' ? a.value : undefined;
  const keyB = 'value' in b && typeof b.value === 'string' ? b.value : undefined;
  return keyA !== undefined && keyA === keyB && !LOCALE_KEY.test(keyA);
}

export type { AppstreamDoc } from './appstream.schema';
export type AppstreamPackageData = Partial<IPackage> & { id: string };

type TransformContext = { mediaBaseUrl: string; architectures: Architecture[] };
type IconEntry = { name: string; contents: Buffer; mtime: Date };
type VersionChangelog = { version: string; changelog: string };

function localizedText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value || undefined;
  }

  if (Array.isArray(value)) {
    const item = value.find((entry) => entry?.lang === 'C') ?? value.find((entry) => entry?.lang === 'en') ?? value[0];
    return typeof item?.text === 'string' ? item.text || undefined : undefined;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const keys = ['C', 'en', ...Object.keys(value).filter((key) => key !== 'C' && key !== 'en')];
  for (const key of keys) {
    const text = localizedText((value as Record<string, unknown>)[key]);
    if (text) {
      return text;
    }
  }

  return undefined;
}

function htmlToText(value: string | undefined, maxLength: number): string {
  if (!value) {
    return '';
  }
  const structured = value
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|li|ul|ol|h[1-6]|tr)\b[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');

  return sanitize(structured)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, maxLength);
}

export function compileAllowlist(patterns: string[]): RegExp[] {
  return patterns.map((pattern) => {
    try {
      return new RegExp(pattern);
    } catch (err) {
      throw new Error(`Invalid allowlist pattern "${pattern}": ${(err as Error).message}`);
    }
  });
}

export function appIdFromComponent(component: AppstreamDoc): string | undefined {
  const id = component.ID;
  return typeof id === 'string' && id ? id.replace(/\.desktop$/, '') : undefined;
}

export function isWantedComponent(component: AppstreamDoc, allowlist: RegExp[]): boolean {
  if (!component.Type || !APPSTREAM_COMPONENT_TYPES.includes(component.Type)) {
    return false;
  }
  const appId = appIdFromComponent(component);
  return !!appId && !!localizedText(component.Name) && (allowlist.length === 0 || allowlist.some((re) => re.test(appId)));
}

export function getMediaBaseUrl(header: AppstreamDoc): string {
  return typeof header.MediaBaseUrl === 'string' ? header.MediaBaseUrl : '';
}

export function resolveMediaUrl(base: string, url: string): string {
  if (!base || /^([a-z][a-z\d+.-]*:|\/\/)/i.test(url)) {
    return url;
  }

  return `${base.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
}

export async function fetchAppstreamStream(url: string, fetchFn: typeof fetch = fetch, signal?: AbortSignal): Promise<Readable> {
  const response = await fetchFn(url, { signal });
  if (!response.ok || !response.body) {
    throw new Error(`Failed to fetch AppStream data from ${url}: ${response.status} ${response.statusText}`);
  }

  return pipeline(Readable.fromWeb(response.body), createGunzip(), () => {});
}

function parseDocument(raw: string, sourceUrl?: string): AppstreamDoc | undefined {
  if (!raw.trim()) {
    return undefined;
  }

  let value: unknown;
  try {
    value = parseYaml(raw, { uniqueKeys: isDuplicateKey });
  } catch (error) {
    if (sourceUrl && error instanceof YAMLParseError) {
      throw new Error(`Invalid YAML from ${sourceUrl}: ${error.message}`, { cause: error });
    }

    throw error;
  }

  const result = appstreamDocSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  const id = value && typeof value === 'object' && 'ID' in value && typeof value.ID === 'string' ? value.ID : undefined;
  console.warn(`Skipping invalid AppStream document${id ? ` ${id}` : ''} - validation errors: ${JSON.stringify(result.error.format())}`);
  return undefined;
}

export async function* parseAppstreamDocuments(stream: Readable, sourceUrl?: string): AsyncGenerator<AppstreamDoc> {
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let buffer: string[] = [];
  try {
    for await (const line of lines) {
      if (line !== '---') {
        buffer.push(line);
        continue;
      }

      const document = parseDocument(buffer.join('\n'), sourceUrl);
      if (document) {
        yield document;
      }
      buffer = [];
    }

    const last = parseDocument(buffer.join('\n'), sourceUrl);
    if (last) {
      yield last;
    }
  } finally {
    lines.close();
    stream.destroy();
  }
}

function screenshotUrls(component: AppstreamDoc, base: string): string[] {
  const shots = Array.isArray(component.Screenshots) ? component.Screenshots : [];
  return [...shots]
    .sort((a, b) => Number(b.default === true) - Number(a.default === true))
    .map((shot) => shot['source-image']?.url ?? shot.url)
    .filter((url): url is string => typeof url === 'string' && !!url)
    .map((url) => resolveMediaUrl(base, url));
}

function contentRating(component: AppstreamDoc): ContentRating | undefined {
  const ratings = component.ContentRating;
  if (!ratings || typeof ratings !== 'object') {
    return undefined;
  }
  const type = ratings['oars-1.1'] ? 'oars-1.1' : ratings['oars-1.0'] ? 'oars-1.0' : undefined;
  if (!type) {
    return undefined;
  }
  return {
    type,
    content_attributes: Object.entries(ratings[type] ?? {}).map(([id, value]) => ({ id, value: String(value) })),
  };
}

function releaseInfo(releases: AppstreamDoc['Releases']): Pick<AppstreamPackageData, 'updated_date' | 'version_changelogs'> {
  const sorted = [...(Array.isArray(releases) ? releases : [])].sort(
    (a, b) => (Number(b['unix-timestamp']) || 0) - (Number(a['unix-timestamp']) || 0),
  );
  const version_changelogs: VersionChangelog[] = sorted
    .filter((release) => release.version)
    .slice(0, 10)
    .map((release) => ({
      version: String(release.version),
      changelog: htmlToText(localizedText(release.Description ?? release.description), CHANGELOG_MAX_LENGTH),
    }));
  const newest = sorted.find((release) => !!release['unix-timestamp']);
  return {
    ...(newest ? { updated_date: new Date(Number(newest['unix-timestamp']) * 1000).toISOString() } : {}),
    version_changelogs,
  };
}

export function transformComponent(component: AppstreamDoc, context: TransformContext): AppstreamPackageData | undefined {
  const appId = appIdFromComponent(component);
  const name = localizedText(component.Name);
  if (!appId || !name) {
    return undefined;
  }

  const urls = component.Url ?? {};
  const author = localizedText(component.DeveloperName) ?? '';
  const rating = contentRating(component);
  const keywordsValue = component.Keywords;
  const keywords = (Array.isArray(keywordsValue) ? keywordsValue : Array.isArray(keywordsValue?.C) ? keywordsValue.C : [])
    .filter((keyword) => !!keyword)
    .slice(0, KEYWORDS_MAX_COUNT);

  return {
    id: `packagekit.${appId}`,
    name,
    tagline: localizedText(component.Summary) ?? '',
    description: htmlToText(localizedText(component.Description), DESCRIPTION_MAX_LENGTH),
    category: mapAppstreamCategory(Array.isArray(component.Categories) ? component.Categories : []) ?? 'Utilities',
    keywords,
    license: mapSpdxLicense(typeof component.ProjectLicense === 'string' ? component.ProjectLicense : ''),
    source: urls.homepage ?? '',
    support_url: urls.help ?? urls.bugtracker ?? '',
    donate_url: urls.donation ?? '',
    translation_url: urls.translate ?? '',
    author,
    maintainer_name: author,
    screenshots: screenshotUrls(component, context.mediaBaseUrl),
    types: [AppType.APP],
    nsfw: false,
    external_id: typeof component.Package === 'string' ? component.Package : '',
    source_store: SourceStore.OS,
    architectures: context.architectures,
    device_compatibilities: [],
    ...releaseInfo(component.Releases),
    ...(rating ? { packagekit_data: { content_rating: rating } } : {}),
  };
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === '') {
    return true;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value).length === 0;
  }
  return false;
}

export function mergeComponents(items: AppstreamPackageData[]): AppstreamPackageData {
  if (items.length === 0) {
    throw new Error('No AppStream components to merge');
  }

  const architectures: Architecture[] = [];
  for (const item of items) {
    for (const architecture of item.architectures ?? []) {
      if (!architectures.includes(architecture)) {
        architectures.push(architecture);
      }
    }
  }

  const merged: Record<string, unknown> = { ...items[0], architectures };
  for (const item of items.slice(1)) {
    for (const [key, value] of Object.entries(item)) {
      if (key !== 'architectures' && isEmpty(merged[key])) {
        merged[key] = value;
      }
    }
  }
  return merged as AppstreamPackageData;
}

export async function* extractIconEntries(tarStream: Readable): AsyncGenerator<IconEntry> {
  const latest = new Map<string, IconEntry>();
  const extract = tarExtract();

  try {
    await new Promise<void>((resolve, reject) => {
      extract.on('entry', (header, entry, next) => {
        const chunks: Buffer[] = [];
        entry.on('data', (chunk: unknown) => chunks.push(chunk as Buffer));
        entry.on('end', () => {
          const candidate = { name: header.name, contents: Buffer.concat(chunks), mtime: header.mtime };
          const existing = latest.get(header.name);
          if (!existing || candidate.mtime >= existing.mtime) {
            latest.set(header.name, candidate);
          }
          next();
        });
        entry.on('error', next);
      });

      extract.on('finish', resolve);
      extract.on('error', reject);

      tarStream.on('error', reject);
      tarStream.pipe(extract);
    });

    yield* latest.values();
  } finally {
    tarStream.unpipe(extract);
    extract.destroy();
  }
}

export function iconSources(component: AppstreamDoc): { cachedNames: string[]; remoteUrl?: string } {
  const icon = component.Icon;
  const entries = Array.isArray(icon) ? icon : [];
  const cached = Array.isArray(icon) ? [] : (icon?.cached ?? []);
  const cachedNames = Array.from(
    new Set(
      [...cached, ...entries.filter((entry) => entry.type === 'cached')]
        .map((entry) => entry.name)
        .filter((name): name is string => typeof name === 'string' && !!name),
    ),
  );

  const remote = Array.isArray(icon) ? undefined : Array.isArray(icon?.remote) ? icon.remote.find((entry) => entry.url) : icon?.remote;
  const remoteUrl = remote?.url ?? entries.find((entry) => entry.type === 'remote' && entry.url)?.url;
  return remoteUrl ? { cachedNames, remoteUrl } : { cachedNames };
}
