import { z } from 'zod';

const verifiedEmailSchema = z.object({
  value: z.string(),
  verified: z.boolean().optional(),
});

const emailSchema = z.object({
  value: z.string(),
});

const stringOrArray = z.union([z.string(), z.array(z.string())]).optional();

export const ubuntuProfileSchema = z.object({
  email: stringOrArray,
  fullname: stringOrArray,
  nickname: stringOrArray,
  language: stringOrArray,
});

export const githubProfileSchema = z.object({
  id: z.string(),
  username: z.string().optional(),
  displayName: z.string().optional(),
  emails: z.array(verifiedEmailSchema).optional(),
});

export const gitlabProfileSchema = z.object({
  id: z.string(),
  username: z.string().optional(),
  displayName: z.string().optional(),
  emails: z.array(emailSchema).optional(),
});

export type UbuntuProfile = z.infer<typeof ubuntuProfileSchema>;
export type GithubProfile = z.infer<typeof githubProfileSchema>;
export type GitlabProfile = z.infer<typeof gitlabProfileSchema>;
