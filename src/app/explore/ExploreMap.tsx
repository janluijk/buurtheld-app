'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MlMap, LngLatBoundsLike } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ExploreSegment } from '@/app/api/segments/explore/route';
import { decodePolyline } from '@/lib/strava/polyline';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const DEFAULT_CENTER: [number, number] = [4.9041, 52.3676];
const DEFAULT_ZOOM = 13;
const REFETCH_DEBOUNCE_MS = 500;
const MAX_VIEWPORT_KM = 20;
const SEGMENTS_SOURCE_ID = 'segments';
const SEGMENTS_LAYER_ID = 'segments-line';

export function ExploreMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const fetchSeqRef = useRef(0);
  const [segments, setSegments] = useState<ExploreSegment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);

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
      void refetch();
    });

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    map.on('moveend', () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void refetch();
      }, REFETCH_DEBOUNCE_MS);
    });

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(container);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refetch() {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    const latKm = (b.getNorth() - b.getSouth()) * 111;
    const avgLat = ((b.getNorth() + b.getSouth()) / 2) * (Math.PI / 180);
    const lngKm = (b.getEast() - b.getWest()) * 111 * Math.cos(avgLat);
    const isTooWide = latKm > MAX_VIEWPORT_KM || lngKm > MAX_VIEWPORT_KM;
    if (isTooWide) {
      fetchSeqRef.current++;
      setIsLoading(false);
      setSegments([]);
      drawSegments([]);
      setError('Zoom in to load segments (max 20 km across).');
      return;
    }
    const bounds = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
    const seq = ++fetchSeqRef.current;
    setIsLoading(true);
    setError(null);
    const res = await fetch(`/api/segments/explore?bounds=${bounds}`, { cache: 'no-store' }).catch(
      () => null
    );
    const isStale = seq !== fetchSeqRef.current;
    if (isStale) return;
    setIsLoading(false);
    const isOk = !!res && res.ok;
    if (!isOk) {
      setError('Failed to load segments');
      return;
    }
    const data = (await res!.json()) as { segments: ExploreSegment[] };
    setSegments(data.segments);
    drawSegments(data.segments);
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
    if (!map || !map.isStyleLoaded()) return;
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
        {isLoading && (
          <div className="absolute left-3 top-3 rounded-md bg-white/90 px-3 py-1 text-xs shadow">
            Loading segments…
          </div>
        )}
        {error && (
          <div className="absolute left-3 top-3 rounded-md border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-700 shadow">
            {error}
          </div>
        )}
      </div>
      <aside className="flex-1 overflow-y-auto border-t border-neutral-200 bg-white md:max-w-sm md:border-l md:border-t-0">
        <div className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold">
          {segments.length} segment{segments.length === 1 ? '' : 's'} in view
        </div>
        <ul>
          {segments.map((s) => (
            <li
              key={s.id}
              onMouseEnter={() => setHoverId(s.id)}
              onMouseLeave={() => setHoverId(null)}
              onClick={() => focusSegment(s)}
              className="cursor-pointer border-b border-neutral-100 px-4 py-3 hover:bg-neutral-50"
            >
              <div className="font-medium">{s.name}</div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {(s.distanceM / 1000).toFixed(2)} km · {s.avgGrade.toFixed(1)}% avg
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
