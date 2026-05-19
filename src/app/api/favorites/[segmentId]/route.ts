import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { favorites, segments } from '@/lib/db/schema';

type Ctx = { params: Promise<{ segmentId: string }> };

async function resolveSegmentId(ctx: Ctx): Promise<number | null> {
  const { segmentId } = await ctx.params;
  const id = Number(segmentId);
  const isValid = Number.isFinite(id) && id > 0;
  return isValid ? id : null;
}

export async function POST(_req: Request, ctx: Ctx) {
  const session = await getSession();
  const hasSession = !!session;
  if (!hasSession) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const segmentId = await resolveSegmentId(ctx);
  if (segmentId === null) {
    return NextResponse.json({ error: 'invalid_segment_id' }, { status: 400 });
  }
  try {
    const exists = await db
      .select({ id: segments.id })
      .from(segments)
      .where(eq(segments.id, segmentId))
      .limit(1);
    const isCached = exists.length > 0;
    if (!isCached) {
      return NextResponse.json({ error: 'segment_not_cached' }, { status: 404 });
    }
    await db
      .insert(favorites)
      .values({ userId: session.userId, segmentId })
      .onConflictDoNothing();
    return NextResponse.json({ favorited: true });
  } catch (e) {
    console.error('POST /api/favorites failed', { userId: session.userId, segmentId, error: e });
    return NextResponse.json({ error: 'server_error', message: String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await getSession();
  const hasSession = !!session;
  if (!hasSession) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const segmentId = await resolveSegmentId(ctx);
  if (segmentId === null) {
    return NextResponse.json({ error: 'invalid_segment_id' }, { status: 400 });
  }
  await db
    .delete(favorites)
    .where(and(eq(favorites.userId, session.userId), eq(favorites.segmentId, segmentId)));
  return NextResponse.json({ favorited: false });
}
