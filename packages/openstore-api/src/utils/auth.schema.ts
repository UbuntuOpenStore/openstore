import { z } from 'zod';

const verifiedEmailSchema = z.object({
  value: z.string(),
  verified: z.boolean().nullish(),
});

const emailSchema = z.object({
  value: z.string(),
});

const stringOrArray = z.union([z.string(), z.array(z.string())]).nullish();

export const ubuntuProfileSchema = z.object({
  email: stringOrArray,
  fullname: stringOrArray,
  nickname: stringOrArray,
  language: stringOrArray,
});

export const githubProfileSchema = z.object({
  id: z.string(),
  username: z.string().nullish(),
  displayName: z.string().nullish(),
  emails: z.array(verifiedEmailSchema).nullish(),
});

export const gitlabProfileSchema = z.object({
  id: z.string(),
  username: z.string().nullish(),
  displayName: z.string().nullish(),
  emails: z.array(emailSchema).nullish(),
});

export type UbuntuProfile = z.infer<typeof ubuntuProfileSchema>;
export type GithubProfile = z.infer<typeof githubProfileSchema>;
export type GitlabProfile = z.infer<typeof gitlabProfileSchema>;
