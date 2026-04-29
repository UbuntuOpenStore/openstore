import xml2js from 'xml2js';

import type { AppstreamData, AppstreamLocalised } from './schemas';

const descriptionBuilder = new xml2js.Builder({ headless: true, rootName: 'description', renderOpts: { pretty: false } });

function normalizeToArray(val: unknown): unknown[] {
  if (val === null || val === undefined) return [];
  return Array.isArray(val) ? val : [val];
}

export function descriptionToText(raw: Record<string, unknown> | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }

  const text = descriptionBuilder.buildObject(raw).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text;
}

function descriptionToLocalisedText(raw: Record<string, unknown> | undefined): AppstreamExportLocalised[] {
  if (!raw) {
    return [];
  }

  const langMap = new Map<string, string[]>();

  function addText(lang: string, text: string) {
    if (text) {
      if (!langMap.has(lang)) langMap.set(lang, []);
      langMap.get(lang)!.push(text);
    }
  }

  for (const p of normalizeToArray(raw.p)) {
    if (typeof p === 'string') {
      addText('en', p);
    }
    else if (p && typeof p === 'object') {
      const obj = p as Record<string, unknown>;
      addText((obj['xml:lang'] as string) ?? 'en', String(obj._ ?? ''));
    }
  }

  for (const listKey of ['ul', 'ol']) {
    for (const list of normalizeToArray(raw[listKey])) {
      if (list && typeof list === 'object') {
        const listObj = list as Record<string, unknown>;
        const lang = (listObj['xml:lang'] as string) ?? 'en';
        for (const li of normalizeToArray(listObj.li)) {
          addText(lang, typeof li === 'string' ? li : String((li as Record<string, unknown>)._ ?? ''));
        }
      }
    }
  }

  return Array.from(langMap.entries(), ([lang, texts]) => ({ lang, text: texts.join(' ') }));
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
    description: descriptionToLocalisedText(component.description),
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
