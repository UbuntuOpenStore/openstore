import fs from 'fs/promises';
import path from 'path';

import sharp from 'sharp';

import { captureException } from './logger';

const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

export async function compressImage(filePath: string): Promise<void> {
  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) return;

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
    captureException(err, '');
    console.warn(`Image compression failed for ${filePath}:`, err);
  }
}
