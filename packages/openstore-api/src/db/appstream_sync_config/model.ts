// SPDX-License-Identifier: AGPL-3.0-or-later
import { Schema, model } from 'mongoose';

import { type AppstreamSource, type AppstreamSyncConfigModel, type EditableAppstreamSyncConfig, type IAppstreamSyncConfig } from './types';

export const DEFAULT_APPSTREAM_SOURCES: AppstreamSource[] = [
  {
    url: 'https://archive.ubuntu.com/ubuntu/dists/noble/main/dep11/Components-amd64.yml.gz',
    icon_url: 'https://archive.ubuntu.com/ubuntu/dists/noble/main/dep11/icons-128x128.tar.gz',
    architecture: 'amd64',
  },
  {
    url: 'https://ports.ubuntu.com/ubuntu-ports/dists/noble/main/dep11/Components-arm64.yml.gz',
    icon_url: 'https://ports.ubuntu.com/ubuntu-ports/dists/noble/main/dep11/icons-128x128.tar.gz',
    architecture: 'arm64',
  },
  {
    url: 'https://ports.ubuntu.com/ubuntu-ports/dists/noble/main/dep11/Components-armhf.yml.gz',
    icon_url: 'https://ports.ubuntu.com/ubuntu-ports/dists/noble/main/dep11/icons-128x128.tar.gz',
    architecture: 'armhf',
  },
];

const sourceSchema = new Schema<AppstreamSource>(
  {
    url: String,
    icon_url: String,
    architecture: String,
    etag: String,
    last_modified: String,
  },
  { _id: false },
);

const appstreamSyncConfigSchema = new Schema<IAppstreamSyncConfig, AppstreamSyncConfigModel>({
  sources: [sourceSchema],
  allowlist: [String],
});

appstreamSyncConfigSchema.statics.getOrCreate = async function () {
  const config = await this.findOne();
  if (config) {
    return { config, created: false };
  }

  const created = await this.create({
    sources: DEFAULT_APPSTREAM_SOURCES.map((source) => ({ ...source })),
    allowlist: [],
  });
  return { config: created, created: true };
};

appstreamSyncConfigSchema.statics.updateEditable = async function (data: EditableAppstreamSyncConfig) {
  const { config } = await this.getOrCreate();
  const previous = new Map(config.sources.map((source) => [source.url, source]));

  config.sources = data.sources.map((source) => {
    const stored = previous.get(source.url);
    // Validators belong to the metadata URL, but a new icon tarball requires a full run.
    const keepValidators = stored && stored.icon_url === source.icon_url;
    return {
      url: source.url,
      icon_url: source.icon_url,
      architecture: source.architecture,
      ...(keepValidators ? { etag: stored.etag, last_modified: stored.last_modified } : {}),
    };
  });
  config.allowlist = data.allowlist;
  await config.save();

  return config;
};

export const AppstreamSyncConfig = model<IAppstreamSyncConfig, AppstreamSyncConfigModel>('AppstreamSyncConfig', appstreamSyncConfigSchema);
