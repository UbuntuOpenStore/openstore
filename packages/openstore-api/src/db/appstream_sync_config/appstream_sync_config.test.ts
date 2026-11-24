// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';

import { AppstreamSyncConfig, DEFAULT_APPSTREAM_SOURCES, type EditableAppstreamSyncConfig } from '.';
import '../index';
import { cleanMongoose, closeMongoose, waitForMongoose } from '../../tests/utils';

const VALIDATOR_ETAG = 'W/"abc123"';
const VALIDATOR_LAST_MODIFIED = 'Mon, 01 Jan 2024 00:00:00 GMT';

function editableSources(): EditableAppstreamSyncConfig['sources'] {
  return DEFAULT_APPSTREAM_SOURCES.map(({ url, icon_url, architecture }) => ({ url, icon_url, architecture }));
}

async function storeValidators(url: string) {
  const { config } = await AppstreamSyncConfig.getOrCreate();
  const source = config.sources.find((candidate) => candidate.url === url)!;
  source.etag = VALIDATOR_ETAG;
  source.last_modified = VALIDATOR_LAST_MODIFIED;
  await config.save();
}

describe('AppstreamSyncConfig', () => {
  beforeEach(async () => {
    await waitForMongoose();
    await cleanMongoose();
  });

  after(async () => {
    await closeMongoose();
  });

  test('uses the appstreamsyncconfigs collection', () => {
    assert.equal(AppstreamSyncConfig.collection.name, 'appstreamsyncconfigs');
  });

  test('getOrCreate creates the defaults once', async () => {
    const { config, created } = await AppstreamSyncConfig.getOrCreate();

    assert.equal(created, true);
    assert.deepEqual(config.toObject().sources, DEFAULT_APPSTREAM_SOURCES);
    assert.deepEqual(config.allowlist, []);
    assert.equal('_id' in config.sources[0], false);

    const second = await AppstreamSyncConfig.getOrCreate();
    assert.equal(second.created, false);
    assert.equal(second.config.id, config.id);
    assert.deepEqual(second.config.toObject().sources, config.toObject().sources);
    assert.equal(await AppstreamSyncConfig.countDocuments(), 1);
  });

  test('updateEditable keeps validators for unchanged URLs', async () => {
    const url = DEFAULT_APPSTREAM_SOURCES[0].url;
    await storeValidators(url);

    const config = await AppstreamSyncConfig.updateEditable({ sources: editableSources(), allowlist: ['^org\\.example\\.'] });
    const source = config.sources.find((candidate) => candidate.url === url)!;

    assert.equal(source.etag, VALIDATOR_ETAG);
    assert.equal(source.last_modified, VALIDATOR_LAST_MODIFIED);
    assert.deepEqual(config.allowlist, ['^org\\.example\\.']);
  });

  test('updateEditable clears validators when icon_url changes', async () => {
    const [changed, kept, ...others] = DEFAULT_APPSTREAM_SOURCES;
    await storeValidators(changed.url);
    await storeValidators(kept.url);

    const config = await AppstreamSyncConfig.updateEditable({
      sources: [
        { url: changed.url, icon_url: `${changed.icon_url}?v=2`, architecture: changed.architecture },
        ...others.map(({ url, icon_url, architecture }) => ({ url, icon_url, architecture })),
        { url: kept.url, icon_url: kept.icon_url, architecture: kept.architecture },
      ],
      allowlist: [],
    });

    const changedSource = config.sources.find((candidate) => candidate.url === changed.url)!;
    assert.equal(changedSource.etag, undefined);
    assert.equal(changedSource.last_modified, undefined);

    const keptSource = config.sources.find((candidate) => candidate.url === kept.url)!;
    assert.equal(keptSource.etag, VALIDATOR_ETAG);
    assert.equal(keptSource.last_modified, VALIDATOR_LAST_MODIFIED);
  });

  test('updateEditable drops validators for new URLs and removes absent sources', async () => {
    const existing = DEFAULT_APPSTREAM_SOURCES[0];
    await storeValidators(existing.url);

    const added = {
      url: 'https://example.com/dists/noble/main/dep11/Components-arm64.yml.gz',
      icon_url: 'https://example.com/dists/noble/main/dep11/icons-128x128.tar.gz',
      architecture: 'arm64',
    };
    const sources = [{ url: existing.url, icon_url: existing.icon_url, architecture: existing.architecture }, added];

    const first = await AppstreamSyncConfig.updateEditable({ sources, allowlist: [] });
    assert.equal(first.sources.length, 2);
    assert.equal(first.sources.find((candidate) => candidate.url === existing.url)?.etag, VALIDATOR_ETAG);
    const newSource = first.sources.find((candidate) => candidate.url === added.url)!;
    assert.equal(newSource.etag, undefined);
    assert.equal(newSource.last_modified, undefined);

    const second = await AppstreamSyncConfig.updateEditable({ sources: [added], allowlist: [] });
    assert.deepEqual(
      second.sources.map((candidate) => candidate.url),
      [added.url],
    );
  });
});
