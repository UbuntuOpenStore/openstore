import { Schema, model } from 'mongoose';
import { type IReservedNamespace, type IReservedNamespaceMethods, type ReservedNamespaceModel } from './types';

const reservedNamespaceSchema = new Schema<IReservedNamespace, ReservedNamespaceModel, IReservedNamespaceMethods>({
  namespace: { type: String, required: true, unique: true, index: true },
  type: { type: String, required: true, enum: ['exact', 'wildcard'] },
  owner_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});

reservedNamespaceSchema.method('serialize', function () {
  return {
    id: this._id.toString(),
    namespace: this.namespace,
    type: this.type,
    owner_id: this.owner_id,
  };
});

reservedNamespaceSchema.static('findByNamespace', async function (namespace: string) {
  return await this.findOne({ namespace });
});

reservedNamespaceSchema.static('findAll', async function () {
  return await this.find({}).sort({ namespace: 1 });
});

reservedNamespaceSchema.static('findByOwnerId', async function (ownerId: string) {
  return await this.find({ owner_id: ownerId }).sort({ namespace: 1 });
});

reservedNamespaceSchema.static('isPackageIdReserved', async function (packageId: string, userId?: string) {
  // First check for exact matches
  const exactMatch = await this.findOne({ namespace: packageId, type: 'exact' }).exec();
  if (exactMatch) {
    const isOwner = userId && exactMatch.owner_id.toString() === userId;

    return !isOwner;
  }

  // Check for wildcard matches
  // If packageId is "app.sub.example", we need to check if "*.example" or "*.sub.example" is reserved
  const parts = packageId.split('.');
  const wildcardPatterns = [];

  // Generate all possible wildcard patterns that could match this package ID
  for (let i = 1; i < parts.length; i++) {
    const domain = parts.slice(i).join('.');
    wildcardPatterns.push(`*.${domain}`);
  }

  if (wildcardPatterns.length > 0) {
    const wildcardMatch = await this.findOne({
      namespace: { $in: wildcardPatterns },
      type: 'wildcard',
    }).exec();

    if (wildcardMatch) {
      // Package ID is reserved by a wildcard match
      // Check if the current user is the owner by comparing IDs directly
      const isOwner = userId && wildcardMatch.owner_id.toString() === userId;

      return !isOwner;
    }
  }

  return false;
});

export const ReservedNamespace = model<IReservedNamespace, ReservedNamespaceModel>(
  'ReservedNamespace',
  reservedNamespaceSchema,
);
