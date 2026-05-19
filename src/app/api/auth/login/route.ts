import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { buildAuthorizeUrl } from '@/lib/strava/oauth';

const STATE_COOKIE = 'buurtheld_oauth_state';

export async function GET() {
  const state = randomBytes(16).toString('hex');
  const url = buildAuthorizeUrl(state);

  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10,
  });
  return res;
}
