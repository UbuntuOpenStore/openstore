// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'fs/promises';

export async function moveFile(src: string, dest: string) {
  await fs.copyFile(src, dest);
  await fs.unlink(src);
}
