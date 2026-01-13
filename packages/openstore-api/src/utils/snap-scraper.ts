import {
  Architecture,
  Channel,
  type ChannelArchitecture,
  PackageType,
  SourceStore,
  type SnapConfinement,
  SnapGrade,
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
  development: 'Developer Tools',
  'devices-and-iot': 'Utilities',
  education: 'Education & Reference',
  entertainment: 'Entertainment',
  finance: 'Business & Finance',
  games: 'Games',
  'health-and-fitness': 'Health & Fitness',
  'music-and-audio': 'Music & Audio',
  'news-and-weather': 'News & Magazines',
  personalisation: 'Personalisation',
  'photo-and-video': 'Media & Video',
  productivity: 'Productivity',
  security: 'Utilities',
  'server-and-cloud': 'Developer Tools',
  social: 'Communication & Social',
  utilities: 'Utilities',
};

export const ARCH_MAPPING: Record<string, Architecture> = {
  amd64: Architecture.AMD64,
  arm64: Architecture.ARM64,
  armhf: Architecture.ARMHF,
  all: Architecture.ALL,
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
  channel: SnapV2Channel;
  'created-at': string;
  download: SnapV2Download;
  revision: number;
  type: string;
  version: string;
}

export interface SnapV2Publisher {
  'display-name': string;
  id: string;
  username: string;
  validation: string;
}

export interface SnapV2Snap {
  license: string;
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

export interface SnapV1Response {
  anon_download_url: string;
  apps: string[];
  architecture: string[];
  base: string;
  binary_filesize: number;
  channel: string;
  'common_ids': string[];
  confinement: string;
  contact: string;
  description: string;
  'developer_id': string;
  'developer_name': string;
  'developer_validation': string;
  'download_sha3_384': string;
  'download_sha512': string;
  'download_url': string;
  'icon_url': string;
  'last_updated': string;
  license: string;
  name: string;
  origin: string;
  'package_name': string;
  publisher: string;
  release: string[];
  revision: number;
  'screenshot_urls': string[];
  snap_id: string;
  summary: string;
  support_url?: string;
  title: string;
  version: string;
  website?: string;
  links?: {
    contact?: string[];
    website?: string[];
  };
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchSnaps(searchQuery = '', limit?: number, fetchFn = fetch): Promise<SnapSearchResult[]> {
  const allSnaps: SnapSearchResult[] = [];
  const seenIds = new Set<string>();

  const url = new URL('https://api.snapcraft.io/v2/snaps/find');
  if (searchQuery) {
    url.searchParams.set('q', searchQuery);
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
      return await fetchSnaps(searchQuery, limit, fetchFn);
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

  const searchTerms = [
    '',
    'app', 'game', 'tool', 'server', 'editor', 'browser',
    'media', 'video', 'audio', 'photo', 'image',
    'development', 'dev', 'code', 'ide', 'terminal',
    'productivity', 'office', 'note', 'calendar',
    'communication', 'chat', 'email', 'social',
    'utility', 'system', 'network', 'security',
    'database', 'cloud', 'docker', 'kubernetes',
  ];

  for (const term of searchTerms) {
    if (limit && allSnaps.length >= limit) {
      break;
    }

    const snaps = await fetchSnaps(term, limit ? limit - allSnaps.length : undefined, fetchFn);
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

export async function fetchSnapDetailsV2(snapName: string, fetchFn = fetch): Promise<SnapV2Response> {
  const response = await fetchFn(`https://api.snapcraft.io/v2/snaps/info/${snapName}`, {
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

export async function fetchSnapDetailsV1(snapName: string, arch = 'amd64', fetchFn = fetch): Promise<SnapV1Response> {
  const response = await fetchFn(`https://api.snapcraft.io/api/v1/snaps/details/${snapName}`, {
    headers: {
      'User-Agent': USER_AGENT,
      'X-Ubuntu-Series': SNAP_DEVICE_SERIES,
      'X-Ubuntu-Architecture': arch,
    },
  });

  if (!response.ok) {
    if (response.status === 429) {
      await sleep(5000);
      return await fetchSnapDetailsV1(snapName, arch, fetchFn);
    }
    throw new Error(`Failed to fetch v1 details for ${snapName}: ${response.statusText}`);
  }

  return (await response.json()) as SnapV1Response;
}

export function transformSnapToPackage(
  v2Data: SnapV2Response,
  v1Data: SnapV1Response | null,
  category: string,
): Partial<IPackage> {
  const snapId = `snap.${v2Data.name}`;

  const channelsSet = new Set<string>();
  const architecturesSet = new Set<Architecture>();
  const channelArchitecturesSet = new Set<ChannelArchitecture>();
  const deviceCompatibilitiesSet = new Set<string>();

  v2Data['channel-map'].forEach((channelMap) => {
    channelsSet.add(channelMap.channel.risk);
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
      filesize: Math.round(channelMap.download.size / 1024),
      downloadSize: channelMap.download.size,
      created_date: channelMap['created-at'],
      permissions: [],
      snap_data: {
        grade: SnapGrade.STABLE,
        risk: channelMap.channel.risk,
      },
    };
  });

  const stableRevision = v2Data['channel-map'].find((cm) => cm.channel.risk === 'stable');
  const openStoreCategory = CATEGORY_MAPPING[category] || 'Utilities';
  const contactUrls = v1Data?.links?.contact || [];
  const websiteUrls = v1Data?.links?.website || [];
  const supportUrl = v1Data?.support_url || contactUrls[0] || '';
  const source = websiteUrls[0] || '';

  return {
    id: snapId,
    name: v2Data.snap.title || v2Data.name,
    tagline: v2Data.snap.summary,
    description: v1Data?.description || v2Data.snap.summary || '',
    changelog: '',
    screenshots: v1Data?.screenshot_urls || [],
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
    published_date: stableRevision?.['created-at'] || v2Data['channel-map'][0]?.['created-at'] || new Date().toISOString(),
    updated_date: stableRevision?.channel['released-at'] || v2Data['channel-map'][0]?.channel['released-at'] || new Date().toISOString(),
    revisions: revisions as unknown as IPackage['revisions'],
    icon: v1Data?.icon_url || '',
    package_type: PackageType.SNAP,
    source_store: SourceStore.SNAPCRAFT,
    external_id: v2Data.name,
    snap_data: {
      channels: Array.from(channelsSet),
      confinement: (v1Data?.confinement as SnapConfinement) || ('strict' as SnapConfinement),
      base: v1Data?.base || '',
    },
  };
}
