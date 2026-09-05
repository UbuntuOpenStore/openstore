// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'fs/promises';
import assert from 'node:assert/strict';
import { test, describe, afterEach } from 'node:test';
import os from 'os';
import path from 'path';

import sharp from 'sharp';

import { compressImage } from './compress';

describe('compressImage', () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  async function setupTmpDir() {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'compress-file-test-'));
    return tmpDir;
  }

  describe('PNG', () => {
    test('should compress a PNG file', async () => {
      const dir = await setupTmpDir();
      const filePath = path.join(dir, 'test.png');

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
  });

  describe('JPEG', () => {
    test('should compress a JPEG file', async () => {
      const dir = await setupTmpDir();
      const filePath = path.join(dir, 'test.jpg');

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
      if (result.length === originalSize) {
        assert.deepEqual([...result], [...originalContent]);
      }
    });
  });

  describe('SVG', () => {
    test('should reduce the size of a verbose SVG', async () => {
      const dir = await setupTmpDir();
      const filePath = path.join(dir, 'test.svg');

      const verboseSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="128" height="128" viewBox="0 0 128 128"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.0.dtd">
  <sodipodi:namedview id="namedview1" pagecolor="#ffffff" bordercolor="#666666" borderopacity="1.0"/>
  <defs>
    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:rgb(255,255,0);stop-opacity:1" />
      <stop offset="100%" style="stop-color:rgb(255,0,0);stop-opacity:1" />
    </linearGradient>
  </defs>
  <g inkscape:groupmode="layer" inkscape:label="Layer 1">
    <rect x="10" y="10" width="108" height="108" fill="url(#grad1)" />
    <circle cx="64" cy="64" r="30" fill="#000000" />
  </g>
</svg>`;

      await fs.writeFile(filePath, verboseSvg, 'utf-8');
      const originalSize = (await fs.stat(filePath)).size;

      await compressImage(filePath);

      const optimized = await fs.readFile(filePath, 'utf-8');
      assert.ok(optimized.length < originalSize, `Expected ${optimized.length} < ${originalSize}`);
      assert.ok(!optimized.includes('inkscape:'), 'Should strip Inkscape namespace');
    });

    test('should not write back a larger SVG file', async () => {
      const dir = await setupTmpDir();
      const filePath = path.join(dir, 'minimal.svg');

      const minimalSvg = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="1" cy="1" r="1"/></svg>';
      await fs.writeFile(filePath, minimalSvg, 'utf-8');

      await compressImage(filePath);

      const result = await fs.readFile(filePath, 'utf-8');
      assert.ok(result.length <= minimalSvg.length);
    });

    test('should not throw on malformed SVG', async () => {
      const dir = await setupTmpDir();
      const filePath = path.join(dir, 'bad.svg');

      await fs.writeFile(filePath, '<svg><unclosed><tag>', 'utf-8');

      await compressImage(filePath);

      const content = await fs.readFile(filePath, 'utf-8');
      assert.ok(content.length > 0);
    });
  });

  describe('unsupported extensions', () => {
    test('should leave unrecognized files untouched', async () => {
      const dir = await setupTmpDir();
      const filePath = path.join(dir, 'data.bin');

      const data = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      await fs.writeFile(filePath, data);

      await compressImage(filePath);

      const result = await fs.readFile(filePath);
      assert.deepEqual([...result], [...data]);
    });
  });

  describe('corrupt files', () => {
    test('should not throw on a corrupt image file', async () => {
      const dir = await setupTmpDir();
      const filePath = path.join(dir, 'corrupt.png');

      await fs.writeFile(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xff, 0xff]));

      await compressImage(filePath);

      const stat = await fs.stat(filePath);
      assert.ok(stat.size > 0);
    });
  });
});
