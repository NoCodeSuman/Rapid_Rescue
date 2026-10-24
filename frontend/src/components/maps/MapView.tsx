import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPinOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MAP_CENTER } from '../../data/places';
import { cx } from '../../lib/cx';
import { Spinner } from '../ui/misc';

export type MarkerKind = 'pickup' | 'destination' | 'ambulance' | 'zone' | 'hospital';
export interface MapMarker { id: string; lat: number; lng: number; label: string; kind: MarkerKind; detail?: string; radiusKm?: number }
interface Props {
  markers: MapMarker[];
  route?: { lat: number; lng: number }[];
  title: string;
  height?: string;
  onPick?: (p: { lat: number; lng: number }) => void;
  emptyMessage?: string;
}

const KIND: Record<MarkerKind, { color: string; glyph: string; name: string }> = {
  pickup: { color: '#0b84d6', glyph: 'P', name: 'Pickup' },
  destination: { color: '#15803d', glyph: 'D', name: 'Destination' },
  ambulance: { color: '#e5383b', glyph: '🚑', name: 'Ambulance' },
  hospital: { color: '#15803d', glyph: 'H', name: 'Hospital' },
  zone: { color: '#b45309', glyph: 'Z', name: 'Demand zone' },
};

/**
 * Reusable map boundary: Leaflet + OpenStreetMap tiles (no key). Shows a loading state, an SVG fallback if tiles
 * cannot load, an empty state, and always a text list of locations. Booking markers may use device GPS or demo values.
 */
export function MapView({ markers, route, title, height = 'h-72', onPick, emptyMessage = 'No locations to display yet.' }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markerRefs = useRef(new Map<string, L.Marker>());
  const popupContentRefs = useRef(new Map<string, string>());
  const circleRefs = useRef(new Map<string, L.Circle>());
  const routeRef = useRef<L.Polyline | null>(null);
  const fittedLocationsRef = useRef('');
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>(() => (typeof navigator !== 'undefined' && navigator.onLine === false ? 'fallback' : 'loading'));

  const fallback = status === 'fallback';
  // Create the map once (re-created only if we leave/enter the tile-fallback state).
  useEffect(() => {
    if (fallback || !el.current || mapRef.current) return;
    let loaded = 0, errors = 0;
    const map = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([MAP_CENTER.lat, MAP_CENTER.lng], 13);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' });
    tiles.on('tileload', () => { loaded += 1; setStatus('ready'); });
    tiles.on('tileerror', () => { errors += 1; if (loaded === 0 && errors >= 3) setStatus('fallback'); });
    tiles.addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => pickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const timer = window.setTimeout(() => { if (loaded === 0) setStatus('fallback'); }, 8000);
    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 100);
    const onOffline = () => setStatus('fallback');
    window.addEventListener('offline', onOffline);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(resizeTimer);
      window.removeEventListener('offline', onOffline);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      markerRefs.current.clear();
      popupContentRefs.current.clear();
      circleRefs.current.clear();
      routeRef.current = null;
      fittedLocationsRef.current = '';
    };
  }, [fallback]);

  // Keep marker instances alive as coordinates change so the ambulance can glide along its simulated route.
  const signature = JSON.stringify([markers, route]);
  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current;
    if (!map || !layer) return;
    const activeIds = new Set(markers.map((m) => m.id));
    const activeCircleIds = new Set(markers.filter((m) => m.kind === 'zone' && m.radiusKm).map((m) => m.id));
    markers.forEach((m) => {
      const k = KIND[m.kind];
      if (m.kind === 'zone' && m.radiusKm) {
        const circle = circleRefs.current.get(m.id) ?? L.circle([m.lat, m.lng], { radius: m.radiusKm * 1000, color: k.color, weight: 1, fillOpacity: 0.08 }).addTo(layer);
        circle.setLatLng([m.lat, m.lng]);
        circle.setRadius(m.radiusKm * 1000);
        circleRefs.current.set(m.id, circle);
      }
      const existing = markerRefs.current.get(m.id);
      const icon = L.divIcon({ className: m.kind === 'ambulance' ? 'rr-ambulance-moving-marker' : '', html: `<div class="rr-marker" style="background:${k.color}">${k.glyph}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
      const marker = existing ?? L.marker([m.lat, m.lng], { title: m.label, alt: m.label, icon });
      if (existing) {
        marker.setLatLng([m.lat, m.lng]);
        marker.options.title = m.label;
        marker.options.alt = m.label;
      } else {
        marker.addTo(layer);
        markerRefs.current.set(m.id, marker);
      }
      const popup = `<strong>${k.name}</strong><br/>${escapeHtml(m.label)}${m.detail ? `<br/>${escapeHtml(m.detail)}` : ''}`;
      if (popupContentRefs.current.get(m.id) !== popup) {
        marker.bindPopup(popup);
        popupContentRefs.current.set(m.id, popup);
      }
    });
    markerRefs.current.forEach((marker, id) => {
      if (!activeIds.has(id)) { layer.removeLayer(marker); markerRefs.current.delete(id); popupContentRefs.current.delete(id); }
    });
    circleRefs.current.forEach((circle, id) => {
      if (!activeCircleIds.has(id)) { layer.removeLayer(circle); circleRefs.current.delete(id); }
    });
    if (route && route.length > 1) {
      const points = route.map((p) => [p.lat, p.lng] as L.LatLngTuple);
      if (routeRef.current) routeRef.current.setLatLngs(points);
      else routeRef.current = L.polyline(points, { color: '#0b84d6', weight: 5, opacity: 0.85 }).addTo(layer);
    } else if (routeRef.current) {
      layer.removeLayer(routeRef.current);
      routeRef.current = null;
    }
    const fixedMarkers = markers.filter((m) => m.kind !== 'ambulance');
    const fixedSignature = JSON.stringify(fixedMarkers.map(({ id, lat, lng }) => [id, lat, lng]));
    if (fixedSignature !== fittedLocationsRef.current) {
      fittedLocationsRef.current = fixedSignature;
      const pts: L.LatLngExpression[] = markers.map((m) => [m.lat, m.lng]);
      if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [32, 32], maxZoom: 15, animate: false });
      else map.setView([MAP_CENTER.lat, MAP_CENTER.lng], 13, { animate: false });
    }
  }, [signature, fallback]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <figure className="space-y-2">
      <div className={cx('relative w-full overflow-hidden rounded-lg border border-surface-border bg-navy-50', height)}>
        {status === 'fallback' ? <SvgFallback markers={markers} route={route} /> : <div ref={el} className="h-full w-full" role="application" aria-label={`${title} map`} />}
        {status === 'loading' && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/60"><Spinner label="Loading map" /></div>}
        {markers.length === 0 && <div className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded-md bg-white/90 px-3 py-1 text-xs text-ink-soft shadow">{emptyMessage}</div>}
      </div>
      <figcaption className="text-xs text-ink-faint">
        {status === 'fallback' ? 'Map tiles unavailable (offline or blocked) — showing a schematic plot instead. ' : ''}
        Device locations are shown when available; demo coordinates and simulated movement are labelled. {onPick ? 'Click the map to choose a custom point.' : ''}
      </figcaption>
      {markers.length > 0 && (
        <ul className="grid gap-1 text-xs text-ink-soft sm:grid-cols-2" aria-label={`${title} locations`}>
          {markers.filter((m) => m.kind !== 'zone' || markers.length < 8).map((m) => (
            <li key={m.id}><span className="font-semibold text-navy-800">{KIND[m.kind].name}:</span> {m.label}{m.detail ? ` — ${m.detail}` : ''}</li>
          ))}
        </ul>
      )}
    </figure>
  );
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function SvgFallback({ markers, route }: { markers: MapMarker[]; route?: { lat: number; lng: number }[] }) {
  if (markers.length === 0) return <div className="flex h-full items-center justify-center gap-2 text-sm text-ink-soft"><MapPinOff className="h-5 w-5" aria-hidden />No locations to plot</div>;
  const lats = markers.map((m) => m.lat), lngs = markers.map((m) => m.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const spanLat = Math.max(maxLat - minLat, 0.004), spanLng = Math.max(maxLng - minLng, 0.004);
  const x = (lng: number) => 40 + ((lng - minLng) / spanLng) * 520;
  const y = (lat: number) => 240 - ((lat - minLat) / spanLat) * 200;
  return (
    <svg viewBox="0 0 600 280" className="h-full w-full" role="img" aria-label="Schematic plot of sample locations">
      <rect width="600" height="280" fill="#eef2f8" />
      {[1, 2, 3].map((i) => <line key={i} x1={i * 150} y1="0" x2={i * 150} y2="280" stroke="#d5deee" />)}
      {route && route.length > 1 && <polyline fill="none" stroke="#0f2344" strokeWidth="2" strokeDasharray="6 6" points={route.map((p) => `${x(p.lng)},${y(p.lat)}`).join(' ')} />}
      {markers.map((m) => (
        <g key={m.id} className={m.kind === 'ambulance' ? 'rr-map-marker-moving' : undefined} transform={`translate(${x(m.lng)},${y(m.lat)})`}>
          <circle r="13" fill={KIND[m.kind].color} stroke="#fff" strokeWidth="2" />
          <text textAnchor="middle" dy="4" fontSize="12" fontWeight="700" fill="#fff">{KIND[m.kind].glyph}</text>
        </g>
      ))}
    </svg>
  );
}
