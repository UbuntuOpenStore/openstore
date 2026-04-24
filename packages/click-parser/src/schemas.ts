import { z } from 'zod/v4';

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
