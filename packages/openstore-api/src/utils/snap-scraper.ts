import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import {
  Architecture,
  Channel,
  type ChannelArchitecture,
  PackageType,
  SourceStore,
  type SnapConfinement,
  SnapGrade,
  SnapChannel,
  type IPackage,
  type IRevision,
  type SnapConnection,
  AppType,
} from '../db/package/types';

const USER_AGENT = 'open-store.io';
const SNAP_DEVICE_SERIES = '16';
const DELAY_BETWEEN_REQUESTS = 150;

export const CATEGORY_MAPPING: Record<string, string> = {
  'art-and-design': 'Graphics',
  'books-and-reference': 'Books & Comics',
  'devices-and-iot': 'Utilities',
  'health-and-fitness': 'Health & Fitness',
  'music-and-audio': 'Music & Audio',
  'news-and-weather': 'News & Magazines',
  'photo-and-video': 'Media & Video',
  'server-and-cloud': 'Developer Tools',
  development: 'Developer Tools',
  education: 'Education & Reference',
  entertainment: 'Entertainment',
  finance: 'Business & Finance',
  games: 'Games',
  personalisation: 'Personalisation',
  productivity: 'Productivity',
  science: 'Education & Reference',
  security: 'Utilities',
  social: 'Communication & Social',
  utilities: 'Utilities',
};

export const ARCH_MAPPING: Partial<Record<string, Architecture>> = {
  amd64: Architecture.AMD64,
  arm64: Architecture.ARM64,
  armhf: Architecture.ARMHF,
  all: Architecture.ALL,
};

export const SNAP_CHANNEL_MAPPING: Partial<Record<string, SnapChannel>> = {
  stable: SnapChannel.STABLE,
  candidate: SnapChannel.CANDIDATE,
  beta: SnapChannel.BETA,
  edge: SnapChannel.EDGE,
};

function mapLicense(spdxLicense: string): string {
  const normalized = spdxLicense.toLowerCase().trim();

  if (normalized.includes('gpl-3') || normalized.includes('gpl3') || normalized.includes('gplv3')) {
    if (normalized.includes('lgpl')) {
      return 'GNU LGPL v3';
    }
    if (normalized.includes('agpl')) {
      return 'GNU Affero GPL v3';
    }
    return 'GNU GPL v3';
  }

  if (normalized.includes('gpl-2') || normalized.includes('gpl2') || normalized.includes('gplv2')) {
    if (normalized.includes('lgpl')) {
      return 'GNU LGPL v2.1';
    }
    return 'GNU GPL v2';
  }

  if (normalized.includes('apache')) {
    return 'Apache License';
  }

  if (normalized.includes('mit')) {
    return 'MIT/X/Expat License';
  }

  if (normalized.includes('bsd')) {
    return 'BSD License (Simplified)';
  }

  if (normalized.includes('mpl') || normalized.includes('mozilla')) {
    return 'Mozilla Public License';
  }

  if (normalized.includes('epl') || normalized.includes('eclipse')) {
    return 'Eclipse Public License';
  }

  if (normalized === 'proprietary') {
    return 'Proprietary';
  }

  if (normalized === 'unset' || !spdxLicense) {
    return 'Other Open Source';
  }

  return 'Other Open Source';
}

export interface SnapSearchResult {
  name: string;
  'snap-id': string;
}

export interface SnapV2Channel {
  architecture: string;
  name: string;
  'released-at': string;
  risk: string;
  track: string;
}

export interface SnapV2Download {
  'sha3-384': string;
  size: number;
  url: string;
}

export interface SnapV2ChannelMap {
  base: string;
  channel: SnapV2Channel;
  confinement: string;
  'created-at': string;
  download: SnapV2Download;
  revision: number;
  'snap-yaml'?: string;
  type: string;
  version: string;
}

export interface SnapV2Publisher {
  'display-name': string;
  id: string;
  username: string;
  validation: string;
}

export interface SnapV2Category {
  featured: boolean;
  name: string;
}

export interface SnapV2Media {
  height: number;
  type: string;
  url: string;
  width: number;
}

export interface SnapV2Snap {
  categories?: SnapV2Category[];
  description?: string;
  license: string;
  links?: {
    contact?: string[];
    website?: string[];
  };
  media?: SnapV2Media[];
  name: string;
  publisher: SnapV2Publisher;
  'snap-id': string;
  'store-url': string;
  summary: string;
  title: string;
}

export interface SnapV2Response {
  'channel-map': SnapV2ChannelMap[];
  'default-track': string | null;
  name: string;
  snap: SnapV2Snap;
  'snap-id': string;
}

const connectionDefSchema = z
  .object({
    interface: z.string().optional(),
    'default-provider': z.string().optional(),
    label: z.string().optional(),
  })
  .passthrough();

const appDefSchema = z
  .object({
    plugs: z.array(z.string()).optional(),
  })
  .passthrough();

const connectionSectionSchema = z.record(z.union([z.null(), connectionDefSchema]));

function extractPermissions(parsed: Record<string, unknown>): string[] {
  const confinement = z.string().safeParse(parsed.confinement);
  if (confinement.success && confinement.data === 'classic') {
    return ['unconfined'];
  }

  const apps = z.record(appDefSchema).safeParse(parsed.apps);
  if (!apps.success) {
    return ['unknown'];
  }

  const plugsSet = new Set<string>();
  for (const app of Object.values(apps.data)) {
    for (const plug of app.plugs ?? []) {
      plugsSet.add(plug);
    }
  }
  return plugsSet.size > 0 ? Array.from(plugsSet).sort() : ['unknown'];
}

function extractConnections(parsed: Record<string, unknown>): SnapConnection[] {
  const connections: SnapConnection[] = [];

  const plugSection = connectionSectionSchema.safeParse(parsed.plugs);
  if (plugSection.success) {
    for (const [plugName, plugDef] of Object.entries(plugSection.data)) {
      const provider = plugDef?.['default-provider'];
      if (provider) {
        connections.push({
          name: plugName,
          interface: plugDef.interface ?? 'unknown',
          type: 'plug',
          snap: provider,
          label: plugDef.label ?? '',
        });
      }
    }
  }

  const slotSection = connectionSectionSchema.safeParse(parsed.slots);
  if (slotSection.success) {
    for (const [slotName, slotDef] of Object.entries(slotSection.data)) {
      connections.push({
        name: slotName,
        interface: slotDef?.interface ?? 'unknown',
        type: 'slot',
        snap: '',
        label: slotDef?.label ?? '',
      });
    }
  }

  return connections;
}

export function parseSnapYaml(snapYaml: string): { permissions: string[]; connections: SnapConnection[] } {
  try {
    const parsed = parseYaml(snapYaml) as Record<string, unknown>;
    return {
      permissions: extractPermissions(parsed),
      connections: extractConnections(parsed),
    };
  } catch {
    return { permissions: ['unknown'], connections: [] };
  }
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export const PREFIX_CHARS = [
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  'g',
  'h',
  'i',
  'j',
  'k',
  'l',
  'm',
  'n',
  'o',
  'p',
  'q',
  'r',
  's',
  't',
  'u',
  'v',
  'w',
  'x',
  'y',
  'z',
];
export const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
export const CONSONANTS = PREFIX_CHARS.filter((c) => !VOWELS.has(c));
const MAX_RESULTS_PER_PAGE = 100;

function secondCharsFor(firstChar: string): string[] {
  return VOWELS.has(firstChar) ? CONSONANTS : Array.from(VOWELS);
}

export async function searchSnaps(prefix: string, fetchFn = fetch, sleepFn = sleep): Promise<string[]> {
  let snaps: string[] = [];
  const url = new URL('https://api.snapcraft.io/v2/snaps/find');
  url.searchParams.set('q', prefix);

  console.log(`Searching for snaps with prefix "${prefix}"...`);
  const response = await fetchFn(url.toString(), {
    headers: {
      'User-Agent': USER_AGENT,
      'Snap-Device-Series': SNAP_DEVICE_SERIES,
    },
  });

  if (!response.ok) {
    if (response.status === 429 || response.status === 503 || response.status === 504) {
      await sleepFn(5000);
      return searchSnaps(prefix, fetchFn, sleepFn);
    }
    if (response.status === 400 || response.status === 404) {
      return snaps;
    }
    throw new Error(`Failed to discover snaps for prefix "${prefix}": ${response.statusText}`);
  }

  const data = (await response.json()) as { results: SnapSearchResult[] };
  const results = data.results;

  snaps = results.map((snap) => snap.name);

  // If we received the maximum results the API returns and we're still on a
  // single-character prefix, expand to two-character prefixes using the
  // complementary character class (vowels after consonants, consonants after vowels).
  if (results.length >= MAX_RESULTS_PER_PAGE && prefix.length === 1) {
    for (const char of secondCharsFor(prefix)) {
      await sleepFn(DELAY_BETWEEN_REQUESTS);
      snaps = snaps.concat(await searchSnaps(prefix + char, fetchFn, sleepFn));
    }
  }

  return snaps;
}

export async function discoverSnaps(fetchFn = fetch, sleepFn = sleep): Promise<string[]> {
  let allSnaps: string[] = [];

  for (const char of PREFIX_CHARS) {
    allSnaps = allSnaps.concat(await searchSnaps(char, fetchFn, sleepFn));
    await sleepFn(DELAY_BETWEEN_REQUESTS);
  }

  return [...new Set(allSnaps)];
}

// eslint-disable-next-line max-len
const SNAP_V2_FIELDS =
  'channel-map,base,categories,confinement,description,download,links,media,revision,snap-yaml,version,created-at,license,name,publisher,snap-id,store-url,summary,title';

export async function fetchSnapDetailsV2(snapName: string, fetchFn = fetch): Promise<SnapV2Response> {
  const response = await fetchFn(`https://api.snapcraft.io/v2/snaps/info/${snapName}?fields=${SNAP_V2_FIELDS}`, {
    headers: {
      'User-Agent': USER_AGENT,
      'Snap-Device-Series': SNAP_DEVICE_SERIES,
    },
  });

  if (!response.ok) {
    if (response.status === 429 || response.status === 503 || response.status === 504) {
      await sleep(5000);
      return await fetchSnapDetailsV2(snapName, fetchFn);
    }
    throw new Error(`Failed to fetch v2 details for ${snapName}: ${response.statusText}`);
  }

  return (await response.json()) as SnapV2Response;
}

export function transformSnapToPackage(v2Data: SnapV2Response): Partial<IPackage> {
  const snapId = `snap.${v2Data.name}`;

  const channelsSet = new Set<SnapChannel>();
  const architecturesSet = new Set<Architecture>();
  const channelArchitecturesSet = new Set<ChannelArchitecture>();
  const deviceCompatibilitiesSet = new Set<string>();

  v2Data['channel-map'].forEach((channelMap) => {
    const snapChannel = SNAP_CHANNEL_MAPPING[channelMap.channel.risk];
    if (snapChannel) {
      channelsSet.add(snapChannel);
    }
    const openStoreArch = ARCH_MAPPING[channelMap.channel.architecture];
    if (openStoreArch) {
      architecturesSet.add(openStoreArch);
      const channelArch = `${Channel.FOCAL}:${openStoreArch}` as ChannelArchitecture;
      channelArchitecturesSet.add(channelArch);
      deviceCompatibilitiesSet.add(`${Channel.FOCAL}:${openStoreArch}:ubuntu-touch-24.04-1.x`);
    }
  });

  const revisions: Partial<IRevision>[] = v2Data['channel-map'].map((channelMap) => {
    const arch = ARCH_MAPPING[channelMap.channel.architecture] || Architecture.AMD64;
    const parsed = channelMap['snap-yaml'] ? parseSnapYaml(channelMap['snap-yaml']) : null;

    return {
      revision: channelMap.revision,
      version: channelMap.version,
      downloads: 0,
      channel: Channel.FOCAL, // Setting as a constant so it'll show for nobel devices
      download_url: null,
      download_sha512: '',
      architecture: arch,
      framework: 'ubuntu-touch-24.04-1.x', // Setting as a constant so it'll show for nobel devices
      filesize: 0, // We don't have the install size, so don't show it in the app
      downloadSize: channelMap.download.size,
      created_date: channelMap['created-at'],
      permissions: parsed?.permissions ?? ['unknown'],
      snap_data: {
        grade: SnapGrade.STABLE,
        risk: channelMap.channel.risk,
        connections: parsed?.connections ?? [],
      },
    };
  });

  const stableRevision = v2Data['channel-map'].find((cm) => cm.channel.risk === 'stable');
  const stableOrFirst = stableRevision || v2Data['channel-map'][0];
  const snapCategory = v2Data.snap.categories?.[0]?.name.toLowerCase() || 'utilities';
  const openStoreCategory = CATEGORY_MAPPING[snapCategory] || 'Utilities';
  const contactUrls = v2Data.snap.links?.contact || [];
  const websiteUrls = v2Data.snap.links?.website || [];
  const supportUrl = contactUrls[0] || '';
  const source = websiteUrls[0] || '';
  const icon = v2Data.snap.media?.find((m) => m.type === 'icon')?.url || '';
  const screenshots = v2Data.snap.media?.filter((m) => m.type === 'screenshot').map((m) => m.url) || [];

  return {
    id: snapId,
    name: v2Data.snap.title || v2Data.name,
    tagline: v2Data.snap.summary,
    description: v2Data.snap.description || v2Data.snap.summary || '',
    changelog: '',
    screenshots,
    category: openStoreCategory,
    keywords: [],
    nsfw: false,
    license: mapLicense(v2Data.snap.license),
    source,
    support_url: supportUrl,
    donate_url: '',
    video_url: '',
    translation_url: '',
    maintainer_name: v2Data.snap.publisher['display-name'],
    author: v2Data.snap.publisher['display-name'],
    types: [AppType.APP],
    languages: [],
    architectures: Array.from(architecturesSet),
    channels: [Channel.FOCAL],
    channel_architectures: Array.from(channelArchitecturesSet),
    device_compatibilities: Array.from(deviceCompatibilitiesSet),
    locked: false,
    published: true,
    published_date: stableOrFirst['created-at'] || new Date().toISOString(),
    updated_date: stableOrFirst.channel['released-at'] || new Date().toISOString(),
    revisions: revisions as unknown as IPackage['revisions'],
    icon,
    package_type: PackageType.SNAP,
    source_store: SourceStore.SNAPCRAFT,
    external_id: v2Data.name,
    snap_data: {
      channels: Array.from(channelsSet),
      confinement: stableOrFirst.confinement as SnapConfinement,
      base: stableOrFirst.base,
    },
  };
}
