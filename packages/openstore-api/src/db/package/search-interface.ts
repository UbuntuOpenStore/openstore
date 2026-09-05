// SPDX-License-Identifier: AGPL-3.0-or-later
import { type HydratedPackage, type PackageRequestFilters } from './types';

// TODO make concrete types
export interface PackageSearchInterface {
  convert: (item: HydratedPackage) => Record<string, any>;
  upsert: (item: HydratedPackage) => Promise<HydratedPackage>;
  remove: (item: HydratedPackage) => Promise<HydratedPackage>;
  bulk: (upserts: HydratedPackage[], removals?: HydratedPackage[]) => Promise<any>;
  search: (filters: PackageRequestFilters, sort?: string, skip?: number, limit?: number) => Promise<{ hits: any[]; count: number }>;
  parseFilters: (filters: PackageRequestFilters) => any;
  removeIndex: () => Promise<any>;
  createIndex: () => Promise<any>;
}
