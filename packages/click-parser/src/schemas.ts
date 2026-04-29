import { z } from 'zod/v4';

import { descriptionToText } from './appstream-utils';

export const manifestSchema = z.object({
  hooks: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  maintainer: z.string().optional(),
  architecture: z.string().optional(),
  description: z.string().optional(),
  framework: z.string().optional(),
  name: z.string().optional(),
  title: z.string().optional(),
  version: z.string().optional(),
  'installed-size': z.string().optional(),
}).loose();

export type Manifest = z.infer<typeof manifestSchema>;

export const apparmorSchema = z.object({
  policy_groups: z.array(z.string()).optional(),
  policy_version: z.number().optional(),
  template: z.string().optional(),
  write_path: z.array(z.string()).optional(),
  read_path: z.array(z.string()).optional(),
}).loose();

export type Apparmor = z.infer<typeof apparmorSchema>;

export const contentHubSchema = z.record(z.string(), z.array(z.string()));

export const urlDispatcherSchema = z.array(z.record(z.string(), z.string()));

export const pushHelperSchema = z.record(z.string(), z.string());

export const accountSchema = z.record(z.string(), z.unknown());

export const webappPropertiesSchema = z.object({
  scripts: z.array(z.unknown()).optional(),
}).loose();

export const desktopSchema = z.object({
  exec: z.string().optional(),
  icon: z.string().optional(),
}).loose();

export type Desktop = z.infer<typeof desktopSchema>;

// xml2js with mergeAttrs:true+explicitArray:false yields single items or arrays depending on count.
// asArray normalises both forms to a consistent array so every repeated field is T[].
const asArray = (val: unknown): unknown[] | undefined =>
  (val === null || val === undefined) ? undefined : Array.isArray(val) ? val : [val];

export const appstreamLocalisedSchema = z.preprocess(
  asArray,
  z.array(z.union([
    z.string(),
    z.object({ _: z.string(), 'xml:lang': z.string().optional() }).loose(),
  ])).optional(),
);

export type AppstreamLocalised = z.infer<typeof appstreamLocalisedSchema>;

export const appstreamImageSchema = z.union([
  z.string(),
  z.object({
    _: z.string().optional(),
    type: z.string().optional(),
  }),
]);

export type AppstreamImage = z.infer<typeof appstreamImageSchema>;

export const appstreamScreenshotSchema = z.object({
  image: z.preprocess(asArray, z.array(appstreamImageSchema).optional()),
});

export type AppstreamScreenshot = z.infer<typeof appstreamScreenshotSchema>;

export const appstreamReleaseSchema = z.object({
  version: z.string().optional(),
  description: z.record(z.string(), z.unknown()).optional().transform(descriptionToText),
});

export type AppstreamRelease = z.infer<typeof appstreamReleaseSchema>;

export const appstreamUrlSchema = z.object({
  _: z.string().optional(),
  type: z.string().optional(),
});

export type AppstreamUrl = z.infer<typeof appstreamUrlSchema>;

const appstreamComponentSchema = z.object({
  type: z.string().optional(),
  name: appstreamLocalisedSchema,
  summary: appstreamLocalisedSchema,
  description: z.record(z.string(), z.unknown()).optional().transform(descriptionToText),
  keywords: z.object({
    keyword: appstreamLocalisedSchema,
  }).optional(),
  screenshots: z.object({
    screenshot: z.preprocess(asArray, z.array(appstreamScreenshotSchema).optional()),
  }).optional(),
  releases: z.object({
    release: z.preprocess(asArray, z.array(appstreamReleaseSchema).optional()),
  }).optional(),
  url: z.preprocess(asArray, z.array(appstreamUrlSchema).optional()),
  project_license: z.string().optional(),
  categories: z.object({
    category: z.preprocess(asArray, z.array(z.string()).optional()),
  }).optional(),
  content_rating: z.object({
    type: z.string().optional(),
    content_attribute: z.preprocess(asArray, z.array(z.object({
      _: z.string().optional(),
      id: z.string().optional(),
    }))).optional(),
  }).optional(),
  custom: z.object({
    value: z.preprocess(asArray, z.array(z.object({
      _: z.string().optional(),
      key: z.string().optional(),
    }))).optional(),
  }).optional(),
});

export const appstreamSchema = z.object({
  component: z.preprocess(asArray, z.array(appstreamComponentSchema)).transform(
    (components) => components.find((c) => c.type === 'desktop-application') ?? components[0],
  ),
});

export type AppstreamData = z.infer<typeof appstreamSchema>;
