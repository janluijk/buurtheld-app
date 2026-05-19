import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getStravaClient } from '@/lib/strava/client';
import { db } from '@/lib/db/client';
import { segments } from '@/lib/db/schema';

type StravaExploreSegment = {
  id: number;
  name: string;
  climb_category: number;
  avg_grade: number;
  start_latlng: [number, number];
  end_latlng: [number, number];
  elev_difference: number;
  distance: number;
  points: string;
};

export type ExploreSegment = {
  id: number;
  name: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  distanceM: number;
  avgGrade: number;
  polyline: string;
};

export async function GET(req: NextRequest) {
  const session = await getSession();
  const hasSession = !!session;
  if (!hasSession) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const bounds = req.nextUrl.searchParams.get('bounds');
  const hasBounds = !!bounds && bounds.split(',').length === 4;
  if (!hasBounds) {
    return NextResponse.json({ error: 'bounds required (sw_lat,sw_lng,ne_lat,ne_lng)' }, { status: 400 });
  }

  const client = await getStravaClient(session.userId);
  const res = await client.fetch(`/segments/explore?bounds=${bounds}&activity_type=running`);

  const isOk = res.ok;
  if (!isOk) {
    const text = await res.text();
    return NextResponse.json({ error: 'strava_error', status: res.status, body: text }, { status: 502 });
  }

  const payload = (await res.json()) as { segments: StravaExploreSegment[] };
  const out: ExploreSegment[] = payload.segments.map((s) => ({
    id: s.id,
    name: s.name,
    startLat: s.start_latlng[0],
    startLng: s.start_latlng[1],
    endLat: s.end_latlng[0],
    endLng: s.end_latlng[1],
    distanceM: s.distance,
    avgGrade: s.avg_grade,
    polyline: s.points,
  }));

  const hasResults = out.length > 0;
  if (hasResults) {
    await db
      .insert(segments)
      .values(
        out.map((s) => ({
          id: s.id,
          name: s.name,
          polyline: s.polyline,
          startLat: s.startLat,
          startLng: s.startLng,
          endLat: s.endLat,
          endLng: s.endLng,
          distanceM: s.distanceM,
          avgGrade: s.avgGrade,
        }))
      )
      .onConflictDoNothing({ target: segments.id });
  }

  return NextResponse.json({ segments: out });
}
