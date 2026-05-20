import { type Schema } from 'mongoose';

import { type IDiscover, type IDiscoverMethods, type DiscoverModel, type IHighlight, type ICategory } from './types';

export function setupStatics(discoverSchema: Schema<IDiscover, DiscoverModel, IDiscoverMethods>) {
  discoverSchema.statics.getDiscoverData = async function (): Promise<IDiscover | null> {
    return await this.findOne();
  };

  discoverSchema.statics.updateDiscoverData = async function (highlights: IHighlight[], categories: ICategory[]): Promise<IDiscover> {
    let discover = await this.findOne();

    if (!discover) {
      discover = new this({
        highlights,
        categories,
      });
    } else {
      discover.highlights = highlights;
      discover.categories = categories;
    }

    await discover.save();
    return discover;
  };
}
