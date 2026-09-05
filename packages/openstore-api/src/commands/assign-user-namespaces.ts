// SPDX-License-Identifier: AGPL-3.0-or-later
import 'db'; // Make sure the database connection gets setup
import { Types } from 'mongoose';

import { Package } from '../db/package';
import { ReservedNamespace } from '../db/reserved_namespace';
import { User } from '../db/user';

/**
 * Command to assign wildcard namespaces to users based on their existing packages
 * This handles app IDs in the format "app.namespace", resulting in "*.namespace" wildcard entries
 * Usage: npm run assign-namespaces -- [--dry-run] [--userId=abc123]
 */
async function assignUserNamespaces(args: string[]): Promise<void> {
  try {
    console.log('Starting namespace assignment');

    const dryRun = args.includes('--dry-run');
    if (dryRun) {
      console.log('Dry run mode - no changes will be made');
    }

    let targetUserId: string | undefined;
    for (const arg of args) {
      if (arg.startsWith('--userId=')) {
        targetUserId = arg.replace('--userId=', '');
        console.log(`Targeting specific user: ${targetUserId}`);
      }
    }

    const filters: Record<string, any> = {};
    if (targetUserId) {
      filters.maintainer = targetUserId;
    }
    const packages = await Package.findByFilters(filters, '', 0, 0, false);

    const packagesByMaintainer = new Map<string, string[]>();
    for (const pkg of packages) {
      const maintainerId = pkg.maintainer || '';
      if (!packagesByMaintainer.has(maintainerId)) {
        packagesByMaintainer.set(maintainerId, []);
      }
      packagesByMaintainer.get(maintainerId)!.push(pkg.id);
    }

    for (const [maintainerId, packageIds] of packagesByMaintainer.entries()) {
      const namespaces = extractNamespaces(packageIds);
      if (namespaces.length === 0) {
        continue;
      }

      if (!maintainerId) {
        console.warn(`Package maintainer ID is missing for packages: ${packageIds.join(', ')}, skipping`);
        continue;
      }

      const user = await User.findById(maintainerId);
      if (!user) {
        console.warn(`User ${maintainerId} not found, skipping`);
        continue;
      }

      console.log(`Processing user: ${user.name || user.username} (${maintainerId})`);
      console.log(`Found ${namespaces.length} namespaces: ${namespaces.join(', ')}`);

      if (!dryRun) {
        for (const namespace of namespaces) {
          const wildcardNamespace = `*.${namespace}`;

          const existing = await ReservedNamespace.findByNamespace(wildcardNamespace);
          if (existing) {
            console.log(`Namespace ${wildcardNamespace} is already reserved by user ${existing.owner_id.toString()}`);
            continue;
          }

          const reservedNamespace = new ReservedNamespace({
            namespace: wildcardNamespace,
            type: 'wildcard',
            owner_id: new Types.ObjectId(maintainerId),
          });

          await reservedNamespace.save();
          console.log(`Reserved namespace ${wildcardNamespace} for user ${user.name || user.username}`);
        }
      }

      console.log('Namespace assignment completed');
    }
  } catch (err) {
    console.error('Error assigning namespaces:', err);
    throw err;
  }
}

/**
 * Extracts potential namespaces from a list of package IDs
 * For example, for package ID "app.namespace", the namespace "namespace" would be extracted
 * Ignores any app ID that starts with "com.ubuntu.developer"
 */
function extractNamespaces(packageIds: string[]): string[] {
  const namespaces = new Set<string>();
  const tlds = ['com', 'net', 'org', 'io', 'dev', 'app', 'co'];

  for (const packageId of packageIds) {
    if (packageId.startsWith('com.ubuntu.developer')) {
      continue;
    }

    const parts = packageId.split('.');
    if (parts.length !== 2) {
      console.log(`Skipping ${packageId} (not exactly one dot)`);
      continue;
    }

    const namespace = parts[1];
    if (namespace.length < 3) {
      console.log(`Skipping namespace "${namespace}" (less than 3 characters)`);
      continue;
    }

    if (tlds.includes(namespace)) {
      console.log(`Skipping namespace "${namespace}" (common TLD)`);
      continue;
    }

    namespaces.add(namespace);
  }

  return Array.from(namespaces);
}

assignUserNamespaces(process.argv)
  .then(() => {
    console.log('done');
    process.exit(0);
  })
  .catch((err: Error) => {
    console.log(err);
    process.exit(1);
  });
