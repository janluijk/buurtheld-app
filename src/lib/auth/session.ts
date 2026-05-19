import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const SESSION_COOKIE = 'buurtheld_session';
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;

export type Session = {
  athleteId: number;
  firstname: string;
  lastname: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
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
  return result.payload as unknown as Session;
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

export { SESSION_COOKIE };
