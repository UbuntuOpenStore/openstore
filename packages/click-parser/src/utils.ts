// SPDX-License-Identifier: AGPL-3.0-or-later
import { execFile } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';

// Cap stdout buffer at 1 GiB
const MAX_BUFFER = 1024 * 1024 * 1024;

export function execFileAsync(
  file: string,
  args: readonly string[] | null,
  options: Record<string, unknown>,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (err, stdout, stderr) => {
      if (err) {
        return reject(err);
      }
      resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
    });
  });
}

export function stripLeading(name: string): string {
  return name.replace(/^\.\//, '');
}

interface TarListing {
  files: string[]; // raw tar entries (with leading "./" and trailing slashes for dirs)
  hasWebappProperties: boolean;
  qmlFiles: string[];
  metainfoFile?: string;
  moLanguages: Set<string>;
}

/**
 * Run a command inside a bubblewrap sandbox. The host root filesystem is
 * bind-mounted read-only, /dev and /proc are isolated, /tmp is a fresh
 * tmpfs, and the work dir is bind-mounted read-write, so the command's only
 * writable surface on the host is the work dir. Requires `bwrap`
 * (bubblewrap) on PATH.
 *
 * Order matters: --tmpfs /tmp must come before --bind workDir, otherwise
 * the tmpfs shadows the workdir mount.
 */
export async function runInSandbox(cmd: string, args: string[], workDir: string, execOpts: Record<string, unknown> = {}) {
  return execFileAsync(
    'bwrap',
    [
      '--ro-bind',
      '/',
      '/',
      '--dev',
      '/dev',
      '--proc',
      '/proc',
      '--tmpfs',
      '/tmp',
      '--bind',
      workDir,
      workDir,
      '--unshare-all',
      '--die-with-parent',
      '--',
      cmd,
      ...args,
    ],
    { cwd: workDir, maxBuffer: MAX_BUFFER, ...execOpts },
  );
}

export async function listDataTarGz(cwd: string, execOpts: Record<string, unknown> = {}): Promise<TarListing> {
  const { stdout } = await runInSandbox('tar', ['-tzf', 'data.tar.gz'], cwd, execOpts);

  const listing: TarListing = {
    files: [],
    hasWebappProperties: false,
    qmlFiles: [],
    metainfoFile: undefined,
    moLanguages: new Set(),
  };

  for (const raw of stdout.split('\n')) {
    const line = raw.trim();
    if (!line) {
      continue;
    }

    listing.files.push(line);

    if (line === './webapp-properties.json') {
      listing.hasWebappProperties = true;
    } else if (line.endsWith('.qml')) {
      listing.qmlFiles.push(line);
    } else if (
      !listing.metainfoFile &&
      (line.startsWith('./usr/share/metainfo/') || line.startsWith('./usr/share/appdata/')) &&
      (line.endsWith('.metainfo.xml') || line.endsWith('.appdata.xml'))
    ) {
      listing.metainfoFile = line;
    } else if (line.includes('LC_MESSAGES') && line.includes('.mo')) {
      const parts = line.split('/');
      const pos = parts.indexOf('LC_MESSAGES');
      if (pos >= 1) {
        const lang = parts[pos - 1].trim();
        if (lang) {
          listing.moLanguages.add(lang);
        }
      }
    }
  }

  return listing;
}

export function isPathSafe(member: string): boolean {
  return !member.split('/').includes('..');
}

/**
 * Read an extracted member only if it is a regular file. Archive members that
 * tar materialized as symlinks (or devices, fifos, etc.) must never be read:
 * a hostile click package could point a symlink at an arbitrary host file and
 * readFile would happily follow it, exfiltrating content the parser process
 * can read (exposed via ParsedData/icon). lstat does not follow symlinks, so
 * this rejects the member instead.
 */
export async function readFileRegular(filePath: string): Promise<Buffer> {
  const stat = await lstat(filePath);
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to read symbolic link: ${filePath}`);
  }

  if (!stat.isFile()) {
    throw new Error(`Refusing to read non-regular file: ${filePath}`);
  }

  return readFile(filePath);
}

export async function extractFiles(cwd: string, members: string[]): Promise<void> {
  if (members.length === 0) {
    return;
  }
  for (const member of members) {
    if (!isPathSafe(member)) {
      throw new Error(`Unsafe path in tar archive: ${member}`);
    }
  }

  await runInSandbox('tar', ['-xzf', 'data.tar.gz', ...members], cwd);
}

export async function extractOne(cwd: string, member: string): Promise<void> {
  return extractFiles(cwd, [member]);
}
