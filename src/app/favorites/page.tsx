import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { athleteEfforts, favorites, segments, users } from '@/lib/db/schema';
import { FavoritesView, type FavoriteSegment } from './FavoritesView';

export default async function FavoritesPage() {
  const session = await getSession();
  const isSignedIn = !!session;
  if (!isSignedIn) {
    redirect('/');
  }
  const [userRow] = await db
    .select({ stravaAthleteId: users.stravaAthleteId })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  const stravaAthleteId = userRow?.stravaAthleteId ?? null;

  const rows = await db
    .select({
      id: segments.id,
      name: segments.name,
      polyline: segments.polyline,
      startLat: segments.startLat,
      startLng: segments.startLng,
      distanceM: segments.distanceM,
      avgGrade: segments.avgGrade,
      localLegendEnabled: segments.localLegendEnabled,
      leaderCountOverall: segments.leaderEffortCountOverall,
      localLegendAthleteId: segments.localLegendAthleteId,
      athleteRecent90d: athleteEfforts.recent90dCount,
      detailsFetchedAt: segments.detailsFetchedAt,
      effortsFetchedAt: athleteEfforts.fetchedAt,
    })
    .from(favorites)
    .innerJoin(segments, eq(favorites.segmentId, segments.id))
    .leftJoin(
      athleteEfforts,
      and(eq(athleteEfforts.segmentId, segments.id), eq(athleteEfforts.userId, session.userId))
    )
    .where(eq(favorites.userId, session.userId));

  const items: FavoriteSegment[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    polyline: r.polyline,
    startLat: r.startLat,
    startLng: r.startLng,
    distanceM: r.distanceM,
    avgGrade: r.avgGrade ?? 0,
    localLegendEnabled: r.localLegendEnabled,
    leaderCountOverall: r.leaderCountOverall,
    athleteRecent90d: r.athleteRecent90d,
    isYouTheLegend:
      stravaAthleteId !== null &&
      r.localLegendAthleteId !== null &&
      r.localLegendAthleteId === stravaAthleteId,
    detailsFetchedAt: r.detailsFetchedAt ? r.detailsFetchedAt.toISOString() : null,
    effortsFetchedAt: r.effortsFetchedAt ? r.effortsFetchedAt.toISOString() : null,
  }));

  return <FavoritesView items={items} />;
}
