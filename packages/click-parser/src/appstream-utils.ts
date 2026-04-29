import xml2js from 'xml2js';

const descriptionBuilder = new xml2js.Builder({ headless: true, rootName: 'description', renderOpts: { pretty: false } });

export function descriptionToText(raw: Record<string, unknown> | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }

  const text = descriptionBuilder.buildObject(raw).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text;
}
