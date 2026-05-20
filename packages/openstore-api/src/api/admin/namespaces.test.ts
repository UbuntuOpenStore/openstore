import { strictEqual } from 'node:assert/strict';
import { beforeEach, before, after, describe, it } from 'node:test';

import mongoose from 'mongoose';
import request from 'supertest';
import { type App } from 'supertest/types';

import * as api from '..';
import { ReservedNamespace } from '../../db/reserved_namespace';
import { User } from '../../db/user';
import { type TestUser } from '../../tests/factory';
import { cleanMongoose, closeMongoose, waitForMongoose } from '../../tests/utils';

describe('Reserved Namespace API', () => {
  let app: App;
  let adminUser: TestUser;
  let normalUser: TestUser;
  let namespaceOwnerId: string;

  before(async () => {
    await waitForMongoose();

    app = api.setup();
  });

  after(async () => {
    await closeMongoose();
  });

  beforeEach(async () => {
    await cleanMongoose();

    normalUser = new User({
      username: 'normie',
      name: 'Normal User',
      email: 'normal@example.com',
      role: 'community',
      apikey: 'normal-api-key',
    });
    await normalUser.save();

    adminUser = new User({
      username: 'admin',
      name: 'Admin User',
      email: 'admin@example.com',
      role: 'admin',
      apikey: 'admin-api-key',
    });
    await adminUser.save();

    namespaceOwnerId = normalUser._id.toString();
  });

  describe('GET /api/v4/admin/namespaces', () => {
    it('should return 403 for non-admin users', async () => {
      const response = await request(app).get(`/api/v4/admin/namespaces?apikey=${normalUser.apikey}`).expect(403);
      strictEqual(response.body.success, false);
    });

    it('should return empty array when no namespaces exist', async () => {
      const response = await request(app).get(`/api/v4/admin/namespaces?apikey=${adminUser.apikey}`).expect(200);

      strictEqual(response.body.success, true);
      strictEqual(Array.isArray(response.body.data), true);
      strictEqual(response.body.data.length, 0);
    });

    it('should return all namespaces with owner info', async () => {
      const namespace = new ReservedNamespace({
        namespace: '*.namespace',
        type: 'wildcard',
        owner_id: new mongoose.Types.ObjectId(namespaceOwnerId),
      });
      await namespace.save();

      // Create another namespace with a different owner
      const otherUser = new User({
        username: 'other',
        name: 'Other User',
        email: 'other@example.com',
        role: 'community',
        apikey: 'other-api-key',
      });
      await otherUser.save();

      const otherNamespace = new ReservedNamespace({
        namespace: '*.other-namespace',
        type: 'wildcard',
        owner_id: new mongoose.Types.ObjectId(otherUser._id),
      });
      await otherNamespace.save();

      const response = await request(app).get(`/api/v4/admin/namespaces?apikey=${adminUser.apikey}`).expect(200);

      strictEqual(response.body.success, true);
      strictEqual(response.body.data.length, 2);
      strictEqual(response.body.data[0].namespace, '*.namespace');
      strictEqual(response.body.data[0].type, 'wildcard');
      strictEqual(response.body.data[0].owner.name, 'Normal User');
    });

    it('should return namespaces filtered by user ID', async () => {
      const namespace1 = new ReservedNamespace({
        namespace: '*.namespace',
        type: 'wildcard',
        owner_id: new mongoose.Types.ObjectId(namespaceOwnerId),
      });
      await namespace1.save();

      // Create another namespace with a different owner
      const otherUser = new User({
        username: 'other',
        name: 'Other User',
        email: 'other@example.com',
        role: 'community',
        apikey: 'other-api-key',
      });
      await otherUser.save();

      const namespace2 = new ReservedNamespace({
        namespace: '*.other-namespace',
        type: 'wildcard',
        owner_id: new mongoose.Types.ObjectId(otherUser._id),
      });
      await namespace2.save();

      const response = await request(app).get(`/api/v4/admin/namespaces?userId=${namespaceOwnerId}&apikey=${adminUser.apikey}`).expect(200);

      strictEqual(response.body.success, true);
      strictEqual(response.body.data.length, 1);
      strictEqual(response.body.data[0].namespace, '*.namespace');
      strictEqual(response.body.data[0].owner.name, 'Normal User');
    });
  });

  describe('POST /api/v4/admin/namespaces', () => {
    it('should create a new namespace reservation', async () => {
      const response = await request(app)
        .post(`/api/v4/admin/namespaces?apikey=${adminUser.apikey}`)
        .send({
          namespace: 'namespace',
          type: 'exact',
          ownerId: namespaceOwnerId,
        })
        .expect(200);

      strictEqual(response.body.success, true);
      strictEqual(response.body.data.namespace, 'namespace');
      strictEqual(response.body.data.type, 'exact');
      strictEqual(response.body.data.owner.name, 'Normal User');

      const saved = await ReservedNamespace.findByNamespace('namespace');
      strictEqual(saved !== null, true);
      strictEqual(saved?.namespace, 'namespace');
    });

    it('should not allow duplicate namespace reservations', async () => {
      await request(app).post(`/api/v4/admin/namespaces?apikey=${adminUser.apikey}`).send({
        namespace: 'namespace',
        type: 'exact',
        ownerId: namespaceOwnerId,
      });

      // Try to create duplicate
      const response = await request(app)
        .post(`/api/v4/admin/namespaces?apikey=${adminUser.apikey}`)
        .send({
          namespace: 'namespace',
          type: 'exact',
          ownerId: namespaceOwnerId,
        })
        .expect(400);

      strictEqual(response.body.success, false);
    });
  });

  describe('DELETE /api/v4/admin/namespaces/:id', () => {
    it('should delete a namespace reservation', async () => {
      const createResponse = await request(app)
        .post(`/api/v4/admin/namespaces?apikey=${adminUser.apikey}`)
        .send({
          namespace: 'namespace',
          type: 'exact',
          ownerId: namespaceOwnerId,
        })
        .expect(200);

      const namespaceId = createResponse.body.data.id as string;

      const deleteResponse = await request(app).delete(`/api/v4/admin/namespaces/${namespaceId}?apikey=${adminUser.apikey}`).expect(200);

      strictEqual(deleteResponse.body.success, true);
      strictEqual(deleteResponse.body.data.deleted, true);

      const saved = await ReservedNamespace.findByNamespace('namespace');
      strictEqual(saved, null);
    });
  });
});
