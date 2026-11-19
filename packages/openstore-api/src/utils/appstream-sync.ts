// SPDX-License-Identifier: AGPL-3.0-or-later
export type AppstreamSyncOptions = { force: boolean; dryRun: boolean; limit?: number };

type ResponseValidators = { etag?: string; lastModified?: string };
type StoredValidators = { etag?: string; last_modified?: string };

export function parseOptions(args: string[]): AppstreamSyncOptions {
  const options: AppstreamSyncOptions = { force: false, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    // The ts-command wrapper always passes a bare -- before the real flags.
    if (arg === '--') {
      continue;
    }

    if (arg === '--force') {
      options.force = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--limit') {
      const raw = args[++i];
      const limit = raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : NaN;
      if (!Number.isSafeInteger(limit)) {
        throw new Error(`Invalid --limit value: ${raw || '(missing)'}`);
      }
      options.limit = limit;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

export function isSourceUnchanged(headers: ResponseValidators, stored: StoredValidators, force: boolean): boolean {
  if (force || (!headers.etag && !headers.lastModified)) {
    return false;
  }

  return (!headers.etag || headers.etag === stored.etag) && (!headers.lastModified || headers.lastModified === stored.last_modified);
}

export function shouldPrune(options: AppstreamSyncOptions, failures: string[]): boolean {
  // Dry-run still reports candidates; pruneApps itself performs no writes.
  return !options.limit && failures.length === 0;
}

export function shouldUpdateValidators(options: AppstreamSyncOptions, failures: string[]): boolean {
  return shouldPrune(options, failures) && !options.dryRun;
}
