// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test, describe, beforeEach, before, after } from 'node:test';
import path from 'path';

import request from 'supertest';
import { type App } from 'supertest/types';

import * as api from '.';
import { Package } from '../db/package';
import { packageSearchInstance } from '../db/package/search-factory';
import { PackageType, SourceStore, SnapChannel, SnapConfinement } from '../db/package/types';
import factory, { type TestUser, type TestPackage, type TestReservedNamespace } from '../tests/factory';
import { cleanMongoose, closeMongoose, waitForMongoose } from '../tests/utils';
import * as messages from '../utils/error-messages';

describe('Manage', () => {
  let app: App;
  let user: TestUser;

  // TODO setup elastic search for testing in CI
  const mockSearchMethod = (process.env.NODE_ENV === 'ci' ? () => {} : undefined) as any;

  before(async () => {
    await waitForMongoose();

    app = api.setup();
  });

  after(async () => {
    await closeMongoose();
  });

  beforeEach(async () => {
    await cleanMongoose();

    user = await factory.user();
  });

  describe('Manage GET', () => {
    let route: string;
    let package1: TestPackage;

    beforeEach(async () => {
      route = `/api/v4/manage/?apikey=${user.apikey}`;

      [package1] = await Promise.all([factory.package({ maintainer: user._id, name: 'User app' }), factory.package()]);
    });

    test('blocks access when not logged in', async () => {
      await request(app).get('/api/v4/manage/').expect(401);
    });

    describe('admin user', () => {
      beforeEach(async () => {
        user.role = 'admin';
        await user.save();
      });

      test('shows apps of every package type for an admin user', async () => {
        const snap = await factory.package({
          maintainer: user._id,
          name: 'Snap app',
          package_type: PackageType.SNAP,
          snap_data: { channels: [SnapChannel.STABLE], confinement: SnapConfinement.STRICT, base: 'core22' },
        });
        const packagekit = await factory.package({
          maintainer: user._id,
          name: 'PackageKit app',
          package_type: PackageType.PACKAGEKIT,
        });

        const res = await request(app).get(route).expect(200);

        assert.ok(res.body.success);
        // package1, the package created in the outer beforeEach, plus the snap and packagekit packages
        assert.equal(res.body.data.count, 4);
        const ids = res.body.data.packages.map((p: TestPackage) => p.id);
        assert.ok(ids.includes(snap.id));
        assert.ok(ids.includes(packagekit.id));
      });

      test('an admin can still narrow the list to a single package type', async () => {
        await factory.package({
          maintainer: user._id,
          name: 'PackageKit app',
          package_type: PackageType.PACKAGEKIT,
        });

        const res = await request(app).get(`${route}&package_type=${PackageType.PACKAGEKIT}`).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.count, 1);
        assert.equal(res.body.data.packages[0].package_type, PackageType.PACKAGEKIT);
      });

      test('shows all apps for an admin user', async () => {
        const res = await request(app).get(route).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.count, 2);
        assert.equal(res.body.data.packages.length, 2);
      });

      test('has a next link', async () => {
        const res = await request(app).get(`${route}&limit=1`).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.count, 2);
        assert.equal(res.body.data.packages.length, 1);
        assert.ok(res.body.data.next.includes('skip=1'));
        assert.ok(res.body.data.next.includes('limit=1'));
      });

      test('has a previous link', async () => {
        const res = await request(app).get(`${route}&limit=1&skip=1`).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.count, 2);
        assert.equal(res.body.data.packages.length, 1);
        assert.ok(res.body.data.previous.includes('skip=0'));
        assert.ok(res.body.data.previous.includes('limit=1'));
      });

      test('searches', async () => {
        const res = await request(app).get(`${route}&search=${package1.name}`).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.count, 1);
        assert.equal(res.body.data.packages.length, 1);
        assert.equal(res.body.data.packages[0].id, package1.id);
      });

      test('can filter to see only their own apps with publisher_id', async () => {
        const userId: string = user._id.toString();
        const testRoute = `${route}&publisher_id=${userId}`;
        const res = await request(app).get(testRoute).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.count, 1);
        assert.equal(res.body.data.packages.length, 1);
        assert.equal(res.body.data.packages[0].id, package1.id);
        assert.equal(res.body.data.packages[0].maintainer, user._id.toString());
      });
    });

    describe('community user', () => {
      beforeEach(async () => {
        user.role = 'community';
        await user.save();
      });

      test('shows only the logged in users apps for a community user', async () => {
        const res = await request(app).get(route).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.count, 1);
        assert.equal(res.body.data.packages.length, 1);
        assert.equal(res.body.data.packages[0].id, package1.id);
        assert.equal(res.body.data.packages[0].maintainer, user._id.toString());
      });

      test('shows all allowed package types for a community user', async () => {
        const snap = await factory.package({
          maintainer: user._id,
          name: 'Snap app',
          package_type: PackageType.SNAP,
          snap_data: { channels: [SnapChannel.STABLE], confinement: SnapConfinement.STRICT, base: 'core22' },
        });
        const packagekit = await factory.package({ maintainer: user._id, name: 'PackageKit app', package_type: PackageType.PACKAGEKIT });

        const res = await request(app).get(route).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.count, 3);
        const ids = res.body.data.packages.map((p: TestPackage) => p.id);
        assert.ok(ids.includes(package1.id));
        assert.ok(ids.includes(snap.id));
        assert.ok(ids.includes(packagekit.id));
      });

      test('fails gracefully', async (t) => {
        const findMock = t.mock.method(Package, 'findByFilters', () => {
          throw new Error();
        });

        const res = await request(app).get(route).expect(500);

        assert.equal(res.body.success, false);
        assert.equal(findMock.mock.callCount(), 1);
      });
    });

    describe('disabled user', () => {
      beforeEach(async () => {
        user.role = 'disabled';
        await user.save();
      });

      test('blocks access for a disabled user', async () => {
        const res = await request(app).get(route).expect(403);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.ACCOUNT_DISABLED);
      });
    });
  });

  describe('Manage GET id', () => {
    let route: string;
    let package1: TestPackage;
    let package2: TestPackage;

    beforeEach(async () => {
      [package1, package2] = await Promise.all([factory.package({ maintainer: user._id, name: 'User app' }), factory.package()]);
      route = `/api/v4/manage/${package1.id}?apikey=${user.apikey}`;
    });

    test('blocks access when not logged in', async () => {
      await request(app).get(`/api/v4/manage/${package1.id}`).expect(401);
    });

    describe('admin user', () => {
      test('sees any app', async () => {
        const res = await request(app).get(route).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.id, package1.id);
        assert.equal(res.body.data.maintainer, user._id.toString());
      });

      test('404s on a bad id', async () => {
        await request(app).get(`/api/v4/manage/foo?apikey=${user.apikey}`).expect(404);
      });
    });

    describe('community user', () => {
      beforeEach(async () => {
        user.role = 'community';
        await user.save();
      });

      test('sees their own app', async () => {
        const res = await request(app).get(route).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.id, package1.id);
        assert.equal(res.body.data.maintainer, user._id.toString());
      });

      test('can not see other apps', async () => {
        await request(app).get(`/api/v4/manage/${package2.id}?apikey=${user.apikey}`).expect(403);
      });

      test('cannot manage snap packages', async () => {
        const snapPackage = await factory.package({
          id: 'snap.package',
          published: true,
          maintainer: user._id.toString(),
          package_type: PackageType.SNAP,
          source_store: SourceStore.SNAPCRAFT,
        });

        const res = await request(app).get(`/api/v4/manage/${snapPackage.id}?apikey=${user.apikey}`).expect(403);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.SNAP_MANAGEMENT_NOT_SUPPORTED);
      });

      test('fails gracefully', async (t) => {
        const findMock = t.mock.method(Package, 'findOneByFilters', () => {
          throw new Error();
        });

        const res = await request(app).get(route).expect(500);

        assert.equal(res.body.success, false);
        assert.equal(findMock.mock.callCount(), 1);
      });
    });

    describe('disabled user', () => {
      beforeEach(async () => {
        user.role = 'disabled';
        await user.save();
      });

      test('blocks access for a disabled user', async () => {
        const res = await request(app).get(route).expect(403);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.ACCOUNT_DISABLED);
      });
    });
  });

  describe('Manage POST', () => {
    let route: string;
    let package1: TestPackage;
    let exactReservedNamespace: TestReservedNamespace;
    let wildcardReservedNamespace: TestReservedNamespace;
    let user2: TestUser;

    beforeEach(async () => {
      route = `/api/v4/manage/?apikey=${user.apikey}`;
      package1 = await factory.package({ maintainer: user._id, name: 'User app' });
      user2 = await factory.user();

      // Create reserved namespaces for testing
      exactReservedNamespace = await factory.reservedNamespace({
        namespace: 'reserved.exact.test',
        type: 'exact',
        owner_id: user2._id,
      });

      wildcardReservedNamespace = await factory.reservedNamespace({
        namespace: '*.reserved.wildcard',
        type: 'wildcard',
        owner_id: user2._id,
      });
    });

    test('blocks access when not logged in', async () => {
      await request(app).post('/api/v4/manage/').expect(401);
    });

    describe('admin user', () => {
      beforeEach(async () => {
        user.role = 'admin';
        await user.save();
      });

      test('succeeds with a com.ubuntu id', async () => {
        const res = await request(app).post(route).send({ license: 'GNU GPL v3', id: 'com.ubuntu.app', name: 'App Dev' }).expect(200);

        assert.ok(res.body.success);
      });

      test('succeeds with a com.canonical id', async () => {
        const res = await request(app).post(route).send({ license: 'GNU GPL v3', id: 'com.canonical.app', name: 'App Dev' }).expect(200);

        assert.ok(res.body.success);
      });

      test('succeeds with a ubports id', async () => {
        const res = await request(app).post(route).send({ license: 'GNU GPL v3', id: 'ubports.app', name: 'App Dev' }).expect(200);

        assert.ok(res.body.success);
      });

      test('succeeds with a openstore id', async () => {
        const res = await request(app).post(route).send({ license: 'GNU GPL v3', id: 'OpenStore.app', name: 'App Dev' }).expect(200);

        assert.ok(res.body.success);
      });

      test('succeeds with a lomiri id', async () => {
        const res = await request(app).post(route).send({ license: 'GNU GPL v3', id: 'lomiri.app', name: 'App Dev' }).expect(200);

        assert.ok(res.body.success);
      });

      test('creates a package without a license', async () => {
        const res = await request(app).post(route).send({ id: 'app.admin.no.license', name: 'App Admin No License' }).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.license, 'Proprietary');

        const pkg = await Package.findOneByFilters('app.admin.no.license');
        assert.ok(pkg);
        assert.equal(pkg.license, undefined);
      });

      test('succeeds with an exact reserved namespace id', async () => {
        const res = await request(app)
          .post(route)
          .send({ license: 'GNU GPL v3', id: exactReservedNamespace.namespace, name: 'Reserved Exact App' })
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.id, exactReservedNamespace.namespace);
      });

      test('succeeds with a wildcard reserved namespace id', async () => {
        const packageId = `app.${wildcardReservedNamespace.namespace.substring(2)}`;
        const res = await request(app)
          .post(route)
          .send({ license: 'GNU GPL v3', id: packageId, name: 'Reserved Wildcard App' })
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.id, packageId);
      });

      describe('package_type', () => {
        test('creates a packagekit package with the expected defaults', async () => {
          const res = await request(app)
            .post(route)
            .send({ license: 'GNU GPL v3', id: 'packagekit.app', name: 'App Packagekit', package_type: PackageType.PACKAGEKIT })
            .expect(200);

          assert.ok(res.body.success);
          assert.equal(res.body.data.package_type, PackageType.PACKAGEKIT);
          assert.equal(res.body.data.published, true);
          assert.deepEqual(res.body.data.channel_architectures, ['focal:all']);

          const pkg = await Package.findOneByFilters('packagekit.app');
          assert.ok(pkg);
          assert.equal(pkg.package_type, PackageType.PACKAGEKIT);
          assert.equal(!!pkg.published, true);
          assert.deepEqual(pkg.channel_architectures, ['focal:all']);
          assert.equal(pkg.revisions.length, 0);
        });

        test('fails without a packagekit. id prefix', async () => {
          const res = await request(app)
            .post(route)
            .send({ license: 'GNU GPL v3', id: 'app.packagekit', name: 'App Packagekit', package_type: PackageType.PACKAGEKIT })
            .expect(400);

          assert.equal(res.body.success, false);
          assert.equal(res.body.message, messages.INVALID_APP_ID_PREFIX);
        });

        test('fails without a snap. id prefix', async () => {
          const res = await request(app)
            .post(route)
            .send({ license: 'GNU GPL v3', id: 'app.snap', name: 'App Snap', package_type: PackageType.SNAP })
            .expect(400);

          assert.equal(res.body.success, false);
          assert.equal(res.body.message, messages.INVALID_APP_ID_PREFIX);
        });

        test('defaults to a click package when package_type is not provided', async () => {
          const res = await request(app).post(route).send({ license: 'GNU GPL v3', id: 'app.default', name: 'App Default' }).expect(200);

          assert.ok(res.body.success);
          assert.equal(res.body.data.package_type, PackageType.CLICK);
          assert.equal(res.body.data.published, false);
          assert.deepEqual(res.body.data.channel_architectures, []);
        });

        test('can explicitly create a click package', async () => {
          const res = await request(app)
            .post(route)
            .send({ license: 'GNU GPL v3', id: 'app.explicit.click', name: 'App Explicit Click', package_type: PackageType.CLICK })
            .expect(200);

          assert.ok(res.body.success);
          assert.equal(res.body.data.package_type, PackageType.CLICK);
          assert.equal(res.body.data.published, false);
        });

        test('lowercases click ids', async () => {
          const res = await request(app)
            .post(route)
            .send({ license: 'GNU GPL v3', id: 'App.Mixed.Case', name: 'App Mixed Case', package_type: PackageType.CLICK })
            .expect(200);

          assert.ok(res.body.success);
          assert.equal(res.body.data.id, 'app.mixed.case');
          assert.ok(await Package.findOneByFilters('app.mixed.case'));
        });

        test('preserves the case of packagekit ids', async () => {
          const res = await request(app)
            .post(route)
            .send({ license: 'GNU GPL v3', id: 'packagekit.MixedCase', name: 'App Mixed Case', package_type: PackageType.PACKAGEKIT })
            .expect(200);

          assert.ok(res.body.success);
          assert.equal(res.body.data.id, 'packagekit.MixedCase');
          assert.ok(await Package.findOneByFilters('packagekit.MixedCase'));
        });

        test('fails with an id that differs only in case from an existing package', async () => {
          await request(app)
            .post(route)
            .send({ license: 'GNU GPL v3', id: 'packagekit.org.wesnoth.wesnoth', name: 'Wesnoth', package_type: PackageType.PACKAGEKIT })
            .expect(200);

          const res = await request(app)
            .post(route)
            .send({ license: 'GNU GPL v3', id: 'packagekit.org.wesnoth.Wesnoth', name: 'Wesnoth', package_type: PackageType.PACKAGEKIT })
            .expect(400);

          assert.equal(res.body.success, false);
          assert.equal(res.body.message, messages.DUPLICATE_PACKAGE);
        });

        test('does not add the package to the search index', async (t) => {
          const upsertSpy = t.mock.method(packageSearchInstance, 'upsert', mockSearchMethod);

          await request(app)
            .post(route)
            .send({ license: 'GNU GPL v3', id: 'packagekit.app.unindexed', name: 'App Unindexed', package_type: PackageType.PACKAGEKIT })
            .expect(200);

          assert.equal(upsertSpy.mock.callCount(), 0);
        });

        test('fails with an unknown package_type', async () => {
          const res = await request(app)
            .post(route)
            .send({ license: 'GNU GPL v3', id: 'app.bad.type', name: 'App Bad Type', package_type: 'not-a-real-type' })
            .expect(400);

          assert.equal(res.body.success, false);
          assert.equal(res.body.message, messages.INVALID_PACKAGE_TYPE);
        });
      });
    });

    describe('truested user', () => {
      beforeEach(async () => {
        user.role = 'trusted';
        await user.save();
      });

      test('succeeds with a com.ubuntu id', async () => {
        const res = await request(app).post(route).send({ license: 'GNU GPL v3', id: 'com.ubuntu.app', name: 'App Dev' }).expect(200);

        assert.ok(res.body.success);
      });

      test('succeeds with a com.canonical id', async () => {
        const res = await request(app).post(route).send({ license: 'GNU GPL v3', id: 'com.canonical.app', name: 'App Dev' }).expect(200);

        assert.ok(res.body.success);
      });

      test('succeeds with a ubports id', async () => {
        const res = await request(app).post(route).send({ license: 'GNU GPL v3', id: 'ubports.app', name: 'App Dev' }).expect(200);

        assert.ok(res.body.success);
      });

      test('succeeds with a openstore id', async () => {
        const res = await request(app).post(route).send({ license: 'GNU GPL v3', id: 'OpenStore.app', name: 'App Dev' }).expect(200);

        assert.ok(res.body.success);
      });

      test('succeeds with a lomiri id', async () => {
        const res = await request(app).post(route).send({ license: 'GNU GPL v3', id: 'lomiri.app', name: 'App Dev' }).expect(200);

        assert.ok(res.body.success);
      });

      test('ignores a package_type and creates a click package', async () => {
        const res = await request(app)
          .post(route)
          .send({ license: 'GNU GPL v3', id: 'app.trusted.packagekit', name: 'App Dev', package_type: PackageType.PACKAGEKIT })
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.package_type, PackageType.CLICK);
        assert.equal(res.body.data.published, false);
        assert.deepEqual(res.body.data.channel_architectures, []);
      });
    });

    describe('community user', () => {
      beforeEach(async () => {
        user.role = 'community';
        await user.save();
      });

      test('fails with no id', async () => {
        const res = await request(app).post(route).expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.NO_APP_NAME);
      });

      test('fails with no name', async () => {
        const res = await request(app).post(route).send({ license: 'GNU GPL v3', id: 'app.dev' }).expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.NO_APP_TITLE);
      });

      test('fails without a license', async () => {
        const res = await request(app).post(route).send({ id: 'app.no.license', name: 'App No License' }).expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.NO_LICENSE_SPECIFIED);
        assert.equal(await Package.findOneByFilters('app.no.license'), null);
      });

      test('fails with an empty license', async () => {
        const res = await request(app).post(route).send({ license: '', id: 'app.empty.license', name: 'App Empty License' }).expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.NO_LICENSE_SPECIFIED);
        assert.equal(await Package.findOneByFilters('app.empty.license'), null);
      });

      test('fails with an invalid license', async () => {
        const res = await request(app)
          .post(route)
          .send({ license: 'not-a-license', id: 'app.invalid.license', name: 'App Invalid License' })
          .expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.INVALID_LICENSE);
        assert.equal(await Package.findOneByFilters('app.invalid.license'), null);
      });

      test('fails with spaces in the id', async () => {
        const res = await request(app).post(route).send({ license: 'GNU GPL v3', id: 'app dev', name: 'App Dev' }).expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.NO_SPACES_NAME);
      });

      test('fails with a duplicate id', async () => {
        const res = await request(app).post(route).send({ license: 'GNU GPL v3', id: package1.id, name: 'App Dev' }).expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.DUPLICATE_PACKAGE);
      });

      test('fails with a com.ubuntu id', async () => {
        const res = await request(app).post(route).send({ license: 'GNU GPL v3', id: 'com.ubuntu.app', name: 'App Dev' }).expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.BAD_NAMESPACE);
      });

      test('fails with a com.canonical id', async () => {
        const res = await request(app).post(route).send({ license: 'GNU GPL v3', id: 'com.canonical.app', name: 'App Dev' }).expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.BAD_NAMESPACE);
      });

      test('fails with a ubports id', async () => {
        const res = await request(app).post(route).send({ license: 'GNU GPL v3', id: 'ubports.app', name: 'App Dev' }).expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.BAD_NAMESPACE);
      });

      test('fails with a openstore id', async () => {
        const res = await request(app).post(route).send({ license: 'GNU GPL v3', id: 'OpenStore.app', name: 'App Dev' }).expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.BAD_NAMESPACE);
      });

      test('fails with a lomiri id', async () => {
        const res = await request(app).post(route).send({ license: 'GNU GPL v3', id: 'lomiri.app', name: 'App Dev' }).expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.BAD_NAMESPACE);
      });

      test('succeeds with a com.ubuntu.developer id', async () => {
        const res = await request(app)
          .post(route)
          .send({ license: 'GNU GPL v3', id: 'com.ubuntu.developer.app', name: 'App Dev' })
          .expect(200);

        assert.ok(res.body.success);
      });

      test('fails with an exact reserved namespace id', async () => {
        const res = await request(app)
          .post(route)
          .send({ license: 'GNU GPL v3', id: exactReservedNamespace.namespace, name: 'Reserved Exact App' })
          .expect(403);

        assert.equal(res.body.success, false);
        assert.ok(res.body.message.includes('reserved by another user'));
      });

      test('fails with a wildcard reserved namespace id', async () => {
        const packageId = `app.${wildcardReservedNamespace.namespace.substring(2)}`;
        const res = await request(app)
          .post(route)
          .send({ license: 'GNU GPL v3', id: packageId, name: 'Reserved Wildcard App' })
          .expect(403);

        assert.equal(res.body.success, false);
        assert.ok(res.body.message.includes('reserved by another user'));
      });

      test('fails with an exact reserved namespace id that differs only in case', async () => {
        await factory.reservedNamespace({
          namespace: 'Reserved.Case.Test',
          type: 'exact',
          owner_id: user2._id,
        });

        const res = await request(app)
          .post(route)
          .send({ license: 'GNU GPL v3', id: 'reserved.case.test', name: 'Reserved Case App' })
          .expect(403);

        assert.equal(res.body.success, false);
        assert.ok(res.body.message.includes('reserved by another user'));
      });

      test('fails with a wildcard reserved namespace id that differs only in case', async () => {
        await factory.reservedNamespace({
          namespace: '*.Reserved.Case.Wildcard',
          type: 'wildcard',
          owner_id: user2._id,
        });

        const res = await request(app)
          .post(route)
          .send({ license: 'GNU GPL v3', id: 'app.reserved.case.wildcard', name: 'Reserved Case App' })
          .expect(403);

        assert.equal(res.body.success, false);
        assert.ok(res.body.message.includes('reserved by another user'));
      });

      test('succeeds when using their own reserved namespace', async () => {
        // Create a namespace owned by the current user
        const userOwnedNamespace = await factory.reservedNamespace({
          namespace: 'user.owned.namespace',
          type: 'exact',
          owner_id: user._id,
        });

        const res = await request(app)
          .post(route)
          .send({ license: 'GNU GPL v3', id: userOwnedNamespace.namespace, name: 'User Owned App' })
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.id, userOwnedNamespace.namespace);
      });

      test('succeeds when using their own wildcard reserved namespace', async () => {
        // Create a wildcard namespace owned by the current user
        await factory.reservedNamespace({
          namespace: '*.user.wildcard',
          type: 'wildcard',
          owner_id: user._id,
        });

        const packageId = 'app.user.wildcard';
        const res = await request(app).post(route).send({ license: 'GNU GPL v3', id: packageId, name: 'User Wildcard App' }).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.id, packageId);
      });

      test('creates a new package', async () => {
        const res = await request(app).post(route).send({ license: 'GNU GPL v3', id: 'app.dev', name: 'App Dev' }).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.id, 'app.dev');
        assert.equal(res.body.data.name, 'App Dev');

        const pkg = await Package.findOneByFilters('app.dev');
        assert.ok(pkg);
        assert.equal(pkg.id, 'app.dev');
        assert.equal(pkg.name, 'App Dev');
        assert.equal(!!pkg.published, false);
        assert.equal(pkg.maintainer, user._id.toString());
        assert.equal(pkg.maintainer_name, user.name);
      });

      test('creates a new package with a license and source URL', async () => {
        const res = await request(app)
          .post(route)
          .send({
            license: 'MIT/X/Expat License',
            id: 'app.licensed',
            name: 'App Licensed',
            source: 'https://example.com/source',
          })
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.license, 'MIT/X/Expat License');
        assert.equal(res.body.data.source, 'https://example.com/source');

        const pkg = await Package.findOneByFilters('app.licensed');
        assert.ok(pkg);
        assert.equal(pkg.license, 'MIT/X/Expat License');
        assert.equal(pkg.source, 'https://example.com/source');
      });

      test('lowercases click ids', async () => {
        const res = await request(app)
          .post(route)
          .send({ license: 'GNU GPL v3', id: 'App.Mixed.Case', name: 'App Mixed Case' })
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.id, 'app.mixed.case');
        assert.ok(await Package.findOneByFilters('app.mixed.case'));
      });

      test('ignores a package_type and creates a click package', async () => {
        const res = await request(app)
          .post(route)
          .send({ license: 'GNU GPL v3', id: 'app.community.packagekit', name: 'App Dev', package_type: PackageType.PACKAGEKIT })
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.package_type, PackageType.CLICK);
        assert.equal(res.body.data.published, false);
        assert.deepEqual(res.body.data.channel_architectures, []);

        const pkg = await Package.findOneByFilters('app.community.packagekit');
        assert.ok(pkg);
        assert.equal(pkg.package_type, PackageType.CLICK);
      });

      test('fails gracefully', async (t) => {
        const findMock = t.mock.method(Package, 'findOneByFilters', () => {
          throw new Error();
        });

        const res = await request(app).post(route).send({ license: 'GNU GPL v3', id: 'app.dev', name: 'App Dev' }).expect(500);

        assert.equal(res.body.success, false);
        assert.equal(findMock.mock.callCount(), 1);
      });
    });

    describe('disabled user', () => {
      beforeEach(async () => {
        user.role = 'disabled';
        await user.save();
      });

      test('blocks access for a disabled user', async () => {
        const res = await request(app).post(route).send({ license: 'GNU GPL v3', id: 'app.dev', name: 'App Dev' }).expect(403);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.ACCOUNT_DISABLED);
      });
    });
  });

  describe('Manage PUT', () => {
    let route: string;
    let route2: string;
    let package1: TestPackage;
    let package2: TestPackage;

    const screenshot1 = path.join(__dirname, '../tests/fixtures/empty1.png');
    const screenshot2 = path.join(__dirname, '../tests/fixtures/empty2.png');
    const notAScreenshot = path.join(__dirname, '../tests/fixtures/empty.click');

    beforeEach(async () => {
      [package1, package2] = await Promise.all([factory.package({ maintainer: user._id, name: 'User app' }), factory.package()]);

      route = `/api/v4/manage/${package1.id}?apikey=${user.apikey}`;
      route2 = `/api/v4/manage/${package2.id}?apikey=${user.apikey}`;
    });

    test('blocks access when not logged in', async () => {
      await request(app).put(`/api/v4/manage/${package1.id}`).expect(401);
    });

    describe('admin user', () => {
      beforeEach(async () => {
        user.role = 'admin';
        await user.save();
      });

      test('allows changing admin only fields', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const user2 = await factory.user();

        const res = await request(app)
          .put(route)
          .send({ license: 'GNU GPL v3', maintainer: user2._id, type_override: 'webapp', locked: true })
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.maintainer, user2._id.toString());
        assert.equal(res.body.data.type_override, 'webapp');
        assert.ok(res.body.data.locked);

        assert.equal(removeSpy.mock.callCount(), 1);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(pkg?.maintainer, user2._id.toString());
      });

      test('can set an admin message and resets acknowledgement when the message changes', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        package1.admin_message = 'Old message';
        package1.admin_message_acknowledged = true;
        await package1.save();

        const res = await request(app).put(route).send({ license: 'GNU GPL v3', admin_message: 'Please update your app' }).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.admin_message, 'Please update your app');
        assert.equal(res.body.data.admin_message_acknowledged, false);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(pkg?.admin_message, 'Please update your app');
        assert.equal(pkg?.admin_message_acknowledged, false);
        assert.equal(removeSpy.mock.callCount(), 1);
      });

      test('can update any package', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const res = await request(app).put(route2).send({ license: 'GNU GPL v3', name: 'Foo Bar' }).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.name, 'Foo Bar');

        assert.equal(removeSpy.mock.callCount(), 1);

        const pkg = await Package.findOneByFilters(package2.id);
        assert.equal(pkg?.name, 'Foo Bar');
      });

      test('can update a locked package', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        package2.locked = true;
        await package2.save();

        const res = await request(app).put(route2).send({ license: 'GNU GPL v3', name: 'Foo Bar' }).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.name, 'Foo Bar');

        assert.equal(removeSpy.mock.callCount(), 1);

        const pkg = await Package.findOneByFilters(package2.id);
        assert.equal(pkg?.name, 'Foo Bar');
      });
    });

    describe('community user', () => {
      beforeEach(async () => {
        user.role = 'community';
        await user.save();
      });

      test('fails with a bad id', async () => {
        await request(app).put(`/api/v4/manage/foo?apikey=${user.apikey}`).expect(404);
      });

      test('does not allow modifying another users package', async () => {
        await request(app).put(route2).expect(403);
      });

      test('does not allow publishing without revisions', async () => {
        const res = await request(app).put(route).send({ license: 'GNU GPL v3', published: true }).expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.NO_REVISIONS);
      });

      test('does not allow changing admin only fields', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const res = await request(app)
          .put(route)
          .send({ license: 'GNU GPL v3', maintainer: 'foo', type_override: 'webapp', locked: true })
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.maintainer, user._id.toString());
        assert.equal(res.body.data.type_override, '');
        assert.equal(res.body.data.locked, false);

        assert.equal(removeSpy.mock.callCount(), 1);
      });

      test('does not allow changing the admin message', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        package1.admin_message = 'Please update your app';
        await package1.save();

        const res = await request(app)
          .put(route)
          .send({ license: 'GNU GPL v3', admin_message: 'Message injected by a maintainer' })
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.admin_message, 'Please update your app');

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(pkg?.admin_message, 'Please update your app');
        assert.equal(removeSpy.mock.callCount(), 1);
      });

      test('can acknowledge an admin message when the app is not locked', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        package1.admin_message = 'Please update your app';
        await package1.save();

        const res = await request(app).put(route).send({ license: 'GNU GPL v3', admin_message_acknowledged: true }).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.admin_message, 'Please update your app');
        assert.equal(res.body.data.admin_message_acknowledged, true);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(pkg?.admin_message_acknowledged, true);
        assert.equal(removeSpy.mock.callCount(), 1);
      });

      test('cannot acknowledge an admin message when there is no message', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const res = await request(app).put(route).send({ license: 'GNU GPL v3', admin_message_acknowledged: true }).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.admin_message_acknowledged, false);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(!!pkg?.admin_message_acknowledged, false);
        assert.equal(removeSpy.mock.callCount(), 1);
      });

      test('updates successfully', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const res = await request(app).put(route).send({ license: 'GNU GPL v3', name: 'Foo Bar' }).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.name, 'Foo Bar');

        assert.equal(removeSpy.mock.callCount(), 1);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(pkg?.name, 'Foo Bar');
      });

      test('requires a license when the app does not have one', async () => {
        await Package.updateOne({ _id: package1._id }, { $unset: { license: 1 } });

        const res = await request(app).put(route).send({ name: 'Foo Bar' }).expect(400);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.NO_LICENSE_SPECIFIED);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(pkg?.name, 'User app');
      });

      test('allows setting a license when the app does not have one', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);
        await Package.updateOne({ _id: package1._id }, { $unset: { license: 1 } });

        const res = await request(app).put(route).send({ license: 'GNU GPL v3' }).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.license, 'GNU GPL v3');
        assert.equal(removeSpy.mock.callCount(), 1);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(pkg?.license, 'GNU GPL v3');
      });

      test('allows updating an app that already has a license without sending one', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);
        package1.license = 'GNU GPL v3';
        await package1.save();

        const res = await request(app).put(route).send({ name: 'Foo Bar' }).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.name, 'Foo Bar');
        assert.equal(res.body.data.license, 'GNU GPL v3');
        assert.equal(removeSpy.mock.callCount(), 1);
      });

      test('accepts a description at the 3072 character limit', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const description = 'a'.repeat(3072);

        const res = await request(app).put(route).send({ license: 'GNU GPL v3', description }).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.description, description);
        assert.equal(removeSpy.mock.callCount(), 1);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(pkg?.description, description);
      });

      test('rejects a description that exceeds the 3072 character limit', async () => {
        const longDescription = 'a'.repeat(3073);

        await request(app).put(route).send({ license: 'GNU GPL v3', description: longDescription }).expect(400);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.ok(pkg);
        assert.notEqual(pkg?.description, longDescription);
      });

      test('accepts a title at the 1024 character limit', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const name = 'a'.repeat(1024);

        const res = await request(app).put(route).send({ license: 'GNU GPL v3', name }).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.name, name);
        assert.equal(removeSpy.mock.callCount(), 1);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(pkg?.name, name);
      });

      test('rejects a title that exceeds the 1024 character limit', async () => {
        const longName = 'a'.repeat(1025);

        await request(app).put(route).send({ license: 'GNU GPL v3', name: longName }).expect(400);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.ok(pkg);
        assert.notEqual(pkg?.name, longName);
      });

      test('accepts a tag line at the 1024 character limit', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const tagline = 'a'.repeat(1024);

        const res = await request(app).put(route).send({ license: 'GNU GPL v3', tagline }).expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.tagline, tagline);
        assert.equal(removeSpy.mock.callCount(), 1);
      });

      test('rejects a tag line that exceeds the 1024 character limit', async () => {
        const longTagline = 'a'.repeat(1025);

        await request(app).put(route).send({ license: 'GNU GPL v3', tagline: longTagline }).expect(400);
      });

      test('accepts keywords at the 1024 character limit', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const keywords = 'a'.repeat(1024);

        const res = await request(app).put(route).send({ license: 'GNU GPL v3', keywords }).expect(200);

        assert.ok(res.body.success);
        assert.equal(removeSpy.mock.callCount(), 1);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.deepEqual(pkg?.keywords, [keywords]);
      });

      test('rejects keywords that exceed the 1024 character limit', async () => {
        const longKeywords = 'a'.repeat(1025);

        await request(app).put(route).send({ license: 'GNU GPL v3', keywords: longKeywords }).expect(400);
      });

      test('accepts up to 10 keywords', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const keywordList = Array.from({ length: 10 }, (_, i) => `keyword-${i}`);

        const res = await request(app)
          .put(route)
          .send({ license: 'GNU GPL v3', keywords: keywordList.join(',') })
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(removeSpy.mock.callCount(), 1);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.deepEqual(pkg?.keywords, keywordList);
      });

      test('rejects more than 10 keywords', async () => {
        const keywordList = Array.from({ length: 11 }, (_, i) => `keyword-${i}`);

        await request(app)
          .put(route)
          .send({ license: 'GNU GPL v3', keywords: keywordList.join(',') })
          .expect(400);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.notDeepEqual(pkg?.keywords, keywordList);
      });

      test('accepts a version changelog at the 2048 character limit', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const changelog = 'a'.repeat(2048);

        const res = await request(app)
          .put(route)
          .send({ license: 'GNU GPL v3', version_changelogs: [{ version: '1.0.0', changelog }] })
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(removeSpy.mock.callCount(), 1);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(pkg?.version_changelogs?.[0]?.changelog, changelog);
      });

      test('rejects a version changelog that exceeds the 2048 character limit', async () => {
        const longChangelog = 'a'.repeat(2049);

        await request(app)
          .put(route)
          .send({ license: 'GNU GPL v3', version_changelogs: [{ version: '1.0.0', changelog: longChangelog }] })
          .expect(400);
      });

      test('accepts a url at the 1024 character limit', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const supportUrl = `https://example.com/${'a'.repeat(1024 - 'https://example.com/'.length)}`;

        const res = await request(app).put(route).send({ license: 'GNU GPL v3', support_url: supportUrl }).expect(200);

        assert.ok(res.body.success);
        assert.equal(removeSpy.mock.callCount(), 1);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(pkg?.support_url, supportUrl);
      });

      test('rejects a url that exceeds the 1024 character limit', async () => {
        const longUrl = `https://example.com/${'a'.repeat(1025 - 'https://example.com/'.length)}`;

        await request(app).put(route).send({ license: 'GNU GPL v3', support_url: longUrl }).expect(400);
      });

      test('publishes the package', async (t) => {
        const upsertSpy = t.mock.method(packageSearchInstance, 'upsert', mockSearchMethod);

        package1.revisions.push({});
        await package1.save();

        const res = await request(app).put(route).send({ license: 'GNU GPL v3', published: true }).expect(200);

        assert.ok(res.body.success);
        assert.equal(upsertSpy.mock.callCount(), 1);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.ok(pkg?.published);
      });

      test('unpublishes the package', async (t) => {
        package1.revisions.push({});
        package1.published = true;
        await package1.save();

        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const res = await request(app).put(route).send({ license: 'GNU GPL v3', published: false }).expect(200);

        assert.ok(res.body.success);
        assert.equal(removeSpy.mock.callCount(), 1);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(!!pkg?.published, false);
      });

      test('fails gracefully', async (t) => {
        const findMock = t.mock.method(Package, 'findOneByFilters', () => {
          throw new Error();
        });

        const res = await request(app).put(route).send({ license: 'GNU GPL v3' }).expect(500);

        assert.equal(res.body.success, false);
        assert.equal(findMock.mock.callCount(), 1);
      });

      test('cannot update a locked package', async () => {
        package1.published = false;
        package1.locked = true;
        await package1.save();

        const res = await request(app).put(route).send({ license: 'GNU GPL v3', published: true, locked: false }).expect(403);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.APP_LOCKED);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(!!pkg?.published, false);
        assert.ok(pkg?.locked);
      });

      test('adds screenshots up to the limit', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const res = await request(app)
          .put(route)
          .field('license', 'GNU GPL v3')
          .attach('screenshot_files', screenshot1)
          .attach('screenshot_files', screenshot2)
          .attach('screenshot_files', screenshot1)
          .attach('screenshot_files', screenshot2)
          .attach('screenshot_files', screenshot1)
          .attach('screenshot_files', screenshot2)
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.screenshots.length, 5);

        assert.equal(removeSpy.mock.callCount(), 1);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(pkg?.screenshots.length, 5);
      });

      test('rejects non-images uploaded as screenshots', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const res = await request(app)
          .put(route)
          .field('license', 'GNU GPL v3')
          .attach('screenshot_files', screenshot1)
          .attach('screenshot_files', notAScreenshot)
          .expect(400);

        assert.equal(res.body.success, false);
        assert.match(res.body.message, /Screenshots must be PNG, JPEG, or SVG/);

        assert.equal(removeSpy.mock.callCount(), 0);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(pkg?.screenshots.length, 0);
      });

      test('removes screenshots', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const res = await request(app)
          .put(route)
          .field('license', 'GNU GPL v3')
          .attach('screenshot_files', screenshot1)
          .attach('screenshot_files', screenshot2)
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.screenshots.length, 2);

        const res2 = await request(app).put(route).send({ license: 'GNU GPL v3', screenshots: [] }).expect(200);

        assert.ok(res2.body.success);
        assert.equal(res2.body.data.screenshots.length, 0);

        assert.equal(removeSpy.mock.callCount(), 2);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(pkg?.screenshots.length, 0);
      });

      test('reorders screenshots', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const res = await request(app)
          .put(route)
          .field('license', 'GNU GPL v3')
          .attach('screenshot_files', screenshot1)
          .attach('screenshot_files', screenshot2)
          .expect(200);

        assert.ok(res.body.success);
        assert.equal(res.body.data.screenshots.length, 2);

        const res2 = await request(app)
          .put(route)
          .send({
            license: 'GNU GPL v3',
            screenshots: [
              res.body.data.screenshots[1].replace('http://local.open-store.io/screenshots/', ''),
              res.body.data.screenshots[0].replace('http://local.open-store.io/screenshots/', ''),
            ],
          })
          .expect(200);

        assert.ok(res2.body.success);
        assert.equal(res2.body.data.screenshots.length, 2);
        assert.equal(res2.body.data.screenshots[0], res.body.data.screenshots[1]);
        assert.equal(res2.body.data.screenshots[1], res.body.data.screenshots[0]);

        assert.equal(removeSpy.mock.callCount(), 2);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(pkg?.screenshots.length, 2);
        assert.equal(pkg.screenshots[0], res.body.data.screenshots[1].replace('http://local.open-store.io/screenshots/', ''));
        assert.equal(pkg.screenshots[1], res.body.data.screenshots[0].replace('http://local.open-store.io/screenshots/', ''));
      });

      test('clears out urls', async (t) => {
        const removeSpy = t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

        const res = await request(app)
          .put(route)
          .send({
            license: 'GNU GPL v3',
            source: 'https://example.com/',
            support_url: 'https://example.com/',
            donate_url: 'https://example.com/',
            translation_url: 'https://example.com/',
            video_url: 'https://www.youtube.com/embed/abcdefghijk',
          })
          .expect(200);

        assert.ok(res.body.success);
        assert.ok(res.body.data.source.length > 0);
        assert.ok(res.body.data.support_url.length > 0);
        assert.ok(res.body.data.donate_url.length > 0);
        assert.ok(res.body.data.translation_url.length > 0);
        assert.ok(res.body.data.video_url.length > 0);

        const res2 = await request(app)
          .put(route)
          .send({
            license: 'GNU GPL v3',
            source: '',
            support_url: '',
            donate_url: '',
            translation_url: '',
            video_url: '',
          })
          .expect(200);

        assert.ok(res2.body.success);
        assert.equal(res2.body.data.source.length, 0);
        assert.equal(res2.body.data.support_url.length, 0);
        assert.equal(res2.body.data.donate_url.length, 0);
        assert.equal(res2.body.data.translation_url.length, 0);
        assert.equal(res2.body.data.video_url.length, 0);

        assert.equal(removeSpy.mock.callCount(), 2);
      });
    });

    describe('disabled user', () => {
      beforeEach(async () => {
        user.role = 'disabled';
        await user.save();
      });

      test('blocks access for a disabled user', async () => {
        const res = await request(app).put(route).expect(403);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.ACCOUNT_DISABLED);
      });
    });
  });

  describe('Manage DELETE', () => {
    let route: string;
    let route2: string;
    let package1: TestPackage;
    let package2: TestPackage;

    beforeEach(async () => {
      [package1, package2] = await Promise.all([factory.package({ maintainer: user._id, name: 'User app' }), factory.package()]);
      route = `/api/v4/manage/${package1.id}?apikey=${user.apikey}`;
      route2 = `/api/v4/manage/${package2.id}?apikey=${user.apikey}`;
    });

    describe('admin user', () => {
      beforeEach(async () => {
        user.role = 'admin';
        await user.save();
      });

      test('can delete any package', async () => {
        await request(app).delete(route).expect(200);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(pkg, null);
      });
    });

    describe('community user', () => {
      beforeEach(async () => {
        user.role = 'community';
        await user.save();
      });

      test('fails with a bad id', async () => {
        await request(app).delete(`/api/v4/manage/foo?apikey=${user.apikey}`).expect(404);
      });

      test('does not allow modifying another users package', async () => {
        await request(app).delete(route2).expect(403);
      });

      test('does not allow deleting an app with revisions', async () => {
        package1.revisions.push({});
        await package1.save();

        await request(app).delete(route).expect(400);
      });

      test('deletes a package', async () => {
        await request(app).delete(route).expect(200);

        const pkg = await Package.findOneByFilters(package1.id);
        assert.equal(pkg, null);
      });

      test('fails gracefully', async (t) => {
        const findMock = t.mock.method(Package, 'findOneByFilters', () => {
          throw new Error();
        });

        const res = await request(app).delete(route).expect(500);

        assert.equal(res.body.success, false);
        assert.equal(findMock.mock.callCount(), 1);
      });
    });

    describe('disabled user', () => {
      beforeEach(async () => {
        user.role = 'disabled';
        await user.save();
      });

      test('blocks access for a disabled user', async () => {
        const res = await request(app).delete(route).expect(403);

        assert.equal(res.body.success, false);
        assert.equal(res.body.message, messages.ACCOUNT_DISABLED);
      });
    });
  });

  describe('Version-specific changelogs', () => {
    let pkg: TestPackage;
    let route: string;

    beforeEach(async () => {
      user.role = 'community';
      await user.save();

      pkg = await factory.package({
        maintainer: user._id,
        changelog: 'Legacy changelog',
      });

      route = `/api/v4/manage/${pkg.id}?apikey=${user.apikey}`;
    });

    test('can update version-specific changelogs', async (t) => {
      t.mock.method(packageSearchInstance, 'remove', mockSearchMethod);

      pkg.version_changelogs = [{ version: '1.0.0', changelog: 'Initial release notes' }];
      await pkg.save();

      const versionChangelogs = [
        { version: '1.0.0', changelog: 'Updated initial release notes' },
        { version: '1.1.0', changelog: 'New version changelog' },
      ];

      const res = await request(app)
        .put(route)
        .field('license', 'GNU GPL v3')
        .field('version_changelogs', JSON.stringify(versionChangelogs))
        .expect(200);

      assert.ok(res.body.success);
      assert.equal(res.body.data.version_changelogs.length, 2);

      const updatedPkg = await Package.findById(pkg._id);
      assert.ok(updatedPkg);
      assert.ok(updatedPkg.version_changelogs);
      assert.equal(updatedPkg.version_changelogs.length, 2);
      assert.equal(updatedPkg.version_changelogs.find((vc) => vc.version === '1.0.0')?.changelog, 'Updated initial release notes');
      assert.equal(updatedPkg.version_changelogs.find((vc) => vc.version === '1.1.0')?.changelog, 'New version changelog');

      // Test replace behavior: sending only a subset removes unlisted versions
      const reducedChangelogs = [{ version: '1.0.0', changelog: 'Kept initial release notes' }];

      const res2 = await request(app)
        .put(route)
        .field('license', 'GNU GPL v3')
        .field('version_changelogs', JSON.stringify(reducedChangelogs))
        .expect(200);

      assert.ok(res2.body.success);
      assert.equal(res2.body.data.version_changelogs.length, 1);

      const replacedPkg = await Package.findById(pkg._id);
      assert.ok(replacedPkg);
      assert.ok(replacedPkg.version_changelogs);
      assert.equal(replacedPkg.version_changelogs.length, 1);
      assert.equal(replacedPkg.version_changelogs[0].version, '1.0.0');
    });
  });
});
