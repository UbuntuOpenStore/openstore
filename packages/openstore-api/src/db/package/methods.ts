// oxlint-disable typescript/no-unnecessary-condition

import { createHash } from 'crypto';
import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';

import { type Schema } from 'mongoose';
import { z } from 'zod';

import { UserError } from '../../exceptions';
import { sanitize, type ClickParserData, config, moveFile, sha512Checksum } from '../../utils';
import {
  getAppstreamLocalizedString,
  mapSpdxLicense,
  mapAppstreamCategory,
  extractAppstreamChangelogs,
} from '../../utils/appstream-helpers';
import * as clickParser from '../../utils/click-parser-async';
import { compressImage } from '../../utils/compress';
import { compareVersions, isValidVersion } from '../../utils/dpkg-compare-versions';
import {
  EXISTING_VERSION,
  INVALID_VERSION,
  MALFORMED_MANIFEST,
  MISMATCHED_FRAMEWORK,
  MISMATCHED_PERMISSIONS,
  NO_ALL,
  NO_NON_ALL,
  NON_ASCENDING_VERSION,
  UNSUPPORTED_SCREENSHOT_TYPE,
  WRONG_PACKAGE,
} from '../../utils/error-messages';
import { type HydratedRatingCount } from '../rating_count/types';
import { User } from '../user';
import {
  type PackageModel,
  Architecture,
  type AppType,
  type BodyUpdate,
  Channel,
  type SerializedRatings,
  type SerializedPackageSlim,
  type SerializedDownload,
  DEFAULT_CHANNEL,
  type SerializedPackage,
  type File,
  type ChannelArchitecture,
  type IPackage,
  type IPackageMethods,
  type HydratedPackage,
  type HydratedRevision,
  type ContentRating,
  PackageType,
} from './types';

/*
  The filesize is stored in kilobytes (from the click package
  https://gitlab.com/ubports/development/core/click/-/blob/main/click_package/build.py#L241
*/
const urlSchema = z.string().url();
function isURL(value: string): boolean {
  return urlSchema.safeParse(value).success;
}

function toBytes(filesizeKb: number) {
  return filesizeKb * 1024;
}

export function extractPathsFromClickData(data: ClickParserData): { readPaths: string[]; writePaths: string[] } {
  let writePaths: string[] = [];
  let readPaths: string[] = [];

  for (const app of data.apps) {
    if (Object.keys(app.apparmor).length > 0) {
      if (app.apparmor.write_path && Array.isArray(app.apparmor.write_path)) {
        writePaths = writePaths.concat(app.apparmor.write_path.map((p: string) => p.replace('/home/phablet', '~').replace('@{HOME}', '~')));
      }

      if (app.apparmor.read_path && Array.isArray(app.apparmor.read_path)) {
        readPaths = readPaths.concat(app.apparmor.read_path.map((p: string) => p.replace('/home/phablet', '~').replace('@{HOME}', '~')));
      }
    }
  }

  return { readPaths, writePaths };
}

export function serializeRatings(ratingCounts: HydratedRatingCount[]) {
  const ratings = {
    THUMBS_UP: 0,
    THUMBS_DOWN: 0,
    HAPPY: 0,
    NEUTRAL: 0,
    BUGGY: 0,
  };

  if (Array.isArray(ratingCounts)) {
    // eslint-disable-next-line no-restricted-syntax
    for (const r of ratingCounts) {
      ratings[r.name] = r.count;
    }
  }

  return ratings;
}

export function setupMethods(packageSchema: Schema<IPackage, PackageModel, IPackageMethods>) {
  packageSchema.method<HydratedPackage>(
    'getLatestRevision',
    function (channel: Channel, arch: Architecture, detectAll = true, frameworks?: string[], version?: string) {
      let architecture = arch;
      if (this.architectures.includes(Architecture.ALL) && detectAll) {
        architecture = Architecture.ALL;
      }

      let revisionData: HydratedRevision | null = null;
      let revisionIndex = -1;
      this.revisions.forEach((data, index) => {
        if (this.package_type === PackageType.SNAP && (data.snap_data?.grade !== 'stable' || data.snap_data?.risk !== 'stable')) {
          return;
        }

        let archCheck = data.architecture === architecture;
        if (data.architecture && data.architecture.includes(',')) {
          // Handle multi arch clicks
          archCheck = data.architecture.includes(architecture);
        }

        if (
          (!revisionData || revisionData.revision < data.revision) &&
          (!revisionData ||
            !isValidVersion(data.version) ||
            !isValidVersion(revisionData.version) ||
            compareVersions(revisionData.version, data.version) < 0) &&
          data.channel === channel &&
          (!arch || archCheck) &&
          (!frameworks || frameworks.length === 0 || frameworks.includes(data.framework)) &&
          (!version || version === data.version)
        ) {
          revisionData = data;
          revisionIndex = index;
        }
      });

      return { revisionData, revisionIndex };
    },
  );

  packageSchema.method<HydratedPackage>('updateFromClick', async function (data: ClickParserData) {
    const manifest = {
      architecture: data.architecture,
      description: data.description,
      framework: data.framework,
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      hooks: {} as { [key: string]: any },
      maintainer: data.maintainer,
      name: data.name,
      title: data.title,
      version: data.version,
    };

    let qmlImports: { module: string; version: string }[] = [];
    data.apps.forEach((app) => {
      const hook: { [key: string]: any } = {};

      if (Object.keys(app.apparmor).length > 0) {
        hook.apparmor = app.apparmor;
      }

      if (Object.keys(app.desktop).length > 0) {
        hook.desktop = app.desktop;
      }

      if (Object.keys(app.contentHub).length > 0) {
        hook['content-hub'] = app.contentHub;
      }

      if (Object.keys(app.urlDispatcher).length > 0) {
        hook.urls = app.urlDispatcher;
      }

      if (Object.keys(app.accountService).length > 0) {
        hook['account-application'] = app.accountService;
      }

      if (Object.keys(app.accountApplication).length > 0) {
        hook['account-service'] = app.accountApplication;
      }

      if (Object.keys(app.pushHelper).length > 0) {
        hook['push-helper'] = app.pushHelper;
      }

      if (Object.keys(app.webappProperties).length > 0) {
        hook['webapp-properties'] = app.webappProperties;
      }

      // Mongo will reject this if there are any `.`s
      manifest.hooks[app.name.replace(/\./g, '__')] = hook;

      qmlImports = qmlImports.concat(
        app.qmlImports.filter(
          (importData): importData is { module: string; version: string } => !!importData.module && !!importData.version,
        ),
      );
    });

    this.architecture = data.architecture;
    // this.author = data.maintainer; < No longer updating the author from the click because that can be faked
    this.id = data.name ?? '';
    this.manifest = manifest;
    this.types = this.type_override ? [this.type_override] : (data.types as AppType[]);
    this.languages = data.languages;
    this.qml_imports = qmlImports;

    // Don't overwrite the these if they already exists
    this.name = this.name ? this.name : (data.title ?? '');
    this.description = this.description ? this.description : sanitize(data.description);
    this.tagline = this.tagline ? this.tagline : sanitize(data.description);

    // Apply AppStream metainfo data if present — it is the source of truth for mapped fields
    if (data.appstream) {
      const as = data.appstream;

      const asName = getAppstreamLocalizedString(as.name);
      if (asName) {
        this.name = asName;
      }

      const asSummary = getAppstreamLocalizedString(as.summary);
      if (asSummary) {
        this.tagline = sanitize(asSummary);
      }

      const asDescription = getAppstreamLocalizedString(as.description);
      if (asDescription) {
        this.description = sanitize(asDescription);
      }

      const asKeywords = as.keywords
        .filter((k) => k.lang === 'en')
        .map((k) => k.text)
        .filter(Boolean);
      if (asKeywords.length > 0) {
        this.keywords = asKeywords;
      }

      const incomingUrls = as.screenshots.slice(0, 5).filter((url) => isURL(url));

      if (incomingUrls.length > 0) {
        const urlHashFor = (url: string) => createHash('sha256').update(url).digest('hex').slice(0, 16);

        // Partition existing screenshots: keep those matching an incoming URL's hash, delete the rest
        const keptScreenshots: string[] = [];
        const toDelete: string[] = [];
        for (const filename of this.screenshots) {
          if (incomingUrls.some((url) => filename.includes(`-screenshot-${urlHashFor(url)}`))) {
            keptScreenshots.push(filename);
          } else {
            toDelete.push(filename);
          }
        }

        await Promise.all(toDelete.map((filename) => fs.unlink(`${config.screenshot_dir}/${filename}`).catch(() => {})));

        // Download only URLs not already present by hash
        const urlsToDownload = incomingUrls.filter((url) => !keptScreenshots.some((f) => f.includes(`-screenshot-${urlHashFor(url)}`)));

        const downloadResults = await Promise.all(
          urlsToDownload.map(async (url: string) => {
            const urlHash = urlHashFor(url);
            try {
              const response = await fetch(url);
              if (!response.ok) {
                return null;
              }

              const contentType = response.headers.get('content-type') ?? '';
              const extMap: Record<string, string> = {
                'image/png': '.png',
                'image/jpeg': '.jpg',
                'image/webp': '.webp',
              };
              const ext = Object.entries(extMap).find(([mime]) => contentType.includes(mime))?.[1];
              if (!ext) {
                return null;
              }

              const tmpPath = path.join('/tmp', `${crypto.randomUUID()}${ext}`);
              await fs.writeFile(tmpPath, Buffer.from(await response.arrayBuffer()));

              const filename = `${this.id as string}-screenshot-${urlHash}${ext}`;
              await moveFile(tmpPath, `${config.screenshot_dir}/${filename}`);
              await compressImage(`${config.screenshot_dir}/${filename}`);
              return filename;
            } catch (err) {
              console.warn(`Failed to download AppStream screenshot ${url}:`, err);
              return null;
            }
          }),
        );

        // Assemble screenshots in original URL order
        const newScreenshots: string[] = [];
        for (const url of incomingUrls) {
          const urlHash = urlHashFor(url);
          const kept = keptScreenshots.find((f) => f.includes(`-screenshot-${urlHash}`));
          if (kept) {
            newScreenshots.push(kept);
          } else {
            const downloaded = downloadResults[urlsToDownload.indexOf(url)];
            if (downloaded) {
              newScreenshots.push(downloaded);
            }
          }
        }

        this.screenshots = newScreenshots;
      }

      const asChangelogs = extractAppstreamChangelogs(as);
      if (asChangelogs.length > 0) {
        this.version_changelogs = asChangelogs;
      }

      for (const url of as.urls) {
        if (url.type === 'homepage' && isURL(url.url)) {
          this.support_url = url.url;
        }
        if (url.type === 'donation' && isURL(url.url)) {
          this.donate_url = url.url;
        }
        if (url.type === 'translate' && isURL(url.url)) {
          this.translation_url = url.url;
        }
        if (url.type === 'vcs-browser' && isURL(url.url)) {
          this.source = url.url;
        }
      }

      if (as.project_license) {
        this.license = mapSpdxLicense(as.project_license);
      }

      if (as.categories.length > 0) {
        const mappedCategory = mapAppstreamCategory(as.categories);
        if (mappedCategory) {
          this.category = mappedCategory;
        }
      }
    }

    this.lomiri_compatible = true;
  });

  packageSchema.method<HydratedPackage>('updateVideoUrl', function (url: string) {
    let embedUrl = '';
    if (isURL(url)) {
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
        if (ytMatch) {
          embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
        }
      } else if (url.includes('vimeo.com')) {
        const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
        if (vimeoMatch) {
          embedUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
        }
      } else if (url.match(/^https?:\/\/[^/]+\/w\/[\w-]+/)) {
        // Peertube "watch" URLs, e.g. https://peer.tube/w/abcdefghijk
        const peertubeMatch = url.match(/^(https?:\/\/[^/]+)\/w\/([\w-]+)/);
        if (peertubeMatch) {
          embedUrl = `${peertubeMatch[1]}/videos/embed/${peertubeMatch[2]}`;
        }
      } else if (url.includes('/videos/embed/')) {
        // Peertube already-embedded URL
        embedUrl = url;
      } else if (url.includes('rumble.com/embed/')) {
        const rumbleEmbedMatch = url.match(/rumble\.com\/embed\/(v[\w]+)/);
        if (rumbleEmbedMatch) {
          embedUrl = `https://rumble.com/embed/${rumbleEmbedMatch[1]}/`;
        }
      } else if (url.includes('rumble.com')) {
        const rumbleMatch = url.match(/rumble\.com\/(?:[\w-]+-)?(v[\w]+)-?/);
        if (rumbleMatch) {
          embedUrl = `https://rumble.com/embed/${rumbleMatch[1]}/`;
        }
      }
    }

    this.video_url = embedUrl;
  });

  packageSchema.method<HydratedPackage>('updateFromBody', async function (body: BodyUpdate) {
    if (body.locked !== undefined) {
      this.locked = body.locked === 'true' || body.locked === 'on' || body.locked === true;
    }

    if (body.published !== undefined) {
      this.published = body.published === 'true' || body.published === 'on' || body.published === true;
    }

    if (!this.published_date && this.published) {
      this.published_date = new Date().toISOString();
      this.updated_date = new Date().toISOString();
    }

    this.name = body.name ? body.name : this.name;
    this.category = body.category ?? this.category;
    this.license = body.license ?? this.license;
    this.changelog = sanitize(body.changelog ?? this.changelog ?? '');

    if (body.version_changelogs) {
      try {
        const parsedChangelogs =
          typeof body.version_changelogs === 'string'
            ? (JSON.parse(body.version_changelogs) as Array<{ version: string; changelog: string }>)
            : body.version_changelogs;

        this.version_changelogs = parsedChangelogs
          .filter(({ version }) => isValidVersion(version))
          .map(({ version, changelog }) => ({ version, changelog: sanitize(changelog) }));
      } catch (err) {
        console.error('Failed to parse version_changelogs', err);
      }
    }

    this.description = sanitize(body.description ?? this.description ?? '');
    this.tagline = sanitize(body.tagline ?? this.tagline ?? '');

    this.source = isURL(body.source ?? '') || body.source === '' ? body.source : (this.source ?? '');
    this.support_url = isURL(body.support_url ?? '') || body.support_url === '' ? body.support_url : (this.support_url ?? '');
    this.donate_url = isURL(body.donate_url ?? '') || body.donate_url === '' ? body.donate_url : (this.donate_url ?? '');
    this.translation_url =
      isURL(body.translation_url ?? '') || body.translation_url === '' ? body.translation_url : (this.translation_url ?? '');
    this.updateVideoUrl(body.video_url ?? '');

    let updatedScreenshots: string[] = [];
    if (body.screenshots) {
      if (Array.isArray(body.screenshots)) {
        updatedScreenshots = body.screenshots;
      } else if (isURL(body.screenshots)) {
        // When there is just one screenshot in form data, it comes across like a single string
        updatedScreenshots = [body.screenshots];
      } else {
        updatedScreenshots = JSON.parse(body.screenshots);
      }
    }

    const regex = new RegExp(`${config.server.host}/screenshots/`, 'g');
    updatedScreenshots = updatedScreenshots.map((screenshot) => {
      return screenshot.replace(regex, '');
    });

    // Unlink the screenshot file if it gets removed
    // eslint-disable-next-line no-restricted-syntax
    for (const screenshot of this.screenshots) {
      const filename = screenshot.replace(regex, '');
      if (!updatedScreenshots.includes(filename)) {
        try {
          await fs.unlink(`${config.screenshot_dir}/${filename}`);
        } catch (error) {
          // Ignore errors if file doesn't exist or can't be removed
          console.warn(`Failed to remove screenshot ${filename}:`, error);
        }
      }
    }
    this.screenshots = updatedScreenshots;

    let keywords = body.keywords ?? [];
    if (!Array.isArray(keywords)) {
      keywords = keywords.split(',');
    }

    this.keywords = keywords.map((keyword) => keyword.trim());

    if (body.nsfw !== undefined) {
      this.nsfw = body.nsfw === 'true' || body.nsfw === 'on' || body.nsfw === true;
    }

    if (body.type_override !== undefined) {
      this.type_override = body.type_override;

      if (body.type_override) {
        this.types = [body.type_override];
      }
    }

    if (body.desktop_names_override !== undefined) {
      if (Array.isArray(body.desktop_names_override)) {
        this.desktop_names_override = body.desktop_names_override;
      } else if (typeof body.desktop_names_override === 'string') {
        // Handle comma-separated string or JSON string
        try {
          this.desktop_names_override = JSON.parse(body.desktop_names_override);
        } catch {
          this.desktop_names_override = body.desktop_names_override
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean);
        }
      }
    }

    if (body.maintainer !== undefined) {
      this.maintainer = body.maintainer;
    }

    if (this.maintainer) {
      const user = await User.findById(this.maintainer);
      if (user) {
        this.maintainer_name = user.name ? user.name : user.username;
        this.author = this.maintainer_name;
      }
    }
  });

  packageSchema.method<HydratedPackage>(
    'createNextRevision',
    function (
      version: string,
      channel: Channel,
      architecture: Architecture,
      framework: string,
      url: string,
      downloadSha512: string,
      installedSize: number,
      downloadSize: number,
      permissions: string[] = [],
      readPaths: string[] = [],
      writePaths: string[] = [],
      desktopNames: string[] = [],
      contentRating?: ContentRating,
    ) {
      this.revisions.push({
        revision: this.next_revision,
        version,
        downloads: 0,
        channel,
        download_url: url,
        download_sha512: downloadSha512,
        architecture,
        framework,
        filesize: installedSize,
        downloadSize,
        created_date: new Date().toISOString(),
        permissions,
        read_paths: readPaths,
        write_paths: writePaths,
        desktop_names: desktopNames,
        content_rating: contentRating,
      });

      this.updated_date = new Date().toISOString();
    },
  );

  packageSchema.method<HydratedPackage>(
    'updateRevision',
    function (
      revisionNumber: number,
      framework: string,
      url: string,
      downloadSha512: string,
      installedSize: number,
      downloadSize: number,
      permissions: string[] = [],
      readPaths: string[] = [],
      writePaths: string[] = [],
      desktopNames: string[] = [],
    ) {
      const revisionIndex = this.revisions.findIndex((rev) => rev.revision === revisionNumber);

      if (revisionIndex === -1) {
        throw new UserError(`Revision ${revisionNumber} not found`);
      }

      const revision = this.revisions[revisionIndex];
      revision.framework = framework;
      revision.download_url = url;
      revision.download_sha512 = downloadSha512;
      revision.filesize = installedSize;
      revision.downloadSize = downloadSize;
      revision.permissions = permissions;
      revision.read_paths = readPaths;
      revision.write_paths = writePaths;
      revision.desktop_names = desktopNames;
    },
  );

  packageSchema.method<HydratedPackage>('getClickFilePath', function (channel: Channel, arch: Architecture, version: string) {
    return path.join(config.data_dir, `${this.id as string}-${channel}-${arch}-${version}.click`);
  });

  packageSchema.method<HydratedPackage>('getIconFilePath', function (ext: string) {
    return path.join(config.icon_dir, `${this.id as string}${ext}`);
  });

  packageSchema.method<HydratedPackage>('getDownloadUrl', function (channel: Channel, arch: Architecture, version?: string) {
    let url: string = `${config.server.host}/api/v4/apps/${this.id as string}/download/${channel}/${arch}`;
    if (version) {
      url = `${url}/${version}`;
    }

    return url;
  });

  packageSchema.method<HydratedPackage>('serializeRatings', function (): SerializedRatings {
    return serializeRatings(this.rating_counts);
  });

  packageSchema.method<HydratedPackage>('serializeSlim', function (): SerializedPackageSlim {
    /*
      Data used by the app:
      - https://gitlab.com/theopenstore/openstore-app/-/blob/master/src/models/searchmodel.cpp#L158-163
      - id
      - name
      - tagline
      - icon
      - types
      - ratings

      Data used by the web:
      - https://gitlab.com/theopenstore/openstore-web/-/blob/master/src/views/Browse.vue
      - icon
      - name
      - ratings
      - id
      - nsfw
      - tagline
      - types
    */

    return {
      architectures: this.architectures || [],
      publisher: this.author || '',
      publisher_id: this.maintainer || '',
      name: this.name || '',
      id: this.id || '',
      category: this.category || '',
      channels: this.channels || [],
      description: this.description || '',
      icon: this.icon_url,
      keywords: this.keywords || [],
      license: this.license || 'Proprietary',
      nsfw: !!this.nsfw,
      published_date: this.published_date || '',
      tagline: this.tagline || '',
      types: this.types || [],
      updated_date: this.updated_date || '',
      ratings: this.serializeRatings(),
      package_type: this.package_type,
      source_store: this.source_store,

      // Deprecated, remove in the next major version
      framework: '',
      author: this.author || '',
    };
  });

  /*
    Fields used by the app:
    - https://gitlab.com/theopenstore/openstore-app/-/blob/master/src/package.cpp#L112-188
    Fields used by the web:
    - https://gitlab.com/theopenstore/openstore-web/-/blob/master/src/views/ManagePackage.vue
    - https://gitlab.com/theopenstore/openstore-web/-/blob/master/src/views/Package.vue
  */
  packageSchema.method<HydratedPackage>(
    'serialize',
    function (
      architecture: Architecture = Architecture.ARMHF,
      channel: Channel = DEFAULT_CHANNEL,
      frameworks: string[] = [],
      apiVersion = 4,
      fullChangelog = false,
    ): SerializedPackage {
      // Clean up languages that got screwed up by click-parser
      let languages = this.languages ? this.languages.sort() : [];
      languages = languages.map((language) => {
        let cleanLanguage = language;
        if (language.includes('/')) {
          const split = language.split('/');
          cleanLanguage = split[split.length - 1];
        }

        return cleanLanguage;
      });

      let defaultChannel = channel;
      if (!this.channels.includes(defaultChannel) && this.channels.length > 0) {
        defaultChannel = this.channels[0];
      }

      const { revisionData } = this.getLatestRevision(defaultChannel, this.architectures.includes(architecture) ? architecture : undefined);
      const installedSize = revisionData ? toBytes(revisionData.filesize) : 0;

      const revisions = (this.revisions || [])
        .map((rData) => {
          if (!Object.values(Architecture).includes(rData.architecture)) {
            return null; // Filter out unsupported arches like i386 (legacy apps)
          }

          const revision = {
            // oxlint-disable-next-line typescript/no-misused-spread
            ...rData.toObject(),
            _id: undefined,
            download_url: rData.download_url ? this.getDownloadUrl(rData.channel, rData.architecture, rData.version) : null,
            installedSize: toBytes(rData.filesize),
            downloadSize: rData.downloadSize ?? 0,
            architecture: rData.architecture ?? 'armhf',
            snap_data: rData.snap_data?.grade
              ? {
                  grade: rData.snap_data.grade,
                  risk: rData.snap_data.risk,
                }
              : undefined,

            // deprecated, remove in next version of the api
            filesize: toBytes(rData.filesize),
          };

          delete revision._id;
          return revision;
        })
        .filter((revision) => !!revision);

      const originalManifest = this.manifest || {};
      const { hooks: _hooks, ...manifestWithoutHooks } = originalManifest;
      const manifest = { ...manifestWithoutHooks, hooks: {} };
      for (const [key, value] of Object.entries(originalManifest.hooks ?? {})) {
        // @ts-ignore
        manifest.hooks[key.replace(/__/g, '.')] = value;
      }

      let changelog = this.changelog || '';
      if (!fullChangelog && this.version_changelogs && this.version_changelogs.length > 0) {
        if (revisionData) {
          const found = this.version_changelogs.find((vc) => vc.version === revisionData.version);
          if (found) {
            changelog = found.changelog;
          } else {
            changelog = '';
          }
        }
      }

      let desktopNames = revisionData ? (revisionData.desktop_names ?? []) : [];
      if (this.desktop_names_override && this.desktop_names_override.length > 0) {
        desktopNames = this.desktop_names_override;
      }

      const json = {
        architectures: this.architectures.filter((arch) => Object.values(Architecture).includes(arch)) || [],
        category: this.category || '',
        changelog,
        version_changelogs: fullChangelog
          ? (this.version_changelogs || []).slice().sort((a, b) => -1 * compareVersions(a.version, b.version))
          : (this.version_changelogs || [])
              .slice()
              .sort((a, b) => -1 * compareVersions(a.version, b.version))
              .slice(0, 5),
        channels: this.channels || [DEFAULT_CHANNEL],
        channel_architectures: this.channel_architectures || [],
        device_compatibilities: this.device_compatibilities || [],
        description: this.description || '',
        downloads: [] as SerializedDownload[],
        icon: this.icon_url,
        banner: this.banner_url,
        id: this.id || '',
        keywords: this.keywords || [],
        license: this.license || 'Proprietary',
        maintainer_name: this.maintainer_name || null,
        maintainer: this.maintainer || null,
        manifest,
        name: this.name || '',
        nsfw: !!this.nsfw,
        published_date: this.published_date || '',
        published: !!this.published,
        locked: !!this.locked,
        screenshots: this.screenshots.map((file) => {
          // For snap packages, screenshots are already external URLs
          if (this.package_type === PackageType.SNAP) {
            return file;
          }
          return `${config.server.host}/screenshots/${file}`;
        }),
        source: this.source || '',
        support_url: this.support_url || '',
        donate_url: this.donate_url || '',
        video_url: this.video_url || '',
        translation_url: this.translation_url || '',
        tagline: this.tagline || '',
        types: this.types || [],
        updated_date: this.updated_date || '',
        languages,
        revisions,
        totalDownloads: 0,
        latestDownloads: 0,
        version: revisionData ? revisionData.version : '',
        ratings: this.serializeRatings(),
        type_override: this.type_override || '',
        calculated_rating: this.calculated_rating || 0,
        publisher: this.author || '',
        publisher_id: this.maintainer || '',
        review_exceptions: this.review_exceptions ?? [],
        permissions: revisionData ? (revisionData.permissions ?? []) : [],
        read_paths: revisionData ? (revisionData.read_paths ?? []) : [],
        write_paths: revisionData ? (revisionData.write_paths ?? []) : [],
        content_rating: revisionData?.content_rating
          ? {
              type: revisionData.content_rating.type || '',
              content_attributes: revisionData.content_rating.content_attributes || [],
            }
          : undefined,
        desktop_names: desktopNames,
        package_type: this.package_type,
        source_store: this.source_store,
        snap_data: this.snap_data
          ? {
              channels: this.snap_data.channels,
              confinement: this.snap_data.confinement,
              base: this.snap_data.base,
            }
          : undefined,

        // Deprecated, remove in the next major version
        author: this.author || '',
        architecture: '',
        framework: '',
        revision: -1,
        download: null,
        download_sha512: '',
        filesize: installedSize,
      };

      if (this.revisions) {
        const jsonDownloads = Object.values(Channel)
          .reduce<(SerializedDownload | null)[]>((downloads: (SerializedDownload | null)[], channel: Channel) => {
            return [
              ...downloads,
              ...this.architectures.map((arch) => {
                if (!Object.values(Architecture).includes(arch)) {
                  return null; // Filter out unsupported arches like i386 (legacy apps)
                }
                const { revisionData: downloadRevisionData } = this.getLatestRevision(channel, arch, false, frameworks);
                if (downloadRevisionData) {
                  const download = {
                    ...downloadRevisionData.toObject(),
                    _id: undefined,
                    architecture: downloadRevisionData.architecture.includes(',') ? arch : downloadRevisionData.architecture,
                    download_url: downloadRevisionData.download_url
                      ? this.getDownloadUrl(channel, arch, downloadRevisionData.version)
                      : null,
                    installedSize: toBytes(downloadRevisionData.filesize),
                    downloadSize: downloadRevisionData.downloadSize ?? 0,
                    snap_data: downloadRevisionData.snap_data?.grade
                      ? {
                          grade: downloadRevisionData.snap_data.grade,
                          risk: downloadRevisionData.snap_data.risk,
                        }
                      : undefined,

                    // deprecated, remove in next version of the api
                    filesize: toBytes(downloadRevisionData.filesize),
                  };
                  delete download._id;
                  return download;
                }
                return null;
              }),
            ];
          }, [])
          .filter((revision) => {
            return revision && (this.package_type === PackageType.SNAP || revision.download_url);
          }) as SerializedDownload[];

        jsonDownloads.sort((a, b) => {
          // Sort xenial to the bottom
          if (a.channel !== b.channel) {
            if (b.channel === Channel.XENIAL) {
              return -1;
            }

            return 1;
          }

          // Make sure the current architecture is last to not break old versions of the app
          if (a.architecture === architecture) {
            return 1;
          }
          if (b.architecture === architecture) {
            return -1;
          }

          return 0;
        });

        if (apiVersion === 3) {
          json.downloads = jsonDownloads.filter(
            (download) => download.architecture === architecture || download.architecture === Architecture.ALL,
          );
        } else {
          json.downloads = jsonDownloads;
        }

        const latestDownloads = jsonDownloads.filter((download) => download.channel === channel);
        for (const download of latestDownloads) {
          json.latestDownloads += download.downloads;
        }

        this.revisions.forEach((revision) => {
          json.totalDownloads += revision.downloads;
        });
      }

      return json;
    },
  );

  packageSchema.method<HydratedPackage>('updateScreenshotFiles', async function (screenshotFiles: File[]) {
    // Clear out the uploaded files that are over the limit
    let screenshotLimit = 5 - this.screenshots.length;
    if (screenshotFiles.length < screenshotLimit) {
      screenshotLimit = screenshotFiles.length;
    }

    if (screenshotFiles.length > screenshotLimit) {
      for (let i = screenshotLimit; i < screenshotFiles.length; i++) {
        try {
          await fs.unlink(screenshotFiles[i].path);
        } catch (error) {
          // Ignore errors if file doesn't exist or can't be removed
          console.warn(`Failed to remove screenshot ${screenshotFiles[i].path}:`, error);
        }
      }
    }

    for (let i = 0; i < screenshotLimit; i++) {
      const file = screenshotFiles[i];

      const ext = path.extname(file.originalname);
      if (!['.png', '.jpg', '.jpeg', '.svg'].includes(ext)) {
        try {
          await fs.unlink(file.path);
        } catch (error) {
          // Ignore errors if file doesn't exist or can't be removed
          console.warn(`Failed to remove screenshot ${file.path}:`, error);
        }
        throw new UserError(UNSUPPORTED_SCREENSHOT_TYPE);
      } else {
        const id = crypto.randomUUID();
        const filename = `${this.id as string}-screenshot-${id}${ext}`;

        await moveFile(screenshotFiles[i].path, `${config.screenshot_dir}/${filename}`);
        await compressImage(`${config.screenshot_dir}/${filename}`);

        this.screenshots.push(filename);
      }
    }
  });

  packageSchema.method<HydratedPackage>('updateBannerFile', async function (bannerFile: File) {
    const ext = path.extname(bannerFile.originalname).toLowerCase();

    if (ext !== '.svg') {
      await fs.unlink(bannerFile.path);
      return false;
    }

    if (this.banner) {
      try {
        await fs.unlink(`${config.banner_dir}/${this.banner}`);
      } catch {
        // Ignore errors if file doesn't exist
      }
    }

    const filename = `${this.id as string}-banner-${crypto.randomUUID()}${ext}`;

    await moveFile(bannerFile.path, `${config.banner_dir}/${filename}`);
    await compressImage(`${config.banner_dir}/${filename}`);

    this.banner = filename;
    return true;
  });

  packageSchema.method<HydratedPackage>('createRevisionFromClick', async function (filePath: string, channel: Channel, changelog?: string) {
    const parseData = await clickParser.parseClickPackage(filePath, true);
    const { version } = parseData;
    const architecture = parseData.architecture as Architecture;
    if (!parseData.name || !version || !architecture) {
      throw new UserError(MALFORMED_MANIFEST);
    }

    if (parseData.name !== this.id) {
      throw new UserError(WRONG_PACKAGE);
    }

    if (!isValidVersion(version)) {
      throw new UserError(INVALID_VERSION);
    }

    if (this.revisions) {
      // Check for existing revisions (for this channel) with the same version string
      const matches = this.revisions.find((revision) => {
        return revision.version === version && revision.channel === channel && revision.architecture === architecture;
      });
      if (matches) {
        throw new UserError(EXISTING_VERSION);
      }

      // Check for strictly increasing version for same channel, framework, and architecture
      const sameGroup = this.revisions.filter(
        (rev) => rev.channel === channel && rev.architecture === architecture && rev.framework === parseData.framework,
      );
      if (sameGroup.length > 0) {
        const latest = sameGroup[sameGroup.length - 1];
        if (isValidVersion(latest.version) && compareVersions(version, latest.version) <= 0) {
          throw new UserError(NON_ASCENDING_VERSION);
        }
      }

      const currentRevisions = this.revisions.filter((rev) => rev.version === version && rev.channel === channel);
      if (currentRevisions.length > 0) {
        const currentArches = currentRevisions.map((rev) => rev.architecture);
        if (architecture === Architecture.ALL && !currentArches.includes(Architecture.ALL)) {
          throw new UserError(NO_ALL);
        }
        if (architecture !== Architecture.ALL && currentArches.includes(Architecture.ALL)) {
          throw new UserError(NO_NON_ALL);
        }

        if (parseData.framework !== currentRevisions[0].framework) {
          throw new UserError(MISMATCHED_FRAMEWORK);
        }

        const permissions = currentRevisions[0].permissions ?? [];
        if (permissions.length > 0 && parseData.permissions.filter((p) => !permissions.includes(p)).length > 0) {
          throw new UserError(MISMATCHED_PERMISSIONS);
        }
      }
    }

    const downloadSha512 = await sha512Checksum(filePath);
    const downloadSize = (await fs.stat(filePath)).size;

    // Only update the data from the parsed click if it's for the default channel or if it's the first one
    if (channel === DEFAULT_CHANNEL || this.revisions.length === 0) {
      await this.updateFromClick(parseData);
    }

    const { readPaths, writePaths } = extractPathsFromClickData(parseData);

    let contentRating: ContentRating | undefined;
    if (parseData.appstream?.content_rating) {
      const cr = parseData.appstream.content_rating;
      if (cr.type === 'oars-1.0' || cr.type === 'oars-1.1') {
        contentRating = {
          type: cr.type,
          content_attributes: cr.content_attributes ?? [],
        };
      }
    }

    const localFilePath = this.getClickFilePath(channel, architecture, version);
    await fs.copyFile(filePath, localFilePath);
    await fs.unlink(filePath);

    this.createNextRevision(
      version,
      channel,
      architecture,
      parseData.framework ?? '',
      localFilePath,
      downloadSha512,
      parseData.installedSize ?? 0,
      downloadSize,
      parseData.permissions,
      readPaths,
      writePaths,
      parseData.apps.filter((app) => app.type === 'app').map((app) => app.name),
      contentRating,
    );

    if (parseData.icon) {
      const ext = path.extname(parseData.icon).toLowerCase();
      if (['.png', '.jpg', '.jpeg', '.svg'].includes(ext)) {
        // Remove the existing icon file if it has a different extension
        if (this.icon) {
          const oldExt = path.extname(this.icon).toLowerCase();
          if (oldExt !== ext && existsSync(this.icon)) {
            try {
              await fs.unlink(this.icon);
            } catch (err) {
              // Ignore errors if file doesn't exist or can't be removed
              console.warn(`Failed to remove old icon ${this.icon}:`, err);
            }
          }
        }

        const localIconPath = this.getIconFilePath(ext);
        await fs.copyFile(parseData.icon, localIconPath);
        await compressImage(localIconPath);

        this.icon = localIconPath;
      }

      await fs.unlink(parseData.icon);
    }

    if (changelog) {
      const updatedChangelog = this.changelog ? `${changelog.trim()}\n\n${this.changelog}` : changelog.trim();
      this.changelog = sanitize(updatedChangelog);

      if (!this.version_changelogs) {
        this.version_changelogs = [];
      }

      const found = this.version_changelogs.find((vc) => vc.version === version);
      if (found) {
        found.changelog = sanitize(changelog.trim());
      } else {
        this.version_changelogs.push({ version, changelog: sanitize(changelog.trim()) });
      }
    }

    if (!this.channels.includes(channel)) {
      this.channels.push(channel);
    }

    if (this.architectures.includes(Architecture.ALL) && architecture !== Architecture.ALL) {
      this.architectures = [architecture];
    } else if (!this.architectures.includes(Architecture.ALL) && architecture === Architecture.ALL) {
      this.architectures = [Architecture.ALL];
    } else if (!this.architectures.includes(architecture)) {
      this.architectures.push(architecture);
    }
  });

  packageSchema.method<HydratedPackage>('updateCalculatedProperties', async function () {
    this.channel_architectures = this.channels
      .flatMap((channel) => {
        return this.architectures.map((arch) => {
          const { revisionData } = this.getLatestRevision(channel, arch, false);

          return revisionData ? `${channel}:${arch}` : undefined;
        });
      })
      .filter(Boolean) as ChannelArchitecture[];

    const deviceCompatibilities = new Set<string>();
    this.revisions.forEach((revision) => {
      // Only include clicks where the file is still present
      if (revision.download_url) {
        deviceCompatibilities.add(`${revision.channel}:${revision.architecture}:${revision.framework}`);
      }
    });

    this.device_compatibilities = Array.from(deviceCompatibilities);
  });
}
