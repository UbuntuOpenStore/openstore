import fs from 'fs/promises';
import path from 'path';

import { optimize } from 'svgo';

export async function compressSvg(filePath: string): Promise<void> {
  if (path.extname(filePath).toLowerCase() !== '.svg') {
    return;
  }

  try {
    const original = await fs.readFile(filePath, 'utf-8');
    const result = optimize(original, {
      multipass: true,
      plugins: ['preset-default', 'removeDimensions', 'sortAttrs', 'removeOffCanvasPaths'],
    });
    if (result.data.length < original.length) {
      await fs.writeFile(filePath, result.data, 'utf-8');
    }
  } catch (err) {
    console.warn(`SVG compression failed for ${filePath}:`, err);
  }
}
