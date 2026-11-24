// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import request from 'supertest';
import { type App } from 'supertest/types';

import * as api from '..';
import { AppstreamSyncConfig } from '../../db/appstream_sync_config';
import factory from '../../tests/factory';
import { cleanMongoose, closeMongoose, waitForMongoose } from '../../tests/utils';

const route = '/api/v4/admin/appstream-sync-config';

const DEFAULT_SOURCES = [
  {
    url: 'https://archive.ubuntu.com/ubuntu/dists/noble/main/dep11/Components-amd64.yml.gz',
    icon_url: 'https://archive.ubuntu.com/ubuntu/dists/noble/main/dep11/icons-128x128.tar.gz',
    architecture: 'amd64',
  },
  {
    url: 'https://ports.ubuntu.com/ubuntu-ports/dists/noble/main/dep11/Components-arm64.yml.gz',
    icon_url: 'https://ports.ubuntu.com/ubuntu-ports/dists/noble/main/dep11/icons-128x128.tar.gz',
    architecture: 'arm64',
  },
  {
    url: 'https://ports.ubuntu.com/ubuntu-ports/dists/noble/main/dep11/Components-armhf.yml.gz',
    icon_url: 'https://ports.ubuntu.com/ubuntu-ports/dists/noble/main/dep11/icons-128x128.tar.gz',
    architecture: 'armhf',
  },
];

const UPDATED_SOURCES = [
  {
    url: 'https://example.com/dep11/Components-amd64.yml.gz',
    icon_url: 'https://example.com/dep11/icons-128x128.tar.gz',
    architecture: 'amd64',
  },
  {
    url: 'https://example.com/dep11/Components-arm64.yml.gz',
    icon_url: 'https://example.com/dep11/icons-128x128.tar.gz',
    architecture: 'arm64',
  },
];

const ALLOWLIST = ['^org\\.example\\.', '^com\\.example\\.'];

async function storeValidators(url: string) {
  const { config } = await AppstreamSyncConfig.getOrCreate();
  const source = config.sources.find((candidate) => candidate.url === url)!;
  source.etag = 'W/"stored-etag"';
  source.last_modified = 'Mon, 01 Jan 2024 00:00:00 GMT';
  await config.save();
}

describe('Admin API - AppStream sync config', () => {
  let app: App;
  let adminApiKey: string;
  let regularApiKey: string;

  before(async () => {
    await waitForMongoose();
    app = api.setup();
  });

  after(async () => {
    await closeMongoose();
  });

  beforeEach(async () => {
    await cleanMongoose();
    adminApiKey = (await factory.user({ role: 'admin' })).apikey;
    regularApiKey = (await factory.user({ role: 'community' })).apikey;
  });

  describe('GET /api/v4/admin/appstream-sync-config', () => {
    test('rejects non-admin users', async () => {
      await request(app).get(`${route}?apikey=${regularApiKey}`).expect(403);
    });

    test('rejects unauthenticated requests', async () => {
      await request(app).get(route).expect(401);
    });

    test('creates and returns the default config on first request', async () => {
      const response = await request(app).get(`${route}?apikey=${adminApiKey}`).expect(200);

      assert.equal(response.body.success, true);
      assert.deepEqual(response.body.data.sources, DEFAULT_SOURCES);
      assert.deepEqual(response.body.data.allowlist, []);
      assert.equal(await AppstreamSyncConfig.countDocuments(), 1);
    });

    test('returns the existing config unchanged on later requests', async () => {
      await request(app).get(`${route}?apikey=${adminApiKey}`).expect(200);

      const response = await request(app).get(`${route}?apikey=${adminApiKey}`).expect(200);

      assert.deepEqual(response.body.data.sources, DEFAULT_SOURCES);
      assert.equal(await AppstreamSyncConfig.countDocuments(), 1);
    });
  });

  describe('PUT /api/v4/admin/appstream-sync-config', () => {
    test('rejects non-admin users', async () => {
      await request(app).put(`${route}?apikey=${regularApiKey}`).send({ sources: [], allowlist: [] }).expect(403);
    });

    test('rejects unauthenticated requests', async () => {
      await request(app).put(route).send({ sources: [], allowlist: [] }).expect(401);
    });

    test('replaces sources and allowlist and returns the updated config', async () => {
      const response = await request(app)
        .put(`${route}?apikey=${adminApiKey}`)
        .send({ sources: UPDATED_SOURCES, allowlist: ALLOWLIST })
        .expect(200);

      assert.equal(response.body.success, true);
      assert.deepEqual(response.body.data.sources, UPDATED_SOURCES);
      assert.deepEqual(response.body.data.allowlist, ALLOWLIST);

      const stored = (await AppstreamSyncConfig.findOne())!.toObject();
      assert.deepEqual(stored.sources, UPDATED_SOURCES);
      assert.deepEqual(stored.allowlist, ALLOWLIST);
    });

    const invalidBodies = [
      { name: 'missing sources', body: { allowlist: [] } },
      { name: 'non-array sources', body: { sources: 'invalid', allowlist: [] } },
      { name: 'missing source url', body: { sources: [{ icon_url: 'url', architecture: 'amd64' }], allowlist: [] } },
      { name: 'missing allowlist', body: { sources: [] } },
      { name: 'non-array allowlist', body: { sources: [], allowlist: 'invalid' } },
      { name: 'non-string allowlist entry', body: { sources: [], allowlist: [42] } },
    ];

    for (const { name, body } of invalidBodies) {
      test(`returns 400 and saves nothing for ${name}`, async () => {
        const response = await request(app).put(`${route}?apikey=${adminApiKey}`).send(body).expect(400);

        assert.equal(response.body.success, false);
        assert.equal(await AppstreamSyncConfig.countDocuments(), 0);
      });
    }

    test('rejects an invalid allowlist regex without saving anything', async () => {
      const before = await request(app).get(`${route}?apikey=${adminApiKey}`).expect(200);

      const response = await request(app)
        .put(`${route}?apikey=${adminApiKey}`)
        .send({ sources: UPDATED_SOURCES, allowlist: ['['] })
        .expect(400);

      assert.equal(response.body.success, false);
      assert.match(response.body.message as string, /\[/);
      assert.match(response.body.message as string, /Unterminated character class/);

      const after = await request(app).get(`${route}?apikey=${adminApiKey}`).expect(200);
      assert.deepEqual(after.body.data, before.body.data);
    });

    test('accepts a regex pattern that compiles to an empty expression', async () => {
      const response = await request(app)
        .put(`${route}?apikey=${adminApiKey}`)
        .send({ sources: [], allowlist: [''] })
        .expect(200);

      assert.deepEqual(response.body.data.allowlist, ['']);
    });

    test('ignores read-only validator fields in the body', async () => {
      const url = DEFAULT_SOURCES[0].url;
      await storeValidators(url);

      const response = await request(app)
        .put(`${route}?apikey=${adminApiKey}`)
        .send({
          sources: [{ ...DEFAULT_SOURCES[0], etag: 'W/"client-etag"', last_modified: 'bad' }, ...DEFAULT_SOURCES.slice(1)],
          allowlist: [],
        })
        .expect(200);

      const source = response.body.data.sources.find((candidate: { url: string }) => candidate.url === url);
      assert.equal(source.etag, 'W/"stored-etag"');
      assert.equal(source.last_modified, 'Mon, 01 Jan 2024 00:00:00 GMT');
    });

    test('keeps validators for unchanged URLs', async () => {
      const url = DEFAULT_SOURCES[0].url;
      await storeValidators(url);

      const response = await request(app)
        .put(`${route}?apikey=${adminApiKey}`)
        .send({ sources: DEFAULT_SOURCES, allowlist: ALLOWLIST })
        .expect(200);

      const source = response.body.data.sources.find((candidate: { url: string }) => candidate.url === url);
      assert.equal(source.etag, 'W/"stored-etag"');
      assert.equal(source.last_modified, 'Mon, 01 Jan 2024 00:00:00 GMT');
    });

    test('clears validators when icon_url changes', async () => {
      const url = DEFAULT_SOURCES[0].url;
      await storeValidators(url);
      const changed = { ...DEFAULT_SOURCES[0], icon_url: 'https://example.com/dep11/icons-128x128.tar.gz' };

      const response = await request(app)
        .put(`${route}?apikey=${adminApiKey}`)
        .send({ sources: [changed, ...DEFAULT_SOURCES.slice(1)], allowlist: [] })
        .expect(200);

      const source = response.body.data.sources.find((candidate: { url: string }) => candidate.url === url);
      assert.equal(source.etag, undefined);
      assert.equal(source.last_modified, undefined);
    });
  });
});
