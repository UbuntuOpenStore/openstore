import type { z } from 'zod/v4';
import xml2js from 'xml2js';

interface ArFile {
  name: string;
  fileData: Buffer;
}

export function parseArArchive(buffer: Buffer): ArFile[] {
  const MAGIC = '!<arch>\n';
  if (buffer.slice(0, 8).toString('ascii') !== MAGIC) {
    throw new Error('Not a valid AR archive');
  }

  const files: ArFile[] = [];
  let offset = 8;
  while (offset < buffer.length) {
    if (offset + 60 > buffer.length) {
      break;
    }

    const name = buffer.slice(offset, offset + 16).toString('ascii').trimEnd();
    const size = parseInt(buffer.slice(offset + 48, offset + 58).toString('ascii').trim(), 10);
    offset += 60;

    const fileData = buffer.slice(offset, offset + size);
    offset += size;

    if (size % 2 !== 0) {
      offset += 1; // pad to even byte boundary
    }

    files.push({ name, fileData });
  }

  return files;
}

export function bufferToWebReadableStream(buffer: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(buffer);
      controller.close();
    },
  });
}

export function parseJsonFile(data: Uint8Array | undefined): unknown | undefined {
  if (!data) {
    return undefined;
  }

  const str = Buffer.from(data).toString();
  try {
    return JSON.parse(str);
  }
  catch {
    return undefined;
  }
}

export async function parseXmlFile(data: Uint8Array | undefined): Promise<Record<string, unknown> | undefined> {
  if (!data) {
    return undefined;
  }

  const str = Buffer.from(data).toString();
  try {
    return (await xml2js.parseStringPromise(str, {
      explicitArray: false,
      mergeAttrs: true,
      normalizeTags: true,
      normalize: true,
    })) as Record<string, unknown>;
  }
  catch {
    return undefined;
  }
}

export function parseIniFile(data: Uint8Array | undefined): Record<string, unknown> | undefined {
  if (!data) {
    return undefined;
  }

  const result: Record<string, unknown> = {};
  const other: string[] = [];

  for (const line of Buffer.from(data).toString().split('\n')) {
    const lline = line.toLowerCase().trim();
    if (!(lline[0] === '[' && lline[lline.length - 1] === ']') && lline.length > 0) {
      const pos = lline.indexOf('=');
      if (pos > -1) {
        result[lline.substring(0, pos).trim()] = line.trim().substring(pos + 1).trim();
      }
      else {
        other.push(line);
      }
    }
  }

  if (other.length > 0) {
    result.other = other;
  }

  return result;
}

export function parseJsonAs<T>(data: Uint8Array | undefined, schema: z.ZodType<T>): T | undefined {
  const raw = parseJsonFile(data);
  if (raw === undefined) return undefined;
  const result = schema.safeParse(raw);
  return result.success ? result.data : undefined;
}

export async function parseXmlAs<T>(data: Uint8Array | undefined, schema: z.ZodType<T>): Promise<T | undefined> {
  const raw = await parseXmlFile(data);
  if (raw === undefined) return undefined;
  const result = schema.safeParse(raw);
  return result.success ? result.data : undefined;
}

export function parseIniAs<T>(data: Uint8Array | undefined, schema: z.ZodType<T>): T | undefined {
  const raw = parseIniFile(data);
  if (raw === undefined) return undefined;
  const result = schema.safeParse(raw);
  return result.success ? result.data : undefined;
}
