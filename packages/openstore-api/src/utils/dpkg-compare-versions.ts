// SPDX-License-Identifier: AGPL-3.0-or-later
import { compareVersions as openstoreCompareVersions, isValidVersion as openstoreIsValidVersion } from 'openstore-dpkg';

/**
 * Compare two debian version strings using `dpkg --compare-versions` c api
 *
 * v1 < v2 : <0
 * v1 = v2 : 0
 * v1 > v2 : >0
 */
export function compareVersions(v1: string, v2: string): number {
  if (v1.trim() === v2.trim()) {
    return 0;
  }

  return openstoreCompareVersions(v1.trim(), v2.trim());
}

export function isValidVersion(version: string): boolean {
  return openstoreIsValidVersion(version.trim());
}
