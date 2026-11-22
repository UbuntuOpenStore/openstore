// SPDX-License-Identifier: AGPL-3.0-or-later
import { XMLParser } from 'fast-xml-parser';

// Single parser instance used for all appstream XML processing
const appstreamParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  preserveOrder: true,
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
});

type XmlNode = {
  '#text'?: string;
  ':@'?: Record<string, string>;
  [tag: string]: unknown;
};

function getNodeText(children: XmlNode[]): string {
  return children
    .map((n) => {
      if (n['#text'] !== undefined) {
        return String(n['#text']);
      }
      const tag = Object.keys(n).find((k) => k !== ':@' && k !== '#text');
      if (!tag) {
        return '';
      }
      const inner = getNodeText(n[tag] as XmlNode[]);
      if (tag === 'em') {
        return `*${inner}*`;
      }
      if (tag === 'code') {
        return `\`${inner}\``;
      }
      return inner;
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getNodeLang(node: XmlNode): string {
  return node[':@']?.['@_xml:lang'] ?? 'en';
}

function findChild(nodes: XmlNode[], tagName: string): { attrs: Record<string, string>; children: XmlNode[] } | undefined {
  for (const node of nodes) {
    if (node[tagName] !== undefined) {
      return {
        attrs: node[':@'] ?? {},
        children: node[tagName] as XmlNode[],
      };
    }
  }
  return undefined;
}

function findChildren(nodes: XmlNode[], tagName: string): Array<{ attrs: Record<string, string>; children: XmlNode[] }> {
  return nodes
    .filter((node) => node[tagName] !== undefined)
    .map((node) => ({
      attrs: node[':@'] ?? {},
      children: node[tagName] as XmlNode[],
    }));
}

// For localized repeated elements (e.g. <name>, <summary>, <keyword>) —
// multiple elements with the same tag name differentiated by xml:lang.
function getlocalizedItems(children: XmlNode[], tagName: string): AppstreamExportlocalized[] {
  return children
    .filter((n) => n[tagName] !== undefined)
    .map((n) => ({
      text: getNodeText(n[tagName] as XmlNode[]),
      lang: getNodeLang(n),
    }))
    .filter((item) => item.text);
}

function processDescriptionChildren(descChildren: XmlNode[]): AppstreamExportlocalized[] {
  const byLang = new Map<string, string[]>();

  function addChunk(lang: string, chunk: string) {
    if (!byLang.has(lang)) {
      byLang.set(lang, []);
    }
    byLang.get(lang)!.push(chunk);
  }

  for (const child of descChildren) {
    if (child['#text'] !== undefined) {
      continue;
    } // skip whitespace text nodes
    const lang = getNodeLang(child);
    const tag = Object.keys(child).find((k) => k !== ':@' && k !== '#text');
    if (!tag) {
      continue;
    }

    const children = child[tag] as XmlNode[];
    if (tag === 'p') {
      const text = getNodeText(children);
      if (text) {
        addChunk(lang, text);
      }
    } else if (tag === 'ul' || tag === 'ol') {
      const items: string[] = [];
      for (const liNode of children) {
        if (liNode['#text'] !== undefined) {
          continue;
        }
        const liTag = Object.keys(liNode).find((k) => k !== ':@' && k !== '#text');
        if (liTag === 'li') {
          const liText = getNodeText(liNode[liTag] as XmlNode[]);
          if (liText) {
            items.push(liText);
          }
        }
      }
      if (items.length > 0) {
        const listMd = items.map((item, i) => (tag === 'ol' ? `${i + 1}. ${item}` : `- ${item}`)).join('\n');
        addChunk(lang, listMd);
      }
    }
  }

  return Array.from(byLang.entries(), ([lang, chunks]) => ({ text: chunks.join('\n\n'), lang })).filter((item) => item.text);
}

interface AppstreamExportlocalized {
  text: string;
  lang: string;
}

export interface AppstreamExportData {
  name: AppstreamExportlocalized[];
  summary: AppstreamExportlocalized[];
  description: AppstreamExportlocalized[];
  keywords: AppstreamExportlocalized[];
  urls: Array<{
    type: string;
    url: string;
  }>;
  project_license: string;
  categories: string[];
  screenshots: string[];
  releases: Array<{
    version: string;
    description: AppstreamExportlocalized[];
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

export function parseAppstream(rawData: Uint8Array | undefined): AppstreamExportData | undefined {
  if (!rawData) {
    return undefined;
  }

  let nodes: XmlNode[];
  try {
    nodes = appstreamParser.parse(Buffer.from(rawData).toString()) as XmlNode[];
  } catch {
    return undefined;
  }

  // Prefer type="desktop-application" if multiple components exist
  const componentNodes = findChildren(nodes, 'component');
  if (componentNodes.length === 0) {
    return undefined;
  }
  const componentNode = componentNodes.find((c) => c.attrs['@_type'] === 'desktop-application') ?? componentNodes[0];
  const cc = componentNode.children;

  const componentDescNode = findChild(cc, 'description');
  const description = componentDescNode ? processDescriptionChildren(componentDescNode.children) : [];

  const keywordsNode = findChild(cc, 'keywords');
  const keywords = keywordsNode ? getlocalizedItems(keywordsNode.children, 'keyword') : [];

  const screenshots: string[] = [];
  const screenshotsNode = findChild(cc, 'screenshots');
  if (screenshotsNode) {
    for (const ssNode of findChildren(screenshotsNode.children, 'screenshot')) {
      const env = ssNode.attrs['@_environment'];
      // Include screenshots with no environment (universal) or lomiri/lomiri:dark/lomiri:light
      if (!env || env === 'lomiri' || env.startsWith('lomiri:')) {
        for (const imgNode of findChildren(ssNode.children, 'image')) {
          const url = getNodeText(imgNode.children);
          if (url) {
            screenshots.push(url);
          }
        }
      }
    }
  }

  const releases: Array<{ version: string; description: AppstreamExportlocalized[] }> = [];
  const releasesNode = findChild(cc, 'releases');
  if (releasesNode) {
    for (const releaseNode of findChildren(releasesNode.children, 'release')) {
      const version = releaseNode.attrs['@_version'] ?? '';
      const descNode = findChild(releaseNode.children, 'description');
      releases.push({
        version,
        description: descNode ? processDescriptionChildren(descNode.children) : [],
      });
    }
  }

  const crNode = findChild(cc, 'content_rating');
  const contentRating = crNode
    ? {
        type: crNode.attrs['@_type'],
        content_attributes: findChildren(crNode.children, 'content_attribute').map((ca) => ({
          value: getNodeText(ca.children),
          id: ca.attrs['@_id'] ?? '',
        })),
      }
    : undefined;

  const customNode = findChild(cc, 'custom');
  const custom = customNode
    ? findChildren(customNode.children, 'value').map((v) => ({
        value: getNodeText(v.children),
        key: v.attrs['@_key'] ?? '',
      }))
    : undefined;

  const licenseNode = findChild(cc, 'project_license');
  const categoriesNode = findChild(cc, 'categories');

  return {
    name: getlocalizedItems(cc, 'name'),
    summary: getlocalizedItems(cc, 'summary'),
    description,
    keywords,
    urls: findChildren(cc, 'url').map((u) => ({
      type: u.attrs['@_type'] ?? '',
      url: getNodeText(u.children),
    })),
    project_license: licenseNode ? getNodeText(licenseNode.children) : '',
    categories: categoriesNode
      ? findChildren(categoriesNode.children, 'category')
          .map((c) => getNodeText(c.children))
          .filter(Boolean)
      : [],
    screenshots,
    releases,
    content_rating: contentRating,
    custom,
  };
}
