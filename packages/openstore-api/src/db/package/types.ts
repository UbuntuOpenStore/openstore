import { type Request } from 'express';
import { type FilterQuery, type HydratedDocument, type Model, type Types } from 'mongoose';

import { type ClickParserData } from '../../utils';
import { type HydratedRatingCount } from '../rating_count/types';

export type SearchProvider = 'elasticsearch' | 'meilisearch';

export enum AppType {
  APP = 'app',
  WEBAPP = 'webapp',
  WEBAPP_PLUS = 'webapp+',
}

export enum PackageType {
  CLICK = 'click',
  SNAP = 'snap',
}

export enum SourceStore {
  OPENSTORE = 'openstore',
  SNAPCRAFT = 'snapcraft',
}

export enum Channel {
  XENIAL = 'xenial',
  FOCAL = 'focal',
}

export const DEPRECATED_CHANNELS: Channel[] = [Channel.XENIAL];

export const DEFAULT_CHANNEL = Channel.FOCAL;

export enum Architecture {
  ALL = 'all',
  ARMHF = 'armhf',
  AMD64 = 'amd64',
  ARM64 = 'arm64',
}

export enum ChannelArchitecture {
  FOCAL_ALL = 'focal:all',
  FOCAL_ARMHF = 'focal:armhf',
  FOCAL_AMD64 = 'focal:amd64',
  FOCAL_ARM64 = 'focal:arm64',
  XENIAL_ALL = 'xenial:all',
  XENIAL_ARMHF = 'xenial:armhf',
  XENIAL_AMD64 = 'xenial:amd64',
  XENIAL_ARM64 = 'xenial:arm64',
}

export type File = {
  originalname: string;
  path: string;
  size: number;
};

export enum SnapConfinement {
  STRICT = 'strict',
  CLASSIC = 'classic',
  DEVMODE = 'devmode',
}

export enum SnapChannel {
  STABLE = 'stable',
  CANDIDATE = 'candidate',
  BETA = 'beta',
  EDGE = 'edge',
}

export enum SnapGrade {
  STABLE = 'stable',
  DEVEL = 'devel',
}

export type SnapConnection = {
  name: string;
  interface: string;
  type: 'plug' | 'slot';
  snap: string;
  label: string;
};

export type RevisionSnapData = {
  grade: SnapGrade;
  risk: string;
  connections?: SnapConnection[];
};

export type ContentRating = {
  type: 'oars-1.0' | 'oars-1.1';
  content_attributes: Array<{
    value: string;
    id: string;
  }>;
};

export type SnapData = {
  channels: SnapChannel[];
  confinement: SnapConfinement;
  base: string; // e.g., core22
};

export interface IRevision {
  revision: number;
  version: string;
  downloads: number;
  channel: Channel;
  download_url: string | null;
  download_sha512: string;
  architecture: Architecture;
  framework: string;
  filesize: number;
  downloadSize: number;
  created_date: string;
  permissions: string[];
  read_paths?: string[];
  write_paths?: string[];
  desktop_names?: string[];
  snap_data?: RevisionSnapData;
  content_rating?: ContentRating;
}

export type HydratedRevision = HydratedDocument<IRevision>;

export interface RevisionModel extends Model<IRevision> {}

export interface SerializedDownload extends IRevision {}

export type SerializedRatings = {
  THUMBS_UP: number;
  THUMBS_DOWN: number;
  HAPPY: number;
  NEUTRAL: number;
  BUGGY: number;
};

export type SerializedSnapData = {
  grade?: SnapGrade;
  risk?: string;
  connections?: SnapConnection[];
};

export type SerializedPackageSnapData = {
  channels?: SnapChannel[];
  confinement?: SnapConfinement;
  base?: string;
};

export type SerializedPackage = {
  architecture: string;
  architectures: Architecture[];
  author: string;
  publisher: string;
  publisher_id: string;
  category: string;
  changelog: string;
  version_changelogs: Array<{ version: string; changelog: string }>;
  channels: Channel[];
  channel_architectures: ChannelArchitecture[];
  device_compatibilities: string[];
  description: string;
  downloads: SerializedDownload[];
  framework: string;
  icon: string;
  banner: string | null;
  id: string;
  keywords: string[];
  license: string;
  maintainer_name: string | null;
  maintainer: string | null;
  manifest: {
    [key: string]: any;
  };
  name: string;
  nsfw: boolean;
  published_date: string;
  published: boolean;
  locked: boolean;
  screenshots: string[];
  source: string;
  support_url: string;
  donate_url: string;
  video_url: string;
  translation_url: string;
  tagline: string;
  types: AppType[];
  updated_date: string;
  package_type: PackageType;
  source_store: SourceStore;
  languages: string[];
  revisions: IRevision[];
  totalDownloads: number;
  latestDownloads: number;
  version: string;
  ratings: SerializedRatings;
  type_override: string;
  calculated_rating: number;
  revision: number;
  download: null;
  download_sha512: string;
  filesize: number;
  permissions: string[];
  review_exceptions: string[];
  read_paths?: string[];
  write_paths?: string[];
  desktop_names?: string[];
  snap_data?: SerializedPackageSnapData;
  content_rating?: ContentRating;
};

export type SerializedPackageSlim = {
  architectures?: Architecture[];
  author?: string;
  publisher?: string;
  publisher_id?: string;
  name?: string;
  id?: string;
  category?: string;
  channels?: Channel[];
  description?: string;
  framework?: string;
  icon?: string;
  keywords?: string[];
  license?: string;
  nsfw?: boolean;
  published_date?: string;
  tagline?: string;
  types?: AppType[];
  updated_date?: string;
  package_type?: PackageType;
  source_store?: SourceStore;
  ratings?: SerializedRatings;
};

export type PackageStats = {
  categories: { [key: string]: number };
  types: { [key: string]: number };
  frameworks: { [key: string]: number };
  architectures: { [key: string]: number };
};

export type CategoryStat = {
  _id: string;
  count: number;
};

export type PackageRequestFilters = {
  limit?: number;
  skip?: number;
  sort?: string;
  types?: AppType[];
  ids?: string[];
  packageTypes?: PackageType[];
  frameworks?: string[] | string;
  architecture?: Architecture;
  architectures?: Architecture[];
  category?: string;
  author?: string;
  search?: string;
  channel?: Channel;
  nsfw?: (boolean | null)[];
  publisherId?: string;
  published?: boolean;
  lomiri_compatible?: boolean;
};

export interface IPackage {
  id: string;
  name: string;
  tagline?: string;
  description?: string;
  changelog?: string;
  version_changelogs?: Array<{ version: string; changelog: string }>;
  screenshots: string[];
  category?: string;
  keywords: string[];
  nsfw?: boolean | null;
  license?: string;
  source?: string;
  support_url?: string;
  donate_url?: string;
  video_url?: string;
  translation_url?: string;
  maintainer?: string;
  maintainer_name?: string;
  author?: string;
  manifest?: { [key: string]: any };
  types: AppType[];
  type_override?: AppType;
  desktop_names_override?: string[];
  package_type: PackageType;
  source_store: SourceStore;
  external_id?: string;
  snap_data?: SnapData;
  languages: string[];
  architectures: Architecture[];
  channel_architectures: ChannelArchitecture[];
  device_compatibilities: string[];
  locked?: boolean;
  qml_imports: {
    module: string;
    version: string;
  }[];
  review_exceptions?: string[];
  skip_review?: boolean;
  published?: boolean;
  published_date?: string;
  updated_date?: string;
  revisions: Types.DocumentArray<HydratedRevision>;
  channels: Channel[];
  icon?: string;
  banner?: string;
  rating_counts: Types.DocumentArray<HydratedRatingCount>;
  calculated_rating?: number;
  lomiri_compatible: boolean;
}

export interface BodyUpdate {
  name?: string;
  published?: string | boolean;
  locked?: string | boolean;
  category?: string;
  changelog?: string;
  version_changelogs?: Array<{ version: string; changelog: string }> | string;
  description?: string;
  license?: string;
  source?: string;
  support_url?: string;
  donate_url?: string;
  video_url?: string;
  translation_url?: string;
  tagline?: string;
  screenshots?: string[] | string;
  keywords?: string[] | string;
  nsfw?: boolean | string;
  type_override?: AppType;
  desktop_names_override?: string[] | string;
  maintainer?: string;
}

export interface IPackageMethods {
  getLatestRevision: (
    channel: Channel,
    arch?: Architecture,
    detectAll?: boolean,
    frameworks?: string[],
    version?: string,
  ) => { revisionData?: HydratedRevision | null; revisionIndex: number };
  updateFromClick: (data: ClickParserData) => Promise<void>;
  updateFromBody: (body: BodyUpdate) => Promise<void>;
  updateVideoUrl: (videoUrl: string) => void;
  createNextRevision: (
    version: string,
    channel: Channel,
    architecture: Architecture,
    framework: string,
    url: string,
    downloadSha512: string,
    installedSize: number,
    downloadSize: number,
    permissions?: string[],
    readPaths?: string[],
    writePaths?: string[],
    desktopNames?: string[],
    contentRating?: ContentRating,
  ) => void;
  updateRevision: (
    revisionNumber: number,
    framework: string,
    url: string,
    downloadSha512: string,
    installedSize: number,
    downloadSize: number,
    permissions?: string[],
    readPaths?: string[],
    writePaths?: string[],
    desktopNames?: string[],
  ) => void;
  getClickFilePath: (channel: Channel, arch: Architecture, version: string) => string;
  getIconFilePath: (ext: string) => string;
  getDownloadUrl: (channel: Channel, arch: Architecture, version?: string) => string;
  serializeRatings: () => SerializedRatings;
  serializeSlim: () => SerializedPackageSlim;
  serialize: (
    architecture?: Architecture,
    channel?: Channel,
    frameworks?: string[],
    apiVersion?: number,
    fullChangelog?: boolean,
  ) => SerializedPackage;
  updateScreenshotFiles: (screenshotFiles: File[]) => Promise<void>;
  updateBannerFile: (bannerFile: File) => Promise<boolean>;
  createRevisionFromClick: (filePath: string, channel: Channel, changelog?: string) => Promise<void>;
  updateCalculatedProperties: () => void;

  // Virtuals
  architecture: string;
  next_revision: number;
  icon_url: string;
  banner_url: string | null;
}

export type HydratedPackage = HydratedDocument<IPackage, IPackageMethods>;

export interface PackageModel extends Model<IPackage, unknown, IPackageMethods> {
  incrementDownload: (id: Types.ObjectId, revisionIndex: number) => Promise<void>;
  stats: () => Promise<PackageStats>;
  categoryStats: (channels: Channel[], packageTypes?: PackageType[], lomiriCompatible?: boolean) => Promise<CategoryStat[]>;
  parseRequestFilters: (req: Request) => PackageRequestFilters;
  parseFilters: (filters: PackageRequestFilters, textSearch?: boolean) => FilterQuery<IPackage>;
  countByFilters: (filters: PackageRequestFilters, textSearch?: boolean) => Promise<number>;
  findByFilters: (
    filters: PackageRequestFilters,
    sort?: string,
    limit?: number,
    skip?: number,
    textSearch?: boolean,
  ) => Promise<HydratedPackage[]>;
  findOneByFilters: (id: string, filters?: PackageRequestFilters) => Promise<HydratedPackage | null>;
  searchByFilters: (filters: PackageRequestFilters, full: boolean) => Promise<{ pkgs: HydratedPackage[]; count: number }>;
  checkId: (id: string) => Promise<void>;
  checkRestrictedId: (id: string) => void;
}
