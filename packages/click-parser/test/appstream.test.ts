import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'path';
import { createGzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { test, describe } from 'node:test';

import parse from '../src/index';

function buildTarEntry(filePath: string, content: Buffer): Buffer {
  const header = Buffer.alloc(512, 0);
  const name = Buffer.from(filePath);
  name.copy(header, 0, 0, Math.min(name.length, 99));
  Buffer.from('0000644\0').copy(header, 100);
  Buffer.from('0000000\0').copy(header, 108);
  Buffer.from('0000000\0').copy(header, 116);
  const sizeOctal = content.length.toString(8).padStart(11, '0') + '\0';
  Buffer.from(sizeOctal).copy(header, 124);
  const mtimeOctal = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0';
  Buffer.from(mtimeOctal).copy(header, 136);
  header[156] = 0x30;
  Buffer.from('ustar\0').copy(header, 257);
  Buffer.from('00').copy(header, 263);

  header.fill(0x20, 148, 156); // fill checksum field with spaces before calculating
  let checksum = 0;
  for (const b of header) checksum += b;
  Buffer.from(checksum.toString(8).padStart(6, '0') + '\0\x20').copy(header, 148);

  const padLen = (512 - (content.length % 512)) % 512;
  return Buffer.concat([header, content, Buffer.alloc(padLen, 0)]);
}

async function buildTarGz(files: Record<string, string | Buffer>): Promise<Buffer> {
  const entries: Buffer[] = [];
  for (const [name, content] of Object.entries(files)) {
    const buf = typeof content === 'string' ? Buffer.from(content) : content;
    entries.push(buildTarEntry(name, buf));
  }
  // Two 512-byte termination blocks
  entries.push(Buffer.alloc(1024, 0));
  const tarBuf = Buffer.concat(entries);

  const chunks: Buffer[] = [];
  await pipeline(
    Readable.from(tarBuf),
    createGzip(),
    async (source) => { for await (const chunk of source) chunks.push(chunk as Buffer); },
  );
  return Buffer.concat(chunks);
}

function buildAr(files: Record<string, Buffer>): Buffer {
  const magic = Buffer.from('!<arch>\n');
  const parts: Buffer[] = [magic];
  for (const [name, data] of Object.entries(files)) {
    const header = Buffer.alloc(60, 0x20);
    const nameBuf = Buffer.from(name.padEnd(16));
    nameBuf.copy(header, 0, 0, 16);
    const sizeBuf = Buffer.from(data.length.toString(10).padEnd(10));
    sizeBuf.copy(header, 48, 0, 10);
    header[58] = 0x60; // `
    header[59] = 0x0a; // \n
    parts.push(header, data);
    if (data.length % 2 !== 0) parts.push(Buffer.from('\n'));
  }
  return Buffer.concat(parts);
}

async function buildClickPackage(extraDataFiles: Record<string, string | Buffer> = {}): Promise<string> {
  const manifest = JSON.stringify({
    name: 'test.app',
    version: '1.0',
    architecture: 'all',
    framework: 'ubuntu-sdk-15.04',
    description: 'Test app',
    maintainer: 'Tester <test@example.com>',
    hooks: { 'test-app': { apparmor: 'app.json', desktop: 'test-app.desktop' } },
    'installed-size': '10',
  });

  const controlTar = await buildTarGz({ './manifest': manifest });
  const dataTar = await buildTarGz({
    './app.json': JSON.stringify({ policy_groups: ['networking'], policy_version: 1.3 }),
    './test-app.desktop': '[Desktop Entry]\nName=Test App\nExec=test\nType=Application\n',
    ...extraDataFiles,
  });

  const ar = buildAr({
    'debian-binary': Buffer.from('2.0\n'),
    'control.tar.gz': controlTar,
    'data.tar.gz': dataTar,
  });

  const tmpPath = path.join(os.tmpdir(), `test-click-${crypto.randomUUID()}.click`);
  await fs.writeFile(tmpPath, ar);
  return tmpPath;
}

describe('AppStream metainfo parsing', () => {
  test('existing clicks without metainfo return appstream: undefined', async () => {
    const data = await parse(path.join(__dirname, 'test-qml.bhdouglass_1.0.0_all.click'));
    assert.equal(data.appstream, undefined);
  });

  test('click with valid metainfo.xml parses appstream data', async () => {
    const metainfo = `<?xml version="1.0" encoding="UTF-8"?>
<component type="application">
  <id>test.app</id>
  <name>My Test App</name>
  <summary>A great test application</summary>
  <description>
    <p>Full description here.</p>
  </description>
  <keywords>
    <keyword>test</keyword>
    <keyword>demo</keyword>
  </keywords>
  <url type="homepage">https://example.com</url>
  <project_license>MIT</project_license>
  <developer_name>Test Developer</developer_name>
  <categories>
    <category>Development</category>
  </categories>
</component>`;

    const clickPath = await buildClickPackage({
      './usr/share/metainfo/test.app.metainfo.xml': metainfo,
    });
    try {
      const data = await parse(clickPath);
      assert.ok(data.appstream, 'appstream should be defined');
      assert.ok(data.appstream.component, 'component should be defined');
    }
    finally {
      await fs.unlink(clickPath).catch(() => { /* ignore */ });
    }
  });

  test('click with malformed metainfo does not throw', async () => {
    const clickPath = await buildClickPackage({
      './usr/share/metainfo/test.app.metainfo.xml': 'not valid xml <<< >>>',
    });
    try {
      const data = await parse(clickPath);
      assert.ok(data.appstream === undefined || typeof data.appstream === 'object');
    }
    finally {
      await fs.unlink(clickPath).catch(() => { /* ignore */ });
    }
  });
});
