'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MlMap, LngLatBoundsLike } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ExploreSegment } from '@/app/api/segments/explore/route';
import { decodePolyline } from '@/lib/strava/polyline';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const DEFAULT_CENTER: [number, number] = [4.9041, 52.3676];
const DEFAULT_ZOOM = 13;
const MAX_VIEWPORT_KM = 20;
const SEGMENTS_SOURCE_ID = 'segments';
const SEGMENTS_LAYER_ID = 'segments-line';

export function ExploreMap({ initialFavoriteIds }: { initialFavoriteIds: number[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const fetchSeqRef = useRef(0);
  const [segments, setSegments] = useState<ExploreSegment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(() => new Set(initialFavoriteIds));

  useEffect(() => {
    const container = containerRef.current;
    const hasContainer = !!container;
    if (!hasContainer) {
      return;
    }

    const map = new maplibregl.Map({
      container,
      style: STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), 'top-right');

    map.on('load', () => {
      map.addSource(SEGMENTS_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: SEGMENTS_LAYER_ID,
        source: SEGMENTS_SOURCE_ID,
        type: 'line',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#FC5200',
          'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 6, 4],
          'line-opacity': 0.85,
        },
      });
      void refetchFromCache();
    });

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function currentBoundsString(): string | null {
    const map = mapRef.current;
    if (!map) return null;
    const b = map.getBounds();
    return `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
  }

  function viewportIsTooWide(): boolean {
    const map = mapRef.current;
    if (!map) return false;
    const b = map.getBounds();
    const latKm = (b.getNorth() - b.getSouth()) * 111;
    const avgLat = ((b.getNorth() + b.getSouth()) / 2) * (Math.PI / 180);
    const lngKm = (b.getEast() - b.getWest()) * 111 * Math.cos(avgLat);
    return latKm > MAX_VIEWPORT_KM || lngKm > MAX_VIEWPORT_KM;
  }

  async function refetchFromCache() {
    const bounds = currentBoundsString();
    if (!bounds) return;
    const seq = ++fetchSeqRef.current;
    setError(null);
    const res = await fetch(`/api/segments/in-bounds?bounds=${bounds}`, {
      cache: 'no-store',
    }).catch(() => null);
    const isStale = seq !== fetchSeqRef.current;
    if (isStale) return;
    const isOk = !!res && res.ok;
    if (!isOk) {
      setError('Failed to load cached segments');
      return;
    }
    const data = (await res!.json()) as { segments: ExploreSegment[] };
    setSegments(data.segments);
    drawSegments(data.segments);
  }

  async function discoverHere() {
    const bounds = currentBoundsString();
    if (!bounds) return;
    if (viewportIsTooWide()) {
      setError('Zoom in to discover segments (max 20 km across).');
      return;
    }
    const seq = ++fetchSeqRef.current;
    setIsLoading(true);
    setError(null);
    const res = await fetch(`/api/segments/explore?bounds=${bounds}`, {
      cache: 'no-store',
    }).catch(() => null);
    const isStale = seq !== fetchSeqRef.current;
    if (isStale) return;
    setIsLoading(false);
    const isOk = !!res && res.ok;
    if (!isOk) {
      const text = await res?.text().catch(() => '');
      setError(`Discover failed${text ? `: ${text}` : ''}`);
      return;
    }
    await refetchFromCache();
  }

  function drawSegments(items: ExploreSegment[]) {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource(SEGMENTS_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData({
      type: 'FeatureCollection',
      features: items.map((s) => ({
        type: 'Feature',
        id: s.id,
        properties: { id: s.id, name: s.name },
        geometry: {
          type: 'LineString',
          coordinates: decodePolyline(s.polyline).map(([lat, lng]) => [lng, lat]),
        },
      })),
    });
  }

  async function toggleFavorite(segmentId: number) {
    const wasFavorite = favoriteIds.has(segmentId);
    const next = new Set(favoriteIds);
    if (wasFavorite) {
      next.delete(segmentId);
    } else {
      next.add(segmentId);
    }
    setFavoriteIds(next);
    const method = wasFavorite ? 'DELETE' : 'POST';
    const res = await fetch(`/api/favorites/${segmentId}`, { method }).catch(() => null);
    const isOk = !!res && res.ok;
    if (!isOk) {
      setFavoriteIds(favoriteIds);
      setError('Failed to update favorite');
    }
  }

  function focusSegment(s: ExploreSegment) {
    const map = mapRef.current;
    if (!map) return;
    const coords = decodePolyline(s.polyline);
    if (coords.length === 0) return;
    const lats = coords.map((c) => c[0]);
    const lngs = coords.map((c) => c[1]);
    const bounds: LngLatBoundsLike = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ];
    map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 600 });
  }

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const hasSource = !!map.getSource(SEGMENTS_SOURCE_ID);
    if (!hasSource) return;
    for (const s of segments) {
      map.setFeatureState(
        { source: SEGMENTS_SOURCE_ID, id: s.id },
        { hover: s.id === hoverId }
      );
    }
  }, [hoverId, segments]);

  return (
    <div className="flex flex-col md:flex-row" style={{ height: '100vh' }}>
      <div className="relative md:flex-1" style={{ minHeight: '60vh' }}>
        <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
        <button
          type="button"
          onClick={() => void discoverHere()}
          disabled={isLoading}
          className="absolute left-3 top-3 rounded-md bg-[#FC5200] px-3 py-2 text-sm font-semibold text-white shadow disabled:opacity-60"
        >
          {isLoading ? 'Discovering…' : 'Discover here'}
        </button>
        {error && (
          <div className="absolute left-3 top-16 max-w-xs rounded-md border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-700 shadow">
            {error}
          </div>
        )}
      </div>
      <aside className="flex-1 overflow-y-auto border-t border-neutral-200 bg-white md:max-w-sm md:border-l md:border-t-0">
        <div className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold">
          {segments.length} segment{segments.length === 1 ? '' : 's'} in view
        </div>
        <ul>
          {segments.map((s) => {
            const isFavorite = favoriteIds.has(s.id);
            return (
              <li
                key={s.id}
                onMouseEnter={() => setHoverId(s.id)}
                onMouseLeave={() => setHoverId(null)}
                className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3 hover:bg-neutral-50"
              >
                <button
                  type="button"
                  aria-label={isFavorite ? 'Unstar segment' : 'Star segment'}
                  onClick={(e) => {
                    e.stopPropagation();
                    void toggleFavorite(s.id);
                  }}
                  className={`text-2xl leading-none transition ${
                    isFavorite ? 'text-[#FC5200]' : 'text-neutral-300 hover:text-neutral-500'
                  }`}
                >
                  {isFavorite ? '★' : '☆'}
                </button>
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => focusSegment(s)}>
                  <div className="truncate font-medium">{s.name}</div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {(s.distanceM / 1000).toFixed(2)} km · {s.avgGrade.toFixed(1)}% avg
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}
