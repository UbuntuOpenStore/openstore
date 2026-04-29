import { XMLBuilder } from 'fast-xml-parser';

import type { AppstreamData, AppstreamLocalised } from './schemas';

const descriptionBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '_',
  suppressUnpairedNode: true,
  format: false,
});

export function descriptionToText(raw: Record<string, unknown> | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }

  const text = descriptionBuilder.build({ description: raw }).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text;
}

interface AppstreamExportLocalised {
  text: string;
  lang: string;
}

export interface AppstreamExportData {
  name: AppstreamExportLocalised[];
  summary: AppstreamExportLocalised[];
  description: AppstreamExportLocalised[];
  keywords: AppstreamExportLocalised[];
  urls: Array<{
    type: string;
    url: string;
  }>;
  project_license: string;
  categories: string[];
  screenshots: string[];
  releases: Array<{
    version: string;
    description: string;
  }>;
  content_rating?: {
    type?: string;
    content_attributes?: Array<{
      value: string;
      id: string;
    }>;
  };
  custom?: Array<{
    value: string;
    key: string;
  }>;
}

function transformLocalised(items: AppstreamLocalised): AppstreamExportLocalised[] {
  if (!items) {
    return [];
  }
  return items.map((item) => {
    if (typeof item === 'string') {
      return { text: item, lang: 'en' };
    }
    return { text: item._, lang: item['xml:lang'] ?? 'en' };
  });
}

export function transformAppstreamData(parsed: AppstreamData): AppstreamExportData {
  // TODO if there are multiple components, use the first desktop-application one.
  const { component } = parsed;

  const screenshots: string[] = [];
  for (const screenshot of component.screenshots?.screenshot ?? []) {
    for (const image of screenshot.image ?? []) {
      const url = typeof image === 'string' ? image : (image._ ?? '');
      if (url) {
        screenshots.push(url);
      }
    }
  }

  return {
    name: transformLocalised(component.name),
    summary: transformLocalised(component.summary),
    description: component.description ? [{ text: component.description, lang: 'en' }] : [],
    keywords: transformLocalised(component.keywords?.keyword),
    urls: (component.url ?? []).map((u) => ({ type: u.type ?? '', url: u._ ?? '' })),
    project_license: component.project_license ?? '',
    categories: component.categories?.category ?? [],
    screenshots,
    releases: (component.releases?.release ?? []).map((r) => ({
      version: r.version ?? '',
      description: r.description ?? '',
    })),
    content_rating: component.content_rating
      ? {
        type: component.content_rating.type,
        content_attributes: component.content_rating.content_attribute?.map((ca) => ({
          value: ca._ ?? '',
          id: ca.id ?? '',
        })),
      }
      : undefined,
    custom: component.custom?.value?.map((v) => ({
      value: v._ ?? '',
      key: v.key ?? '',
    })),
  };
}
