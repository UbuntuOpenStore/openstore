import type { AppstreamExportData } from 'click-parser';

type AppstreamLocalized = { text: string; lang: string };

/**
 * Returns the English (default) text from an array of localized AppStream strings.
 * The click-parser defaults lang to 'en' when no xml:lang attribute is present.
 */
export function getAppstreamLocalizedString(items: AppstreamLocalized[] | undefined): string | undefined {
  if (!items || items.length === 0) return undefined;
  const en = items.find((item) => item.lang === 'en' || item.lang === '');
  return (en ?? items[0]).text || undefined;
}

const SPDX_MAP: Record<string, string> = {
  'GPL-3.0': 'GNU GPL v3',
  'GPL-3.0-only': 'GNU GPL v3',
  'GPL-3.0-or-later': 'GNU GPL v3',
  'LGPL-3.0': 'GNU LGPL v3',
  'LGPL-3.0-only': 'GNU LGPL v3',
  'LGPL-3.0-or-later': 'GNU LGPL v3',
  'AGPL-3.0': 'GNU Affero GPL v3',
  'AGPL-3.0-only': 'GNU Affero GPL v3',
  'AGPL-3.0-or-later': 'GNU Affero GPL v3',
  'GPL-2.0': 'GNU GPL v2',
  'GPL-2.0-only': 'GNU GPL v2',
  'GPL-2.0-or-later': 'GNU GPL v2',
  'LGPL-2.0': 'GNU LGPL v2.1',
  'LGPL-2.1': 'GNU LGPL v2.1',
  'LGPL-2.1-only': 'GNU LGPL v2.1',
  'LGPL-2.1-or-later': 'GNU LGPL v2.1',
  'Apache-2.0': 'Apache License',
  MIT: 'MIT/X/Expat License',
  'BSD-2-Clause': 'BSD License (Simplified)',
  'BSD-3-Clause': 'BSD License (Simplified)',
  'MPL-2.0': 'Mozilla Public License',
  'EPL-2.0': 'Eclipse Public License',
  'LicenseRef-proprietary': 'Proprietary',
};

/**
 * Maps an SPDX license expression to an OpenStore license string.
 * Handles compound expressions with AND/OR by returning the first recognized token.
 */
export function mapSpdxLicense(spdx: string): string {
  if (!spdx) return 'Other Open Source';
  const tokens = spdx.split(/ AND | OR /);
  for (const token of tokens) {
    const mapped = SPDX_MAP[token.trim()];
    if (mapped) return mapped;
  }
  return 'Other Open Source';
}

const APPSTREAM_CATEGORY_MAP: Record<string, string> = {
  AudioVideo: 'Music & Audio',
  Audio: 'Music & Audio',
  Video: 'Media & Video',
  Development: 'Developer Tools',
  Education: 'Education & Reference',
  Science: 'Education & Reference',
  Game: 'Games',
  Games: 'Games',
  Graphics: 'Graphics',
  Photography: 'Graphics',
  Network: 'Communication & Social',
  Chat: 'Communication & Social',
  Email: 'Communication & Social',
  InstantMessaging: 'Communication & Social',
  Office: 'Productivity',
  Productivity: 'Productivity',
  Calendar: 'Productivity',
  Finance: 'Productivity',
  Settings: 'Utilities',
  System: 'Utilities',
  Utility: 'Utilities',
  News: 'News & Magazines',
  Maps: 'Travel & Weather',
  Weather: 'Travel & Weather',
  Sports: 'Sports',
  Accessibility: 'Accessibility',
  DesktopSettings: 'Personalisation',
  Health: 'Health & Fitness',
  Medical: 'Health & Fitness',
  BookReader: 'Books & Comics',
  Comics: 'Books & Comics',
};

/**
 * Maps an array of XDG AppStream category names to the first recognized OpenStore category.
 * Returns undefined if none match.
 */
export function mapAppstreamCategory(categories: string[]): string | undefined {
  for (const category of categories) {
    const mapped = APPSTREAM_CATEGORY_MAP[category];
    if (mapped) return mapped;
  }
  return undefined;
}

/**
 * Extracts version changelog entries from AppStream releases.
 */
export function extractAppstreamChangelogs(appstream: AppstreamExportData): Array<{ version: string; changelog: string }> {
  return appstream.releases
    .filter((release) => release.version)
    .map((release) => ({
      version: release.version,
      changelog: getAppstreamLocalizedString(release.description) ?? '',
    }));
}
