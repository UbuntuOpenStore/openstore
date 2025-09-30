import express, { type Request, type Response } from 'express';
import { Types } from 'mongoose';
import { ReservedNamespace } from '../../db/reserved_namespace';
import { User } from '../../db/user';
import { adminOnly, authenticate } from '../../middleware';
import { success, asyncErrorWrapper } from '../../utils';
import { NotFoundError, ValidationError } from '../../exceptions';

const router = express.Router();

/**
 * Get reserved namespaces, with optional userId filter
 * @route GET /api/v4/admin/namespaces
 */
router.get('/', authenticate, adminOnly, asyncErrorWrapper(async (req: Request, res: Response) => {
  const { userId } = req.query;
  let reservedNamespaces;

  if (userId && typeof userId === 'string') {
    reservedNamespaces = await ReservedNamespace.findByOwnerId(userId);
  }
  else {
    reservedNamespaces = await ReservedNamespace.findAll();
  }

  // Populate the owner information for each namespace
  const namespaceData = await Promise.all(reservedNamespaces.map(async (namespace) => {
    const owner = await User.findById(namespace.owner_id);
    const serialized = namespace.serialize();
    return {
      ...serialized,
      owner: owner ? owner.serialize(false, false) : null,
    };
  }));

  success(res, namespaceData);
}));

/**
 * Create a new reserved namespace
 * @route POST /api/v4/admin/namespaces
 */
router.post('/', authenticate, adminOnly, asyncErrorWrapper(async (req: Request, res: Response) => {
  const { namespace, type, ownerId } = req.body;

  if (!namespace) {
    throw new ValidationError('Namespace is required');
  }

  if (!type || !['exact', 'wildcard'].includes(type)) {
    throw new ValidationError('Type must be either "exact" or "wildcard"');
  }

  if (!ownerId) {
    throw new ValidationError('Owner ID is required');
  }

  const owner = await User.findById(ownerId);
  if (!owner) {
    throw new ValidationError('Owner not found');
  }

  const existingNamespace = await ReservedNamespace.findByNamespace(namespace);
  if (existingNamespace) {
    throw new ValidationError('The namespace is already reserved');
  }

  // Create the reserved namespace
  const reservedNamespace = new ReservedNamespace({
    namespace,
    type,
    owner_id: new Types.ObjectId(ownerId),
  });

  await reservedNamespace.save();

  success(res, {
    ...reservedNamespace.serialize(),
    owner: owner.serialize(false, false),
  });
}));

/**
 * Update a reserved namespace
 * @route PUT /api/v4/admin/namespaces/:id
 */
router.put('/:id', authenticate, adminOnly, asyncErrorWrapper(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { type, ownerId } = req.body;

  const reservedNamespace = await ReservedNamespace.findById(id);
  if (!reservedNamespace) {
    throw new NotFoundError('Reserved namespace not found');
  }

  if (type && ['exact', 'wildcard'].includes(type)) {
    reservedNamespace.type = type;
  }

  if (ownerId) {
    const owner = await User.findById(ownerId);
    if (!owner) {
      throw new ValidationError('Owner not found');
    }

    reservedNamespace.owner_id = new Types.ObjectId(ownerId);
  }

  await reservedNamespace.save();

  const owner = await User.findById(reservedNamespace.owner_id);

  success(res, {
    ...reservedNamespace.serialize(),
    owner: owner ? owner.serialize(false, false) : null,
  });
}));

/**
 * Delete a reserved namespace
 * @route DELETE /api/v4/admin/namespaces/:id
 */
router.delete('/:id', authenticate, adminOnly, asyncErrorWrapper(async (req: Request, res: Response) => {
  const { id } = req.params;

  const reservedNamespace = await ReservedNamespace.findByIdAndDelete(id);
  if (!reservedNamespace) {
    throw new NotFoundError('Reserved namespace not found');
  }

  success(res, { deleted: true });
}));

export default router;
