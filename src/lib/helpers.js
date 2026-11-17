// Shared helpers: dates, travel time and road geometry, opening hours.
import { useEffect, useState } from 'react';
import { Footprints, TrainFront, Car } from 'lucide-react';

// Calculate quadratic curved points for flight path arc
export function getCurvedPath(dep, arr, numPoints = 50) {
  if (!dep || !arr || dep.lat == null || dep.lng == null || arr.lat == null || arr.lng == null) return [];
  const lat1 = Number(dep.lat);
  const lng1 = Number(dep.lng);
  const lat2 = Number(arr.lat);
  const lng2 = Number(arr.lng);

  const midLat = (lat1 + lat2) / 2;
  const midLng = (lng1 + lng2) / 2;

  const dx = lng2 - lng1;
  const dy = lat2 - lat1;

  const curvature = 0.25;
  const controlLat = midLat - dx * curvature;
  const controlLng = midLng + dy * curvature;

  const points = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const lat = (1 - t) * (1 - t) * lat1 + 2 * (1 - t) * t * controlLat + t * t * lat2;
    const lng = (1 - t) * (1 - t) * lng1 + 2 * (1 - t) * t * controlLng + t * t * lng2;
    points.push({ lat, lng });
  }
  return points;
}

// Sort stops chronologically by scheduled time ("HH:mm")
export function sortStopsByTime(stops) {
  if (!Array.isArray(stops)) return [];
  return [...stops].sort((a, b) => {
    const timeA = a.time || '00:00';
    const timeB = b.time || '00:00';
    return timeA.localeCompare(timeB);
  });
}

// Helper to group consecutive days for the same stay
export function getGroupedStays(staysByDay, daysCount) {
  if (!staysByDay || !daysCount) return [];
  const groups = [];
  let currentGroup = null;

  for (let d = 1; d <= daysCount; d++) {
    const stay = staysByDay[d];
    if (!stay) {
      if (currentGroup) {
        groups.push(currentGroup);
        currentGroup = null;
      }
      continue;
    }

    if (currentGroup && currentGroup.stay.name === stay.name && currentGroup.stay.address === stay.address) {
      currentGroup.endDay = d;
    } else {
      if (currentGroup) groups.push(currentGroup);
      currentGroup = { startDay: d, endDay: d, stay };
    }
  }
  if (currentGroup) groups.push(currentGroup);

  return groups.map(g => ({
    dayLabel: g.startDay === g.endDay ? `Day ${g.startDay}` : `Days ${g.startDay}–${g.endDay}`,
    stay: g.stay
  }));
}

// ---- Travel time and road geometry for one leg ----
export const TRAVEL_MODES = [
  { key: 'WALK', label: 'Walk', verb: 'on foot', gmaps: 'walking', Icon: Footprints },
  { key: 'TRANSIT', label: 'Transit', verb: 'by train or bus', gmaps: 'transit', Icon: TrainFront },
  { key: 'DRIVE', label: 'Car', verb: 'by car', gmaps: 'driving', Icon: Car }
];
export const modeByKey = key => TRAVEL_MODES.find(m => m.key === key) || TRAVEL_MODES[2];

export function formatDuration(seconds) {
  if (seconds == null) return '–';
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatDistance(meters) {
  if (meters == null) return '';
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

// Standard encoded-polyline decoder (precision 5) → [{ lat, lng }]
export function decodePolyline(encoded) {
  if (!encoded) return [];
  const points = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    for (const axis of ['lat', 'lng']) {
      let result = 0, shift = 0, byte;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index < encoded.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 'lat') lat += delta; else lng += delta;
    }
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

// Results are kept for a week on this device so reopening a day does not look
// every leg up again. Values: { seconds, meters, polyline } or null (no route).
const TRAVEL_STORE = 'tl_travel_v1';
const TRAVEL_TTL = 7 * 24 * 60 * 60 * 1000;
const TRAVEL_MAX = 240;
export const travelCache = new Map(); // key -> Promise<result|null>
let travelStore = null;

function loadTravelStore() {
  if (travelStore) return travelStore;
  travelStore = {};
  try {
    const raw = JSON.parse(localStorage.getItem(TRAVEL_STORE) || '{}');
    const now = Date.now();
    for (const [k, v] of Object.entries(raw)) if (v && now - v.t < TRAVEL_TTL) travelStore[k] = v;
  } catch { /* storage unavailable */ }
  return travelStore;
}

function rememberTravel(key, result) {
  const store = loadTravelStore();
  store[key] = { t: Date.now(), r: result };
  const keys = Object.keys(store);
  if (keys.length > TRAVEL_MAX) {
    keys.sort((x, y) => store[x].t - store[y].t).slice(0, keys.length - TRAVEL_MAX).forEach(k => delete store[k]);
  }
  try { localStorage.setItem(TRAVEL_STORE, JSON.stringify(store)); } catch { /* full or unavailable */ }
}

const coordKey = p => `${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)}`;

export function fetchTravel(from, to, mode, departure) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey || !from || !to) return Promise.resolve(null);
  // Only public transport depends on the time of day.
  const when = mode.key === 'TRANSIT' && departure ? `${departure.getDay()}@${departure.getHours()}:${departure.getMinutes()}` : '';
  const key = `${coordKey(from)}|${coordKey(to)}|${mode.key}|${when}`;
  if (travelCache.has(key)) return travelCache.get(key);

  const stored = loadTravelStore()[key];
  if (stored) {
    const hit = Promise.resolve(stored.r);
    travelCache.set(key, hit);
    return hit;
  }

  const task = (async () => {
    try {
      const body = {
        origin: { location: { latLng: { latitude: Number(from.lat), longitude: Number(from.lng) } } },
        destination: { location: { latLng: { latitude: Number(to.lat), longitude: Number(to.lng) } } },
        travelMode: mode.key
      };
      if (mode.key === 'TRANSIT' && departure) body.departureTime = departure.toISOString();

      const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline'
        },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (!response.ok) {
        console.error('Travel time lookup failed:', data?.error?.message || response.status);
        return null; // not remembered, so a later visit can try again
      }
      const route = data.routes?.[0];
      const result = route ? {
        seconds: parseInt(String(route.duration || '0').replace('s', ''), 10) || 0,
        meters: route.distanceMeters || 0,
        polyline: route.polyline?.encodedPolyline || ''
      } : null;
      rememberTravel(key, result);
      return result;
    } catch (e) {
      console.error('Travel time lookup failed:', e);
      return null;
    }
  })();
  travelCache.set(key, task);
  return task;
}

// The moment used for public-transport timetables. Timetables repeat weekly, and the
// lookup only accepts dates close to today, so use the next occurrence of the planned
// weekday and time. The result is stable between renders (no repeated lookups).
export function getDepartureDate(dateStr, timeStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '12:00').split(':').map(Number);
  if (!y || !m || !d) return null;
  const planned = new Date(y, m - 1, d, hh || 0, mm || 0);
  if (isNaN(planned.getTime())) return null;
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), planned.getHours(), planned.getMinutes());
  next.setDate(next.getDate() + ((planned.getDay() - now.getDay() + 7) % 7));
  if (next.getTime() <= now.getTime() + 60 * 1000) next.setDate(next.getDate() + 7);
  return next;
}

export function renderPriceLevel(priceLevel) {
  if (typeof priceLevel === 'string') {
    switch (priceLevel) {
      case 'INEXPENSIVE': return '$';
      case 'MODERATE': return '$$';
      case 'EXPENSIVE': return '$$$';
      case 'VERY_EXPENSIVE': return '$$$$';
      case 'FREE': return 'Free';
      case 'PRICE_LEVEL_INEXPENSIVE': return '$';
      case 'PRICE_LEVEL_MODERATE': return '$$';
      case 'PRICE_LEVEL_EXPENSIVE': return '$$$';
      case 'PRICE_LEVEL_VERY_EXPENSIVE': return '$$$$';
      case 'PRICE_LEVEL_FREE': return 'Free';
      default: return priceLevel;
    }
  }
  if (typeof priceLevel === 'number') {
    return '$'.repeat(Math.max(1, priceLevel));
  }
  return null;
}

export function formatOpeningHours(openingHours) {
  if (!openingHours) return [];
  return openingHours.weekdayDescriptions || [];
}

export function getTodayOpeningHours(openingHours, date = new Date()) {
  const descriptions = formatOpeningHours(openingHours);
  if (!descriptions.length) return null;
  return descriptions[date.getDay() === 0 ? 6 : date.getDay() - 1] || null;
}

export function getDayDate(startDateStr, dayNumber) {
  if (!startDateStr) return null;
  const [year, month, day] = startDateStr.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day + (dayNumber - 1));
}

export function formatDayDate(startDateStr, dayNumber, includeYear = false) {
  const date = getDayDate(startDateStr, dayNumber);
  if (!date || isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {})
  });
}

export function getDayDateString(startDateStr, dayNumber) {
  const date = getDayDate(startDateStr, dayNumber);
  if (!date || isNaN(date.getTime())) return startDateStr;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function calculateDaysCount(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return 1;
  const [sY, sM, sD] = startDateStr.split('-').map(Number);
  const [eY, eM, eD] = endDateStr.split('-').map(Number);
  if (!sY || !sM || !sD || !eY || !eM || !eD) return 1;
  const start = new Date(sY, sM - 1, sD);
  const end = new Date(eY, eM - 1, eD);
  const diffTime = end - start;
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return diffDays > 0 ? diffDays : 1;
}

export function getEndDateString(startDateStr, daysCount) {
  if (!startDateStr || !daysCount) return startDateStr;
  const date = getDayDate(startDateStr, daysCount);
  if (!date || isNaN(date.getTime())) return startDateStr;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function checkIsClosed(timeStr, openingHours, dateStr) {
  if (!openingHours || !openingHours.periods || !timeStr) return false;

  if (
    openingHours.periods.length === 1 &&
    openingHours.periods[0].open &&
    !openingHours.periods[0].close
  ) {
    return false;
  }

  let dayOfWeek;
  if (dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    dayOfWeek = new Date(year, month - 1, day).getDay();
  } else {
    dayOfWeek = new Date().getDay();
  }

  const dayPeriods = openingHours.periods.filter(p => p.open && p.open.day === dayOfWeek);
  if (dayPeriods.length === 0) return true;

  const [hours, minutes] = timeStr.split(':').map(Number);
  const scheduledMinutes = hours * 60 + (minutes || 0);

  const isOpen = dayPeriods.some(period => {
    if (!period.open) return false;
    if (!period.close) return true;

    const openMin = period.open.hour * 60 + (period.open.minute || 0);
    const closeMin = period.close.hour * 60 + (period.close.minute || 0);

    if (openMin === closeMin) return true;

    if (closeMin < openMin) {
      return scheduledMinutes >= openMin || scheduledMinutes <= closeMin;
    }
    return scheduledMinutes >= openMin && scheduledMinutes <= closeMin;
  });

  return !isOpen;
}

// Walk, transit and car for one leg. Returns { loading, data: { WALK, TRANSIT, DRIVE } }.
// All three are always looked up; nothing is chosen on the traveller's behalf.
export function useLegTravel(from, to, departure, enabled = true) {
  const [state, setState] = useState({ loading: true, data: {} });
  const depKey = departure ? `${departure.getDay()}@${departure.getHours()}:${departure.getMinutes()}` : '';
  useEffect(() => {
    if (!enabled || !from || !to) return;
    let cancelled = false;
    setState(s => ({ ...s, loading: true }));
    Promise.all(TRAVEL_MODES.map(m => fetchTravel(from, to, m, departure))).then(results => {
      if (cancelled) return;
      const data = {};
      TRAVEL_MODES.forEach((m, i) => { data[m.key] = results[i]; });
      setState({ loading: false, data });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from?.lat, from?.lng, to?.lat, to?.lng, depKey, enabled]);
  return state;
}

// Road geometry for a list of legs in one travel mode, for drawing on the map.
// legs: [{ from, to, departure }] → [{ path: [{lat,lng}], road: boolean }]
// A leg with no route (or still loading) falls back to a straight line.
export function useRoutePaths(legs, modeKey, enabled = true) {
  const signature = legs.map(l => `${coordKey(l.from)}>${coordKey(l.to)}`).join('|');
  const [found, setFound] = useState({ signature: '', modeKey: '', lines: [] });
  useEffect(() => {
    if (!enabled || !legs.length) return;
    let cancelled = false;
    const mode = modeByKey(modeKey);
    Promise.all(legs.map(l => fetchTravel(l.from, l.to, mode, l.departure))).then(results => {
      if (cancelled) return;
      setFound({ signature, modeKey, lines: results.map(r => (r?.polyline ? decodePolyline(r.polyline) : null)) });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, modeKey, enabled]);
  const current = found.signature === signature && found.modeKey === modeKey;
  return legs.map((l, i) => {
    const line = current ? found.lines[i] : null;
    return line && line.length > 1
      ? { path: line, road: true }
      : { path: [{ lat: Number(l.from.lat), lng: Number(l.from.lng) }, { lat: Number(l.to.lat), lng: Number(l.to.lng) }], road: false };
  });
}

// Shrink a chosen photo to a small square JPEG that is cheap to store and send.
export function fileToAvatar(file, size = 320) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type || '')) { reject(new Error('Choose an image file.')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        if (!side) throw new Error('empty');
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f8f4ec';
        ctx.fillRect(0, 0, size, size);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.84));
      } catch {
        reject(new Error('That photo could not be read. Try a JPG or PNG.'));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That photo could not be read. Try a JPG or PNG.')); };
    img.src = url;
  });
}

export function formatRange(startDateStr, daysCount) {
  if (!startDateStr) return '';
  const a = getDayDate(startDateStr, 1), b = getDayDate(startDateStr, daysCount || 1);
  if (!a || !b) return '';
  const f = (d, y) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(y ? { year: 'numeric' } : {}) });
  return `${f(a, false)} – ${f(b, true)}`;
}

export function addMinutes(timeStr, mins) {
  const [h, m] = (timeStr || '09:00').split(':').map(Number);
  let total = (h || 0) * 60 + (m || 0) + mins;
  total = Math.max(0, Math.min(23 * 60 + 59, total));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function formatClock(timeStr) {
  return timeStr || '--:--';
}

export function haversineKm(a, b) {
  if (!a || !b) return 0;
  const R = 6371, toRad = x => (x * Math.PI) / 180;
  const dLat = toRad(Number(b.lat) - Number(a.lat)), dLng = toRad(Number(b.lng) - Number(a.lng));
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(Number(a.lat))) * Math.cos(toRad(Number(b.lat))) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
