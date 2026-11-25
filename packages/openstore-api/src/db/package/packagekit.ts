// SPDX-License-Identifier: AGPL-3.0-or-later

import { ChannelArchitecture, type IPackage, PackageType } from './types';

export const PACKAGEKIT_ID_PREFIX = 'packagekit.';

export function packageKitDefaults(): Pick<IPackage, 'package_type' | 'published' | 'channel_architectures'> {
  return {
    package_type: PackageType.PACKAGEKIT,
    published: true,
    channel_architectures: [ChannelArchitecture.FOCAL_ALL],
  };
}

export function packageKitName(id: string): string {
  return id.slice(PACKAGEKIT_ID_PREFIX.length);
}
