// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'fs/promises';
import path from 'path';

import sharp from 'sharp';
import { optimize } from 'svgo';

async function compressRaster(filePath: string): Promise<void> {
  const ext = path.extname(filePath).toLowerCase();

  try {
    const tmpPath = `${filePath}.tmp`;

    let pipeline = sharp(filePath);

    if (ext === '.png') {
      pipeline = pipeline.png({ compressionLevel: 9, palette: true });
    } else {
      pipeline = pipeline.jpeg({ quality: 80, mozjpeg: true });
    }

    const originalSize = (await fs.stat(filePath)).size;
    await pipeline.toFile(tmpPath);
    const compressedSize = (await fs.stat(tmpPath)).size;

    if (compressedSize < originalSize) {
      await fs.rename(tmpPath, filePath);
    } else {
      await fs.unlink(tmpPath);
    }
  } catch (err) {
    console.warn(`Image compression failed for ${filePath}:`, err);
  }
}

async function compressSvg(filePath: string): Promise<void> {
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

const SVG_EXTENSIONS = ['.svg'];
const RASTER_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

export async function compressImage(filePath: string): Promise<void> {
  const ext = path.extname(filePath).toLowerCase();

  if (SVG_EXTENSIONS.includes(ext)) {
    await compressSvg(filePath);
  } else if (RASTER_EXTENSIONS.includes(ext)) {
    await compressRaster(filePath);
  }
}
