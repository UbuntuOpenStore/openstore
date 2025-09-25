import { type Document, type Model, type Types, type HydratedDocument } from 'mongoose';

export interface IReservedNamespace extends Document {
  namespace: string;
  type: 'exact' | 'wildcard';
  owner_id: Types.ObjectId;
}

export interface IReservedNamespaceMethods {
  serialize: () => Record<string, any>;
}

export interface ReservedNamespaceModel extends Model<IReservedNamespace, Record<string, unknown>, IReservedNamespaceMethods> {
  findByNamespace: (namespace: string) => Promise<HydratedReservedNamespace | null>;
  findAll: () => Promise<HydratedReservedNamespace[]>;
  findByOwnerId: (ownerId: string) => Promise<HydratedReservedNamespace[]>;
  isPackageIdReserved: (packageId: string, userId?: string) => Promise<boolean>;
}

export type HydratedReservedNamespace = HydratedDocument<IReservedNamespace, IReservedNamespaceMethods>;

export type ReservedNamespaceCreationData = {
  namespace: string;
  type: 'exact' | 'wildcard';
  owner_id: string;
};

export type ReservedNamespaceUpdateData = Partial<Omit<ReservedNamespaceCreationData, 'namespace'>>;
