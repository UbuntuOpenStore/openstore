// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from 'zod/v4';

import { PackageType } from '../db/package';
import { INVALID_LICENSE, INVALID_PACKAGE_TYPE, NO_APP_NAME, NO_APP_TITLE, NO_LICENSE_SPECIFIED } from '../utils/error-messages';
import { isValidLicense } from '../utils/licenses';
import { TEXT_MAX_LENGTH } from '../utils/limits';

export const baseCreateAppSchema = z.object({
  id: z
    .string({
      error: NO_APP_NAME,
    })
    .trim()
    .min(1, NO_APP_NAME),
  name: z
    .string({
      error: NO_APP_TITLE,
    })
    .trim()
    .min(1, NO_APP_TITLE)
    .max(TEXT_MAX_LENGTH, `Title must be ${TEXT_MAX_LENGTH} characters or less`),
  source: z
    .url({
      error: 'Source URL must be a valid URL',
    })
    .trim()
    .max(TEXT_MAX_LENGTH, `Source URL must be ${TEXT_MAX_LENGTH} characters or less`)
    .or(z.literal(''))
    .optional(),
  package_type: z
    .enum(PackageType, {
      error: INVALID_PACKAGE_TYPE,
    })
    .optional(),
});

export const createAdminAppSchema = baseCreateAppSchema.extend({
  license: z
    .string({
      error: NO_LICENSE_SPECIFIED,
    })
    .trim()
    .min(1, NO_LICENSE_SPECIFIED)
    .refine(isValidLicense, INVALID_LICENSE)
    .optional(),
});

export const createAppSchema = baseCreateAppSchema.extend({
  license: z
    .string({
      error: NO_LICENSE_SPECIFIED,
    })
    .trim()
    .min(1, NO_LICENSE_SPECIFIED)
    .refine(isValidLicense, INVALID_LICENSE),
});

export type CreateAppData = z.infer<typeof createAppSchema>;
