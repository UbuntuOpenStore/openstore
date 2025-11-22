import { Schema, model } from 'mongoose';
import { setupStatics } from './statics';
import { type IDiscover, type IDiscoverMethods, type DiscoverModel } from './types';

const highlightSchema = new Schema({
  id: { type: String, required: true },
  description: { type: String, required: true },
}, { _id: false });

const categorySchema = new Schema({
  name: { type: String, required: true },
  tagline: { type: String, required: true },
  referral: { type: String, default: '' },
  ids: [{ type: String, required: true }],
}, { _id: false });

const discoverSchema = new Schema<IDiscover, DiscoverModel, IDiscoverMethods>({
  highlights: [highlightSchema],
  categories: [categorySchema],
});

setupStatics(discoverSchema);

export const Discover = model<IDiscover, DiscoverModel>('Discover', discoverSchema);
