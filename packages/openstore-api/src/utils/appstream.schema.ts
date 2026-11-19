// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from 'zod';

const localizedEntrySchema = z.object({
  lang: z.string().nullish(),
  text: z.string().nullish(),
});

const localizedStringsSchema = z.record(z.string(), z.union([z.string(), z.array(z.string())]));

const localizedTextSchema = z.union([z.string(), z.array(z.union([z.string(), localizedEntrySchema])), localizedStringsSchema]);

const keywordsSchema = z.union([z.array(z.string()), localizedStringsSchema]);

const imageSchema = z.object({
  url: z.string().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
});

export const iconEntrySchema = z.object({
  name: z.string().nullish(),
  url: z.string().nullish(),
  type: z.string().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
  scale: z.number().nullish(),
});

const iconSchema = z.union([
  z.object({
    cached: z.array(iconEntrySchema).nullish(),
    remote: z.union([z.array(iconEntrySchema), iconEntrySchema]).nullish(),
    stock: z.string().nullish(),
  }),
  z.array(iconEntrySchema),
]);

const screenshotSchema = z.object({
  default: z.boolean().nullish(),
  caption: localizedTextSchema.nullish(),
  thumbnails: z.array(imageSchema).nullish(),
  'source-image': imageSchema.nullish(),
  url: z.string().nullish(),
});

const oarsSchema = z.record(z.string(), z.union([z.string(), z.number()]));

const contentRatingSchema = z.object({
  'oars-1.0': oarsSchema.nullish(),
  'oars-1.1': oarsSchema.nullish(),
});

const releaseSchema = z.object({
  version: z.union([z.string(), z.number()]).nullish(),
  type: z.string().nullish(),
  'unix-timestamp': z.union([z.number(), z.string()]).nullish(),
  Description: localizedTextSchema.nullish(),
  description: localizedTextSchema.nullish(),
});

export const appstreamDocSchema = z.object({
  File: z.string().nullish(),
  Version: z.string().nullish(),
  Origin: z.string().nullish(),
  MediaBaseUrl: z.string().nullish(),
  Time: z.string().nullish(),
  Type: z.string().nullish(),
  ID: z.string().nullish(),
  Package: z.string().nullish(),
  Name: localizedTextSchema.nullish(),
  Summary: localizedTextSchema.nullish(),
  Description: localizedTextSchema.nullish(),
  DeveloperName: localizedTextSchema.nullish(),
  ProjectLicense: z.string().nullish(),
  Categories: z.array(z.string()).nullish(),
  Keywords: keywordsSchema.nullish(),
  Url: z.record(z.string(), z.string().nullish()).nullish(),
  Icon: iconSchema.nullish(),
  Screenshots: z.array(screenshotSchema).nullish(),
  ContentRating: contentRatingSchema.nullish(),
  Releases: z.array(releaseSchema).nullish(),
});

export type AppstreamDoc = z.infer<typeof appstreamDocSchema>;
export type AppstreamIconEntry = z.infer<typeof iconEntrySchema>;
