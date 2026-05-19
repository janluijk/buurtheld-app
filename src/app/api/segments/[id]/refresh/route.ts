import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { getStravaClient } from '@/lib/strava/client';
import { db } from '@/lib/db/client';
import { athleteEfforts, segments, users } from '@/lib/db/schema';

type Ctx = { params: Promise<{ id: string }> };

type StravaSegmentDetails = {
  id: number;
  name: string;
  local_legend?: {
    athlete_id?: number;
    effort_count?: string | number;
    effort_counts?: { overall?: string | number; female?: string | number };
  };
};

function parseEffortCount(v: string | number | undefined): number | null {
  if (v === undefined) return null;
  const n = typeof v === 'number' ? v : parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

const EFFORTS_PER_PAGE = 200;

function toLocalIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}Z`;
}

async function countRecentEfforts(
  client: { fetch: (path: string) => Promise<Response> },
  segmentId: number
): Promise<number> {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
  const start = toLocalIso(ninetyDaysAgo);
  const end = toLocalIso(now);

  let total = 0;
  let page = 1;
  while (true) {
    const res = await client.fetch(
      `/segments/${segmentId}/all_efforts?start_date_local=${start}&end_date_local=${end}&per_page=${EFFORTS_PER_PAGE}&page=${page}`
    );
    if (!res.ok) {
      throw new Error(`all_efforts ${res.status}: ${await res.text()}`);
    }
    const efforts = (await res.json()) as unknown[];
    total += efforts.length;
    if (efforts.length < EFFORTS_PER_PAGE) break;
    page++;
  }
  return total;
}

export async function POST(_req: Request, ctx: Ctx) {
  const session = await getSession();
  const hasSession = !!session;
  if (!hasSession) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const segmentId = Number(id);
  const isValid = Number.isFinite(segmentId) && segmentId > 0;
  if (!isValid) {
    return NextResponse.json({ error: 'invalid_segment_id' }, { status: 400 });
  }

  try {
    const client = await getStravaClient(session.userId);

    const detailsRes = await client.fetch(`/segments/${segmentId}`);
    if (!detailsRes.ok) {
      const text = await detailsRes.text();
      return NextResponse.json(
        { error: 'strava_details_error', status: detailsRes.status, body: text },
        { status: 502 }
      );
    }
    const details = (await detailsRes.json()) as StravaSegmentDetails;
    const ll = details.local_legend;
    const overallNum = parseEffortCount(ll?.effort_count ?? ll?.effort_counts?.overall);
    const femaleNum = parseEffortCount(ll?.effort_counts?.female);
    const localLegendEnabled = !!ll && overallNum !== null;

    await db
      .update(segments)
      .set({
        localLegendEnabled,
        leaderEffortCountOverall: overallNum,
        leaderEffortCountFemale: femaleNum,
        localLegendAthleteId: ll?.athlete_id ?? null,
        detailsFetchedAt: sql`now()`,
      })
      .where(eq(segments.id, segmentId));

    const recentCount = await countRecentEfforts(client, segmentId);
    await db
      .insert(athleteEfforts)
      .values({ userId: session.userId, segmentId, recent90dCount: recentCount })
      .onConflictDoUpdate({
        target: [athleteEfforts.userId, athleteEfforts.segmentId],
        set: { recent90dCount: recentCount, fetchedAt: sql`now()` },
      });

    const [userRow] = await db
      .select({ stravaAthleteId: users.stravaAthleteId })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    const isYouTheLegend =
      !!ll?.athlete_id && !!userRow && userRow.stravaAthleteId === ll.athlete_id;

    return NextResponse.json({
      leaderCountOverall: overallNum,
      leaderCountFemale: femaleNum,
      athleteRecent90d: recentCount,
      isYouTheLegend,
    });
  } catch (e) {
    console.error('POST /api/segments/[id]/refresh failed', {
      userId: session.userId,
      segmentId,
      error: e,
    });
    return NextResponse.json({ error: 'server_error', message: String(e) }, { status: 500 });
  }
}

export async function GET(_req: Request, ctx: Ctx) {
  // Allow checking the joined state without re-fetching from Strava.
  const session = await getSession();
  const hasSession = !!session;
  if (!hasSession) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const segmentId = Number(id);
  if (!Number.isFinite(segmentId) || segmentId <= 0) {
    return NextResponse.json({ error: 'invalid_segment_id' }, { status: 400 });
  }
  const rows = await db
    .select({
      leaderCountOverall: segments.leaderEffortCountOverall,
      leaderCountFemale: segments.leaderEffortCountFemale,
      athleteRecent90d: athleteEfforts.recent90dCount,
      detailsFetchedAt: segments.detailsFetchedAt,
      effortsFetchedAt: athleteEfforts.fetchedAt,
    })
    .from(segments)
    .leftJoin(
      athleteEfforts,
      and(eq(athleteEfforts.segmentId, segments.id), eq(athleteEfforts.userId, session.userId))
    )
    .where(eq(segments.id, segmentId))
    .limit(1);

  return NextResponse.json(rows[0] ?? null);
}
