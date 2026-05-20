import { parse as parseYaml } from 'yaml';

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

export const ARCH_MAPPING: Record<string, Architecture> = {
  amd64: Architecture.AMD64,
  arm64: Architecture.ARM64,
  armhf: Architecture.ARMHF,
  all: Architecture.ALL,
};

export const SNAP_CHANNEL_MAPPING: Record<string, SnapChannel> = {
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

export function parseSnapYamlPlugs(snapYaml: string): string[] {
  try {
    const parsed = parseYaml(snapYaml) as {
      confinement?: string;
      apps?: Record<string, { plugs?: string[] }>;
    };

    if (parsed.confinement === 'classic') {
      return ['unconfined'];
    }

    const plugsSet = new Set<string>();
    for (const app of Object.values(parsed.apps || {})) {
      for (const plug of app.plugs || []) {
        plugsSet.add(plug);
      }
    }
    return plugsSet.size > 0 ? Array.from(plugsSet).sort() : ['unknown'];
  } catch {
    return ['unknown'];
  }
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchSnaps(category = '', limit?: number, fetchFn = fetch): Promise<SnapSearchResult[]> {
  const allSnaps: SnapSearchResult[] = [];
  const seenIds = new Set<string>();

  const url = new URL('https://api.snapcraft.io/v2/snaps/find');
  if (category) {
    url.searchParams.set('category', category);
  }

  const response = await fetchFn(url.toString(), {
    headers: {
      'User-Agent': USER_AGENT,
      'Snap-Device-Series': SNAP_DEVICE_SERIES,
    },
  });

  if (!response.ok) {
    if (response.status === 429) {
      await sleep(5000);
      return await fetchSnaps(category, limit, fetchFn);
    }
    if (response.status === 400 || response.status === 404) {
      return [];
    }
    throw new Error(`Failed to fetch snaps: ${response.statusText}`);
  }

  const data = (await response.json()) as { results: SnapSearchResult[] };

  if (!data.results || data.results.length === 0) {
    return [];
  }

  for (const snap of data.results) {
    if (!seenIds.has(snap['snap-id'])) {
      seenIds.add(snap['snap-id']);
      allSnaps.push(snap);

      if (limit && allSnaps.length >= limit) {
        break;
      }
    }
  }

  return allSnaps;
}

export async function discoverSnaps(limit?: number, fetchFn = fetch): Promise<SnapSearchResult[]> {
  const allSnaps: SnapSearchResult[] = [];
  const seenIds = new Set<string>();

  const categories = Object.keys(CATEGORY_MAPPING);

  for (const category of categories) {
    if (limit && allSnaps.length >= limit) {
      break;
    }

    const snaps = await fetchSnaps(category, limit ? limit - allSnaps.length : undefined, fetchFn);
    await sleep(DELAY_BETWEEN_REQUESTS);

    for (const snap of snaps) {
      if (!seenIds.has(snap['snap-id'])) {
        seenIds.add(snap['snap-id']);
        allSnaps.push(snap);
      }
    }
  }

  return allSnaps;
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
    if (response.status === 429) {
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
      permissions: channelMap['snap-yaml'] ? parseSnapYamlPlugs(channelMap['snap-yaml']) : ['unknown'],
      snap_data: {
        grade: SnapGrade.STABLE,
        risk: channelMap.channel.risk,
      },
    };
  });

  const stableRevision = v2Data['channel-map'].find((cm) => cm.channel.risk === 'stable');
  const stableOrFirst = stableRevision || v2Data['channel-map'][0];
  const snapCategory = v2Data.snap.categories?.[0]?.name?.toLowerCase() || 'utilities';
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
    published_date: stableOrFirst?.['created-at'] || new Date().toISOString(),
    updated_date: stableOrFirst?.channel['released-at'] || new Date().toISOString(),
    revisions: revisions as unknown as IPackage['revisions'],
    icon,
    package_type: PackageType.SNAP,
    source_store: SourceStore.SNAPCRAFT,
    external_id: v2Data.name,
    snap_data: {
      channels: Array.from(channelsSet),
      confinement: (stableOrFirst?.confinement as SnapConfinement) || ('strict' as SnapConfinement),
      base: stableOrFirst?.base || '',
    },
  };
}
