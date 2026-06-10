import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test, describe, beforeEach, before, after } from 'node:test';

import type { Request } from 'express';
import type { DoneCallback, StrategyCreatedStatic } from 'passport';
import passport from 'passport';
import request from 'supertest';
import { type App } from 'supertest/types';

import * as api from '.';
import { User } from '../db/user';
import factory, { type TestUser } from '../tests/factory';
import { cleanMongoose, closeMongoose, waitForMongoose } from '../tests/utils';
import { type GithubProfile, type GitlabProfile, type UbuntuProfile } from '../utils/auth.schema';
import { config } from '../utils/config';

interface PassportStrategy {
  authenticate(this: StrategyCreatedStatic, req: Request): void;
}

type UbuntuVerifyFn = (identifier: string, profile: UbuntuProfile, done: DoneCallback) => void;

type OAuthVerifyFn = (accessToken: string, refreshToken: string, profile: GithubProfile | GitlabProfile, done: DoneCallback) => void;

function getStrategy(name: string): PassportStrategy {
  return (passport as unknown as { _strategy: (name: string) => PassportStrategy })._strategy(name);
}

function callUbuntuVerify(strategy: PassportStrategy, identifier: string, profile: UbuntuProfile): Promise<Express.User> {
  const verify = (strategy as unknown as { _verify: UbuntuVerifyFn })._verify;
  return new Promise<Express.User>((resolve, reject) => {
    verify(identifier, profile, (err, user) => {
      if (err) reject(err);
      else if (user) resolve(user);
      else reject(new Error('User not returned from verify'));
    });
  });
}

function callOAuthVerify(
  strategy: PassportStrategy,
  accessToken: string,
  refreshToken: string,
  profile: GithubProfile | GitlabProfile,
): Promise<Express.User> {
  const verify = (strategy as unknown as { _verify: OAuthVerifyFn })._verify;
  return new Promise<Express.User>((resolve, reject) => {
    verify(accessToken, refreshToken, profile, (err, user) => {
      if (err) reject(err);
      else if (user) resolve(user);
      else reject(new Error('User not returned from verify'));
    });
  });
}

function makeSessionCookie(passportUser: string, secret: string): string {
  const data = JSON.stringify({ passport: { user: passportUser } });
  const b64 = Buffer.from(data).toString('base64');
  const sigData = `opensession=${b64}`;
  const sig = crypto.createHmac('sha1', secret).update(sigData).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `opensession=${b64}; opensession.sig=${sig}`;
}

function makeSessionCookieWithData(data: Record<string, unknown>, secret: string): string {
  const json = JSON.stringify(data);
  const b64 = Buffer.from(json).toString('base64');
  const sigData = `opensession=${b64}`;
  const sig = crypto.createHmac('sha1', secret).update(sigData).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `opensession=${b64}; opensession.sig=${sig}`;
}

function parseSetCookieSession(setCookieHeader: string | string[] | undefined): Record<string, unknown> | null {
  if (!setCookieHeader) {
    return null;
  }

  const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  const sessionCookie = cookies.find((c) => c.startsWith('opensession='));
  if (!sessionCookie) {
    return null;
  }

  const match = sessionCookie.match(/^opensession=([^;]+)/);
  if (!match) {
    return null;
  }

  try {
    const json = Buffer.from(match[1], 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

describe('Auth API', () => {
  let app: App;
  let user: TestUser;

  before(async () => {
    await waitForMongoose();

    app = api.setup();
  });

  after(async () => {
    await closeMongoose();
  });

  beforeEach(async () => {
    await cleanMongoose();

    user = await factory.user({
      email: 'test@example.com',
      name: 'Test User',
      username: 'testuser',
    });
  });

  describe('GET /auth/me', () => {
    test('returns 401 when not authenticated', async () => {
      const res = await request(app).get('/auth/me').expect(401);

      assert.equal(res.body.success, false);
      assert.equal(res.body.data, null);
      assert.equal(res.body.message, 'User not logged in');
    });

    test('returns user data when authenticated via session cookie', async () => {
      const cookie = makeSessionCookie(user.email, config.server.session_secret);

      const res = await request(app).get('/auth/me').set('Cookie', cookie).expect(200);

      assert.ok(res.body.success);
      assert.equal(res.body.data._id, user._id.toString());
      assert.equal(res.body.data.name, user.name);
      assert.equal(res.body.data.language, user.language);
      assert.equal(res.body.data.username, user.username);
      assert.equal(res.body.data.apikey, user.apikey);
      assert.equal(res.body.data.role, user.role);
      assert.equal(res.body.message, null);
    });
  });

  describe('GET /auth/logout', () => {
    test('redirects to /', async () => {
      await request(app).get('/auth/logout').expect(302).expect('Location', '/');
    });
  });

  describe('POST /auth/ubuntu', () => {
    test('saveReturnTo stores valid next URL in session', async (t) => {
      const ubuntuStrategy = getStrategy('ubuntu');
      t.mock.method(ubuntuStrategy, 'authenticate', function (this: StrategyCreatedStatic, _req: Request) {
        this.redirect('https://login.ubuntu.com/');
      });

      const res = await request(app).post('/auth/ubuntu?next=/manage').expect(302);

      const session = parseSetCookieSession(res.get('Set-Cookie'));
      assert.ok(session);
      assert.equal(session.returnTo, '/manage');
    });

    test('saveReturnTo does not store external next URL', async (t) => {
      const ubuntuStrategy = getStrategy('ubuntu');
      t.mock.method(ubuntuStrategy, 'authenticate', function (this: StrategyCreatedStatic, _req: Request) {
        this.redirect('https://login.ubuntu.com/');
      });

      const res = await request(app).post('/auth/ubuntu?next=http://evil.com').expect(302);

      const session = parseSetCookieSession(res.get('Set-Cookie'));
      assert.equal(session, null);
    });
  });

  describe('GET /auth/ubuntu/return', () => {
    test('redirects to /manage after successful login', async (t) => {
      const ubuntuStrategy = getStrategy('ubuntu');
      t.mock.method(ubuntuStrategy, 'authenticate', function (this: StrategyCreatedStatic, _req: Request) {
        this.success(user as Express.User);
      });

      const res = await request(app).get('/auth/ubuntu/return').expect(302);

      assert.equal(res.headers.location, '/manage');
    });

    test('redirects to returnTo after successful login', async (t) => {
      const ubuntuStrategy = getStrategy('ubuntu');
      t.mock.method(ubuntuStrategy, 'authenticate', function (this: StrategyCreatedStatic, _req: Request) {
        this.success(user as Express.User);
      });

      const cookie = makeSessionCookieWithData({ returnTo: '/dashboard' }, config.server.session_secret);
      const res = await request(app).get('/auth/ubuntu/return').set('Cookie', cookie).expect(302);

      assert.equal(res.headers.location, '/dashboard?key=' + user.apikey);
    });

    test('redirects to /logged-in with apiKey for OpenStore App user-agent', async (t) => {
      const ubuntuStrategy = getStrategy('ubuntu');
      t.mock.method(ubuntuStrategy, 'authenticate', function (this: StrategyCreatedStatic, _req: Request) {
        this.success(user as Express.User);
      });

      const res = await request(app).get('/auth/ubuntu/return').set('User-Agent', 'OpenStore App').expect(302);

      assert.equal(res.headers.location, '/logged-in?apiKey=' + user.apikey);
    });
  });

  describe('Ubuntu verify callback', () => {
    test('creates a new user on first-time login', async () => {
      const ubuntuStrategy = getStrategy('ubuntu');

      const identifier = 'https://login.ubuntu.com/+id/newuser123';
      const profile: UbuntuProfile = {
        email: 'newuser@example.com',
        fullname: 'New User',
        nickname: 'newuser',
        language: 'fr',
      };

      const savedUser = await callUbuntuVerify(ubuntuStrategy, identifier, profile);

      assert.ok(savedUser);
      assert.equal(savedUser.ubuntu_id, identifier);
      assert.equal(savedUser.email, 'newuser@example.com');
      assert.equal(savedUser.name, 'New User');
      assert.equal(savedUser.username, 'newuser');
      assert.equal(savedUser.language, 'fr');
      assert.ok(savedUser.apikey);

      const dbUser = await User.findById(savedUser._id);
      assert.ok(dbUser);
      assert.equal(dbUser.ubuntu_id, identifier);
    });

    test('finds existing user by ubuntu_id on returning login', async () => {
      const existingUser = await factory.user({
        ubuntu_id: 'https://login.ubuntu.com/+id/returning123',
        email: 'returning@example.com',
        name: 'Old Name',
        username: 'oldname',
        language: 'de',
      });

      const ubuntuStrategy = getStrategy('ubuntu');

      const profile: UbuntuProfile = {
        email: 'returning@example.com',
        fullname: 'Updated Name',
        nickname: 'updatedname',
        language: 'en',
      };

      const savedUser = await callUbuntuVerify(ubuntuStrategy, existingUser.ubuntu_id!, profile);

      assert.ok(savedUser);
      assert.equal(savedUser._id.toString(), existingUser._id.toString());
      assert.equal(savedUser.name, 'Updated Name');
      assert.equal(savedUser.username, 'updatedname');
      assert.equal(savedUser.language, 'en');

      const dbUser = await User.findById(existingUser._id);
      assert.equal(dbUser?.name, 'Updated Name');
      assert.equal(dbUser.username, 'updatedname');
    });

    test('links account by email when no ubuntu_id match exists', async () => {
      const existingUser = await factory.user({
        email: 'linkme@example.com',
        name: 'Link Me',
        username: 'linkme',
      });

      const ubuntuStrategy = getStrategy('ubuntu');

      const identifier = 'https://login.ubuntu.com/+id/linkme123';
      const profile: UbuntuProfile = {
        email: 'linkme@example.com',
        fullname: 'Link Me',
        nickname: 'linkme',
        language: 'en',
      };

      const savedUser = await callUbuntuVerify(ubuntuStrategy, identifier, profile);

      assert.ok(savedUser);
      assert.equal(savedUser._id.toString(), existingUser._id.toString());
      assert.equal(savedUser.ubuntu_id, identifier);
      assert.equal(savedUser.email, 'linkme@example.com');

      const dbUser = await User.findById(existingUser._id);
      assert.equal(dbUser?.ubuntu_id, identifier);
    });

    test('handles email as array from profile', async () => {
      const ubuntuStrategy = getStrategy('ubuntu');

      const identifier = 'https://login.ubuntu.com/+id/arrayemail123';
      const profile: UbuntuProfile = {
        email: ['arr-email@example.com'],
        fullname: 'Array Email',
        nickname: 'arrayemail',
        language: 'en',
      };

      const savedUser = await callUbuntuVerify(ubuntuStrategy, identifier, profile);

      assert.ok(savedUser);
      assert.equal(savedUser.email, 'arr-email@example.com');
    });

    test('replaces ubports-related terms in name', async () => {
      const ubuntuStrategy = getStrategy('ubuntu');

      const identifier = 'https://login.ubuntu.com/+id/ubportsuser';
      const profile: UbuntuProfile = {
        email: 'user@example.com',
        fullname: 'Ubuntu Touch Fan',
        nickname: 'ubports_fan',
        language: 'en',
      };

      const savedUser = await callUbuntuVerify(ubuntuStrategy, identifier, profile);

      assert.ok(savedUser);
      assert.equal(savedUser.name, 'user Fan');
      assert.equal(savedUser.username, 'user_fan');
    });
  });

  describe('GitHub verify callback', () => {
    test('creates a new user on first-time login', async () => {
      const githubStrategy = getStrategy('github');

      const accessToken = 'test-access-token';
      const refreshToken = 'test-refresh-token';
      const profile: GithubProfile = {
        id: '12345',
        username: 'githubuser',
        displayName: 'GitHub User',
        emails: [{ value: 'github@example.com', verified: true }],
      };

      const savedUser = await callOAuthVerify(githubStrategy, accessToken, refreshToken, profile);

      assert.ok(savedUser);
      assert.equal(savedUser.github_id, '12345');
      assert.equal(savedUser.email, 'github@example.com');
      assert.equal(savedUser.name, 'GitHub User');
      assert.equal(savedUser.username, 'githubuser');
      assert.ok(savedUser.apikey);

      const dbUser = await User.findById(savedUser._id);
      assert.ok(dbUser);
      assert.equal(dbUser.github_id, '12345');
    });

    test('finds existing user by github_id on returning login', async () => {
      const existingUser = await factory.user({
        github_id: '67890',
        email: 'returning-github@example.com',
        name: 'Old GitHub Name',
        username: 'oldgithub',
      });

      const githubStrategy = getStrategy('github');

      const profile: GithubProfile = {
        id: '67890',
        username: 'newgithub',
        displayName: 'Updated GitHub Name',
        emails: [{ value: 'returning-github@example.com', verified: true }],
      };

      const savedUser = await callOAuthVerify(githubStrategy, 'access-token', 'refresh-token', profile);

      // GitHub verify callback preserves existing user's name and username
      assert.ok(savedUser);
      assert.equal(savedUser._id.toString(), existingUser._id.toString());
      assert.equal(savedUser.name, 'Old GitHub Name');
      assert.equal(savedUser.username, 'oldgithub');

      const dbUser = await User.findById(existingUser._id);
      assert.equal(dbUser?.name, 'Old GitHub Name');
    });

    test('links account by email when no github_id match exists', async () => {
      const existingUser = await factory.user({
        email: 'link-github@example.com',
        name: 'Link GitHub',
        username: 'linkgithub',
      });

      const githubStrategy = getStrategy('github');

      const profile: GithubProfile = {
        id: '11111',
        username: 'linkgithub',
        displayName: 'Link GitHub',
        emails: [{ value: 'link-github@example.com', verified: true }],
      };

      const savedUser = await callOAuthVerify(githubStrategy, 'access-token', 'refresh-token', profile);

      assert.ok(savedUser);
      assert.equal(savedUser._id.toString(), existingUser._id.toString());
      assert.equal(savedUser.github_id, '11111');

      const dbUser = await User.findById(existingUser._id);
      assert.equal(dbUser?.github_id, '11111');
    });

    test('uses only verified emails for lookup', async () => {
      const existingUser = await factory.user({
        email: 'verified-github@example.com',
        name: 'Verified GitHub',
        username: 'verifiedgithub',
      });

      const githubStrategy = getStrategy('github');

      const profile: GithubProfile = {
        id: '22222',
        username: 'vgithub',
        displayName: 'Verified GitHub',
        emails: [
          { value: 'unverified@example.com', verified: false },
          { value: 'verified-github@example.com', verified: true },
        ],
      };

      const savedUser = await callOAuthVerify(githubStrategy, 'access-token', 'refresh-token', profile);

      assert.ok(savedUser);
      assert.equal(savedUser._id.toString(), existingUser._id.toString());
      assert.equal(savedUser.github_id, '22222');
    });
  });

  describe('GitLab verify callback', () => {
    test('creates a new user on first-time login', async () => {
      const gitlabStrategy = getStrategy('gitlab');

      const profile: GitlabProfile = {
        id: '99999',
        username: 'gitlabuser',
        displayName: 'GitLab User',
        emails: [{ value: 'gitlab@example.com' }],
      };

      const savedUser = await callOAuthVerify(gitlabStrategy, 'access-token', 'refresh-token', profile);

      assert.ok(savedUser);
      assert.equal(savedUser.gitlab_id, '99999');
      assert.equal(savedUser.email, 'gitlab@example.com');
      assert.equal(savedUser.name, 'GitLab User');
      assert.equal(savedUser.username, 'gitlabuser');
      assert.ok(savedUser.apikey);

      const dbUser = await User.findById(savedUser._id);
      assert.ok(dbUser);
      assert.equal(dbUser.gitlab_id, '99999');
    });

    test('finds existing user by gitlab_id on returning login', async () => {
      const existingUser = await factory.user({
        gitlab_id: '88888',
        email: 'returning-gitlab@example.com',
        name: 'Old GitLab Name',
        username: 'oldgitlab',
      });

      const gitlabStrategy = getStrategy('gitlab');

      const profile: GitlabProfile = {
        id: '88888',
        username: 'newgitlab',
        displayName: 'Updated GitLab Name',
        emails: [{ value: 'returning-gitlab@example.com' }],
      };

      const savedUser = await callOAuthVerify(gitlabStrategy, 'access-token', 'refresh-token', profile);

      // GitLab verify callback preserves existing user's name and username
      assert.ok(savedUser);
      assert.equal(savedUser._id.toString(), existingUser._id.toString());
      assert.equal(savedUser.name, 'Old GitLab Name');
      assert.equal(savedUser.username, 'oldgitlab');

      const dbUser = await User.findById(existingUser._id);
      assert.equal(dbUser?.name, 'Old GitLab Name');
    });

    test('links account by email when no gitlab_id match exists', async () => {
      const existingUser = await factory.user({
        email: 'link-gitlab@example.com',
        name: 'Link GitLab',
        username: 'linkgitlab',
      });

      const gitlabStrategy = getStrategy('gitlab');

      const profile: GitlabProfile = {
        id: '77777',
        username: 'linkgitlab',
        displayName: 'Link GitLab',
        emails: [{ value: 'link-gitlab@example.com' }],
      };

      const savedUser = await callOAuthVerify(gitlabStrategy, 'access-token', 'refresh-token', profile);

      assert.ok(savedUser);
      assert.equal(savedUser._id.toString(), existingUser._id.toString());
      assert.equal(savedUser.gitlab_id, '77777');

      const dbUser = await User.findById(existingUser._id);
      assert.equal(dbUser?.gitlab_id, '77777');
    });

    test('does not link by email when profile has no emails', async () => {
      const gitlabStrategy = getStrategy('gitlab');

      const profile: GitlabProfile = {
        id: '66666',
        username: 'noemaillink',
        displayName: 'No Email Link',
        emails: [],
      };

      const savedUser = await callOAuthVerify(gitlabStrategy, 'access-token', 'refresh-token', profile);

      assert.ok(savedUser);
      assert.equal(savedUser.gitlab_id, '66666');
      assert.equal(savedUser.email, undefined);
    });
  });
});
