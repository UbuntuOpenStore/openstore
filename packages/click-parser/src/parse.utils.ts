// SPDX-License-Identifier: AGPL-3.0-or-later
import { XMLParser } from 'fast-xml-parser';
import type { z } from 'zod/v4';

import { QmlImport } from './app';

export function parseJsonFile(data: Uint8Array | undefined): unknown {
  if (!data) {
    return undefined;
  }

  const str = Buffer.from(data).toString();
  try {
    return JSON.parse(str);
  } catch {
    return undefined;
  }
}

export function parseXmlFile(data: Uint8Array | undefined, parser: XMLParser): Record<string, unknown> | undefined {
  if (!data) {
    return undefined;
  }

  const str = Buffer.from(data).toString();
  try {
    return parser.parse(str) as Record<string, unknown>;
  } catch {
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
        result[lline.substring(0, pos).trim()] = line
          .trim()
          .substring(pos + 1)
          .trim();
      } else {
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

export function parseXmlAs<T>(data: Uint8Array | undefined, schema: z.ZodType<T>, parser: XMLParser): T | undefined {
  const raw = parseXmlFile(data, parser);
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

export function parseQmlImports(str: string): QmlImport[] {
  return str
    .split('\n')
    .filter((line) => line.trim().startsWith('import '))
    .map((line) => {
      const tokens = line.split(' ');
      const module = tokens[1].replace(/"/g, '');
      const isJs = module.endsWith('.js');
      return { module, version: isJs ? undefined : tokens[2] };
    });
}
