import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users, type User } from '@/lib/db/schema';
import { refreshAccessToken } from './oauth';

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';
const REFRESH_LEEWAY_MS = 60 * 1000;

async function ensureFreshToken(user: User): Promise<User> {
  const isStillFresh = user.tokenExpiresAt.getTime() - REFRESH_LEEWAY_MS > Date.now();
  if (isStillFresh) {
    return user;
  }

  const refreshed = await refreshAccessToken(user.refreshToken);
  const tokenExpiresAt = new Date(refreshed.expires_at * 1000);

  const [updated] = await db
    .update(users)
    .set({
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      tokenExpiresAt,
    })
    .where(eq(users.id, user.id))
    .returning();

  return updated;
}

async function loadUser(userId: number): Promise<User> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  const exists = !!user;
  if (!exists) {
    throw new Error(`No user row for id ${userId}`);
  }
  return user;
}

export type StravaClient = {
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
};

export async function getStravaClient(userId: number): Promise<StravaClient> {
  let user = await loadUser(userId);
  user = await ensureFreshToken(user);

  async function call(path: string, init?: RequestInit): Promise<Response> {
    const url = path.startsWith('http') ? path : `${STRAVA_API_BASE}${path}`;
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${user.accessToken}`);
    const res = await fetch(url, { ...init, headers });

    const isUnauthorized = res.status === 401;
    if (!isUnauthorized) {
      return res;
    }

    user = await ensureFreshToken({
      ...user,
      tokenExpiresAt: new Date(0),
    });
    const retryHeaders = new Headers(init?.headers);
    retryHeaders.set('Authorization', `Bearer ${user.accessToken}`);
    return fetch(url, { ...init, headers: retryHeaders });
  }

  return { fetch: call };
}
