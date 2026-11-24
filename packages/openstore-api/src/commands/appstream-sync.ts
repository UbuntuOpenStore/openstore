// SPDX-License-Identifier: AGPL-3.0-or-later
import 'db'; // Make sure the database connection gets setup
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pipeline, Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';

import { AppstreamSyncConfig, type AppstreamSource, type IAppstreamSyncConfig } from '../db/appstream_sync_config';
import { packageKitDefaults, Package, packageKitName } from '../db/package';
import { Architecture, type HydratedPackage, PackageType, SourceStore } from '../db/package/types';
import { withAbortTimeout } from '../utils/abort-timeout';
import {
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
} from '../utils/appstream-scraper';
import { isSourceUnchanged, parseOptions, shouldPrune, shouldUpdateValidators, type AppstreamSyncOptions } from '../utils/appstream-sync';

const PROBE_TIMEOUT_MS = 10_000;
const FETCH_TIMEOUT_MS = 120_000;
const ICON_TIMEOUT_MS = 30_000;

const ARCHITECTURES: Partial<Record<string, Architecture>> = {
  amd64: Architecture.AMD64,
  arm64: Architecture.ARM64,
  armhf: Architecture.ARMHF,
  all: Architecture.ALL,
};

type ProbeStatus = 'unchanged' | 'changed' | 'missing' | 'error';
type Probe = { source: AppstreamSource; status: ProbeStatus; etag?: string; lastModified?: string; error?: unknown };
type App = { data: AppstreamPackageData; component: AppstreamDoc; mediaBaseUrl: string; iconUrl: string };
type IconCache = Map<string, Map<string, Buffer>>;
type Counts = {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  icons: number;
  iconErrors: number;
  pruned: number;
};

async function probeSource(source: AppstreamSource, force: boolean): Promise<Probe> {
  try {
    const response = await withAbortTimeout(
      PROBE_TIMEOUT_MS,
      (signal) => fetch(source.url, { method: 'HEAD', signal }),
      `Timed out probing ${source.url} after ${PROBE_TIMEOUT_MS}ms`,
    );
    if (response.status === 404) {
      return { source, status: 'missing' };
    }
    if (!response.ok) {
      return { source, status: 'error', error: new Error(`HEAD ${source.url}: ${response.status}`) };
    }

    const etag = response.headers.get('etag') ?? undefined;
    const lastModified = response.headers.get('last-modified') ?? undefined;
    const unchanged = isSourceUnchanged({ etag, lastModified }, source, force);

    return { source, status: unchanged ? 'unchanged' : 'changed', etag, lastModified };
  } catch (error) {
    return { source, status: 'error', error };
  }
}

async function probeSources(sources: AppstreamSource[], force: boolean): Promise<Probe[]> {
  const probes = await Promise.all(sources.map((source) => probeSource(source, force)));
  for (const probe of probes) {
    if (probe.status === 'missing') {
      console.log(`Missing AppStream source: ${probe.source.url}`);
    } else if (probe.status === 'error') {
      console.error(`Probe failed for ${probe.source.url}:`, probe.error);
    }
  }

  return probes;
}

async function collectSource(
  source: AppstreamSource,
  allowlist: RegExp[],
  apps: Map<string, App>,
  seen: Set<string>,
  limit?: number,
): Promise<void> {
  const architecture = ARCHITECTURES[source.architecture];
  if (!architecture) {
    throw new Error(`Unknown architecture "${source.architecture}"`);
  }

  await withAbortTimeout(
    FETCH_TIMEOUT_MS,
    async (signal) => {
      const stream = await fetchAppstreamStream(source.url, fetch, signal);
      let first = true;
      let mediaBaseUrl = '';
      for await (const doc of parseAppstreamDocuments(stream, source.url)) {
        if (first) {
          // The first entry is usually the metadata
          mediaBaseUrl = getMediaBaseUrl(doc);
          first = false;
          continue;
        }

        const appId = appIdFromComponent(doc);
        if (!appId || !isWantedComponent(doc, allowlist)) {
          continue;
        }
        seen.add(appId);

        const data = transformComponent(doc, { mediaBaseUrl, architectures: [architecture] });
        if (!data) {
          continue;
        }

        const existing = apps.get(data.id);
        if (existing) {
          existing.data = mergeComponents([existing.data, data]);
        } else {
          apps.set(data.id, { data, component: doc, mediaBaseUrl, iconUrl: source.icon_url });
        }

        if (limit && apps.size >= limit) {
          return;
        }
      }
    },
    `Timed out fetching ${source.url} after ${FETCH_TIMEOUT_MS}ms`,
  );
}

async function collectApps(
  allowlist: RegExp[],
  probes: Probe[],
  limit?: number,
): Promise<{ apps: Map<string, App>; seen: Set<string>; failures: string[] }> {
  const apps = new Map<string, App>();
  const seen = new Set<string>();
  const failures: string[] = [];
  for (const probe of probes) {
    if (probe.status === 'missing') {
      continue;
    }

    try {
      await collectSource(probe.source, allowlist, apps, seen, limit);
    } catch (error) {
      if (error instanceof Error && /\b404\b/.test(error.message)) {
        console.log(`Missing AppStream source: ${probe.source.url}`);
      } else {
        console.error(`Failed to process ${probe.source.url}:`, error);
        failures.push(probe.source.url);
      }
    }

    if (limit && apps.size >= limit) {
      break;
    }
  }

  return { apps, seen, failures };
}

async function fetchIconTarball(url: string): Promise<Map<string, Buffer>> {
  return withAbortTimeout(
    ICON_TIMEOUT_MS,
    async (signal) => {
      const response = await fetch(url, { signal });
      if (!response.ok || !response.body) {
        throw new Error(`Failed to fetch icon tarball ${url}: ${response.status}`);
      }

      const stream = pipeline(Readable.fromWeb(response.body), createGunzip(), () => {});

      const entries = new Map<string, Buffer>();
      for await (const entry of extractIconEntries(stream)) {
        entries.set(entry.name, entry.contents);
      }

      return entries;
    },
    `Timed out fetching icon tarball ${url} after ${ICON_TIMEOUT_MS}ms`,
  );
}

async function fetchIconBytes(url: string): Promise<Buffer> {
  return withAbortTimeout(
    ICON_TIMEOUT_MS,
    async (signal) => {
      const response = await fetch(url, { signal });
      if (!response.ok) {
        throw new Error(`Failed to fetch icon ${url}: ${response.status}`);
      }

      return Buffer.from(await response.arrayBuffer());
    },
    `Timed out fetching icon ${url} after ${ICON_TIMEOUT_MS}ms`,
  );
}

async function fetchIconData(
  app: App,
  sources: { cachedNames: string[]; remoteUrl?: string },
  cache: IconCache,
): Promise<Buffer | undefined> {
  if (sources.cachedNames.length) {
    let entries = cache.get(app.iconUrl);
    if (!entries) {
      entries = await fetchIconTarball(app.iconUrl);
      cache.set(app.iconUrl, entries);
    }

    const name = sources.cachedNames.find((cached) => entries.has(cached));
    if (name) {
      return entries.get(name);
    }
  }

  if (sources.remoteUrl) {
    return fetchIconBytes(resolveMediaUrl(app.mediaBaseUrl, sources.remoteUrl));
  }

  return undefined;
}

async function writeIcon(pkg: HydratedPackage, contents: Buffer): Promise<string> {
  const iconPath = pkg.getIconFilePath('.png');
  await fs.mkdir(path.dirname(iconPath), { recursive: true });
  const tempPath = `${iconPath}.${randomUUID()}.tmp`;

  try {
    await fs.writeFile(tempPath, contents);
    await fs.rename(tempPath, iconPath);
  } finally {
    await fs.rm(tempPath, { force: true });
  }

  return iconPath;
}

async function updateIcon(pkg: HydratedPackage, app: App, options: AppstreamSyncOptions, counts: Counts, cache: IconCache): Promise<void> {
  const iconPath = pkg.getIconFilePath('.png');
  if (
    !options.force &&
    (await fs.access(iconPath).then(
      () => true,
      () => false,
    ))
  ) {
    return;
  }

  const sources = iconSources(app.component);
  if (options.dryRun) {
    if (sources.cachedNames.length || sources.remoteUrl) {
      counts.icons++;
    }

    return;
  }

  try {
    const contents = await fetchIconData(app, sources, cache);
    if (!contents) {
      return;
    }

    pkg.icon = await writeIcon(pkg, contents);
    await pkg.save();
    counts.icons++;
  } catch (error) {
    console.error(`Icon failed for ${pkg.id}:`, error);
    counts.iconErrors++;
  }
}

async function upsertApp(app: App, options: AppstreamSyncOptions, counts: Counts, iconCache: IconCache): Promise<void> {
  const existing = await Package.findOne({ id: app.data.id });
  if (existing && existing.package_type !== PackageType.PACKAGEKIT) {
    console.error(`ID collision for ${app.data.id}: ${existing.package_type}`);
    counts.skipped++;
    return;
  }

  if (existing?.locked) {
    console.log(`Skipped locked package: ${app.data.id}`);
    counts.skipped++;
    return;
  }

  if (options.dryRun) {
    console.log(`Would ${existing ? 'update' : 'create'}: ${app.data.id}`);
    counts[existing ? 'updated' : 'created']++;
    return;
  }

  let pkg: HydratedPackage;
  if (existing) {
    Object.assign(existing, app.data);
    existing.published = true; // Pruned apps come back when their metadata reappears.
    pkg = await existing.save();
    counts.updated++;
  } else {
    pkg = await Package.create({ ...packageKitDefaults(), ...app.data, published_date: new Date().toISOString() });
    counts.created++;
  }

  await updateIcon(pkg, app, options, counts, iconCache);
}

async function pruneApps(seen: Set<string>, counts: Counts, dryRun: boolean): Promise<void> {
  const candidates = await Package.find({
    package_type: PackageType.PACKAGEKIT,
    source_store: SourceStore.OS,
    external_id: { $exists: true, $ne: '' },
    locked: { $ne: true },
    published: true,
  });

  for (const pkg of candidates) {
    if (seen.has(packageKitName(pkg.id))) {
      continue;
    }

    if (dryRun) {
      console.log(`Would prune: ${pkg.id}`);
    } else {
      pkg.published = false;
      await pkg.save();
    }

    counts.pruned++;
  }
}

async function updateValidators(configDoc: IAppstreamSyncConfig, probes: Probe[]): Promise<void> {
  for (const probe of probes) {
    if (probe.status === 'missing' || probe.status === 'error') {
      continue;
    }

    probe.source.etag = probe.etag;
    probe.source.last_modified = probe.lastModified;
  }

  await configDoc.save();
}

async function loadSources(): Promise<{ configDoc: IAppstreamSyncConfig; allowlist: RegExp[] } | undefined> {
  const { config: configDoc } = await AppstreamSyncConfig.getOrCreate();
  if (configDoc.sources.length === 0) {
    console.error('No AppStream sources configured');
    return undefined;
  }

  try {
    return { configDoc, allowlist: compileAllowlist(configDoc.allowlist) };
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return undefined;
  }
}

async function applyApps(
  apps: Map<string, App>,
  seen: Set<string>,
  failures: string[],
  options: AppstreamSyncOptions,
  configDoc: IAppstreamSyncConfig,
  probes: Probe[],
): Promise<Counts> {
  const counts: Counts = { created: 0, updated: 0, skipped: 0, errors: 0, icons: 0, iconErrors: 0, pruned: 0 };
  const iconCache: IconCache = new Map();
  for (const app of apps.values()) {
    try {
      await upsertApp(app, options, counts, iconCache);
    } catch (error) {
      console.error(`Error processing ${app.data.id}:`, error);
      counts.errors++;
    }
  }

  if (shouldPrune(options, failures)) {
    await pruneApps(seen, counts, options.dryRun);
    if (shouldUpdateValidators(options, failures)) {
      await updateValidators(configDoc, probes);
    }
  }

  return counts;
}

async function syncAppstream(options: AppstreamSyncOptions): Promise<number> {
  console.log('Starting AppStream sync...');
  const sources = await loadSources();
  if (!sources) {
    return 1;
  }

  const probes = await probeSources(sources.configDoc.sources, options.force);
  if (probes.every((probe) => probe.status === 'missing' || probe.status === 'error')) {
    console.error('All AppStream sources are unavailable');
    return 1;
  }

  if (probes.every((probe) => probe.status === 'unchanged' || probe.status === 'missing')) {
    console.log('All AppStream sources are unchanged; skipping');
    return 0;
  }

  const { apps, seen, failures } = await collectApps(sources.allowlist, probes, options.limit);
  const counts = await applyApps(apps, seen, failures, options, sources.configDoc, probes);

  console.log('\n=== AppStream Sync Complete ===');
  console.log(`Created: ${counts.created}`);
  console.log(`Updated: ${counts.updated}`);
  console.log(`Skipped: ${counts.skipped}`);
  console.log(`Errors: ${counts.errors}`);
  console.log(`Icons: ${counts.icons}`);
  console.log(`Icon errors: ${counts.iconErrors}`);
  console.log(`Pruned: ${counts.pruned}`);
  return 0;
}

let options: AppstreamSyncOptions;
try {
  options = parseOptions(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

void syncAppstream(options)
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error('Fatal error during sync:', error);
    process.exit(1);
  });
