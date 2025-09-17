import { db, sql, UserCache } from 'astro:db';
import crypto from 'node:crypto';

import { UserSchema, type UserData } from './schema';

export async function invalidateUserCache(apikey: string) {
  const hash = crypto.createHash('sha256');
  hash.update(apikey);
  const lookupHash = hash.copy().digest('hex');

  await db.delete(UserCache).where(sql`${UserCache.lookupHash} = ${lookupHash}`);
}

export async function getUser(apikey: string, useCache = true): Promise<UserData | undefined> {
  const hash = crypto.createHash('sha256');
  hash.update(apikey);
  const lookupHash = hash.copy().digest('hex');

  if (useCache) {
    const users = await db.select().from(UserCache).where(sql`${UserCache.lookupHash} = ${lookupHash}`);
    const cachedUser = users.length === 1 ? users[0] : undefined;
    if (cachedUser) {
      if (cachedUser.expiresAt.getTime() > new Date().getTime()) {
        // TODO this isn't the full userdata, make the types conditional on useCache
        return cachedUser as UserData;
      }
      else {
        await invalidateUserCache(apikey);
      }
    }
  }

  const userResponse = await fetch(`${import.meta.env.PUBLIC_API_URL}api/users/me?apikey=${apikey}`, { headers: { 'X-Source': 'openstore-web-next' } });

  if (userResponse.status !== 200) {
    return undefined;
  }

  const { data } = await userResponse.json()
  const user = UserSchema.parse(data);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 2);

  if (useCache) {
    await db.insert(UserCache).values({
      _id: user._id,
      lookupHash,
      name: user.name ?? '',
      username: user.username,
      role: user.role ?? 'community',
      avatar: user.avatar,
      expiresAt,
    });
  }

  return user;
}
