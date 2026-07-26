import fs from 'fs/promises';
import assert from 'node:assert/strict';
import { test, describe, afterEach } from 'node:test';
import os from 'os';
import path from 'path';

import sharp from 'sharp';

import { compressImage } from './compress-image';

describe('compressImage', () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  async function setupTmpDir() {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'compress-image-test-'));
    return tmpDir;
  }

  test('should compress a PNG file', async () => {
    const dir = await setupTmpDir();
    const filePath = path.join(dir, 'test.png');

    // Create a 256-color PNG icon (typical app icon)
    await sharp({
      create: { width: 128, height: 128, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toFile(filePath);

    const originalSize = (await fs.stat(filePath)).size;

    await compressImage(filePath);

    const compressedSize = (await fs.stat(filePath)).size;
    assert.ok(compressedSize < originalSize, `Expected ${compressedSize} < ${originalSize}`);
  });

  test('should compress a JPEG file', async () => {
    const dir = await setupTmpDir();
    const filePath = path.join(dir, 'test.jpg');

    // Create a JPEG screenshot-like image
    await sharp({
      create: { width: 1080, height: 1920, channels: 3, background: { r: 100, g: 150, b: 200 } },
    })
      .jpeg({ quality: 100 })
      .toFile(filePath);

    const originalSize = (await fs.stat(filePath)).size;

    await compressImage(filePath);

    const compressedSize = (await fs.stat(filePath)).size;
    assert.ok(compressedSize < originalSize, `Expected ${compressedSize} < ${originalSize}`);
  });

  test('should not write back a larger file', async () => {
    const dir = await setupTmpDir();
    const filePath = path.join(dir, 'optimized.jpg');

    // Create an already well-compressed JPEG
    await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg({ quality: 80 })
      .toFile(filePath);

    const originalSize = (await fs.stat(filePath)).size;
    const originalContent = await fs.readFile(filePath);

    await compressImage(filePath);

    const result = await fs.readFile(filePath);
    assert.ok(result.length <= originalSize, `Expected ${result.length} <= ${originalSize}`);
    // If compressed would be larger, the original content is preserved
    if (result.length === originalSize) {
      assert.deepEqual([...result], [...originalContent]);
    }
  });

  test('should leave SVG files untouched', async () => {
    const dir = await setupTmpDir();
    const filePath = path.join(dir, 'icon.svg');

    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="1" cy="1" r="1"/></svg>';
    await fs.writeFile(filePath, svgContent, 'utf-8');

    await compressImage(filePath);

    const result = await fs.readFile(filePath, 'utf-8');
    assert.equal(result, svgContent);
  });

  test('should not throw on a corrupt image file', async () => {
    const dir = await setupTmpDir();
    const filePath = path.join(dir, 'corrupt.png');

    await fs.writeFile(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xff, 0xff]));

    await compressImage(filePath);

    // File should still exist
    const stat = await fs.stat(filePath);
    assert.ok(stat.size > 0);
  });
});
