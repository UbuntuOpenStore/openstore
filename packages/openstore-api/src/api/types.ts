// SPDX-License-Identifier: AGPL-3.0-or-later
import { type SerializedPackage } from '../db/package/types';

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
