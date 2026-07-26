import fs from 'fs/promises';
import assert from 'node:assert/strict';
import { test, describe, afterEach } from 'node:test';
import os from 'os';
import path from 'path';

import { compressSvg } from './compress-svg';

describe('compressSvg', () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  async function setupTmpDir() {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'compress-svg-test-'));
    return tmpDir;
  }

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

    await compressSvg(filePath);

    const optimized = await fs.readFile(filePath, 'utf-8');
    assert.ok(optimized.length < originalSize, `Expected ${optimized.length} < ${originalSize}`);
    assert.ok(!optimized.includes('inkscape:'), 'Should strip Inkscape namespace');
  });

  test('should not write back a larger file', async () => {
    const dir = await setupTmpDir();
    const filePath = path.join(dir, 'minimal.svg');

    const minimalSvg = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="1" cy="1" r="1"/></svg>';
    await fs.writeFile(filePath, minimalSvg, 'utf-8');

    await compressSvg(filePath);

    const result = await fs.readFile(filePath, 'utf-8');
    // It's fine if it's the same or smaller; just should not be larger
    assert.ok(result.length <= minimalSvg.length);
  });

  test('should leave non-SVG files untouched', async () => {
    const dir = await setupTmpDir();
    const filePath = path.join(dir, 'icon.png');

    const pngData = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await fs.writeFile(filePath, pngData);

    await compressSvg(filePath);

    const result = await fs.readFile(filePath);
    assert.deepEqual([...result], [...pngData]);
  });

  test('should not throw on malformed SVG', async () => {
    const dir = await setupTmpDir();
    const filePath = path.join(dir, 'bad.svg');

    await fs.writeFile(filePath, '<svg><unclosed><tag>', 'utf-8');

    await compressSvg(filePath);

    // File should still exist and be readable
    const content = await fs.readFile(filePath, 'utf-8');
    assert.ok(content.length > 0);
  });
});
