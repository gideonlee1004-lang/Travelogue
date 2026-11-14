// Shared helpers: dates, travel time (Google Routes v2), opening hours.
import { useEffect, useState } from 'react';
import { Footprints, Bus, Car } from 'lucide-react';

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

// ---- Travel time (Google Routes v2 REST API) ----
export const TRAVEL_MODES = [
  { key: 'WALK', label: 'Walk', Icon: Footprints },
  { key: 'TRANSIT', label: 'Transit', Icon: Bus },
  { key: 'DRIVE', label: 'Car', Icon: Car }
];

export const travelCache = new Map();

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

export async function fetchTravel(from, to, mode, departure) {
  const key = `${from.lat},${from.lng}|${to.lat},${to.lng}|${mode.key}|${mode.key === 'TRANSIT' && departure ? departure.getTime() : ''}`;
  if (travelCache.has(key)) return travelCache.get(key);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const modeMap = {
    WALK: 'WALK',
    TRANSIT: 'TRANSIT',
    DRIVE: 'DRIVE'
  };

  try {
    const body = {
      origin: { location: { latLng: { latitude: Number(from.lat), longitude: Number(from.lng) } } },
      destination: { location: { latLng: { latitude: Number(to.lat), longitude: Number(to.lng) } } },
      travelMode: modeMap[mode.key] || 'DRIVE',
      ...(mode.key === 'DRIVE' ? { polylineQuality: 'HIGH_QUALITY' } : {})
    };

    if (mode.key === 'TRANSIT' && departure) {
      body.departureTime = departure.toISOString();
    }

    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': mode.key === 'DRIVE' ? 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline' : 'routes.duration,routes.distanceMeters'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    const route = data.routes?.[0];

    let result = null;
    if (route) {
      const seconds = parseInt(route.duration?.replace('s', '') || '0', 10);
      const meters = route.distanceMeters || 0;
      result = { seconds, meters, ...(mode.key === 'DRIVE' && route.polyline?.encodedPolyline ? { encodedPolyline: route.polyline.encodedPolyline } : {}) };
    }

    travelCache.set(key, result);
    return result;
  } catch (e) {
    console.error('Routes API call failed:', e);
    travelCache.set(key, null);
    return null;
  }
}

export function getDepartureDate(dateStr, timeStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '12:00').split(':').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d, hh || 0, mm || 0);
  return date.getTime() > Date.now() ? date : new Date();
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

// Walk / transit / drive for one leg. Returns { loading, data: { WALK, TRANSIT, DRIVE } }.
export function useLegTravel(from, to, departure, enabled = true) {
  const [state, setState] = useState({ loading: true, data: {} });
  const depKey = departure ? departure.getTime() : null;
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

// Pick a sensible mode for a leg: walk when short, otherwise transit, else drive.
export function pickLeg(data) {
  if (!data) return null;
  const walk = data.WALK, transit = data.TRANSIT, drive = data.DRIVE;
  if (walk && walk.seconds <= 20 * 60) return { mode: TRAVEL_MODES[0], ...walk };
  if (transit) return { mode: TRAVEL_MODES[1], ...transit };
  if (drive) return { mode: TRAVEL_MODES[2], ...drive };
  if (walk) return { mode: TRAVEL_MODES[0], ...walk };
  return null;
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
