/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { test, describe, beforeEach, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { cleanMongoose, closeMongoose, waitForMongoose } from '../tests/utils';
import factory, { type TestUser } from '../tests/factory';
import * as api from '.';
import { type App } from 'supertest/types';
import { User } from '../db/user';
import { Types } from 'mongoose';

describe('Users API', () => {
  const route = '/api/users/';
  let app: App;
  let adminUser: TestUser;
  let regularUser: TestUser;
  let anotherUser: TestUser;

  before(async () => {
    await waitForMongoose();
    app = api.setup();
  });

  after(async () => {
    await closeMongoose();
  });

  beforeEach(async () => {
    await cleanMongoose();

    adminUser = await factory.user({
      name: 'Admin User',
      username: 'admin-user',
      role: 'admin',
    });

    regularUser = await factory.user({
      name: 'Regular User',
      username: 'regular-user',
    });

    anotherUser = await factory.user({
      name: 'Another User',
      username: 'another-user',
    });
  });

  describe('GET /', () => {
    test('allows authenticated users to list all users', async () => {
      const res = await request(app)
        .get(`${route}?apikey=${regularUser.apikey}`)
        .expect(200);

      assert.ok(res.body.success);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length >= 3); // At least the three users we created

      const adminUserResult = res.body.data.find((u: any) => u.username === 'admin-user');
      const regularUserResult = res.body.data.find((u: any) => u.username === 'regular-user');
      assert.ok(adminUserResult);
      assert.ok(regularUserResult);

      // Verify roles are not included
      assert.equal(adminUserResult.role, undefined);
      assert.equal(regularUserResult.role, undefined);

      // Verify API keys are not included
      assert.equal(adminUserResult.apikey, undefined);
      assert.equal(regularUserResult.apikey, undefined);
    });

    test('returns 401 when not authenticated', async () => {
      await request(app)
        .get(route)
        .expect(401);
    });
  });

  describe('GET /me', () => {
    test('returns user info with role and apikey when authenticated', async () => {
      const res = await request(app)
        .get(`${route}me?apikey=${regularUser.apikey}`)
        .expect(200);

      assert.ok(res.body.success);
      assert.equal(res.body.data.username, 'regular-user');
      assert.equal(res.body.data.name, 'Regular User');
      assert.equal(res.body.data.role, 'community');
      assert.equal(res.body.data.apikey, regularUser.apikey);
    });

    test('returns 401 when not authenticated', async () => {
      await request(app)
        .get(`${route}me`)
        .expect(401);
    });
  });

  describe('GET /:id', () => {
    test('allows unauthenticated users to get other users by id', async () => {
      const res = await request(app)
        .get(`${route}${adminUser._id}`)
        .expect(200);

      assert.ok(res.body.success);
      assert.equal(res.body.data.username, 'admin-user');
      assert.equal(res.body.data.name, 'Admin User');
      assert.equal(res.body.data.role, undefined);
      assert.equal(res.body.data.apikey, undefined);
    });

    test('returns 404 for non-existent user', async () => {
      await request(app)
        .get(`${route}${new Types.ObjectId().toString()}?apikey=${adminUser.apikey}`)
        .expect(404);
    });
  });

  describe('PUT /me', () => {
    test('allows user to update their own profile', async () => {
      const profileData = {
        website_url: 'https://example.com',
        github_profile_url: 'https://github.com/exampleuser',
        gitlab_profile_url: 'https://gitlab.com/exampleuser',
        ubports_forum_username: 'exampleuser',
        donation_url: 'https://donate.example.com',
        description: 'This is my test profile description',
      };

      const res = await request(app)
        .put(`${route}me?apikey=${regularUser.apikey}`)
        .send(profileData)
        .expect(200);

      assert.ok(res.body.success);
      assert.equal(res.body.data.website_url, profileData.website_url);
      assert.equal(res.body.data.github_profile_url, profileData.github_profile_url);
      assert.equal(res.body.data.gitlab_profile_url, profileData.gitlab_profile_url);
      assert.equal(res.body.data.ubports_forum_username, profileData.ubports_forum_username);
      assert.equal(res.body.data.donation_url, profileData.donation_url);
      assert.equal(res.body.data.description, profileData.description);
      assert.equal(res.body.data.role, 'community');
      assert.equal(res.body.data.apikey, regularUser.apikey);

      const updatedUser = await User.findById(regularUser._id);
      assert.ok(updatedUser);
      assert.equal(updatedUser.website_url, profileData.website_url);
      assert.equal(updatedUser.github_profile_url, profileData.github_profile_url);
      assert.equal(updatedUser.gitlab_profile_url, profileData.gitlab_profile_url);
      assert.equal(updatedUser.ubports_forum_username, profileData.ubports_forum_username);
      assert.equal(updatedUser.donation_url, profileData.donation_url);
      assert.equal(updatedUser.description, profileData.description);
    });

    test('prevents updating restricted fields', async () => {
      const profileData = {
        website_url: 'https://example.com',
        role: 'admin', // This should be ignored for non-admin users
      };

      const res = await request(app)
        .put(`${route}me?apikey=${regularUser.apikey}`)
        .send(profileData)
        .expect(200);

      assert.ok(res.body.success);
      assert.equal(res.body.data.website_url, profileData.website_url);
      assert.notEqual(res.body.data.role, 'admin');

      const updatedUser = await User.findById(regularUser._id);
      assert.ok(updatedUser);
      assert.equal(updatedUser.role, 'community');
    });

    test('rejects description that exceeds maximum length', async () => {
      const longDescription = 'a'.repeat(201);

      await request(app)
        .put(`${route}me?apikey=${regularUser.apikey}`)
        .send({ description: longDescription })
        .expect(400);

      const user = await User.findById(regularUser._id);
      assert.ok(user);
      assert.notEqual(user.description, longDescription);
    });

    test('rejects non-HTTPS URLs', async () => {
      const profileData = {
        website_url: 'http://example.com',
      };

      await request(app)
        .put(`${route}me?apikey=${regularUser.apikey}`)
        .send(profileData)
        .expect(400);

      const user = await User.findById(regularUser._id);
      assert.ok(user);
      assert.notEqual(user.website_url, profileData.website_url);
    });

    test('rejects invalid URLs', async () => {
      const profileData = {
        github_profile_url: 'invalid-url',
      };

      await request(app)
        .put(`${route}me?apikey=${regularUser.apikey}`)
        .send(profileData)
        .expect(400);

      const user = await User.findById(regularUser._id);
      assert.ok(user);
      assert.notEqual(user.github_profile_url, profileData.github_profile_url);
    });

    test('returns 401 when not authenticated', async () => {
      await request(app)
        .put(`${route}me`)
        .send({ website_url: 'https://example.com' })
        .expect(401);
    });
  });

  describe('PUT /:id', () => {
    test('allows admin to update any user', async () => {
      const profileData = {
        website_url: 'https://example-admin-updated.com',
        role: 'trusted', // Admin should be able to update role
      };

      const res = await request(app)
        .put(`${route}${regularUser._id}?apikey=${adminUser.apikey}`)
        .send(profileData)
        .expect(200);

      assert.ok(res.body.success);
      assert.equal(res.body.data.website_url, profileData.website_url);
      assert.equal(res.body.data.role, 'trusted');

      const updatedUser = await User.findById(regularUser._id);
      assert.ok(updatedUser);
      assert.equal(updatedUser.role, 'trusted');
    });

    test('does not allows user to update their own profile by ID', async () => {
      await request(app)
        .put(`${route}${regularUser._id}?apikey=${regularUser.apikey}`)
        .send({ website_url: 'https://should-not-update.com' })
        .expect(403);

      const user = await User.findById(anotherUser._id);
      assert.ok(user);
      assert.notEqual(user.website_url, 'https://should-not-update.com');
    });

    test('prevents user from updating another user\'s profile', async () => {
      await request(app)
        .put(`${route}${anotherUser._id}?apikey=${regularUser.apikey}`)
        .send({ website_url: 'https://should-not-update.com' })
        .expect(403);

      const user = await User.findById(anotherUser._id);
      assert.ok(user);
      assert.notEqual(user.website_url, 'https://should-not-update.com');
    });

    test('returns 404 for non-existent user', async () => {
      await request(app)
        .put(`${route}${new Types.ObjectId().toString()}?apikey=${adminUser.apikey}`)
        .send({ website_url: 'https://example.com' })
        .expect(404);
    });
  });
});
