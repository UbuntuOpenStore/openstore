// @ts-ignore
import dpkgCompareVersions from 'dpkg-compare-versions';
import { execSync } from 'child_process';

/**
 * @deprecated Use compareVersions instead
 */
export function compareVersionsOld(v1: string, v2: string): number {
  /*
    When comparing versions like 1.0.0-20.04 and 1.0.0-24.04-1.x, dpkg-compare-versions
    doesn't handle it like `dpkg --compare-versions` does. So we add a patch version to the 20.04 version to make it comparable.
  */

  if (v1.endsWith('-20.04') && v2.includes('-24.04')) {
    v1 = v1.replace('-20.04', '-20.04-0');
  }

  if (v2.endsWith('-20.04') && v1.includes('-24.04')) {
    v2 = v2.replace('-20.04', '-20.04-0');
  }

  return dpkgCompareVersions(v1, v2);
}

/**
 * Compare two debian version strings using `dpkg --compare-versions`
 *
 * v1 < v2 : <0
 * v1 = v2 : 0
 * v1 > v2 : >0
 */
export function compareVersions(v1: string, v2: string): number {
  if (v1.trim() === v2.trim()) {
    return 0;
  }

  const res = execSync(`dpkg --compare-versions '${v1.trim()}' 'gt' '${v2.trim()}'; echo $?`).toString().trim();

  if (res === '0') {
    return 1;
  }
  else {
    return -1;
  }
};

// Check if a version string is a valid debian version number
export function isValidVersion(version: string): boolean {
  try {
    dpkgCompareVersions(version, version);
    return true;
  }
  catch {
    return false;
  }
};
