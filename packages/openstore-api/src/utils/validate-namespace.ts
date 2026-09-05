// SPDX-License-Identifier: AGPL-3.0-or-later
import { ReservedNamespace } from '../db/reserved_namespace';
import { AuthorizationError } from '../exceptions';

/**
 * Validates if a package ID is reserved and if the user has permission to use it.
 * Throws an AuthorizationError if the package ID is reserved and the user is not an admin or the namespace owner.
 *
 * @param packageId The package ID to validate
 * @param userId The ID of the user trying to use the package ID
 * @param isAdmin Whether the user is an admin
 * @throws {AuthorizationError} If the package ID is reserved and the user is not the owner or an admin
 */
export async function validateNamespace(packageId: string, userId: string, isAdmin: boolean): Promise<void> {
  // Admin users can use any namespace
  if (isAdmin) {
    return;
  }

  const reserved = await ReservedNamespace.isPackageIdReserved(packageId, userId);
  if (reserved) {
    const errorMessage = `The package ID "${packageId}" is reserved by another user. Please use a different package ID.`;
    throw new AuthorizationError(errorMessage);
  }
}
