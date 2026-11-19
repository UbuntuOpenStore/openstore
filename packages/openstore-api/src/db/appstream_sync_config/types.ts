// SPDX-License-Identifier: AGPL-3.0-or-later
import { type Document, type Model } from 'mongoose';

export type AppstreamSource = {
  url: string;
  icon_url: string;
  architecture: string;
  etag?: string;
  last_modified?: string;
};

export type EditableAppstreamSyncConfig = {
  sources: Array<Pick<AppstreamSource, 'url' | 'icon_url' | 'architecture'>>;
  allowlist: string[];
};

export interface IAppstreamSyncConfig extends Document {
  sources: AppstreamSource[];
  allowlist: string[];
}

export interface AppstreamSyncConfigModel extends Model<IAppstreamSyncConfig> {
  getOrCreate(): Promise<{ config: IAppstreamSyncConfig; created: boolean }>;
  updateEditable(data: EditableAppstreamSyncConfig): Promise<IAppstreamSyncConfig>;
}
