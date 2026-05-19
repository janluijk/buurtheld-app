import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { favorites } from '@/lib/db/schema';

export async function GET() {
  const session = await getSession();
  const hasSession = !!session;
  if (!hasSession) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const rows = await db
    .select({ segmentId: favorites.segmentId })
    .from(favorites)
    .where(eq(favorites.userId, session.userId));
  return NextResponse.json({ segmentIds: rows.map((r) => r.segmentId) });
}
