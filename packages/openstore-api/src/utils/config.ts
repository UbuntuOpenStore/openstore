import path from 'path';

import { PackageType } from '../db/package/types';

let configuration = {
  data_dir: process.env.DATA_DIR || './.data/clicks',
  screenshot_dir: process.env.IMAGE_DIR || './.data/screenshots',
  icon_dir: process.env.ICON_DIR || './.data/icons',
  avatar_dir: process.env.AVATAR_DIR || './.data/avatars',
  banner_dir: process.env.BANNER_DIR || './.data/banners',
  cache_dir: process.env.CACHE_DIR || './.data/cache',
  allowed_package_types: (process.env.ALLOWED_PACKAGE_TYPES || PackageType.CLICK).split(',').filter(Boolean) as PackageType[],
  server: {
    ip: process.env.NODEJS_IP || '0.0.0.0',
    port: parseInt(process.env.PORT || process.env.NODEJS_PORT || '6543', 10),
    session_secret: process.env.SESSION_SECRET || 'openstore',
    host: process.env.HOST || 'http://local.open-store.io',
    domain: (process.env.HOST || 'http://local.open-store.io').replace('http://', '').replace('https://', ''),
    process_limit: parseInt(process.env.PROCESS_LIMIT || '1', 10),
    static_root: process.env.STATIC_ROOT || path.join(__dirname, '../../www/'),
  },
  mongo: {
    uri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
    database: process.env.MONGODB_DB || 'openstore',
  },
  meilisearch: {
    uri: process.env.MEILISEARCH_URI || 'http://127.0.0.1:7700/',
    apiKey: process.env.MEILISEARCH_API_KEY || 'masterKey',
    indexPrefix: process.env.MEILISEARCH_INDEX_PREFIX || 'openstore_',
  },
  clickreview: {
    command: process.env.CLICK_REVIEW_COMMAND || 'click-review',
    pythonpath: process.env.CLICK_REVIEW_PYTHONPATH || '',
  },
  github: {
    clientID: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
  },
  gitlab: {
    clientID: process.env.GITLAB_CLIENT_ID || '',
    clientSecret: process.env.GITLAB_CLIENT_SECRET || '',
  },
  sentry: process.env.SENTRY_URL || '',
  version: process.env.VERSION || 'dev',
  telegram: process.env.TELEGRAM || '',
};

if (process.env.NODE_ENV === 'testing') {
  configuration = {
    ...configuration,
    data_dir: '/tmp',
    screenshot_dir: '/tmp',
    icon_dir: '/tmp',
    avatar_dir: '/tmp',
    banner_dir: '/tmp',
    cache_dir: '/tmp/.cache',
    mongo: {
      uri: 'mongodb://127.0.0.1:27017',
      database: process.env.SNAPSHOT_TEST === 'true' ? 'openstore' : 'openstore-test',
    },
    server: {
      ...configuration.server,
      host: process.env.SNAPSHOT_TEST === 'true' ? 'https://open-store.io' : configuration.server.host,
      port: 8888,
    },
    meilisearch: {
      uri: 'http://127.0.0.1:7700/',
      apiKey: 'masterKey',
      indexPrefix: process.env.SNAPSHOT_TEST === 'true' ? 'openstore_' : 'openstore_test_',
    },
  };
}

export const config = configuration;
