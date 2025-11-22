import { type Document, type Model } from 'mongoose';

export interface IHighlight {
  id: string;
  description: string;
}

export interface ICategory {
  name: string;
  tagline: string;
  referral: string;
  ids: string[];
}

export interface IDiscover extends Document {
  highlights: IHighlight[];
  categories: ICategory[];
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IDiscoverMethods { }

export interface DiscoverModel extends Model<IDiscover, object, IDiscoverMethods> {
  getDiscoverData: () => Promise<IDiscover | null>;
  updateDiscoverData: (highlights: IHighlight[], categories: ICategory[]) => Promise<IDiscover>;
}
