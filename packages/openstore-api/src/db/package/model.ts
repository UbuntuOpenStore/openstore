// SPDX-License-Identifier: GPL-3.0-or-later OR AGPL-3.0-or-later
import { Schema, model } from 'mongoose';

import { UserError } from '../../exceptions';
import { NO_REVISIONS } from '../../utils/error-messages';
import { setupMethods } from './methods';
import { setupStatics } from './statics';
import { type SnapConnection } from './types';
import {
  type RevisionModel,
  type PackageModel,
  type IRevision,
  type IPackageMethods,
  type IPackage,
  PackageType,
  SourceStore,
} from './types';
import { setupVirtuals } from './virtuals';

const snapConnectionSchema = new Schema<SnapConnection>(
  {
    name: String,
    interface: String,
    type: String,
    snap: String,
    label: String,
  },
  { _id: false },
);

const revisionSchema = new Schema<IRevision, RevisionModel>({
  revision: Number,
  version: String, // Unique among revisions with this arch
  downloads: Number,
  channel: String,
  download_url: String, // The path to the local click file
  download_sha512: String,
  architecture: String,
  framework: String,
  // Size in kB (TODO migrate this to bytes)
  filesize: Number, // TODO rename to installedSize
  // Size in bytes
  downloadSize: Number,
  created_date: String,
  permissions: [String],
  read_paths: [String],
  write_paths: [String],
  desktop_names: [String],
  snap_data: {
    type: {
      grade: String,
      risk: String,
      connections: [snapConnectionSchema],
    },
    default: undefined,
    _id: false,
  },
  content_rating: {
    type: { type: String },
    content_attributes: [{ value: String, id: String }],
  },
});

const packageSchema = new Schema<IPackage, PackageModel, IPackageMethods>({
  id: { type: String, index: true, unique: true },

  // Presentation
  name: String,
  tagline: String,
  description: String,
  changelog: String,
  version_changelogs: [{ version: String, changelog: String }],
  screenshots: [String],

  // Discovery
  category: String,
  keywords: [String],
  nsfw: Boolean,

  // Info
  license: String,
  source: String,
  support_url: String,
  donate_url: String,
  video_url: String,
  translation_url: String,
  maintainer: String,
  maintainer_name: String, // TODO deprecate

  // Metadata
  author: String, // TODO rename to publisher
  manifest: {}, // TODO deprecate, put what is needed from the manifest into the revision data
  types: [String],
  type_override: String,
  desktop_names_override: [String],
  languages: [String],
  architectures: [String], // TODO deprecate, get from the revisions where appropriate
  channel_architectures: [String], // A list of channel:architecture that the app supports
  device_compatibilities: [String], // A list of channel:arch:framework that the app supports
  locked: Boolean,
  qml_imports: [],
  review_exceptions: [String],
  skip_review: Boolean,

  // Package source and type
  package_type: { type: String, default: PackageType.CLICK },
  source_store: { type: String, default: SourceStore.OPENSTORE },
  external_id: String,
  snap_data: {
    channels: [String],
    confinement: String,
    base: String,
  },

  // Publication metadata
  published: Boolean,
  published_date: String,
  updated_date: String,

  // Revisions
  revisions: [revisionSchema],
  channels: [String],

  icon: String, // Path to a local icon file
  banner: String, // Path to a local SVG banner file

  // Number of ratings in each category
  rating_counts: [{ type: Schema.Types.ObjectId, ref: 'RatingCount' }],
  calculated_rating: Number,
  lomiri_compatible: Boolean,
});

packageSchema.pre('save', function (next) {
  if (this.published && this.revisions.length === 0 && this.package_type !== PackageType.PACKAGEKIT) {
    return next(new UserError(NO_REVISIONS));
  }
  next();
});

packageSchema.index(
  {
    name: 'text',
    description: 'text',
    keywords: 'text',
    author: 'text',
  },
  {
    weights: {
      name: 10,
      description: 5,
      keywords: 3,
      author: 1,
    },
    name: 'searchIndex',
  },
);

// Compound index for ID-based lookups (highlights, category apps)
packageSchema.index({ id: 1, published: 1, package_type: 1 });

// Compound index for list queries (new/updated, popular)
packageSchema.index({ published: 1, package_type: 1, nsfw: 1 });

packageSchema.index({ package_type: 1 });

// Index for maintainer-based queries (user package management)
packageSchema.index({ maintainer: 1, published: 1 });

// Indexes for sorted discover queries (new, updated, popular)
packageSchema.index({ published: 1, package_type: 1, published_date: -1 });
packageSchema.index({ published: 1, package_type: 1, updated_date: -1 });
packageSchema.index({ published: 1, package_type: 1, calculated_rating: -1 });

// Index for author/publisher filtering
packageSchema.index({ author: 1 });

// Index for category filtering
packageSchema.index({ category: 1, published: 1 });

// Index for category stats aggregation (categories API)
packageSchema.index({ package_type: 1, published: 1, category: 1, channels: 1, lomiri_compatible: 1 });

setupMethods(packageSchema);
setupVirtuals(packageSchema);
setupStatics(packageSchema);

export const Package = model<IPackage, PackageModel>('Package', packageSchema);
