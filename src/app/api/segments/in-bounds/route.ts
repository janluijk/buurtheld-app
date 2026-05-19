import { NextRequest, NextResponse } from 'next/server';
import { and, between } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { segments } from '@/lib/db/schema';
import type { ExploreSegment } from '../explore/route';

export async function GET(req: NextRequest) {
  const session = await getSession();
  const hasSession = !!session;
  if (!hasSession) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const boundsParam = req.nextUrl.searchParams.get('bounds');
  const parts = boundsParam?.split(',').map(Number) ?? [];
  const isValid = parts.length === 4 && parts.every(Number.isFinite);
  if (!isValid) {
    return NextResponse.json({ error: 'bounds required (sw_lat,sw_lng,ne_lat,ne_lng)' }, { status: 400 });
  }
  const [swLat, swLng, neLat, neLng] = parts;

  const rows = await db
    .select({
      id: segments.id,
      name: segments.name,
      startLat: segments.startLat,
      startLng: segments.startLng,
      endLat: segments.endLat,
      endLng: segments.endLng,
      distanceM: segments.distanceM,
      avgGrade: segments.avgGrade,
      polyline: segments.polyline,
    })
    .from(segments)
    .where(
      and(
        between(segments.startLat, swLat, neLat),
        between(segments.startLng, swLng, neLng)
      )
    );

  const out: ExploreSegment[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    startLat: r.startLat,
    startLng: r.startLng,
    endLat: r.endLat,
    endLng: r.endLng,
    distanceM: r.distanceM,
    avgGrade: r.avgGrade ?? 0,
    polyline: r.polyline,
  }));
  return NextResponse.json({ segments: out });
}
