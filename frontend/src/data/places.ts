import type { LocationPoint, RouteProfile } from '../types';

/** Fictional demo places. Coordinates are mock values for demonstration only. */
export const DEMO_PICKUPS: LocationPoint[] = [
  { label: 'Green Park Apartments', lat: 22.58, lng: 88.37 },
  { label: 'Central Market Gate', lat: 22.576, lng: 88.364 },
  { label: 'Lakeside Residency', lat: 22.542, lng: 88.356 },
  { label: 'Riverside Colony', lat: 22.588, lng: 88.352 },
  { label: 'Old Town Lane 7', lat: 22.566, lng: 88.332 },
  { label: 'Airport Link Plaza', lat: 22.609, lng: 88.396 },
];

export const DEMO_HOSPITALS: LocationPoint[] = [
  { label: 'Demo General Hospital', lat: 22.57, lng: 88.355 },
  { label: 'Lakeside Medical Centre', lat: 22.545, lng: 88.362 },
  { label: 'Riverside Heart Institute', lat: 22.592, lng: 88.348 },
  { label: 'Airport Link Clinic', lat: 22.608, lng: 88.398 },
];

export const MAP_CENTER = { lat: 22.5726, lng: 88.3639 };

export const ROUTE_PROFILES: Record<string, RouteProfile> = {
  congested: { label: 'Congested market lanes', avgSpeedKmh: 12, detourFactor: 1.8, note: 'Mock assumption: slow lanes and a bridge closure force a long detour.' },
  arterial: { label: 'Ring-road arterial', avgSpeedKmh: 42, detourFactor: 1.2, note: 'Mock assumption: fast arterial road with a small detour.' },
  moderate: { label: 'Moderate city roads', avgSpeedKmh: 30, detourFactor: 1.3, note: 'Mock assumption: typical city roads.' },
  oldtown: { label: 'Narrow old-town streets', avgSpeedKmh: 18, detourFactor: 1.4, note: 'Mock assumption: narrow streets slow the vehicle.' },
  fast: { label: 'Airport link expressway', avgSpeedKmh: 50, detourFactor: 1.1, note: 'Mock assumption: expressway with few junctions.' },
};
