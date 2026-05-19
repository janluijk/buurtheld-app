import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken } from '@/lib/strava/oauth';
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

const STATE_COOKIE = 'buurtheld_oauth_state';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');

  const home = new URL('/', req.url);

  const wasDenied = !!error || !code;
  if (wasDenied) {
    home.searchParams.set('auth', 'denied');
    return NextResponse.redirect(home);
  }

  const expectedState = req.cookies.get(STATE_COOKIE)?.value;
  const stateMatches = !!expectedState && expectedState === state;
  if (!stateMatches) {
    home.searchParams.set('auth', 'state_mismatch');
    return NextResponse.redirect(home);
  }

  const token = await exchangeCodeForToken(code).catch((e) => {
    console.error('OAuth exchange failed', e);
    return null;
  });

  const isExchanged = !!token;
  if (!isExchanged) {
    home.searchParams.set('auth', 'exchange_failed');
    return NextResponse.redirect(home);
  }

  const avatarUrl = token.athlete.profile_medium || token.athlete.profile || null;
  const tokenExpiresAt = new Date(token.expires_at * 1000);

  const [row] = await db
    .insert(users)
    .values({
      stravaAthleteId: token.athlete.id,
      firstname: token.athlete.firstname,
      lastname: token.athlete.lastname,
      avatarUrl,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      tokenExpiresAt,
    })
    .onConflictDoUpdate({
      target: users.stravaAthleteId,
      set: {
        firstname: token.athlete.firstname,
        lastname: token.athlete.lastname,
        avatarUrl,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        tokenExpiresAt,
        lastLoginAt: sql`now()`,
      },
    })
    .returning({ id: users.id });

  const sessionToken = await createSessionToken({ userId: row.id });

  const res = NextResponse.redirect(home);
  res.cookies.delete(STATE_COOKIE);
  res.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
