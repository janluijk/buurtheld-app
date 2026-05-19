import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users, type User } from '@/lib/db/schema';

const SESSION_COOKIE = 'buurtheld_session';
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;

export type Session = {
  userId: number;
};

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  const hasSecret = !!secret;
  if (!hasSecret) {
    throw new Error('SESSION_SECRET is not set');
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(session: Session): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  const result = await jwtVerify(token, getSecret()).catch(() => null);
  const isValid = !!result;
  if (!isValid) {
    return null;
  }
  const payload = result.payload as { userId?: unknown };
  const hasUserId = typeof payload.userId === 'number';
  if (!hasUserId) {
    return null;
  }
  return { userId: payload.userId as number };
}

export async function setSessionCookie(session: Session): Promise<void> {
  const token = await createSessionToken(session);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const hasToken = !!token;
  if (!hasToken) {
    return null;
  }
  return verifySessionToken(token);
}

export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession();
  const hasSession = !!session;
  if (!hasSession) {
    return null;
  }
  const rows = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  return rows[0] ?? null;
}

export { SESSION_COOKIE };
