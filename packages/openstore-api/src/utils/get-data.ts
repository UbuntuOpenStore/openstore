// SPDX-License-Identifier: AGPL-3.0-or-later
// oxlint-disable typescript/no-unnecessary-condition

import { type Request } from 'express';

export function getData(req: Request, name: string, defaultData = ''): string {
  if (req.query && req.query[name]) {
    const value = req.query[name];
    if (typeof value === 'string') {
      return value.trim();
    }
  }

  if (req.body && req.body[name]) {
    return req.body[name].trim();
  }

  return defaultData;
}

export function getDataInt(req: Request, name: string, defaultData = 0): number {
  let returnValue = defaultData;
  if (req.query && req.query[name]) {
    const value = req.query[name];

    if (typeof value === 'string') {
      returnValue = parseInt(value.trim(), 10);
    }
  }

  if (req.body && req.body[name]) {
    returnValue = parseInt(req.body[name].trim(), 10);
  }

  return Number.isNaN(returnValue) ? defaultData : returnValue;
}

export function getDataArray(req: Request, name: string, defaultData: string[] = []): string[] {
  if (req.query && req.query[name]) {
    const value = req.query[name];
    if (Array.isArray(value)) {
      return value as string[];
    }

    if (typeof value === 'string') {
      return value.split(',');
    }
  }

  if (req.body && req.body[name]) {
    if (Array.isArray(req.body[name])) {
      return req.body[name];
    }

    return req.body[name].split(',');
  }

  return defaultData;
}

export function getDataBoolean(req: Request, name: string, defaultData = false): boolean {
  if (req.query && req.query[name] !== undefined) {
    const value = req.query[name];
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }

    return Boolean(value);
  }

  if (req.body && req.body[name] !== undefined) {
    if (typeof req.body[name] === 'string') {
      return req.body[name].toLowerCase() === 'true';
    }

    return Boolean(req.body[name]);
  }

  return Boolean(defaultData);
}

export function getDataBooleanOrUndefined(req: Request, name: string): boolean | undefined {
  if (req.query && req.query[name] !== undefined && req.query[name] !== '') {
    const value = req.query[name];
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }

    return Boolean(value);
  }

  if (req.body && req.body[name] !== undefined && req.body[name] !== '') {
    if (typeof req.body[name] === 'string') {
      return req.body[name].toLowerCase() === 'true';
    }

    return Boolean(req.body[name]);
  }

  return undefined;
}
