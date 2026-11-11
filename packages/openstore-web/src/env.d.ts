// SPDX-License-Identifier: AGPL-3.0-or-later
/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly PUBLIC_API_URL: string;
  readonly ALLOWED_PACKAGE_TYPES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
