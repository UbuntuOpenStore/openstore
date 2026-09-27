// SPDX-License-Identifier: AGPL-3.0-or-later
import { type SerializedDiscoverApp, type SerializedPackage } from '../db/package/types';

export type DiscoverHighlight = {
  id: string;
  image: string;
  description: string;
  app: Omit<SerializedPackage, 'revisions'>;
};

export type DiscoverCategory = {
  name: string;
  tagline: string;
  referral: string;
  ids: string[];
  apps: Omit<SerializedPackage, 'revisions'>[];
};

export type DiscoverData = {
  highlights: DiscoverHighlight[];
  categories: DiscoverCategory[];
  highlight: DiscoverHighlight;
};

export type DiscoverHighlightV5 = {
  id: string;
  image: string;
  description: string;
  publisher: string;
  app: SerializedDiscoverApp;
};

export type DiscoverCategoryV5 = {
  name: string;
  tagline: string;
  referral: string;
  apps: SerializedDiscoverApp[];
};

export type DiscoverDataV5 = {
  highlights: DiscoverHighlightV5[];
  categories: DiscoverCategoryV5[];
};
