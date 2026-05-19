'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { decodePolyline } from '@/lib/strava/polyline';
import { AppNav } from '@/components/AppNav';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const SEGMENTS_SOURCE_ID = 'fav-segments';
const SEGMENTS_LAYER_ID = 'fav-segments-line';
const SEGMENTS_HALO_LAYER_ID = 'fav-segments-halo';
const SEGMENTS_HELD_GLOW_LAYER_ID = 'fav-segments-held-glow';
const SEGMENTS_HELD_LAYER_ID = 'fav-segments-held';
const PINS_SOURCE_ID = 'fav-pins';
const PINS_LAYER_ID = 'fav-pins-circle';
const PINS_HELD_GLOW_LAYER_ID = 'fav-pins-held-glow';
const PINS_HELD_LAYER_ID = 'fav-pins-held';

const COLOR_HELD = '#F2C94C';
const COLOR_CHASE = '#FC5200';
const COLOR_NONE = '#9CA3AF';

function segmentState(s: { isYouTheLegend: boolean; leaderCountOverall: number | null }): 'held' | 'chase' | 'none' {
  if (s.isYouTheLegend) return 'held';
  if (s.leaderCountOverall !== null) return 'chase';
  return 'none';
}

const DEEP: [number, number, number] = [255, 228, 138]; // #FFE48A warm yellow
const MID: [number, number, number] = [255, 240, 180]; // #FFF0B4
const BRIGHT: [number, number, number] = [255, 252, 220]; // #FFFCDC near-white

function lerp(a: [number, number, number], b: [number, number, number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bb = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bb})`;
}

function brightnessToColor(b: number): string {
  const c = Math.max(0, Math.min(1, b));
  if (c < 0.5) return lerp(DEEP, MID, c / 0.5);
  return lerp(MID, BRIGHT, (c - 0.5) / 0.5);
}

const SHIMMER_SAMPLES = 28;
const SHIMMER_SHARPNESS = 80;

function buildShimmerGradient(phase: number): maplibregl.ExpressionSpecification {
  const cycle = phase % 1;
  const peak = cycle;
  const intensity = Math.sin(cycle * Math.PI);
  const stops: (number | string)[] = [];
  for (let i = 0; i <= SHIMMER_SAMPLES; i++) {
    const x = i / SHIMMER_SAMPLES;
    const d = Math.abs(x - peak);
    const brightness = intensity * Math.exp(-d * d * SHIMMER_SHARPNESS);
    stops.push(x, brightnessToColor(brightness));
  }
  return [
    'interpolate',
    ['linear'],
    ['line-progress'],
    ...stops,
  ] as maplibregl.ExpressionSpecification;
}

function fitToSegment(map: MlMap, s: { polyline: string }) {
  const coords = decodePolyline(s.polyline);
  if (coords.length === 0) return;
  const lats = coords.map((c) => c[0]);
  const lngs = coords.map((c) => c[1]);
  map.fitBounds(
    [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
    { padding: 80, maxZoom: 16, duration: 600 }
  );
}

export type FavoriteSegment = {
  id: number;
  name: string;
  polyline: string;
  startLat: number;
  startLng: number;
  distanceM: number;
  avgGrade: number;
  localLegendEnabled: boolean;
  leaderCountOverall: number | null;
  athleteRecent90d: number | null;
  isYouTheLegend: boolean;
  detailsFetchedAt: string | null;
  effortsFetchedAt: string | null;
};

function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(2)} km`;
}

export function FavoritesView({ items: initialItems }: { items: FavoriteSegment[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const shimmerRafRef = useRef<number | null>(null);
  const heldLayersRef = useRef<Set<number>>(new Set());
  const heldPhaseRef = useRef<Map<number, number>>(new Map());
  const [items, setItems] = useState<FavoriteSegment[]>(initialItems);
  const itemsRef = useRef<FavoriteSegment[]>(initialItems);
  itemsRef.current = items;
  const [stillFavorite, setStillFavorite] = useState<Set<number>>(
    () => new Set(initialItems.map((i) => i.id))
  );
  const stillFavoriteRef = useRef<Set<number>>(stillFavorite);
  stillFavoriteRef.current = stillFavorite;
  const [refreshingIds, setRefreshingIds] = useState<Set<number>>(() => new Set());
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const hasContainer = !!container;
    if (!hasContainer) {
      return;
    }
    const hasItems = items.length > 0;
    const center: [number, number] = hasItems
      ? [items[0].startLng, items[0].startLat]
      : [4.9041, 52.3676];

    const map = new maplibregl.Map({
      container,
      style: STYLE_URL,
      center,
      zoom: hasItems ? 12 : 6,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      map.addSource(SEGMENTS_SOURCE_ID, {
        type: 'geojson',
        lineMetrics: true,
        data: {
          type: 'FeatureCollection',
          features: items.map((s) => ({
            type: 'Feature',
            id: s.id,
            properties: { id: s.id, state: segmentState(s) },
            geometry: {
              type: 'LineString',
              coordinates: decodePolyline(s.polyline).map(([lat, lng]) => [lng, lat]),
            },
          })),
        },
      });
      const colorByState: maplibregl.ExpressionSpecification = [
        'match',
        ['get', 'state'],
        'held',
        COLOR_HELD,
        'chase',
        COLOR_CHASE,
        COLOR_NONE,
      ];
      map.addLayer({
        id: SEGMENTS_HALO_LAYER_ID,
        source: SEGMENTS_SOURCE_ID,
        type: 'line',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#1f2937',
          'line-width': 12,
          'line-opacity': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            0.35,
            0,
          ],
        },
      });
      map.addLayer({
        id: SEGMENTS_LAYER_ID,
        source: SEGMENTS_SOURCE_ID,
        type: 'line',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': colorByState,
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            7,
            4,
          ],
          'line-opacity': 0.95,
        },
      });
      map.on('mouseenter', SEGMENTS_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', SEGMENTS_LAYER_ID, () => {
        map.getCanvas().style.cursor = '';
      });
      map.on('click', SEGMENTS_LAYER_ID, (e) => {
        const f = e.features?.[0];
        const fid = f?.id;
        if (fid === undefined) return;
        setSelectedId(Number(fid));
      });

      map.addLayer({
        id: SEGMENTS_HELD_GLOW_LAYER_ID,
        source: SEGMENTS_SOURCE_ID,
        type: 'line',
        filter: ['==', ['get', 'state'], 'held'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#E8C766',
          'line-width': 18,
          'line-blur': 8,
          'line-opacity': 0.45,
        },
      });
      syncHeldLayers();
      map.addSource(PINS_SOURCE_ID, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: items.map((s) => ({
            type: 'Feature',
            id: s.id,
            properties: { id: s.id, state: segmentState(s) },
            geometry: { type: 'Point', coordinates: [s.startLng, s.startLat] },
          })),
        },
      });
      map.addLayer({
        id: PINS_LAYER_ID,
        source: PINS_SOURCE_ID,
        type: 'circle',
        paint: {
          'circle-radius': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            10,
            6,
          ],
          'circle-color': colorByState,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: PINS_HELD_GLOW_LAYER_ID,
        source: PINS_SOURCE_ID,
        type: 'circle',
        filter: ['==', ['get', 'state'], 'held'],
        paint: {
          'circle-radius': 20,
          'circle-color': '#FFD24A',
          'circle-blur': 1,
          'circle-opacity': 0.6,
        },
      });
      map.addLayer({
        id: PINS_HELD_LAYER_ID,
        source: PINS_SOURCE_ID,
        type: 'circle',
        filter: ['==', ['get', 'state'], 'held'],
        paint: {
          'circle-radius': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            12,
            8,
          ],
          'circle-color': '#FFE48A',
          'circle-stroke-color': '#B8860B',
          'circle-stroke-width': 2,
        },
      });

      if (hasItems) {
        const coords = items.flatMap((s) =>
          decodePolyline(s.polyline).map(([lat, lng]) => [lng, lat] as [number, number])
        );
        const lats = coords.map((c) => c[1]);
        const lngs = coords.map((c) => c[0]);
        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 40, maxZoom: 14, duration: 0 }
        );
      }

      const PERIOD_MS = 3500;
      function shimmer(now: number) {
        const base = now / PERIOD_MS;
        for (const id of heldLayersRef.current) {
          const layerId = `fav-seg-held-${id}`;
          if (!map.getLayer(layerId)) continue;
          const offset = heldPhaseRef.current.get(id) ?? 0;
          const phase = (base + offset) % 1;
          map.setPaintProperty(layerId, 'line-gradient', buildShimmerGradient(phase));
        }
        shimmerRafRef.current = requestAnimationFrame(shimmer);
      }
      shimmerRafRef.current = requestAnimationFrame(shimmer);
    });

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container);

    return () => {
      if (shimmerRafRef.current !== null) cancelAnimationFrame(shimmerRafRef.current);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.getSource(SEGMENTS_SOURCE_ID)) return;
    const visibleIds = items
      .filter((s) => stillFavorite.has(s.id))
      .map((s) => s.id);
    for (const id of visibleIds) {
      map.setFeatureState(
        { source: SEGMENTS_SOURCE_ID, id },
        { selected: id === selectedId }
      );
      map.setFeatureState(
        { source: PINS_SOURCE_ID, id },
        { selected: id === selectedId }
      );
    }
    if (selectedId !== null) {
      const target = itemsRef.current.find((i) => i.id === selectedId);
      if (target) fitToSegment(map, target);
      const row = document.getElementById(`fav-row-${selectedId}`);
      row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, items, stillFavorite]);

  useEffect(() => {
    syncHeldLayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, stillFavorite]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const segSource = map.getSource(SEGMENTS_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    const pinSource = map.getSource(PINS_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (!segSource || !pinSource) return;
    segSource.setData({
      type: 'FeatureCollection',
      features: items
        .filter((s) => stillFavorite.has(s.id))
        .map((s) => ({
          type: 'Feature',
          id: s.id,
          properties: { id: s.id, state: segmentState(s) },
          geometry: {
            type: 'LineString',
            coordinates: decodePolyline(s.polyline).map(([lat, lng]) => [lng, lat]),
          },
        })),
    });
    pinSource.setData({
      type: 'FeatureCollection',
      features: items
        .filter((s) => stillFavorite.has(s.id))
        .map((s) => ({
          type: 'Feature',
          id: s.id,
          properties: { id: s.id, state: segmentState(s) },
          geometry: { type: 'Point', coordinates: [s.startLng, s.startLat] },
        })),
    });
  }, [items, stillFavorite]);

  function focusSegment(s: FavoriteSegment) {
    setSelectedId(s.id);
  }

  async function refreshAll() {
    const unrefreshed = visible.filter((s) => !s.detailsFetchedAt && !s.effortsFetchedAt);
    const refreshed = visible.filter((s) => s.detailsFetchedAt || s.effortsFetchedAt);
    await Promise.all(unrefreshed.map((s) => refreshSegment(s.id)));
    await Promise.all(refreshed.map((s) => refreshSegment(s.id)));
  }

  async function refreshSegment(segmentId: number) {
    setRefreshingIds((prev) => new Set(prev).add(segmentId));
    setRefreshError(null);
    const res = await fetch(`/api/segments/${segmentId}/refresh`, { method: 'POST' }).catch(
      () => null
    );
    const isOk = !!res && res.ok;
    if (!isOk) {
      const body = res ? await res.text().catch(() => '') : '';
      setRefreshError(`Refresh failed${body ? `: ${body}` : ''}`);
    } else {
      const data = (await res!.json()) as {
        leaderCountOverall: number | null;
        athleteRecent90d: number | null;
        isYouTheLegend: boolean;
      };
      const nowIso = new Date().toISOString();
      setItems((prev) =>
        prev.map((i) =>
          i.id === segmentId
            ? {
                ...i,
                leaderCountOverall: data.leaderCountOverall,
                athleteRecent90d: data.athleteRecent90d,
                isYouTheLegend: data.isYouTheLegend,
                detailsFetchedAt: nowIso,
                effortsFetchedAt: nowIso,
              }
            : i
        )
      );
    }
    setRefreshingIds((prev) => {
      const next = new Set(prev);
      next.delete(segmentId);
      return next;
    });
  }

  async function unstar(segmentId: number) {
    const prev = stillFavorite;
    const next = new Set(prev);
    next.delete(segmentId);
    setStillFavorite(next);
    const res = await fetch(`/api/favorites/${segmentId}`, { method: 'DELETE' }).catch(() => null);
    const isOk = !!res && res.ok;
    if (!isOk) {
      setStillFavorite(prev);
    }
  }

  function syncHeldLayers() {
    const map = mapRef.current;
    if (!map) return;
    if (!map.getSource(SEGMENTS_SOURCE_ID)) return;
    const target = new Set(
      itemsRef.current
        .filter((i) => i.isYouTheLegend && stillFavoriteRef.current.has(i.id))
        .map((i) => i.id)
    );
    for (const id of Array.from(heldLayersRef.current)) {
      if (!target.has(id)) {
        const lid = `fav-seg-held-${id}`;
        if (map.getLayer(lid)) map.removeLayer(lid);
        heldLayersRef.current.delete(id);
        heldPhaseRef.current.delete(id);
      }
    }
    for (const id of target) {
      if (heldLayersRef.current.has(id)) continue;
      const lid = `fav-seg-held-${id}`;
      const beforeId = map.getLayer(PINS_HELD_GLOW_LAYER_ID)
        ? PINS_HELD_GLOW_LAYER_ID
        : map.getLayer(PINS_LAYER_ID)
        ? PINS_LAYER_ID
        : undefined;
      map.addLayer(
        {
          id: lid,
          source: SEGMENTS_SOURCE_ID,
          type: 'line',
          filter: ['==', ['get', 'id'], id],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-width': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              10,
              7,
            ],
            'line-gradient': buildShimmerGradient(Math.random()),
          },
        },
        beforeId
      );
      map.on('mouseenter', lid, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', lid, () => {
        map.getCanvas().style.cursor = '';
      });
      map.on('click', lid, (e) => {
        const f = e.features?.[0];
        const fid = f?.id;
        if (fid === undefined) return;
        setSelectedId(Number(fid));
      });
      heldLayersRef.current.add(id);
      heldPhaseRef.current.set(id, Math.random());
    }
  }

  function sortKey(s: FavoriteSegment): [number, number] {
    if (s.isYouTheLegend) return [0, 0];
    if (s.leaderCountOverall !== null) {
      const remaining = Math.max(0, s.leaderCountOverall + 1 - (s.athleteRecent90d ?? 0));
      return [1, remaining * s.distanceM];
    }
    return [2, 0];
  }

  const visible = items
    .filter((i) => stillFavorite.has(i.id))
    .sort((a, b) => {
      const [aBucket, aValue] = sortKey(a);
      const [bBucket, bValue] = sortKey(b);
      if (aBucket !== bBucket) return aBucket - bBucket;
      return aValue - bValue;
    });

  return (
    <div className="flex flex-col" style={{ height: '100vh' }}>
      <AppNav />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div className="relative md:flex-1" style={{ minHeight: '50vh' }}>
        <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      </div>
      <aside className="flex-1 overflow-y-auto border-t border-neutral-200 bg-white md:max-w-sm md:border-l md:border-t-0">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3">
          <div className="text-sm font-semibold">
            {visible.length} favorite{visible.length === 1 ? '' : 's'}
          </div>
          {visible.length > 0 && (
            <button
              type="button"
              onClick={() => void refreshAll()}
              disabled={refreshingIds.size > 0}
              className="rounded-md bg-[#FC5200] px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-60"
            >
              {refreshingIds.size > 0
                ? `Refreshing ${refreshingIds.size}/${visible.length}…`
                : 'Refresh all'}
            </button>
          )}
        </div>
        {refreshError && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
            {refreshError}
          </div>
        )}
        {visible.length === 0 ? (
          <div className="p-4 text-sm text-neutral-500">
            No favorites yet. Star segments from the{' '}
            <a className="text-[#FC5200] underline" href="/explore">
              Explore
            </a>{' '}
            page.
          </div>
        ) : (
          <ul>
            {visible.map((s) => {
              const isRefreshing = refreshingIds.has(s.id);
              const wasRefreshed = !!s.detailsFetchedAt || !!s.effortsFetchedAt;
              const hasLeader = s.leaderCountOverall !== null;
              const athleteCount = s.athleteRecent90d ?? 0;
              const isYouTheLegend = s.isYouTheLegend;
              const remainingAttempts = isYouTheLegend
                ? 0
                : hasLeader
                ? Math.max(0, (s.leaderCountOverall ?? 0) + 1 - athleteCount)
                : null;
              const remainingDistanceM = remainingAttempts !== null
                ? remainingAttempts * s.distanceM
                : null;
              const isSelected = s.id === selectedId;
              const baseClass = isYouTheLegend
                ? 'relative flex items-start gap-3 border-b border-[#FC5200]/40 bg-gradient-to-r from-[#FC5200]/15 via-[#FC5200]/[0.07] to-transparent px-4 py-3 hover:from-[#FC5200]/20'
                : 'flex items-start gap-3 border-b border-neutral-100 px-4 py-3 hover:bg-neutral-50';
              const rowClass = isSelected
                ? `${baseClass} ring-2 ring-inset ring-[#FC5200]`
                : baseClass;
              return (
                <li key={s.id} id={`fav-row-${s.id}`} className={rowClass}>
                  {isYouTheLegend && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src="/laurel.png"
                      alt="Local Legend"
                      title="Local Legend"
                      className="pointer-events-none absolute right-2 top-2 h-8 w-8"
                    />
                  )}
                  <button
                    type="button"
                    aria-label="Unstar segment"
                    onClick={() => void unstar(s.id)}
                    className="text-2xl leading-none text-[#FC5200]"
                  >
                    ★
                  </button>
                  <div className="relative min-w-0 flex-1">
                    <div
                      className="cursor-pointer truncate font-medium"
                      onClick={() => focusSegment(s)}
                    >
                      {s.name}
                    </div>
                    <div className="mt-0.5 text-xs text-neutral-500">{formatKm(s.distanceM)}</div>
                    {wasRefreshed ? (
                      isYouTheLegend ? (
                        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                          <div className="text-neutral-500">Your efforts (90d)</div>
                          <div className="text-right font-medium">{athleteCount}</div>
                        </div>
                      ) : (
                        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                          <div className="text-neutral-500">Leader (90d)</div>
                          <div className="text-right font-medium">
                            {hasLeader ? s.leaderCountOverall : '—'}
                          </div>
                          <div className="text-neutral-500">You (90d)</div>
                          <div className="text-right font-medium">{athleteCount}</div>
                          {hasLeader ? (
                            <>
                              <div className="text-neutral-500">Attempts to claim</div>
                              <div className="text-right font-semibold text-[#FC5200]">
                                {remainingAttempts}
                              </div>
                              <div className="text-neutral-500">Distance to claim</div>
                              <div className="text-right font-semibold text-[#FC5200]">
                                {formatKm(remainingDistanceM ?? 0)}
                              </div>
                            </>
                          ) : (
                            <div className="col-span-2 mt-1 text-xs italic text-neutral-400">
                              Local Legend not active for this segment.
                            </div>
                          )}
                        </div>
                      )
                    ) : (
                      <div className="mt-2 text-xs italic text-neutral-400">
                        No stats yet — press Refresh.
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => void refreshSegment(s.id)}
                      disabled={isRefreshing}
                      className="mt-2 rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-60"
                    >
                      {isRefreshing ? 'Refreshing…' : 'Refresh'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
      </div>
    </div>
  );
}
