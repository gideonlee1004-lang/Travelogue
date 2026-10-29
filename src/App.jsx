import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Plus, Trash2, Sparkles, Search, ArrowUp, ArrowDown, Globe, ExternalLink, BookmarkPlus, Check, RefreshCw, AlertTriangle, Star, Layers, Footprints, Car, Bus, Plane, Hotel, Pin, Pen, User, LogOut, Lock, Mail, Database, CheckCircle2, Calendar, Users, Link2, Copy, UserMinus, X } from 'lucide-react';
import { GoogleMap, useJsApiLoader, MarkerF, PolylineF } from '@react-google-maps/api';
import { mergeTrip } from '../api/_merge.js';

const LIBRARIES = ['places'];

// ---- Shared form-control styles (every text box / select / date / time uses these) ----
const FIELD_BASE =
  'w-full min-w-0 border border-[#e5e5e0] rounded-lg text-base sm:text-sm text-[#111111] placeholder:text-[#aaaaaa] ' +
  'focus:outline-none focus:border-[#111111] transition-colors appearance-none text-left';
const FIELD = `${FIELD_BASE} bg-white h-10 px-3`;
const FIELD_ICON = `${FIELD_BASE} bg-white h-10 pl-9 pr-3`; // input with a leading icon
const FIELD_DISABLED = `${FIELD_BASE} bg-[#f4f4f0] text-[#999999] h-10 px-3 cursor-not-allowed`;
const TEXTAREA = `${FIELD_BASE} bg-white px-3 py-2`;
const SELECT = `${FIELD_BASE} bg-white h-10 pl-3 pr-9 cursor-pointer`;
const SELECT_STYLE = {
  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>'
  )}")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 0.75rem center',
  backgroundSize: '1rem'
};
const LABEL = 'block text-xs font-medium text-[#666666] mb-1';

// Google's place-search web component renders inside a shadow DOM, so we theme it
// with CSS variables to sit next to the other fields.
const PLACE_AUTOCOMPLETE_CSS = `
gmp-place-autocomplete.travelogue-place-autocomplete {
  display: block;
  width: 100%;
  color-scheme: light;
  --gmp-mat-color-surface: #ffffff;
  --gmp-mat-color-on-surface: #111111;
  --gmp-mat-color-on-surface-variant: #666666;
  --gmp-mat-color-outline: #e5e5e0;
  --gmp-mat-color-outline-decorative: #e5e5e0;
  --gmp-mat-color-primary: #111111;
  --gmp-mat-font-family: inherit;
}
`;

const MAP_CONTAINER_STYLE = {
  width: '100%',
  height: '100%'
};

const DEFAULT_MAP_OPTIONS = {
  disableDefaultUI: true,
  zoomControl: true,
  styles: [
    {
      featureType: 'poi',
      elementType: 'labels',
      stylers: [{ visibility: 'off' }]
    }
  ]
};

async function apiRequest(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
  } catch (err) {
    const e = new Error('Unable to connect to Vercel Blob. Please check your connection and try again.');
    e.network = true;
    throw e;
  }

  let data = null;
  try {
    data = await response.json();
  } catch (err) {
    // non-JSON response (e.g. API route not deployed)
  }

  if (!response.ok) {
    const e = new Error(data?.error || `Unable to connect to Vercel Blob (HTTP ${response.status}).`);
    e.status = response.status;
    throw e;
  }
  return data || {};
}

const authApi = (payload) =>
  apiRequest('/api/auth', { method: 'POST', body: JSON.stringify(payload) });

const loadUserItineraries = async () => {
  const data = await apiRequest('/api/trips', { method: 'GET' });
  return {
    trips: Array.isArray(data.trips) ? data.trips : [],
    shared: data.shared || {}, versions: data.versions || {}
  };
};

const collaborationApi = (payload) =>
  apiRequest('/api/collaboration', { method: 'POST', body: JSON.stringify(payload) });
const saveSharedTrip = (payload) =>
  apiRequest('/api/collaboration', { method: 'PUT', body: JSON.stringify(payload) });
const loadSharedTrip = (sharedId) =>
  apiRequest(`/api/collaboration?sharedId=${encodeURIComponent(sharedId)}`);

const jsonEqual = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
const privateTripIndex = trips => trips.map(t => t.sharedId
  ? { id: t.id, sharedId: t.sharedId } : t);
const indexJSON = trips => JSON.stringify(privateTripIndex(trips));


const saveUserItineraries = (trips) =>
  apiRequest('/api/trips', { method: 'PUT', body: JSON.stringify({ trips }) });

// Poll returns only updated shared trip bodies; ETags are still verified by the server.
const pollUserItineraries = knownVersions => apiRequest('/api/trips', {
  method: 'POST', body: JSON.stringify({ action: 'poll', knownVersions })
});

// Map pins
const BLUE_SAVED_PLACE_PIN = {
  url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="38" viewBox="0 0 24 24" fill="#2563eb" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
      <circle cx="12" cy="10" r="3.5" fill="#ffffff"></circle>
    </svg>
  `),
  anchor: { x: 15, y: 38 }
};

const DARK_ITINERARY_PIN = {
  url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="38" viewBox="0 0 24 24" fill="#111111" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
      <circle cx="12" cy="10" r="3.5" fill="#ffffff"></circle>
    </svg>
  `),
  anchor: { x: 15, y: 38 }
};

const STAY_HOTEL_PIN = {
  url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 24 24" fill="#d97706" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
      <circle cx="12" cy="10" r="4" fill="#ffffff"></circle>
    </svg>
  `),
  anchor: { x: 17, y: 42 }
};

// Calculate quadratic curved points for flight path arc
function getCurvedPath(dep, arr, numPoints = 50) {
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
function sortStopsByTime(stops) {
  if (!Array.isArray(stops)) return [];
  return [...stops].sort((a, b) => {
    const timeA = a.time || '00:00';
    const timeB = b.time || '00:00';
    return timeA.localeCompare(timeB);
  });
}

// Helper to group consecutive days for the same stay
function getGroupedStays(staysByDay, daysCount) {
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
const TRAVEL_MODES = [
  { key: 'WALK', label: 'Walk', Icon: Footprints },
  { key: 'TRANSIT', label: 'Transit', Icon: Bus },
  { key: 'DRIVE', label: 'Car', Icon: Car }
];

const travelCache = new Map();

function formatDuration(seconds) {
  if (seconds == null) return '–';
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function formatDistance(meters) {
  if (meters == null) return '';
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

async function fetchTravel(from, to, mode, departure) {
  const key = `${from.lat},${from.lng}|${to.lat},${to.lng}|${mode.key}|${departure ? departure.getTime() : ''}`;
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
      travelMode: modeMap[mode.key] || 'DRIVE'
    };

    if (mode.key === 'TRANSIT' && departure) {
      body.departureTime = departure.toISOString();
    }

    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    const route = data.routes?.[0];

    let result = null;
    if (route) {
      const seconds = parseInt(route.duration?.replace('s', '') || '0', 10);
      const meters = route.distanceMeters || 0;
      result = { seconds, meters };
    }

    travelCache.set(key, result);
    return result;
  } catch (e) {
    console.error('Routes API call failed:', e);
    travelCache.set(key, null);
    return null;
  }
}

function TravelTimeBar({ from, to, departure }) {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(TRAVEL_MODES.map(m => fetchTravel(from, to, m, departure))).then(results => {
      if (cancelled) return;
      const next = {};
      TRAVEL_MODES.forEach((m, i) => { next[m.key] = results[i]; });
      setData(next);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [from.lat, from.lng, to.lat, to.lng, departure ? departure.getTime() : null]);

  const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}`;

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5 sm:gap-2 ml-1 sm:ml-3 pl-3 sm:pl-6 border-l-2 border-dashed border-[#e5e5e0] py-1.5 text-[11px] text-[#555555]">
      <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
        {TRAVEL_MODES.map(({ key, label, Icon }) => (
          <span key={key} className="flex items-center space-x-1" title={data[key] ? formatDistance(data[key].meters) : ''}>
            <Icon className="w-3.5 h-3.5 text-[#888888]" />
            <span className="text-[#888888]">{label}:</span>
            <span className="font-medium text-[#111111]">
              {loading ? '…' : data[key] ? formatDuration(data[key].seconds) : 'n/a'}
            </span>
          </span>
        ))}
      </div>
      <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-[#888888] hover:text-[#111111] shrink-0 font-medium">
        Directions
      </a>
    </div>
  );
}

function getDepartureDate(dateStr, timeStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '12:00').split(':').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d, hh || 0, mm || 0);
  return date.getTime() > Date.now() ? date : new Date();
}

function renderPriceLevel(priceLevel) {
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

function formatOpeningHours(openingHours) {
  if (!openingHours) return [];
  return openingHours.weekdayDescriptions || [];
}

function getTodayOpeningHours(openingHours, date = new Date()) {
  const descriptions = formatOpeningHours(openingHours);
  if (!descriptions.length) return null;
  return descriptions[date.getDay() === 0 ? 6 : date.getDay() - 1] || null;
}

function getDayDate(startDateStr, dayNumber) {
  if (!startDateStr) return null;
  const [year, month, day] = startDateStr.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day + (dayNumber - 1));
}

function formatDayDate(startDateStr, dayNumber, includeYear = false) {
  const date = getDayDate(startDateStr, dayNumber);
  if (!date || isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {})
  });
}

function getDayDateString(startDateStr, dayNumber) {
  const date = getDayDate(startDateStr, dayNumber);
  if (!date || isNaN(date.getTime())) return startDateStr;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function calculateDaysCount(startDateStr, endDateStr) {
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

function getEndDateString(startDateStr, daysCount) {
  if (!startDateStr || !daysCount) return startDateStr;
  const date = getDayDate(startDateStr, daysCount);
  if (!date || isNaN(date.getTime())) return startDateStr;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function checkIsClosed(timeStr, openingHours, dateStr) {
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

function PlaceAutocomplete({ onPlaceSelected, placeholder = 'Search for a place...' }) {
  const containerRef = useRef(null);
  const onPlaceSelectedRef = useRef(onPlaceSelected);

  useEffect(() => {
    onPlaceSelectedRef.current = onPlaceSelected;
  }, [onPlaceSelected]);

  useEffect(() => {
    if (!containerRef.current || !window.google?.maps?.importLibrary) return;

    let autocompleteElement = null;
    let handleSelect = null;
    let cancelled = false;

    const setupAutocomplete = async () => {
      try {
        const { PlaceAutocompleteElement } = await window.google.maps.importLibrary('places');

        if (cancelled || !containerRef.current) return;

        autocompleteElement = new PlaceAutocompleteElement();
        autocompleteElement.placeholder = placeholder;
        autocompleteElement.style.width = '100%';
        autocompleteElement.style.height = '40px';
        autocompleteElement.classList.add('travelogue-place-autocomplete');

        handleSelect = async (event) => {
          try {
            const placePrediction = event.placePrediction;
            if (!placePrediction) return;

            const place = placePrediction.toPlace();
            await place.fetchFields({
              fields: [
                'id',
                'displayName',
                'formattedAddress',
                'location',
                'types',
                'rating',
                'priceLevel',
                'regularOpeningHours'
              ]
            });

            onPlaceSelectedRef.current({
              id: place.id || '',
              name: place.displayName || '',
              address: place.formattedAddress || '',
              lat: place.location ? place.location.lat() : null,
              lng: place.location ? place.location.lng() : null,
              types: place.types || [],
              rating: place.rating || null,
              priceLevel: place.priceLevel || null,
              openingHours: place.regularOpeningHours || null
            });
          } catch (error) {
            console.error('Error getting place details:', error);
          }
        };

        autocompleteElement.addEventListener('gmp-select', handleSelect);
        if (containerRef.current) {
          containerRef.current.replaceChildren(autocompleteElement);
        }
      } catch (error) {
        console.error('Failed to initialize Google Places Autocomplete:', error);
      }
    };

    setupAutocomplete();

    return () => {
      cancelled = true;
      if (autocompleteElement && handleSelect) {
        autocompleteElement.removeEventListener('gmp-select', handleSelect);
      }
      if (containerRef.current) {
        containerRef.current.replaceChildren();
      }
    };
  }, [placeholder]);

  return <div ref={containerRef} className="w-full" />;
}

const REC_QUERIES = {
  'Places to Visit': { query: 'top tourist attractions', type: 'tourist_attraction' },
  'Food & Eats': { query: 'best restaurants', type: 'restaurant' },
  'Experiences': { query: 'popular things to do', type: null },
  'Stays/Hotel': { query: 'best hotels', type: 'lodging' }
};

export default function App() {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: LIBRARIES
  });

  // User Authentication & Database Account State (session lives in an HttpOnly cookie)
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '' });
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [isDbSyncing, setIsDbSyncing] = useState(false);
  const [dbError, setDbError] = useState('');
  const [tripsLoaded, setTripsLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Local edits stay in React state. Shared documents are individually persisted with
  // conditional writes + three-way merge; personal data remains in the old account store.
  const [trips, setTrips] = useState([]);
  const tripsRef = useRef([]);
  tripsRef.current = trips;
  const syncedTripsRef = useRef(new Map());
  const sharedVersionsRef = useRef({});
  const personalIndexRef = useRef('');
  const saveRunningRef = useRef(false);
  const pollRunningRef = useRef(false);
  const skipNextSave = useRef(true);
  const [syncPulse, setSyncPulse] = useState(0);
  const [sharedMeta, setSharedMeta] = useState({});
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareDetails, setShareDetails] = useState(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [collabConflict, setCollabConflict] = useState(null);
  const [pendingInvite, setPendingInvite] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get('invite');
    const code = params.get('code');
    return invite && code ? { sharedId: invite, inviteToken: code } : null;
  });
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState('');

  // Restore session on page load (verifies against Vercel Blob)
  useEffect(() => {
    let active = true;
    authApi({ action: 'me' })
      .then(data => { if (active) setCurrentUser(data.user); })
      .catch(err => {
        if (!active) return;
        if (err.status !== 401) setAuthError(err.message);
      })
      .finally(() => { if (active) setAuthChecking(false); });
    return () => { active = false; };
  }, []);

  // Initial load, including the latest canonical versions of trips shared with me.
  useEffect(() => {
    let active = true;
    if (!currentUser) return;
    setTripsLoaded(false);
    setIsDbSyncing(true);
    setDbError('');
    loadUserItineraries()
      .then(data => {
        if (!active) return;
        syncedTripsRef.current = new Map(data.trips.map(t => [t.id, t]));
        sharedVersionsRef.current = data.versions;
        personalIndexRef.current = indexJSON(data.trips);
        skipNextSave.current = true;
        setSharedMeta(data.shared);
        setTrips(data.trips);
        setTripsLoaded(true);
      })
      .catch(err => {
        if (active) { setTripsLoaded(false); setDbError(err.message); }
      })
      .finally(() => { if (active) setIsDbSyncing(false); });
    return () => { active = false; };
  }, [currentUser, reloadKey]);

  // Changes to different saved places, stays, days or stop fields merge on the server.
  // Actual conflicting edits are shown to the user rather than overwritten silently.
  useEffect(() => {
    if (!currentUser || !tripsLoaded) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    const needsSave = () => indexJSON(tripsRef.current) !== personalIndexRef.current ||
      tripsRef.current.some(t => t.sharedId && !jsonEqual(t, syncedTripsRef.current.get(t.id)) &&
        collabConflict?.sharedId !== t.sharedId);
    if (!needsSave()) return;
    const timer = setTimeout(async () => {
      if (saveRunningRef.current) return;
      let succeeded = false;
      let failingSharedId = null;
      saveRunningRef.current = true;
      setIsDbSyncing(true);
      try {
        const atStart = tripsRef.current;
        const indexSnapshot = indexJSON(atStart);
        if (indexSnapshot !== personalIndexRef.current) {
          await saveUserItineraries(atStart);
          personalIndexRef.current = indexSnapshot;
        }
        const dirtyShared = atStart.flatMap(trip => {
          if (!trip.sharedId || collabConflict?.sharedId === trip.sharedId) return [];
          const baseTrip = syncedTripsRef.current.get(trip.id);
          return baseTrip && !jsonEqual(baseTrip, trip) ? [{ trip, baseTrip }] : [];
        });
        // Independent trips can be saved together. Limit concurrency to avoid
        // overwhelming Blob and retain the successful results if another fails.
        for (let start = 0; start < dirtyShared.length; start += 4) {
          const batch = dirtyShared.slice(start, start + 4);
          const outcomes = await Promise.allSettled(batch.map(async ({ trip, baseTrip }) => {
            const result = await saveSharedTrip({ sharedId: trip.sharedId, baseTrip, trip });
            syncedTripsRef.current.set(trip.id, result.trip);
            sharedVersionsRef.current = {
              ...sharedVersionsRef.current, [trip.sharedId]: result.revision
            };
            setSharedMeta(prev => ({ ...prev, [trip.sharedId]: result.shared }));
            setTrips(current => current.map(t => {
              if (t.id !== trip.id) return t;
              if (jsonEqual(t, trip)) return result.trip;
              // A newer local change occurred during the network request. Rebase it.
              return mergeTrip(trip, t, result.trip, { preferLocal: true });
            }));
          }));
          const failedAt = outcomes.findIndex(item => item.status === 'rejected');
          if (failedAt !== -1) {
            failingSharedId = batch[failedAt].trip.sharedId;
            throw outcomes[failedAt].reason;
          }
        }
        setDbError('');
        succeeded = true;
      } catch (err) {
        if (err.status === 409 && failingSharedId) {
          setCollabConflict({ sharedId: failingSharedId, message: err.message });
        }
        setDbError(`Some changes were NOT saved: ${err.message}`);
      } finally {
        saveRunningRef.current = false;
        setIsDbSyncing(false);
        // Re-check edits made while the previous request was in flight.
        // On failure, don't spin endlessly retrying against a disconnected server.
        if (succeeded) setSyncPulse(v => v + 1);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [trips, currentUser, tripsLoaded, syncPulse, collabConflict]);

  // Every 6 seconds, check shared ETags. Only changed trips cross the network.
  // Unchanged polls do not trigger any React updates or JSON comparisons.
  useEffect(() => {
    if (!currentUser || !tripsLoaded) return;
    let active = true;
    const poll = async () => {
      if (!active || document.hidden || saveRunningRef.current || pollRunningRef.current) return;
      pollRunningRef.current = true;
      const versionsAtStart = sharedVersionsRef.current;
      try {
        const result = await pollUserItineraries(versionsAtStart);
        // A save/share action may have completed after this poll began. Never
        // apply an older poll response over its newer authoritative ETag.
        if (!active || saveRunningRef.current || sharedVersionsRef.current !== versionsAtStart) return;
        const accessible = new Map(result.pointers.map(p => [p.id, p.sharedId]));
        const remoteById = new Map(result.trips.map(t => [t.id, t]));
        const previousVersions = sharedVersionsRef.current;
        sharedVersionsRef.current = Object.fromEntries(result.pointers.map(p =>
          [p.sharedId, result.versions[p.sharedId] || previousVersions[p.sharedId]]));
        setTrips(prev => {
          let changed = false;
          const next = prev.flatMap(t => {
            if (!t.sharedId) return [t];
            if (accessible.get(t.id) !== t.sharedId) {
              changed = true;
              syncedTripsRef.current.delete(t.id);
              return []; // membership removed or sharing stopped
            }
            const incoming = remoteById.get(t.id);
            if (!incoming) return [t]; // ETag unchanged; keep existing reference
            const base = syncedTripsRef.current.get(t.id);
            if (!base || jsonEqual(t, base)) {
              syncedTripsRef.current.set(t.id, incoming);
              if (!jsonEqual(t, incoming)) changed = true;
              return [incoming];
            }
            return [t]; // local edits are rebased by the save endpoint
          });
          for (const [id] of accessible) {
            if (next.some(t => t.id === id)) continue;
            const incoming = remoteById.get(id);
            if (incoming) {
              next.push(incoming);
              syncedTripsRef.current.set(id, incoming);
              changed = true;
            }
          }
          if (!changed) return prev;
          // A remote invite or revocation changes the pointer set, not a local edit.
          if (indexJSON(next) !== indexJSON(prev)) personalIndexRef.current = indexJSON(next);
          return next;
        });
        setSharedMeta(prev => {
          const currentIds = new Set(result.pointers.map(p => p.sharedId));
          if (!Object.keys(result.shared).length &&
              Object.keys(prev).every(id => currentIds.has(id))) return prev;
          return { ...Object.fromEntries(Object.entries(prev).filter(([id]) => currentIds.has(id))),
            ...result.shared };
        });
      } catch (err) {
        // Keep the current unsaved trip and try on the next poll.
      } finally {
        pollRunningRef.current = false;
      }
    };
    const timer = setInterval(poll, 6000);
    // Catch up promptly after the tab has been asleep instead of polling in the background.
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [currentUser, tripsLoaded]);

  const [activeTripId, setActiveTripId] = useState(null);
  const [activeDay, setActiveDay] = useState(null);
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [recommendations, setRecommendations] = useState([]);
  const [isRecLoading, setIsRecLoading] = useState(false);

  const [recCategory, setRecCategory] = useState('Places to Visit');

  const [showNewPlaceModal, setShowNewPlaceModal] = useState(false);
  const [newPlace, setNewPlace] = useState({
    name: '',
    address: '',
    area: '',
    category: 'Places to Visit',
    lat: null,
    lng: null,
    note: '',
    rating: null,
    priceInfo: '',
    openingHours: null,
    types: []
  });

  const [showAddStopModal, setShowAddStopModal] = useState(false);
  const [newStop, setNewStop] = useState({
    name: '',
    address: '',
    time: '12:00',
    lat: null,
    lng: null,
    note: '',
    rating: null,
    priceInfo: '',
    openingHours: null,
    types: []
  });

  // Edit Stop/Place Modal State
  const [showEditStopModal, setShowEditStopModal] = useState(false);
  const [editStopForm, setEditStopForm] = useState({
    id: '',
    name: '',
    address: '',
    time: '12:00',
    lat: null,
    lng: null,
    note: '',
    rating: null,
    priceInfo: '',
    openingHours: null,
    types: []
  });

  const [showAddFlightModal, setShowAddFlightModal] = useState(false);
  const [newFlight, setNewFlight] = useState({
    flightNumber: '',
    airline: '',
    departureAirport: '',
    arrivalAirport: '',
    departureTime: '08:00',
    arrivalTime: '12:00',
    departureLat: null,
    departureLng: null,
    arrivalLat: null,
    arrivalLng: null,
    bookingRef: '',
    note: ''
  });

  // Stay / Hotel Modal state
  const [showStayModal, setShowStayModal] = useState(false);
  const [stayForm, setStayForm] = useState({
    name: '',
    address: '',
    lat: null,
    lng: null,
    note: '',
    rating: null,
    priceInfo: '',
    fromDay: 1,
    toDay: 1
  });

  const [showNewTripModal, setShowNewTripModal] = useState(false);
  const [newTripForm, setNewTripForm] = useState({
    name: '',
    subName: '',
    startDate: '',
    endDate: '',
    lat: 48.8566,
    lng: 2.3522
  });

  // Edit Dates Modal state
  const [showEditDatesModal, setShowEditDatesModal] = useState(false);
  const [editDatesForm, setEditDatesForm] = useState({
    startDate: '',
    endDate: ''
  });

  const [map, setMap] = useState(null);

  // Set active trip default on load
  useEffect(() => {
    if (trips.length > 0 && !trips.some(t => t.id === activeTripId)) {
      setActiveTripId(trips[0].id);
    }
  }, [trips, activeTripId]);

  const activeTrip = trips.find(t => t.id === activeTripId) || null;

  const activeTripName = activeTrip?.name;
  const activeTripLat = activeTrip?.center?.[0];
  const activeTripLng = activeTrip?.center?.[1];

  // User Auth Actions
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    if (!authForm.email || !authForm.password) {
      setAuthError('Please fill in all required fields.');
      return;
    }

    setAuthSubmitting(true);
    try {
      const data = await authApi({
        action: authMode === 'login' ? 'login' : 'register',
        email: authForm.email,
        password: authForm.password,
        name: authForm.name
      });
      setAuthForm({ email: '', password: '', name: '' });
      setCurrentUser(data.user);
    } catch (err) {
      // Includes "unable to connect to Vercel Blob" - account creation is refused if Blob is down
      setAuthError(err.message);
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await authApi({ action: 'logout' });
    } catch (err) {
      // cookie may remain; still clear local UI state
    }
    setCurrentUser(null);
    setTrips([]);
    setTripsLoaded(false);
    syncedTripsRef.current.clear();
    sharedVersionsRef.current = {};
    personalIndexRef.current = '';
    setSharedMeta({});
    setDbError('');
    setActiveTripId(null);
    setActiveDay(null);
  };

  const fetchRecommendations = useCallback(async () => {
    if (!activeTripName || !isLoaded || !window.google?.maps?.importLibrary) return;

    setIsRecLoading(true);
    try {
      const { Place } = await window.google.maps.importLibrary('places');
      const cfg = REC_QUERIES[recCategory] || REC_QUERIES['Places to Visit'];

      const request = {
        textQuery: `${cfg.query} in ${activeTripName}`,
        fields: [
          'id', 'displayName', 'formattedAddress', 'location', 'rating',
          'userRatingCount', 'priceLevel', 'regularOpeningHours', 'types', 'editorialSummary'
        ],
        maxResultCount: 10,
        ...(cfg.type ? { includedType: cfg.type } : {}),
        ...(activeTripLat != null && activeTripLng != null
          ? { locationBias: { center: { lat: activeTripLat, lng: activeTripLng }, radius: 20000 } }
          : {})
      };

      const { places } = await Place.searchByText(request);

      const results = (places || [])
        .filter(p => p.location)
        .sort((a, b) => (b.rating || 0) - (a.rating || 0))
        .slice(0, 6)
        .map(p => ({
          googleId: p.id,
          name: p.displayName || 'Unnamed place',
          address: p.formattedAddress || '',
          area: p.formattedAddress?.split(',')[0] || activeTripName,
          category: recCategory,
          note: p.editorialSummary || (p.rating ? `Rated ${p.rating}${p.userRatingCount ? ` from ${p.userRatingCount.toLocaleString()} reviews` : ''}.` : ''),
          lat: p.location.lat(),
          lng: p.location.lng(),
          rating: p.rating || null,
          priceInfo: renderPriceLevel(p.priceLevel) || '',
          openingHours: p.regularOpeningHours || null,
          types: p.types || []
        }));

      setRecommendations(results);
    } catch (err) {
      console.error('Recommendation error:', err);
      setRecommendations([]);
    } finally {
      setIsRecLoading(false);
    }
  }, [activeTripId, activeTripName, activeTripLat, activeTripLng, isLoaded, recCategory]);

  useEffect(() => {
    if (activeTripId && isLoaded) {
      fetchRecommendations();
    }
  }, [activeTripId, isLoaded, fetchRecommendations]);

  const onLoadMap = useCallback((mapInstance) => setMap(mapInstance), []);
  const onUnmountMap = useCallback(() => setMap(null), []);

  // Sorted chronologically by scheduled time
  const activeStops = activeDay !== null ? sortStopsByTime(activeTrip?.schedule[activeDay] || []) : [];
  const allDayStops = activeTrip
    ? Object.keys(activeTrip.schedule)
        .sort((a, b) => Number(a) - Number(b))
        .flatMap(day => sortStopsByTime(activeTrip.schedule[day] || []))
        .filter(stop => stop.lat != null && stop.lng != null)
    : [];
  const savedPlacesWithCoords = activeTrip
    ? (activeTrip.savedPlaces || []).filter(p => p.lat != null && p.lng != null)
    : [];

  const lastFitKeyRef = useRef({ map: null, key: '' });
  const mapCenter = useMemo(
    () => (activeTrip ? { lat: activeTrip.center[0], lng: activeTrip.center[1] } : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTrip?.id, activeTrip?.center?.[0], activeTrip?.center?.[1]]
  );

  useEffect(() => {
    if (!map || !activeTrip) return;

    let points = [];
    const currentStops = activeDay !== null ? (activeTrip.schedule[activeDay] || []) : allDayStops;

    currentStops.forEach(stop => {
      if (stop.isFlight) {
        if (stop.departureLat != null && stop.departureLng != null) {
          points.push({ lat: Number(stop.departureLat), lng: Number(stop.departureLng) });
        }
        if (stop.arrivalLat != null && stop.arrivalLng != null) {
          points.push({ lat: Number(stop.arrivalLat), lng: Number(stop.arrivalLng) });
        }
      } else if (stop.lat != null && stop.lng != null) {
        points.push({ lat: Number(stop.lat), lng: Number(stop.lng) });
      }
    });

    if (activeDay !== null) {
      const dayStay = activeTrip.staysByDay?.[activeDay];
      if (dayStay && dayStay.lat != null && dayStay.lng != null) {
        points.push({ lat: Number(dayStay.lat), lng: Number(dayStay.lng) });
      }
    } else {
      savedPlacesWithCoords.forEach(p => points.push({ lat: Number(p.lat), lng: Number(p.lng) }));
      if (activeTrip.staysByDay) {
        Object.values(activeTrip.staysByDay).forEach(stay => {
          if (stay.lat != null && stay.lng != null) {
            points.push({ lat: Number(stay.lat), lng: Number(stay.lng) });
          }
        });
      }
    }

    const fitKey = `${activeTrip.id}|${activeDay}|${points.map(pt => `${pt.lat},${pt.lng}`).join(';')}`;
    if (lastFitKeyRef.current.map === map && lastFitKeyRef.current.key === fitKey) return;
    lastFitKeyRef.current = { map, key: fitKey };

    if (points.length > 1) {
      const bounds = new window.google.maps.LatLngBounds();
      points.forEach(point => bounds.extend(point));
      map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
    } else if (points.length === 1) {
      map.panTo(points[0]);
      map.setZoom(13);
    } else if (activeTrip.center) {
      map.panTo({ lat: activeTrip.center[0], lng: activeTrip.center[1] });
      map.setZoom(activeTrip.zoom || 11);
    }
  }, [map, activeTrip, activeDay, allDayStops.length, savedPlacesWithCoords.length]);

  const handleTripPlaceSelected = useCallback((place) => {
    if (!place) return;
    setNewTripForm(prev => ({
      ...prev,
      name: prev.name || place.name,
      subName: prev.subName || place.address?.split(',')[0] || '',
      lat: place.lat !== null ? place.lat : prev.lat,
      lng: place.lng !== null ? place.lng : prev.lng
    }));
  }, []);

  const handleCustomPlaceSelected = useCallback((place) => {
    if (!place) return;

    setNewPlace(prev => ({
      ...prev,
      name: place.name,
      address: place.address,
      area: place.address,
      lat: place.lat,
      lng: place.lng,
      types: place.types || [],
      rating: place.rating,
      priceInfo: renderPriceLevel(place.priceLevel) || '',
      openingHours: place.openingHours,
    }));
  }, []);

  const handleStopPlaceSelected = useCallback((place) => {
    if (!place) return;

    setNewStop(prev => ({
      ...prev,
      name: place.name,
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      types: place.types || [],
      rating: place.rating,
      priceInfo: renderPriceLevel(place.priceLevel) || '',
      openingHours: place.openingHours,
    }));
  }, []);

  const handleEditStopPlaceSelected = useCallback((place) => {
    if (!place) return;

    setEditStopForm(prev => ({
      ...prev,
      name: place.name,
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      types: place.types || [],
      rating: place.rating,
      priceInfo: renderPriceLevel(place.priceLevel) || '',
      openingHours: place.openingHours,
    }));
  }, []);

  const handleStayPlaceSelected = useCallback((place) => {
    if (!place) return;

    setStayForm(prev => ({
      ...prev,
      name: place.name || '',
      address: place.address || '',
      lat: place.lat,
      lng: place.lng,
      rating: place.rating,
      priceInfo: renderPriceLevel(place.priceLevel) || '',
    }));
  }, []);

  const clearInvitation = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('invite');
    url.searchParams.delete('code');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    setPendingInvite(null);
  };

  const handleJoinTrip = async () => {
    if (!pendingInvite) return;
    setJoinBusy(true);
    setJoinError('');
    try {
      const result = await collaborationApi({ action: 'join', ...pendingInvite });
      clearInvitation();
      setActiveTripId(result.trip.id);
      setReloadKey(v => v + 1);
    } catch (err) {
      setJoinError(err.message);
    } finally {
      setJoinBusy(false);
    }
  };

  const handleOpenShare = async () => {
    if (!activeTrip) return;
    setShowShareModal(true);
    setShareDetails(null);
    setShareError('');
    setLinkCopied(false);
    if (activeTrip.sharedId) {
      setShareBusy(true);
      try {
        const result = await loadSharedTrip(activeTrip.sharedId);
        setShareDetails(result.shared);
      } catch (err) {
        setShareError(err.message);
      } finally { setShareBusy(false); }
    }
  };

  const handleEnableSharing = async () => {
    if (!activeTrip || activeTrip.sharedId) return;
    setShareBusy(true);
    setShareError('');
    try {
      // Ensure a trip created a moment ago is persisted before promoting it to shared.
      const current = tripsRef.current;
      await saveUserItineraries(current);
      personalIndexRef.current = indexJSON(current);
      const result = await collaborationApi({ action: 'create', tripId: activeTrip.id, trip: activeTrip });
      syncedTripsRef.current.set(activeTrip.id, result.trip);
      sharedVersionsRef.current = { ...sharedVersionsRef.current, [result.trip.sharedId]: result.revision };
      setTrips(prev => prev.map(t => t.id === result.trip.id ? result.trip : t));
      setSharedMeta(prev => ({ ...prev, [result.trip.sharedId]: result.shared }));
      setShareDetails(result.shared);
      // The create endpoint already persisted the personal trip pointer.
      personalIndexRef.current = indexJSON(tripsRef.current.map(t =>
        t.id === result.trip.id ? result.trip : t));
    } catch (err) { setShareError(err.message); }
    finally { setShareBusy(false); }
  };

  const shareLink = shareDetails?.inviteToken && shareDetails.id
    ? `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(shareDetails.id)}&code=${encodeURIComponent(shareDetails.inviteToken)}`
    : '';

  const handleCopyShareLink = async () => {
    if (!shareLink) return;
    try { await navigator.clipboard.writeText(shareLink); setLinkCopied(true); }
    catch { setShareError('Clipboard unavailable. Select and copy the invitation link manually.'); }
  };

  const handleShareAction = async (action, extra = {}) => {
    if (!activeTrip?.sharedId) return;
    const id = activeTrip.sharedId;
    if (action === 'regenerate' && !confirm('Invalidate all previously shared invitation links? Existing editors keep their access.')) return;
    if (action === 'remove' && !confirm('Remove this editor from the shared itinerary?')) return;
    if (action === 'stop' && !confirm('Stop sharing? Others will lose access. Your trip will remain private.')) return;
    if (action === 'leave' && !confirm('Leave this shared trip? It will disappear from your account.')) return;
    setShareBusy(true);
    setShareError('');
    try {
      const result = await collaborationApi({ action, sharedId: id, ...extra });
      if (action === 'stop') {
        syncedTripsRef.current.set(result.trip.id, result.trip);
        sharedVersionsRef.current = Object.fromEntries(
          Object.entries(sharedVersionsRef.current).filter(([key]) => key !== id));
        setTrips(prev => prev.map(t => t.id === result.trip.id ? result.trip : t));
        setSharedMeta(prev => { const copy = { ...prev }; delete copy[id]; return copy; });
        setShareDetails(null);
        setShowShareModal(false);
      } else if (action === 'leave') {
        syncedTripsRef.current.delete(activeTrip.id);
        sharedVersionsRef.current = Object.fromEntries(
          Object.entries(sharedVersionsRef.current).filter(([key]) => key !== id));
        setTrips(prev => prev.filter(t => t.id !== activeTrip.id));
        setActiveTripId(null);
        setActiveDay(null);
        setShowShareModal(false);
      } else {
        setShareDetails(result.shared);
        setSharedMeta(prev => ({ ...prev, [id]: result.shared }));
        setLinkCopied(false);
      }
    } catch (err) { setShareError(err.message); }
    finally { setShareBusy(false); }
  };

  const handleResolveConflict = async (keepMine) => {
    if (!collabConflict) return;
    const trip = tripsRef.current.find(t => t.sharedId === collabConflict.sharedId);
    if (!trip) { setCollabConflict(null); return; }
    setIsDbSyncing(true);
    try {
      let result;
      if (keepMine) {
        result = await saveSharedTrip({
          sharedId: trip.sharedId, baseTrip: syncedTripsRef.current.get(trip.id),
          trip, conflictMode: 'mine'
        });
      } else result = await loadSharedTrip(trip.sharedId);
      syncedTripsRef.current.set(trip.id, result.trip);
      sharedVersionsRef.current = { ...sharedVersionsRef.current, [trip.sharedId]: result.revision };
      setTrips(prev => prev.map(t => t.id === trip.id ? result.trip : t));
      setSharedMeta(prev => ({ ...prev, [trip.sharedId]: result.shared }));
      setCollabConflict(null);
      setDbError('');
    } catch (err) { setDbError(err.message); }
    finally { setIsDbSyncing(false); }
  };

  const handleDeparturePlaceSelected = useCallback((place) => {
    if (!place) return;
    setNewFlight(prev => ({
      ...prev,
      departureAirport: place.name || place.address,
      departureLat: place.lat,
      departureLng: place.lng
    }));
  }, []);

  const handleArrivalPlaceSelected = useCallback((place) => {
    if (!place) return;
    setNewFlight(prev => ({
      ...prev,
      arrivalAirport: place.name || place.address,
      arrivalLat: place.lat,
      arrivalLng: place.lng
    }));
  }, []);

  const handleCreateTrip = (e) => {
    e.preventDefault();
    if (!newTripForm.name.trim()) return;

    const startDate = newTripForm.startDate || new Date().toISOString().split('T')[0];
    const endDate = newTripForm.endDate || startDate;
    const daysCount = calculateDaysCount(startDate, endDate);

    const newTrip = {
      id: `trip_${Date.now()}`,
      userId: currentUser ? currentUser.id : 'guest',
      name: newTripForm.name,
      japaneseSub: newTripForm.subName || 'Trip',
      center: [parseFloat(newTripForm.lat) || 48.8566, parseFloat(newTripForm.lng) || 2.3522],
      zoom: 11,
      startDate: startDate,
      daysCount: daysCount,
      savedPlaces: [],
      schedule: {},
      staysByDay: {}
    };

    setTrips(prev => [...prev, newTrip]);
    setActiveTripId(newTrip.id);
    setActiveDay(null);
    setShowNewTripModal(false);
    setNewTripForm({ name: '', subName: '', startDate: '', endDate: '', lat: 48.8566, lng: 2.3522 });
  };

  const handleOpenEditDatesModal = () => {
    if (!activeTrip) return;
    const start = activeTrip.startDate || '';
    const end = getEndDateString(start, activeTrip.daysCount || 1);
    setEditDatesForm({ startDate: start, endDate: end });
    setShowEditDatesModal(true);
  };

  const handleSaveEditedDates = (e) => {
    e.preventDefault();
    if (!activeTrip) return;
    const start = editDatesForm.startDate || activeTrip.startDate;
    const end = editDatesForm.endDate || start;
    const daysCount = calculateDaysCount(start, end);

    setTrips(prev =>
      prev.map(trip =>
        trip.id === activeTrip.id
          ? { ...trip, startDate: start, daysCount: daysCount }
          : trip
      )
    );
    setShowEditDatesModal(false);
  };

  const handleAddDay = () => {
    if (!activeTrip) return;
    setTrips(prev =>
      prev.map(trip => (trip.id === activeTrip.id ? { ...trip, daysCount: trip.daysCount + 1 } : trip))
    );
  };

  const handleDeleteTrip = async () => {
    if (!activeTrip || !confirm(`Delete trip "${activeTrip.name}"?`)) return;
    if (activeTrip.sharedId) {
      const action = sharedMeta[activeTrip.sharedId]?.role === 'owner' ? 'stop' : 'leave';
      try { await collaborationApi({ action, sharedId: activeTrip.sharedId }); }
      catch (err) { setDbError(`Could not delete trip: ${err.message}`); return; }
    }
    const remaining = tripsRef.current.filter(trip => trip.id !== activeTrip.id);
    setTrips(remaining);
    setActiveTripId(remaining[0]?.id || null);
    setActiveDay(null);
  };

  const handleSetStayForDays = (e) => {
    e.preventDefault();
    if (!stayForm.name.trim() || !activeTrip) return;

    const start = Math.min(parseInt(stayForm.fromDay) || 1, parseInt(stayForm.toDay) || 1);
    const end = Math.max(parseInt(stayForm.fromDay) || 1, parseInt(stayForm.toDay) || 1);

    const stayData = {
      id: `stay_${Date.now()}`,
      name: stayForm.name,
      address: stayForm.address || '',
      lat: stayForm.lat !== null ? parseFloat(stayForm.lat) : activeTrip.center[0],
      lng: stayForm.lng !== null ? parseFloat(stayForm.lng) : activeTrip.center[1],
      note: stayForm.note || '',
      rating: stayForm.rating || null,
      priceInfo: stayForm.priceInfo || ''
    };

    setTrips(prev =>
      prev.map(trip => {
        if (trip.id !== activeTrip.id) return trip;
        const updatedStays = { ...(trip.staysByDay || {}) };
        for (let d = start; d <= end; d++) {
          updatedStays[d] = stayData;
        }
        return { ...trip, staysByDay: updatedStays };
      })
    );

    setShowStayModal(false);
    setStayForm({
      name: '',
      address: '',
      lat: null,
      lng: null,
      note: '',
      rating: null,
      priceInfo: '',
      fromDay: 1,
      toDay: 1
    });
  };

  const handleUnpinStay = (day) => {
    if (!activeTrip) return;
    setTrips(prev =>
      prev.map(trip => {
        if (trip.id !== activeTrip.id) return trip;
        const updatedStays = { ...(trip.staysByDay || {}) };
        delete updatedStays[day];
        return { ...trip, staysByDay: updatedStays };
      })
    );
  };

  const handleAddToDay = (place, day) => {
    setTrips(prev =>
      prev.map(trip => {
        if (trip.id !== activeTrip.id) return trip;
        const currentSchedule = trip.schedule[day] || [];
        const updatedSchedule = [
          ...currentSchedule,
          {
            ...place,
            address: place.address || place.area || '',
            id: `s_${Date.now()}_${Math.random()}`,
            time: '12:00'
          }
        ];
        return {
          ...trip,
          schedule: {
            ...trip.schedule,
            [day]: sortStopsByTime(updatedSchedule)
          }
        };
      })
    );
  };

  const handleAddDirectStop = async (e) => {
    e.preventDefault();
    if (!newStop.name.trim() || !activeTrip) return;

    const targetDay = activeDay || 1;

    const createdStop = {
      id: `s_${Date.now()}_${Math.random()}`,
      name: newStop.name,
      address: newStop.address || '',
      time: newStop.time || '12:00',
      lat: newStop.lat !== null ? parseFloat(newStop.lat) : activeTrip.center[0],
      lng: newStop.lng !== null ? parseFloat(newStop.lng) : activeTrip.center[1],
      note: newStop.note,
      rating: newStop.rating,
      priceInfo: newStop.priceInfo,
      openingHours: newStop.openingHours,
      types: newStop.types || []
    };

    setTrips(prev =>
      prev.map(trip => {
        if (trip.id !== activeTrip.id) return trip;
        const currentSchedule = trip.schedule[targetDay] || [];
        return {
          ...trip,
          schedule: {
            ...trip.schedule,
            [targetDay]: sortStopsByTime([...currentSchedule, createdStop])
          }
        };
      })
    );

    setNewStop({ name: '', address: '', time: '12:00', lat: null, lng: null, note: '', rating: null, priceInfo: '', openingHours: null, types: [] });
    setShowAddStopModal(false);
  };

  const handleOpenEditStopModal = (stop) => {
    setEditStopForm({
      id: stop.id,
      name: stop.name || '',
      address: stop.address || '',
      time: stop.time || '12:00',
      lat: stop.lat !== undefined ? stop.lat : null,
      lng: stop.lng !== undefined ? stop.lng : null,
      note: stop.note || '',
      rating: stop.rating !== undefined ? stop.rating : null,
      priceInfo: stop.priceInfo || '',
      openingHours: stop.openingHours || null,
      types: stop.types || []
    });
    setShowEditStopModal(true);
  };

  const handleSaveEditedStop = (e) => {
    e.preventDefault();
    if (!editStopForm.name.trim() || !activeTrip || activeDay === null) return;

    setTrips(prev =>
      prev.map(trip => {
        if (trip.id !== activeTrip.id) return trip;
        const currentSchedule = trip.schedule[activeDay] || [];
        const updatedSchedule = currentSchedule.map(stop => {
          if (stop.id === editStopForm.id) {
            return {
              ...stop,
              name: editStopForm.name,
              address: editStopForm.address,
              time: editStopForm.time,
              lat: editStopForm.lat !== null ? parseFloat(editStopForm.lat) : stop.lat,
              lng: editStopForm.lng !== null ? parseFloat(editStopForm.lng) : stop.lng,
              note: editStopForm.note,
              rating: editStopForm.rating,
              priceInfo: editStopForm.priceInfo,
              openingHours: editStopForm.openingHours,
              types: editStopForm.types
            };
          }
          return stop;
        });
        return {
          ...trip,
          schedule: {
            ...trip.schedule,
            [activeDay]: sortStopsByTime(updatedSchedule)
          }
        };
      })
    );

    setShowEditStopModal(false);
  };

  const handleAddFlight = (e) => {
    e.preventDefault();
    if (!activeTrip) return;

    const targetDay = activeDay || 1;
    const flightName = newFlight.flightNumber 
      ? `Flight ${newFlight.flightNumber} (${newFlight.departureAirport || 'Dep'} → ${newFlight.arrivalAirport || 'Arr'})`
      : `Flight (${newFlight.departureAirport || 'Dep'} → ${newFlight.arrivalAirport || 'Arr'})`;

    const createdFlightStop = {
      id: `f_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      isFlight: true,
      category: 'Flights',
      name: flightName,
      flightNumber: newFlight.flightNumber,
      airline: newFlight.airline,
      departureAirport: newFlight.departureAirport,
      arrivalAirport: newFlight.arrivalAirport,
      departureLat: newFlight.departureLat !== null ? parseFloat(newFlight.departureLat) : null,
      departureLng: newFlight.departureLng !== null ? parseFloat(newFlight.departureLng) : null,
      arrivalLat: newFlight.arrivalLat !== null ? parseFloat(newFlight.arrivalLat) : null,
      arrivalLng: newFlight.arrivalLng !== null ? parseFloat(newFlight.arrivalLng) : null,
      time: newFlight.departureTime || '08:00',
      arrivalTime: newFlight.arrivalTime || '',
      address: `${newFlight.airline ? `${newFlight.airline} • ` : ''}${newFlight.departureAirport || 'Departure'} → ${newFlight.arrivalAirport || 'Arrival'}`,
      note: [
        newFlight.bookingRef ? `Booking Ref: ${newFlight.bookingRef}` : '',
        newFlight.note
      ].filter(Boolean).join(' • '),
      lat: newFlight.departureLat !== null ? parseFloat(newFlight.departureLat) : (newFlight.arrivalLat !== null ? parseFloat(newFlight.arrivalLat) : activeTrip.center[0]),
      lng: newFlight.departureLng !== null ? parseFloat(newFlight.departureLng) : (newFlight.arrivalLng !== null ? parseFloat(newFlight.arrivalLng) : activeTrip.center[1]),
      types: ['flight', 'airport']
    };

    setTrips(prev =>
      prev.map(trip => {
        if (trip.id !== activeTrip.id) return trip;
        const currentSchedule = trip.schedule[targetDay] || [];
        return {
          ...trip,
          schedule: {
            ...trip.schedule,
            [targetDay]: sortStopsByTime([...currentSchedule, createdFlightStop])
          }
        };
      })
    );

    setNewFlight({
      flightNumber: '',
      airline: '',
      departureAirport: '',
      arrivalAirport: '',
      departureTime: '08:00',
      arrivalTime: '12:00',
      departureLat: null,
      departureLng: null,
      arrivalLat: null,
      arrivalLng: null,
      bookingRef: '',
      note: ''
    });
    setShowAddFlightModal(false);
  };

  const handleOpenInGoogleMaps = (stop) => {
    let mapsUrl = '';
    if (stop.lat != null && stop.lng != null) {
      mapsUrl = `https://www.google.com/maps/search/?api=1&query=${stop.lat},${stop.lng}`;
    } else {
      mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.name)}`;
    }
    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
  };

  const handleOpenInYahooCarNavi = (stop) => {
    if (stop.lat == null || stop.lng == null) return;
    const url = `yjcarnavi://navi/select?lat=${stop.lat}&lon=${stop.lng}&name=${encodeURIComponent(stop.name || '')}`;
    window.location.href = url;
  };

  const handleMoveStop = (day, index, direction) => {
    setTrips(prev =>
      prev.map(trip => {
        if (trip.id !== activeTrip.id) return trip;
        const dayStops = [...(trip.schedule[day] || [])];
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= dayStops.length) return trip;

        const temp = dayStops[index];
        dayStops[index] = dayStops[targetIndex];
        dayStops[targetIndex] = temp;

        return { ...trip, schedule: { ...trip.schedule, [day]: dayStops } };
      })
    );
  };

  const handleRemoveStop = (day, index) => {
    setTrips(prev =>
      prev.map(trip => {
        if (trip.id !== activeTrip.id) return trip;
        const dayStops = (trip.schedule[day] || []).filter((_, i) => i !== index);
        return { ...trip, schedule: { ...trip.schedule, [day]: dayStops } };
      })
    );
  };

  const handleCreatePlace = async (e) => {
    e.preventDefault();
    if (!newPlace.name.trim() || !activeTrip) return;

    const created = {
      id: `p_${Date.now()}`,
      name: newPlace.name,
      address: newPlace.address || newPlace.area || activeTrip.name,
      area: newPlace.area || activeTrip.name,
      category: newPlace.category,
      lat: newPlace.lat !== null ? parseFloat(newPlace.lat) : activeTrip.center[0],
      lng: newPlace.lng !== null ? parseFloat(newPlace.lng) : activeTrip.center[1],
      note: newPlace.note,
      rating: newPlace.rating,
      priceInfo: newPlace.priceInfo,
      openingHours: newPlace.openingHours,
      types: newPlace.types || []
    };

    setTrips(prev =>
      prev.map(trip =>
        trip.id === activeTrip.id ? { ...trip, savedPlaces: [created, ...trip.savedPlaces] } : trip
      )
    );

    setNewPlace({ name: '', address: '', area: '', category: 'Places to Visit', lat: null, lng: null, note: '', rating: null, priceInfo: '', openingHours: null, types: [] });
    setShowNewPlaceModal(false);
  };

  const handleAddRecommendedToSaved = (recommendedItem) => {
    if (!activeTrip) return;

    const newSavedItem = {
      id: `p_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: recommendedItem.name,
      address: recommendedItem.address || recommendedItem.area || activeTrip.name,
      area: recommendedItem.area || activeTrip.name,
      category: recommendedItem.category || 'Places to Visit',
      lat: recommendedItem.lat !== null ? recommendedItem.lat : activeTrip.center[0],
      lng: recommendedItem.lng !== null ? recommendedItem.lng : activeTrip.center[1],
      note: recommendedItem.note || '',
      rating: recommendedItem.rating || null,
      priceInfo: recommendedItem.priceInfo || '',
      openingHours: recommendedItem.openingHours || null,
      types: recommendedItem.types || []
    };

    setTrips(prev =>
      prev.map(trip => {
        if (trip.id !== activeTrip.id) return trip;
        return {
          ...trip,
          savedPlaces: [newSavedItem, ...trip.savedPlaces]
        };
      })
    );
  };

  const handleDeleteSavedPlace = (placeId) => {
    if (!activeTrip) return;
    setTrips(prev =>
      prev.map(trip => {
        if (trip.id !== activeTrip.id) return trip;
        return {
          ...trip,
          savedPlaces: trip.savedPlaces.filter(place => place.id !== placeId)
        };
      })
    );
  };

  const filteredPlaces = activeTrip
    ? activeTrip.savedPlaces.filter(place => {
        const matchesCategory = filterCategory === 'ALL' || place.category === filterCategory;
        const matchesSearch =
          place.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (place.area && place.area.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (place.address && place.address.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchesCategory && matchesSearch;
      })
    : [];

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#fbfbf9] flex items-center justify-center text-xs text-[#888888]">
        Connecting to Vercel Blob...
      </div>
    );
  }

  // Mandated Login Page when not authenticated
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#fbfbf9] text-[#111111] flex flex-col justify-center items-center px-4 py-8 sm:py-12 font-sans relative">
        <div className="w-full max-w-md bg-white border border-[#e5e5e0] rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
          <div className="text-center space-y-2">
            <img
              src="/travelogue-logo.png"
              alt="Travelogue Logo"
              className="w-14 h-14 sm:w-16 sm:h-16 object-contain mx-auto mb-1"
            />
            <h1 className="font-serif text-2xl sm:text-3xl font-medium tracking-tight">Travelogue</h1>
            <p className="text-xs text-[#888888] tracking-wide">by Li Ze Ying</p>
          </div>

          <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-lg text-xs text-emerald-900 flex items-center space-x-2">
            <Database className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Sign in to manage and sync your travel itineraries.</span>
          </div>

          <div className="flex border-b border-[#e5e5e0] text-xs">
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setAuthError('');
                setAuthSuccess('');
              }}
              className={`flex-1 py-2.5 font-medium border-b-2 transition-all cursor-pointer ${
                authMode === 'login'
                  ? 'border-[#111111] text-[#111111]'
                  : 'border-transparent text-[#888888] hover:text-[#111111]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('register');
                setAuthError('');
                setAuthSuccess('');
              }}
              className={`flex-1 py-2.5 font-medium border-b-2 transition-all cursor-pointer ${
                authMode === 'register'
                  ? 'border-[#111111] text-[#111111]'
                  : 'border-transparent text-[#888888] hover:text-[#111111]'
              }`}
            >
              Create Account
            </button>
          </div>

          {authError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {authSuccess && (
            <div className="p-3 bg-green-50 border border-green-200 text-green-800 text-xs rounded-lg flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-green-600" />
              <span>{authSuccess}</span>
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4 text-xs">
            {authMode === 'register' && (
              <div>
                <label className={LABEL}>Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#888888] pointer-events-none" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alex Tan"
                    value={authForm.name}
                    onChange={(e) => setAuthForm(prev => ({ ...prev, name: e.target.value }))}
                    className={FIELD_ICON}
                  />
                </div>
              </div>
            )}

            <div>
              <label className={LABEL}>Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#888888] pointer-events-none" />
                <input
                  type="email"
                  required
                  placeholder="e.g. user@example.com"
                  value={authForm.email}
                  onChange={(e) => setAuthForm(prev => ({ ...prev, email: e.target.value }))}
                  className={FIELD_ICON}
                />
              </div>
            </div>

            <div>
              <label className={LABEL}>Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#888888] pointer-events-none" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={authForm.password}
                  onChange={(e) => setAuthForm(prev => ({ ...prev, password: e.target.value }))}
                  className={FIELD_ICON}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={authSubmitting}
              className="w-full bg-[#111111] text-white py-3 rounded-lg text-xs font-medium hover:bg-[#333333] transition-all flex items-center justify-center space-x-1.5 shadow-sm mt-2 cursor-pointer disabled:opacity-60"
            >
              <User className="w-3.5 h-3.5" />
              <span>{authSubmitting ? 'Please wait...' : authMode === 'login' ? 'Sign In & Access Travelogue' : 'Register Account'}</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (dbError && !tripsLoaded) {
    return (
      <div className="min-h-screen bg-[#fbfbf9] text-[#111111] flex flex-col justify-center items-center px-4 font-sans">
        <div className="w-full max-w-md bg-white border border-red-200 rounded-2xl p-6 space-y-4 shadow-sm text-center">
          <AlertTriangle className="w-8 h-8 mx-auto text-red-500" />
          <h2 className="font-serif text-xl">Unable to connect to Vercel Blob</h2>
          <p className="text-xs text-[#666666] break-words">{dbError}</p>
          <div className="flex items-center justify-center space-x-2 text-xs">
            <button
              onClick={() => setReloadKey(k => k + 1)}
              disabled={isDbSyncing}
              className="px-4 py-2 bg-[#111111] text-white rounded hover:bg-[#333333] cursor-pointer"
            >
              {isDbSyncing ? 'Retrying...' : 'Retry'}
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 border border-[#e5e5e0] rounded hover:border-[#111111] cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fbfbf9] text-[#111111] flex flex-col font-sans">
      <style>{PLACE_AUTOCOMPLETE_CSS}</style>
      {/* Header */}
      <header className="border-b border-[#e5e5e0] bg-[#fbfbf9] sticky top-0 z-40">
        {/* Mobile: row 1 = brand + account, row 2 = trip switcher (full width).
            Desktop (sm+): single row = brand | trip switcher ........ account */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 sm:py-0 sm:h-16 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 sm:gap-x-6">
          {/* Brand */}
          <div className="flex items-center space-x-2 shrink-0 min-w-0 order-1">
            <img
              src="/travelogue-logo.png"
              alt="Travelogue Logo"
              className="w-10 h-10 sm:w-12 sm:h-12 object-contain"
            />
            <div className="flex flex-col">
              <span className="font-serif text-lg sm:text-xl font-medium tracking-tight">Travelogue</span>
              <span className="font-serif text-[9px] sm:text-[10px] tracking-wide text-[#888888] leading-tight">by Li Ze Ying</span>
            </div>
          </div>

          {/* User Account & Database Status Bar */}
          <div className="flex items-center space-x-2 sm:space-x-4 ml-auto shrink-0 min-w-0 order-2 sm:order-3">
            <div className="hidden md:flex items-center space-x-1.5 text-[11px] text-[#666666] bg-[#f4f4f0] px-2.5 py-1 rounded border border-[#e5e5e0]">
              <Database className={`w-3.5 h-3.5 ${dbError ? 'text-red-500' : isDbSyncing ? 'text-amber-500 animate-spin' : 'text-emerald-600'}`} />
              <span>Vercel Blob Storage:</span>
              <span className="font-medium text-[#111111]">
                {dbError ? 'Error' : isDbSyncing ? 'Syncing...' : `Synced @${currentUser.name}`}
              </span>
            </div>

            <div className="flex items-center space-x-1 sm:space-x-3 min-w-0">
              <div className="flex items-center space-x-1.5 sm:space-x-2 bg-white border border-[#e5e5e0] rounded px-2 sm:px-2.5 py-1 min-w-0">
                <div className="w-5 h-5 rounded-full bg-[#111111] text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                  {currentUser.name ? currentUser.name[0].toUpperCase() : 'U'}
                </div>
                <span className="text-xs font-medium text-[#111111] max-w-[72px] sm:max-w-[120px] truncate">{currentUser.name}</span>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 sm:p-1.5 text-[#666666] hover:text-red-600 hover:bg-red-50 rounded transition-all cursor-pointer shrink-0"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Trip switcher: full width on mobile, inline (with divider) on desktop */}
          <div className="order-3 sm:order-2 w-full sm:w-auto flex items-center gap-2 sm:gap-3 sm:border-l sm:border-[#e5e5e0] sm:pl-6">
            {trips.length > 0 ? (
              <select
                value={activeTripId || ''}
                onChange={(e) => {
                  setActiveTripId(e.target.value);
                  setActiveDay(null);
                  setShowShareModal(false);
                }}
                className="flex-1 min-w-0 sm:flex-none sm:max-w-[200px] bg-transparent font-medium text-sm border-none outline-none cursor-pointer text-[#111111] truncate"
              >
                {trips.map(trip => (
                  <option key={trip.id} value={trip.id}>
                    {trip.name} ({trip.japaneseSub}){trip.sharedId ? ' · Shared' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <span className="flex-1 sm:flex-none text-xs text-[#888888] italic">No active itineraries</span>
            )}

            <button
              onClick={() => setShowNewTripModal(true)}
              className="flex items-center space-x-1 text-xs px-2.5 py-1 border border-[#e5e5e0] rounded hover:border-[#111111] transition-all shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Trip</span>
            </button>
          </div>
        </div>
      </header>

      {dbError && (
        <div className="bg-red-50 border-b border-red-200 text-red-700 text-xs px-4 py-2 flex items-center justify-center space-x-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="break-words">{dbError}</span>
          <button onClick={() => setSyncPulse(v => v + 1)} className="underline font-medium cursor-pointer shrink-0">Retry saving</button>
        </div>
      )}

      {collabConflict && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-xs px-4 py-3 flex flex-wrap items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span>Someone edited the same field. Your changes are still on this device. Choose which version to keep.</span>
          <button onClick={() => handleResolveConflict(true)} className="px-3 py-1.5 bg-[#111111] text-white rounded cursor-pointer">Keep my changes</button>
          <button onClick={() => handleResolveConflict(false)} className="px-3 py-1.5 border border-amber-400 rounded cursor-pointer">Load their version</button>
        </div>
      )}

      {/* Main */}
      {!activeTrip ? (
        <div className="max-w-md mx-auto my-auto py-16 sm:py-24 px-4 text-center space-y-4">
          <Globe className="w-12 h-12 mx-auto text-[#cccccc]" />
          <h2 className="font-serif text-2xl">No Itineraries Found</h2>
          <p className="text-xs text-[#777777]">
            No itineraries found for {currentUser.email}. Create your first itinerary below.
          </p>
          <div className="flex items-center justify-center space-x-3 pt-2">
            <button
              onClick={() => setShowNewTripModal(true)}
              className="px-4 py-2 bg-[#111111] text-white rounded text-xs font-medium hover:bg-[#333333] transition-all cursor-pointer"
            >
              + Create New Trip
            </button>
          </div>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex-1 w-full grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          {/* Places */}
          <div className="lg:col-span-5 min-w-0 flex flex-col space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl sm:text-3xl font-serif font-normal text-[#111111]">{activeTrip.name}</h1>
                <p className="text-xs text-[#777777] uppercase tracking-wider mt-1 flex items-center space-x-2">
                  <span>{activeTrip.japaneseSub} • {activeTrip.startDate}</span>
                  {activeTrip.sharedId && <span>• Shared with {Math.max(0, (sharedMeta[activeTrip.sharedId]?.members?.length || 1) - 1)} editor(s)</span>}
                </p>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={handleOpenShare}
                  className="px-2.5 py-2 border border-[#e5e5e0] rounded hover:border-[#111111] transition-all cursor-pointer flex items-center gap-1.5 text-xs"
                  title="Share trip and collaborate"
                >
                  <Users className="w-4 h-4" />
                  <span>{activeTrip.sharedId ? 'Collaborators' : 'Share'}</span>
                </button>
                <button
                  onClick={handleOpenEditDatesModal}
                  className="p-2 border border-[#e5e5e0] rounded hover:border-[#111111] transition-all cursor-pointer"
                  title="Edit Trip Dates"
                >
                  <Calendar className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowNewPlaceModal(true)}
                  className="p-2 border border-[#e5e5e0] rounded hover:border-[#111111] transition-all cursor-pointer"
                  title="Add Custom Place"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDeleteTrip}
                  className="p-2 border border-[#e5e5e0] text-red-500 hover:border-red-500 rounded transition-all cursor-pointer"
                  title="Delete Trip"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#888888] pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search saved places..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={FIELD_ICON}
                />
              </div>

              <div className="flex space-x-2 overflow-x-auto pb-1 text-xs">
                {['ALL', 'Places to Visit', 'Food & Eats', 'Experiences', 'Stays/Hotel', 'Flights'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat)}
                    className={`px-3 py-1 rounded whitespace-nowrap transition-all cursor-pointer ${
                      filterCategory === cat
                        ? 'bg-[#111111] text-white'
                        : 'border border-[#e5e5e0] text-[#666666] hover:border-[#111111]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Saved Places */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-[#888888] uppercase tracking-wider">
                Saved Places ({filteredPlaces.length})
              </h3>
              <div className="space-y-3 overflow-y-auto max-h-[280px] pr-1">
                {filteredPlaces.length === 0 ? (
                  <div className="text-center py-6 border border-dashed border-[#e5e5e0] rounded">
                    <p className="text-xs text-[#888888]">No places saved yet.</p>
                  </div>
                ) : (
                  filteredPlaces.map(place => (
                    <div
                      key={place.id}
                      className="p-3 bg-white border border-[#e5e5e0] rounded hover:border-[#cccccc] transition-all flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2 flex-wrap">
                          <span className="text-xs font-semibold text-[#111111] break-words">{place.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-[#f4f4f0] text-[#666666] rounded">
                            {place.category}
                          </span>
                        </div>
                        <p className="text-xs text-[#777777] mt-0.5">{place.address || place.area}</p>

                        {(place.rating || place.priceInfo) && (
                          <div className="flex items-center space-x-2 mt-1 text-[11px] text-[#555555]">
                            {place.rating && (
                              <span className="flex items-center space-x-0.5 text-amber-600 font-medium">
                                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                <span>{place.rating}</span>
                              </span>
                            )}
                            {place.priceInfo && (
                              <span className="text-green-700 bg-green-50 px-1.5 rounded text-[10px] border border-green-200">
                                {place.priceInfo}
                              </span>
                            )}
                          </div>
                        )}
                        {place.openingHours?.weekdayDescriptions?.length > 0 && (
                          <p className="text-[10px] text-[#777777] mt-1">
                            <span className="font-medium text-[#555555]">Hours:</span>{' '}
                            {getTodayOpeningHours(place.openingHours) || 'See full hours'}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center space-x-1 shrink-0 self-end sm:self-start">

                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              handleAddToDay(place, parseInt(e.target.value));
                              e.target.value = '';
                            }
                          }}
                          defaultValue=""
                          className="bg-[#fbfbf9] text-xs border border-[#e5e5e0] rounded px-2 py-1 cursor-pointer max-w-[120px]"
                        >
                          <option value="" disabled>Add to day...</option>
                          {Array.from({ length: activeTrip.daysCount }, (_, i) => i + 1).map(d => (
                            <option key={d} value={d}>
                              Day {d} {formatDayDate(activeTrip.startDate, d) ? `(${formatDayDate(activeTrip.startDate, d)})` : ''}
                            </option>
                          ))}
                        </select>

                        <button
                          onClick={() => handleDeleteSavedPlace(place.id)}
                          className="p-1.5 text-red-500 hover:text-red-700 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Recommendations */}
            <div className="space-y-3 pt-4 border-t border-[#e5e5e0]">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[#888888] uppercase tracking-wider flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#111111]" />
                  <span>Suggestions from Google Maps</span>
                </h3>

                <button
                  onClick={fetchRecommendations}
                  disabled={isRecLoading}
                  className="text-[11px] text-[#666666] hover:text-[#111111] flex items-center space-x-1 transition-all cursor-pointer"
                  title="Refresh suggestions"
                >
                  <RefreshCw className={`w-3 h-3 ${isRecLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              <div className="flex space-x-2 overflow-x-auto pb-1 text-[11px]">
                {['Places to Visit', 'Food & Eats', 'Experiences', 'Stays/Hotel'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setRecCategory(cat)}
                    className={`px-2.5 py-1 rounded whitespace-nowrap transition-all cursor-pointer ${
                      recCategory === cat
                        ? 'bg-[#111111] text-white'
                        : 'border border-[#e5e5e0] text-[#666666] hover:border-[#111111]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="space-y-3 overflow-y-auto max-h-[260px] pr-1">
                {isRecLoading ? (
                  <div className="py-8 text-center text-xs text-[#888888] space-y-2 border border-dashed border-[#e5e5e0] rounded">
                    <Sparkles className="w-4 h-4 mx-auto animate-pulse text-[#111111]" />
                    <p>Finding top-rated places on Google Maps...</p>
                  </div>
                ) : recommendations.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[#888888] border border-dashed border-[#e5e5e0] rounded">
                    No suggestions found. Check that the Places API (New) is enabled for your Maps key.
                  </div>
                ) : (
                  recommendations.map((rec, idx) => {
                    const isAlreadySaved = activeTrip.savedPlaces.some(
                      p => p.name.toLowerCase() === rec.name.toLowerCase()
                    );

                    return (
                      <div
                        key={idx}
                        className="p-3 bg-[#fdfdfe] border border-[#e5e5e0] rounded flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-2 flex-wrap">
                            <span className="text-xs font-medium text-[#111111] break-words">{rec.name}</span>
                            <span className="text-[9px] px-1.5 py-0.5 bg-[#f4f4f0] text-[#666666] rounded">
                              {rec.category}
                            </span>
                          </div>

                          <div className="flex items-center space-x-2 mt-0.5 flex-wrap">
                            <span className="text-[11px] text-[#777777]">{rec.address || rec.area}</span>
                            {rec.rating && (
                              <span className="text-[10px] text-amber-600 font-medium flex items-center space-x-0.5">
                                <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                                <span>{rec.rating}</span>
                              </span>
                            )}
                            {rec.priceInfo && (
                              <span className="text-[10px] text-green-700 bg-green-50 px-1 rounded">
                                {rec.priceInfo}
                              </span>
                            )}
                          </div>

                          {rec.openingHours?.weekdayDescriptions?.length > 0 && (
                            <p className="text-[10px] text-[#777777] mt-1">
                              <span className="font-medium text-[#555555]">Hours:</span>{' '}
                              {getTodayOpeningHours(rec.openingHours) || 'See full hours'}
                            </p>
                          )}

                          {rec.note && <p className="text-[11px] text-[#555555] mt-1 italic">{rec.note}</p>}
                        </div>

                        <button
                          onClick={() => handleAddRecommendedToSaved(rec)}
                          disabled={isAlreadySaved}
                          className={`flex items-center space-x-1 px-2 py-1 text-xs rounded transition-all cursor-pointer self-end sm:self-start shrink-0 ${
                            isAlreadySaved
                              ? 'bg-[#f4f4f0] text-[#888888] cursor-default'
                              : 'border border-[#e5e5e0] bg-white text-[#111111] hover:border-[#111111]'
                          }`}
                        >
                          {isAlreadySaved ? (
                            <>
                              <Check className="w-3 h-3 text-green-600" />
                              <span>Saved</span>
                            </>
                          ) : (
                            <>
                              <BookmarkPlus className="w-3 h-3" />
                              <span>+ Save</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div className="lg:col-span-7 min-w-0 flex flex-col space-y-6">
            <div className="flex items-center space-x-2 border-b border-[#e5e5e0] pb-3 overflow-x-auto min-w-0">
              <button
                onClick={() => setActiveDay(null)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-all flex flex-col items-center min-w-[90px] shrink-0 cursor-pointer ${
                  activeDay === null
                    ? 'bg-[#111111] text-white'
                    : 'bg-white border border-[#e5e5e0] text-[#666666] hover:border-[#111111]'
                }`}
              >
                <div className="flex items-center space-x-1">
                  <Layers className="w-3 h-3" />
                  <span>Summary</span>
                </div>
                <span className={`text-[10px] font-normal ${activeDay === null ? 'text-gray-300' : 'text-[#888888]'}`}>
                  All Places Map
                </span>
              </button>

              {Array.from({ length: activeTrip.daysCount }, (_, i) => i + 1).map(day => {
                const dateFormatted = formatDayDate(activeTrip.startDate, day);
                return (
                  <button
                    key={day}
                    onClick={() => setActiveDay(prev => prev === day ? null : day)}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-all flex flex-col items-center min-w-[72px] shrink-0 cursor-pointer ${
                      activeDay === day
                        ? 'bg-[#111111] text-white'
                        : 'bg-white border border-[#e5e5e0] text-[#666666] hover:border-[#111111]'
                    }`}
                  >
                    <span>Day {day}</span>
                    {dateFormatted && (
                      <span className={`text-[10px] font-normal ${activeDay === day ? 'text-gray-300' : 'text-[#888888]'}`}>
                        {dateFormatted}
                      </span>
                    )}
                  </button>
                );
              })}

              <button
                onClick={handleAddDay}
                className="px-3 py-2 text-xs border border-dashed border-[#e5e5e0] text-[#666666] rounded hover:border-[#111111] transition-all flex items-center space-x-1 shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Day</span>
              </button>
            </div>

            {/* Map */}
            <div className="w-full h-64 sm:h-80 border border-[#e5e5e0] rounded overflow-hidden relative bg-[#f4f4f0]">
              <div className="absolute top-2 sm:top-3 right-2 sm:right-3 z-10 bg-white/95 backdrop-blur border border-[#e5e5e0] rounded p-2 sm:px-3 sm:py-2 shadow-sm text-[10px] sm:text-[11px] space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-[#111111] inline-block border border-white shadow-sm"></span>
                  <span className="text-[#333333]">Itinerary Stops</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-amber-500 inline-block border border-white shadow-sm"></span>
                  <span className="text-[#333333]">Pinned Stays</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-blue-600 inline-block border border-white shadow-sm"></span>
                  <span className="text-[#333333]">Saved Places</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-1 sm:w-3 sm:h-1 bg-blue-600 border-b border-dashed border-blue-600 inline-block"></span>
                  <span className="text-[#333333]">Flight Routes</span>
                </div>
              </div>

              {loadError ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-xs text-red-500 p-4">
                  Google Maps failed to load.
                </div>
              ) : isLoaded ? (
                <GoogleMap
                  mapContainerStyle={MAP_CONTAINER_STYLE}
                  center={mapCenter}
                  zoom={activeTrip.zoom || 11}
                  options={DEFAULT_MAP_OPTIONS}
                  onLoad={onLoadMap}
                  onUnmount={onUnmountMap}
                >
                  {/* Non-flight itinerary markers */}
                  {(activeDay !== null ? activeStops : allDayStops).map((stop, idx) =>
                    !stop.isFlight && stop.lat != null && stop.lng != null ? (
                      <MarkerF
                        key={stop.id || `stop_${idx}`}
                        position={{ lat: Number(stop.lat), lng: Number(stop.lng) }}
                        icon={DARK_ITINERARY_PIN}
                        label={{
                          text: `${idx + 1}`,
                          color: '#ffffff',
                          fontSize: '10px',
                          fontWeight: '700'
                        }}
                        title={`${stop.name} (Itinerary Stop)`}
                      />
                    ) : null
                  )}

                  {/* Pinned Stay Markers */}
                  {activeDay !== null && activeTrip.staysByDay?.[activeDay]?.lat != null && activeTrip.staysByDay?.[activeDay]?.lng != null && (
                    <MarkerF
                      key={`stay_day_${activeDay}`}
                      position={{
                        lat: Number(activeTrip.staysByDay[activeDay].lat),
                        lng: Number(activeTrip.staysByDay[activeDay].lng)
                      }}
                      icon={STAY_HOTEL_PIN}
                      title={`Stay: ${activeTrip.staysByDay[activeDay].name}`}
                    />
                  )}

                  {activeDay === null && activeTrip.staysByDay &&
                    Object.values(activeTrip.staysByDay)
                      .filter((stay, index, self) => stay.lat != null && stay.lng != null && self.findIndex(s => s.name === stay.name && s.address === stay.address) === index)
                      .map((stay, idx) => (
                        <MarkerF
                          key={`stay_summary_${idx}`}
                          position={{ lat: Number(stay.lat), lng: Number(stay.lng) }}
                          icon={STAY_HOTEL_PIN}
                          title={`Stay: ${stay.name}`}
                        />
                      ))
                  }

                  {/* Flight paths */}
                  {(activeDay !== null ? activeStops : allDayStops)
                    .filter(stop => stop.isFlight)
                    .map(flight => {
                      const dep = {
                        lat: flight.departureLat ?? flight.lat,
                        lng: flight.departureLng ?? flight.lng
                      };
                      const arr = {
                        lat: flight.arrivalLat,
                        lng: flight.arrivalLng
                      };

                      if (!dep.lat || !dep.lng || !arr.lat || !arr.lng) return null;

                      const pathPoints = getCurvedPath(dep, arr);
                      if (pathPoints.length === 0) return null;

                      const midPoint = pathPoints[Math.floor(pathPoints.length / 2)];

                      return (
                        <React.Fragment key={`flight_path_${flight.id}`}>
                          <PolylineF
                            path={pathPoints}
                            options={{
                              strokeColor: '#2563eb',
                              strokeOpacity: 0,
                              strokeWeight: 2,
                              icons: [
                                {
                                  icon: {
                                    path: 'M 0,-1 0,1',
                                    strokeOpacity: 1,
                                    strokeColor: '#2563eb',
                                    scale: 3
                                  },
                                  offset: '0',
                                  repeat: '15px'
                                }
                              ]
                            }}
                          />

                          {midPoint && (
                            <MarkerF
                              position={midPoint}
                              icon={{
                                url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                                  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24">
                                    <circle cx="12" cy="12" r="11" fill="#2563eb" stroke="#ffffff" stroke-width="2"/>
                                    <path transform="translate(12 12) rotate(45)" d="M0 -8.5 Q0.6 -8.5 0.8 -7.3 L1.5 -2 L7 0.8 Q7.7 1.2 7.3 1.9 Q7.0 2.3 6.3 1.9 L1.6 0.7 L1.3 4.8 L2.5 5.8 Q2.9 6.1 2.6 6.5 Q2.4 6.8 2 6.7 L0 6.1 L-2 6.7 Q-2.4 6.8 -2.6 6.5 Q-2.9 6.1 -2.5 5.8 L-1.3 4.8 L-1.6 0.7 L-6.3 1.9 Q-7.0 2.3 -7.3 1.9 Q-7.7 1.2 -7 0.8 L-1.5 -2 L-0.8 -7.3 Q-0.6 -8.5 0 -8.5 Z" fill="#ffffff" stroke="#ffffff" stroke-width="0.2" stroke-linejoin="round"/>
                                  </svg>
                                `),
                                anchor: { x: 14, y: 14 }
                              }}
                              title={flight.name}
                            />
                          )}
                        </React.Fragment>
                      );
                    })}

                  {activeDay === null && savedPlacesWithCoords.map((place, idx) => (
                    <MarkerF
                      key={place.id || `saved_${idx}`}
                      position={{ lat: Number(place.lat), lng: Number(place.lng) }}
                      icon={BLUE_SAVED_PLACE_PIN}
                      label={{
                        text: '★',
                        color: '#ffffff',
                        fontSize: '10px',
                        fontWeight: 'bold'
                      }}
                      title={`${place.name} (Saved Place)`}
                    />
                  ))}
                </GoogleMap>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-[#888888]">
                  Loading Map...
                </div>
              )}
            </div>

            {/* Itinerary Box */}
            <div className="bg-white border border-[#e5e5e0] rounded p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#e5e5e0] pb-3 gap-2">
                <div className="flex items-center space-x-2 sm:space-x-3 flex-wrap">
                  <h2 className="font-serif text-base sm:text-lg text-[#111111]">
                    {activeDay !== null ? `Day ${activeDay} Itinerary` : 'Trip Summary Overview'}
                  </h2>
                  {activeDay !== null && formatDayDate(activeTrip.startDate, activeDay, true) && (
                    <span className="text-xs font-medium text-[#555555] bg-[#f4f4f0] px-2 py-0.5 rounded border border-[#e5e5e0]">
                      {formatDayDate(activeTrip.startDate, activeDay, true)}
                    </span>
                  )}
                  <span className="text-xs text-[#777777]">
                    • {activeDay !== null ? activeStops.length : allDayStops.length} stops
                  </span>
                </div>

                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  {activeDay !== null && (
                    <>
                      <button
                        onClick={() => {
                          const currentStay = activeTrip.staysByDay?.[activeDay];
                          setStayForm({
                            name: currentStay?.name || '',
                            address: currentStay?.address || '',
                            lat: currentStay?.lat || null,
                            lng: currentStay?.lng || null,
                            note: currentStay?.note || '',
                            rating: currentStay?.rating || null,
                            priceInfo: currentStay?.priceInfo || '',
                            fromDay: activeDay,
                            toDay: activeDay
                          });
                          setShowStayModal(true);
                        }}
                        className="flex items-center space-x-1 text-xs px-2.5 py-1 border border-amber-300 bg-amber-50 text-amber-900 font-medium rounded hover:bg-amber-100 transition-all cursor-pointer"
                      >
                        <Hotel className="w-3.5 h-3.5 text-amber-600" />
                        <span>{activeTrip.staysByDay?.[activeDay] ? 'Edit Stay' : 'Add Stay'}</span>
                      </button>
                      <button
                        onClick={() => setShowAddFlightModal(true)}
                        className="flex items-center space-x-1 text-xs px-2.5 py-1 border border-sky-200 bg-sky-50/50 text-sky-800 rounded hover:border-sky-400 transition-all cursor-pointer"
                      >
                        <Plane className="w-3.5 h-3.5 text-sky-600" />
                        <span>Add Flight</span>
                      </button>
                      <button
                        onClick={() => setShowAddStopModal(true)}
                        className="flex items-center space-x-1 text-xs px-2.5 py-1 border border-[#e5e5e0] rounded hover:border-[#111111] transition-all cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Stop</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Pinned Stay Banner at Top of Day Itinerary */}
              {activeDay !== null && (
                <div>
                  {activeTrip.staysByDay?.[activeDay] ? (
                    <div className="p-3 sm:p-3.5 bg-amber-50/70 border border-amber-200/90 rounded-lg shadow-sm flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start space-x-3 min-w-0 flex-1">
                        <div className="p-2 bg-amber-500 text-white rounded-md shrink-0 mt-0.5 shadow-sm">
                          <Hotel className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-2 flex-wrap">
                            <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider flex items-center space-x-1">
                              <Hotel className="w-3 h-3 text-amber-600" />
                              <span>Stay for (Day {activeDay})</span>
                            </span>
                            {activeTrip.staysByDay[activeDay].priceInfo && (
                              <span className="text-[10px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded border border-green-200">
                                {activeTrip.staysByDay[activeDay].priceInfo}
                              </span>
                            )}
                            {activeTrip.staysByDay[activeDay].rating && (
                              <span className="text-[10px] text-amber-700 font-medium flex items-center space-x-0.5">
                                <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                                <span>{activeTrip.staysByDay[activeDay].rating}</span>
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-semibold text-[#111111] mt-0.5">
                            {activeTrip.staysByDay[activeDay].name}
                          </h4>
                          {activeTrip.staysByDay[activeDay].address && (
                            <p className="text-xs text-[#666666] mt-0.5 truncate">
                              {activeTrip.staysByDay[activeDay].address}
                            </p>
                          )}
                          {activeTrip.staysByDay[activeDay].note && (
                            <p className="text-xs text-amber-900/80 italic mt-1 bg-amber-100/60 px-2 py-0.5 rounded inline-block">
                              {activeTrip.staysByDay[activeDay].note}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0 self-end sm:self-start">
                        <button
                          onClick={() => handleOpenInGoogleMaps(activeTrip.staysByDay[activeDay])}
                          className="flex items-center space-x-1 text-[11px] bg-white border border-amber-300 text-amber-900 px-2 py-1 rounded hover:bg-amber-100 transition-all shadow-xs cursor-pointer"
                          title="View on Google Maps"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Maps</span>
                        </button>
                        {activeTrip.staysByDay[activeDay].lat != null && activeTrip.staysByDay[activeDay].lng != null && (
                          <button
                            onClick={() => handleOpenInYahooCarNavi(activeTrip.staysByDay[activeDay])}
                            className="flex items-center space-x-1 text-[11px] bg-white border border-amber-300 text-amber-900 px-2 py-1 rounded hover:bg-amber-100 transition-all shadow-xs cursor-pointer"
                            title="Open in Yahoo!カーナビ"
                          >
                            <Car className="w-3 h-3" />
                            <span>Yahoo!カーナビ</span>
                          </button>
                        )}
                        <button
                          onClick={() => {
                            const currentStay = activeTrip.staysByDay[activeDay];
                            setStayForm({
                              name: currentStay.name || '',
                              address: currentStay.address || '',
                              lat: currentStay.lat || null,
                              lng: currentStay.lng || null,
                              note: currentStay.note || '',
                              rating: currentStay.rating || null,
                              priceInfo: currentStay.priceInfo || '',
                              fromDay: activeDay,
                              toDay: activeDay
                            });
                            setShowStayModal(true);
                          }}
                          className="p-1.5 text-amber-800 hover:text-amber-950 hover:bg-amber-100 rounded transition-all cursor-pointer"
                          title="Edit / Change Stay"
                        >
                          <Pen className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleUnpinStay(activeDay)}
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-all cursor-pointer"
                          title="Remove Stay for Day"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-[#fafaf7] border border-dashed border-[#e2e2da] rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center space-x-2 text-xs text-[#666666]">
                        <Hotel className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>No stay added for Day {activeDay} yet.</span>
                      </div>
                      <button
                        onClick={() => {
                          setStayForm({
                            name: '',
                            address: '',
                            lat: null,
                            lng: null,
                            note: '',
                            rating: null,
                            priceInfo: '',
                            fromDay: activeDay,
                            toDay: activeDay
                          });
                          setShowStayModal(true);
                        }}
                        className="flex items-center space-x-1 text-xs px-2.5 py-1 bg-amber-500 text-white font-medium rounded hover:bg-amber-600 transition-all shadow-xs cursor-pointer self-end sm:self-auto shrink-0"
                      >
                        <Hotel className="w-3 h-3 text-white" />
                        <span>+ Add Stay / Hotel</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {activeDay === null ? (
                <div className="space-y-4">
                  {/* Summary Accommodations Overview */}
                  {activeTrip.staysByDay && Object.keys(activeTrip.staysByDay).length > 0 && (
                    <div className="p-3.5 bg-amber-50/50 border border-amber-200/70 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 text-xs font-semibold text-amber-900">
                          <Hotel className="w-4 h-4 text-amber-600" />
                          <span>Pinned Accommodations Overview</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {getGroupedStays(activeTrip.staysByDay, activeTrip.daysCount).map((group, i) => (
                          <div key={i} className="p-2.5 bg-white border border-amber-100 rounded flex items-start justify-between gap-2 shadow-xs">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center space-x-2 flex-wrap">
                                <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-1.5 py-0.5 rounded shrink-0">
                                  {group.dayLabel}
                                </span>
                                <span className="font-semibold text-[#111111] truncate">{group.stay.name}</span>
                              </div>
                              {group.stay.address && (
                                <p className="text-[11px] text-[#777777] mt-1 truncate">{group.stay.address}</p>
                              )}
                              {group.stay.note && (
                                <p className="text-[10px] text-amber-800/80 italic mt-0.5">{group.stay.note}</p>
                              )}
                            </div>
                            <div className="flex items-center space-x-2 shrink-0">
                              <button
                                onClick={() => handleOpenInGoogleMaps(group.stay)}
                                className="text-[10px] text-amber-800 hover:text-amber-950 flex items-center space-x-0.5 shrink-0 cursor-pointer"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </button>
                              {group.stay.lat != null && group.stay.lng != null && (
                                <button
                                  onClick={() => handleOpenInYahooCarNavi(group.stay)}
                                  className="text-[10px] text-amber-800 hover:text-amber-950 flex items-center space-x-0.5 shrink-0 cursor-pointer"
                                  title="Open in Yahoo!カーナビ"
                                >
                                  <Car className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="p-3 bg-[#fbfbf9] border border-[#e5e5e0] rounded text-xs text-[#555555]">
                    Showing summary map of all added itinerary stops & saved places segregated by day. Click a day tab above to view/edit specific day schedule.
                  </div>

                  {allDayStops.length === 0 ? (
                    <div className="text-center py-6 text-xs text-[#888888]">
                      No stops added to any day yet. Add places from saved places or click a day to start planning!
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                      {Array.from({ length: activeTrip.daysCount }, (_, i) => i + 1).map(dayNum => {
                        const dayStops = sortStopsByTime(activeTrip.schedule[dayNum] || []);
                        const dayDateStr = formatDayDate(activeTrip.startDate, dayNum, true);
                        const dayStay = activeTrip.staysByDay?.[dayNum];

                        if (dayStops.length === 0 && !dayStay) return null;

                        return (
                          <div key={dayNum} className="border border-[#e5e5e0] rounded-lg overflow-hidden bg-white">
                            <div className="bg-[#f8f8f5] px-3 py-2 border-b border-[#e5e5e0] flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <span className="font-semibold text-xs text-[#111111]">Day {dayNum}</span>
                                {dayDateStr && (
                                  <span className="text-[11px] text-[#777777]">({dayDateStr})</span>
                                )}
                              </div>
                              <span className="text-[10px] text-[#888888]">
                                {dayStops.length} stop{dayStops.length !== 1 ? 's' : ''}
                              </span>
                            </div>

                            <div className="p-2.5 space-y-2">
                              {dayStay && (
                                <div className="p-2 bg-amber-50/60 border border-amber-200/80 rounded text-xs flex items-center justify-between">
                                  <div className="flex items-center space-x-2 min-w-0">
                                    <Hotel className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                    <span className="font-medium text-amber-900 truncate">Stay: {dayStay.name}</span>
                                  </div>
                                  <div className="flex items-center space-x-2 shrink-0">
                                    <button
                                      onClick={() => handleOpenInGoogleMaps(dayStay)}
                                      className="text-[10px] text-amber-800 hover:text-amber-950 flex items-center space-x-0.5 shrink-0 cursor-pointer"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </button>
                                    {dayStay.lat != null && dayStay.lng != null && (
                                      <button
                                        onClick={() => handleOpenInYahooCarNavi(dayStay)}
                                        className="text-[10px] text-amber-800 hover:text-amber-950 flex items-center space-x-0.5 shrink-0 cursor-pointer"
                                        title="Open in Yahoo!カーナビ"
                                      >
                                        <Car className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}

                              {dayStops.map((stop, idx) => (
                                <div key={stop.id || idx} className="p-2.5 border border-[#e5e5e0] rounded flex items-center justify-between gap-3 bg-white text-xs">
                                  <div className="flex items-center space-x-2 min-w-0 flex-1">
                                    <span className={`w-5 h-5 rounded-full text-white text-[10px] flex items-center justify-center font-semibold shrink-0 ${
                                      stop.isFlight ? 'bg-sky-700' : 'bg-[#111111]'
                                    }`}>
                                      {stop.isFlight ? <Plane className="w-3 h-3" /> : (idx + 1)}
                                    </span>
                                    <div className="min-w-0">
                                      <div className="flex items-center space-x-2 flex-wrap">
                                        <span className="font-medium text-[#111111]">{stop.name}</span>
                                        <span className="text-[10px] bg-[#f4f4f0] text-[#555555] px-1.5 py-0.5 rounded border border-[#e5e5e0]">
                                          {stop.time || '12:00'}
                                        </span>
                                        {stop.isFlight && (
                                          <span className="text-[10px] bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded font-medium border border-sky-200">
                                            Flight
                                          </span>
                                        )}
                                      </div>
                                      {(stop.address || stop.area) && (
                                        <p className="text-xs text-[#777777] mt-0.5 truncate">
                                          {stop.address || stop.area}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center space-x-3 shrink-0">
                                    <button
                                      onClick={() => handleOpenInGoogleMaps(stop)}
                                      className="text-[11px] text-[#555555] hover:text-[#111111] flex items-center space-x-1 shrink-0 cursor-pointer"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                      <span>Maps</span>
                                    </button>
                                    {stop.lat != null && stop.lng != null && (
                                      <button
                                        onClick={() => handleOpenInYahooCarNavi(stop)}
                                        className="text-[11px] text-[#555555] hover:text-[#111111] flex items-center space-x-1 shrink-0 cursor-pointer"
                                        title="Open in Yahoo!カーナビ"
                                      >
                                        <Car className="w-3 h-3" />
                                        <span>Yahoo!カーナビ</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : activeStops.length === 0 ? (
                <div className="text-center py-8 space-y-3">
                  <p className="text-xs text-[#888888]">No stops scheduled for Day {activeDay}.</p>
                  <div className="flex items-center justify-center space-x-2">
                    <button
                      onClick={() => setShowAddFlightModal(true)}
                      className="flex items-center space-x-1 text-xs px-3 py-1.5 border border-sky-200 bg-sky-50/50 text-sky-800 rounded hover:border-sky-400 transition-all cursor-pointer"
                    >
                      <Plane className="w-3.5 h-3.5 text-sky-600" />
                      <span>Add Flight</span>
                    </button>
                    <button
                      onClick={() => setShowAddStopModal(true)}
                      className="flex items-center space-x-1 text-xs px-3 py-1.5 border border-[#e5e5e0] rounded hover:border-[#111111] transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Stop</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeStops.map((stop, idx) => {
                    const currentDayDateStr = getDayDateString(activeTrip.startDate, activeDay);
                    const isClosed = !stop.isFlight && checkIsClosed(stop.time, stop.openingHours, currentDayDateStr);

                    const prevStop = idx > 0 ? activeStops[idx - 1] : null;
                    const canRoute = !stop.isFlight && prevStop && !prevStop.isFlight && prevStop.lat != null && prevStop.lng != null && stop.lat != null && stop.lng != null;

                    return (
                      <React.Fragment key={stop.id}>
                      {canRoute && isLoaded && (
                        <TravelTimeBar
                          from={{ lat: Number(prevStop.lat), lng: Number(prevStop.lng) }}
                          to={{ lat: Number(stop.lat), lng: Number(stop.lng) }}
                          departure={getDepartureDate(currentDayDateStr, stop.time)}
                        />
                      )}
                      <div
                        className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 border rounded transition-all gap-2 sm:gap-3 ${
                          isClosed 
                            ? 'bg-red-50/40 border-red-200' 
                            : stop.isFlight 
                              ? 'bg-sky-50/40 border-sky-200' 
                              : 'border-[#f0f0eb] hover:border-[#e5e5e0]'
                        }`}
                      >
                        <div className="flex items-start sm:items-center space-x-3 min-w-0 flex-1">
                          <span className={`w-6 h-6 rounded-full text-white text-xs flex items-center justify-center font-semibold shrink-0 mt-0.5 sm:mt-0 ${
                            stop.isFlight ? 'bg-sky-700' : 'bg-[#111111]'
                          }`}>
                            {stop.isFlight ? <Plane className="w-3.5 h-3.5" /> : (idx + 1)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                              <span className="text-xs font-semibold break-words">{stop.name}</span>
                              {stop.isFlight && (
                                <span className="text-[10px] bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded font-medium border border-sky-200 flex items-center space-x-1">
                                  <Plane className="w-2.5 h-2.5" />
                                  <span>Flight</span>
                                </span>
                              )}
                              <input
                                type="time"
                                value={stop.time || '12:00'}
                                onChange={(e) => {
                                  const newTime = e.target.value;
                                  setTrips(prev =>
                                    prev.map(trip => {
                                      if (trip.id !== activeTrip.id) return trip;
                                      const updated = (trip.schedule[activeDay] || []).map((s, i) =>
                                        i === idx ? { ...s, time: newTime } : s
                                      );
                                      return {
                                        ...trip,
                                        schedule: {
                                          ...trip.schedule,
                                          [activeDay]: sortStopsByTime(updated)
                                        }
                                      };
                                    })
                                  );
                                }}
                                className="text-[10px] bg-[#fbfbf9] border border-[#e5e5e0] rounded px-1 py-0.5"
                              />

                              {stop.arrivalTime && (
                                <span className="text-[10px] text-[#666666]">
                                  → Arr: {stop.arrivalTime}
                                </span>
                              )}

                              {isClosed && (
                                <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-semibold flex items-center space-x-1 border border-red-200">
                                  <AlertTriangle className="w-3 h-3 text-red-600" />
                                  <span>Closed at {stop.time}</span>
                                </span>
                              )}
                            </div>

                            {(stop.address || stop.area) && (
                              <p className="text-xs text-[#777777] mt-0.5 break-words">
                                {stop.address || stop.area}
                              </p>
                            )}

                            <div className="flex items-center space-x-2 mt-0.5 flex-wrap">
                              {stop.rating && (
                                <span className="text-[10px] text-amber-600 font-medium flex items-center space-x-0.5">
                                  <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                                  <span>{stop.rating}</span>
                                </span>
                              )}
                              {stop.priceInfo && (
                                <span className="text-[10px] text-green-700 bg-green-50 px-1 rounded border border-green-200">
                                  {stop.priceInfo}
                                </span>
                              )}
                            </div>

                            {stop.openingHours?.weekdayDescriptions?.length > 0 && (
                              <p className="text-[10px] text-[#777777] mt-1 max-w-[420px]">
                                <span className="font-medium text-[#555555]">Hours:</span>{' '}
                                {getTodayOpeningHours(stop.openingHours) || 'See full hours'}
                              </p>
                            )}

                            {stop.note && <p className="text-xs text-[#666666] mt-0.5">{stop.note}</p>}
                          </div>
                        </div>

                        <div className="flex items-center space-x-1 shrink-0 self-end sm:self-center">
                          <button
                            onClick={() => handleOpenInGoogleMaps(stop)}
                            className="flex items-center space-x-1 text-[11px] text-[#444444] border border-[#e5e5e0] px-2 py-1 rounded hover:border-[#111111] transition-all cursor-pointer"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Maps</span>
                          </button>
                          {stop.lat != null && stop.lng != null && (
                            <button
                              onClick={() => handleOpenInYahooCarNavi(stop)}
                              className="flex items-center space-x-1 text-[11px] text-[#444444] border border-[#e5e5e0] px-2 py-1 rounded hover:border-[#111111] transition-all cursor-pointer"
                              title="Open in Yahoo!カーナビ"
                            >
                              <Car className="w-3 h-3" />
                              <span>Yahoo!カーナビ</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenEditStopModal(stop)}
                            className="p-1 text-[#888888] hover:text-[#111111] cursor-pointer"
                            title="Edit Place"
                          >
                            <Pen className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleMoveStop(activeDay, idx, -1)}
                            disabled={idx === 0}
                            className="p-1 text-[#888888] disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleMoveStop(activeDay, idx, 1)}
                            disabled={idx === activeStops.length - 1}
                            className="p-1 text-[#888888] disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleRemoveStop(activeDay, idx)}
                            className="p-1 text-red-500 hover:text-red-700 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Invitation link: guests join using their own signed-in account. */}
      {pendingInvite && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center gap-2"><Users className="w-5 h-5" /><h3 className="font-serif text-xl">Join a shared trip</h3></div>
            <p className="text-sm text-[#666666]">Accept this invitation to co-edit the itinerary using your Travelogue account. Other collaborators can see your name and email address.</p>
            {joinError && <p className="text-xs text-red-600">{joinError}</p>}
            <div className="flex gap-3 justify-end">
              <button disabled={joinBusy} onClick={clearInvitation} className="text-xs px-4 py-2 rounded border border-[#dddddd] cursor-pointer">Cancel</button>
              <button disabled={joinBusy || !tripsLoaded} onClick={handleJoinTrip} className="text-xs px-4 py-2 rounded bg-[#111111] text-white cursor-pointer disabled:opacity-50">
                {joinBusy ? 'Joining...' : 'Join as editor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sharing and collaborator management */}
      {showShareModal && activeTrip && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#fbfbf9] border border-[#e5e5e0] rounded-xl shadow-xl p-5 sm:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex justify-between items-center border-b border-[#e5e5e0] pb-3">
              <div className="flex items-center gap-2"><Users className="w-5 h-5" /><h3 className="font-serif text-lg">Trip collaboration</h3></div>
              <button onClick={() => setShowShareModal(false)} className="p-1.5 rounded hover:bg-[#eeeeea] cursor-pointer" aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
            {shareError && <div className="text-xs text-red-700 bg-red-50 p-3 rounded">{shareError}</div>}
            {!activeTrip.sharedId ? (
              <div className="space-y-4">
                <p className="text-sm text-[#555555]">Invite friends to edit saved places, daily schedules, flights and stays together. Everyone needs a Travelogue account.</p>
                <button disabled={shareBusy} onClick={handleEnableSharing} className="w-full px-4 py-3 bg-[#111111] text-white text-xs rounded-lg disabled:opacity-50 cursor-pointer">
                  {shareBusy ? 'Enabling...' : 'Enable co-editing & generate invite link'}
                </button>
              </div>
            ) : !shareDetails ? (
              <p className="text-xs text-[#666666]">{shareBusy ? 'Loading shared trip...' : 'Unable to load sharing details.'}</p>
            ) : (
              <div className="space-y-5">
                <div className="text-xs flex items-center gap-2 text-[#666666]"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Automatic sync • checks for changes every 6 seconds</div>
                {shareDetails.role === 'owner' && (
                  <section className="space-y-2">
                    <p className="font-medium text-sm flex items-center gap-1.5"><Link2 className="w-4 h-4" /> Invitation link</p>
                    <p className="text-xs text-[#666666]">Anyone with this link can join as an editor after signing in. Share it only with people you trust.</p>
                    <div className="flex gap-2">
                      <input readOnly aria-label="Invitation link" value={shareLink} onFocus={e => e.target.select()} className={FIELD} />
                      <button onClick={handleCopyShareLink} className="px-3 py-2 bg-[#111111] text-white rounded flex gap-1 items-center text-xs cursor-pointer"><Copy className="w-4 h-4" />{linkCopied ? 'Copied' : 'Copy'}</button>
                    </div>
                    <button onClick={() => handleShareAction('regenerate')} disabled={shareBusy} className="text-xs underline text-[#666666] hover:text-[#111111] cursor-pointer disabled:opacity-50">Reset invitation link</button>
                  </section>
                )}
                <section className="space-y-2">
                  <h4 className="font-medium text-sm">Collaborators ({shareDetails.members?.length || 0})</h4>
                  <div className="divide-y border-y border-[#e5e5e0]">
                    {(shareDetails.members || []).map(member => (
                      <div key={member.id} className="py-3 flex justify-between items-center gap-2">
                        <div className="min-w-0"><p className="text-xs font-medium truncate">{member.name} <span className="text-[#999999]">· {member.role}</span></p><p className="text-[11px] text-[#777777] truncate">{member.email}</p></div>
                        {shareDetails.role === 'owner' && member.role === 'editor' && (
                          <button disabled={shareBusy} onClick={() => handleShareAction('remove', { memberId: member.id })} title="Remove editor" className="p-2 text-red-600 cursor-pointer disabled:opacity-50"><UserMinus className="w-4 h-4" /></button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
                <div className="border-t border-[#e5e5e0] pt-3">
                  {shareDetails.role === 'owner' ? (
                    <button disabled={shareBusy} onClick={() => handleShareAction('stop')} className="text-xs text-red-600 underline cursor-pointer disabled:opacity-50">Stop sharing (keep my private trip)</button>
                  ) : (
                    <button disabled={shareBusy} onClick={() => handleShareAction('leave')} className="text-xs text-red-600 underline cursor-pointer disabled:opacity-50">Leave this shared trip</button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Dates Modal */}
      {showEditDatesModal && activeTrip && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveEditedDates}
            className="bg-[#fbfbf9] border border-[#e5e5e0] rounded-lg max-w-md w-full p-4 sm:p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-[#e5e5e0] pb-3">
              <h3 className="font-serif text-base sm:text-lg font-normal flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-[#111111]" />
                <span>Edit Itinerary Dates</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowEditDatesModal(false)}
                className="text-xs text-[#888888] hover:text-[#111111] cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Start Date</label>
                  <input
                    type="date"
                    required
                    value={editDatesForm.startDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditDatesForm(prev => ({
                        ...prev,
                        startDate: val,
                        endDate: prev.endDate && prev.endDate < val ? val : prev.endDate
                      }));
                    }}
                    className={FIELD}
                  />
                </div>

                <div>
                  <label className={LABEL}>End Date</label>
                  <input
                    type="date"
                    required
                    min={editDatesForm.startDate || undefined}
                    value={editDatesForm.endDate}
                    onChange={(e) => setEditDatesForm(prev => ({ ...prev, endDate: e.target.value }))}
                    className={FIELD}
                  />
                </div>
              </div>
              <p className="text-[11px] text-[#777777]">
                Total Duration: {calculateDaysCount(editDatesForm.startDate, editDatesForm.endDate)} day(s)
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#e5e5e0]">
              <button
                type="button"
                onClick={() => setShowEditDatesModal(false)}
                className="px-3 py-1.5 border border-[#e5e5e0] text-[#666666] rounded hover:border-[#111111] text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-[#111111] text-white rounded text-xs font-medium hover:bg-[#333333] transition-all cursor-pointer shadow-xs"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Stay / Hotel modal */}
      {showStayModal && activeTrip && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleSetStayForDays}
            className="bg-[#fbfbf9] border border-[#e5e5e0] rounded-lg max-w-md w-full p-4 sm:p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-[#e5e5e0] pb-3">
              <h3 className="font-serif text-base sm:text-lg font-normal flex items-center space-x-2">
                <Hotel className="w-5 h-5 text-amber-600" />
                <span>Add Stay / Hotel</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowStayModal(false)}
                className="text-xs text-[#888888] hover:text-[#111111] cursor-pointer"
              >
                Close
              </button>
            </div>

            {/* Quick Selector from Saved Places */}
            {activeTrip.savedPlaces && activeTrip.savedPlaces.length > 0 && (
              <div className="space-y-1.5 text-xs">
                <label className="block text-xs font-medium text-[#666666]">Select from Saved Places</label>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 bg-white border border-[#e5e5e0] rounded">
                  {activeTrip.savedPlaces.map((place) => (
                    <button
                      key={place.id}
                      type="button"
                      onClick={() => {
                        setStayForm(prev => ({
                          ...prev,
                          name: place.name || '',
                          address: place.address || place.area || '',
                          lat: place.lat || null,
                          lng: place.lng || null,
                          note: place.note || '',
                          rating: place.rating || null,
                          priceInfo: place.priceInfo || ''
                        }));
                      }}
                      className={`text-[11px] px-2 py-1 rounded border transition-all flex items-center space-x-1 cursor-pointer ${
                        stayForm.name === place.name
                          ? 'bg-amber-500 text-white border-amber-600 font-medium'
                          : 'bg-[#f8f8f5] border-[#e5e5e0] text-[#333333] hover:border-amber-400'
                      }`}
                    >
                      <Hotel className="w-3 h-3" />
                      <span className="truncate max-w-[120px]">{place.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className={LABEL}>Search Stay / Hotel Location</label>
                {isLoaded ? (
                  <PlaceAutocomplete
                    placeholder="Search hotel or resort name..."
                    onPlaceSelected={handleStayPlaceSelected}
                  />
                ) : (
                  <input
                    type="text"
                    disabled
                    placeholder="Loading Google Places..."
                    className={FIELD_DISABLED}
                  />
                )}
              </div>

              <div>
                <label className={LABEL}>Hotel / Stay Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Grand Hyatt Tokyo"
                  value={stayForm.name}
                  onChange={(e) => setStayForm(prev => ({ ...prev, name: e.target.value }))}
                  className={FIELD}
                />
              </div>

              <div>
                <label className={LABEL}>Address</label>
                <input
                  type="text"
                  placeholder="e.g. 6-10-3 Roppongi, Minato-ku, Tokyo"
                  value={stayForm.address}
                  onChange={(e) => setStayForm(prev => ({ ...prev, address: e.target.value }))}
                  className={FIELD}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>From Day</label>
                  <select
                    value={stayForm.fromDay}
                    onChange={(e) => setStayForm(prev => ({ ...prev, fromDay: parseInt(e.target.value) }))}
                    className={SELECT} style={SELECT_STYLE}
                  >
                    {Array.from({ length: activeTrip.daysCount }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d}>Day {d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={LABEL}>To Day</label>
                  <select
                    value={stayForm.toDay}
                    onChange={(e) => setStayForm(prev => ({ ...prev, toDay: parseInt(e.target.value) }))}
                    className={SELECT} style={SELECT_STYLE}
                  >
                    {Array.from({ length: activeTrip.daysCount }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d}>Day {d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={LABEL}>Note / Confirmation Ref</label>
                <input
                  type="text"
                  placeholder="e.g. Booking Ref #12345, check-in 3 PM"
                  value={stayForm.note}
                  onChange={(e) => setStayForm(prev => ({ ...prev, note: e.target.value }))}
                  className={FIELD}
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#e5e5e0]">
              <button
                type="button"
                onClick={() => setShowStayModal(false)}
                className="px-3 py-1.5 border border-[#e5e5e0] text-[#666666] rounded hover:border-[#111111] text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-amber-600 text-white rounded text-xs font-medium hover:bg-amber-700 transition-all cursor-pointer shadow-xs"
              >
                Save Accommodation
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Stop Modal */}
      {showAddStopModal && activeTrip && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleAddDirectStop}
            className="bg-[#fbfbf9] border border-[#e5e5e0] rounded-lg max-w-md w-full p-4 sm:p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-[#e5e5e0] pb-3">
              <h3 className="font-serif text-base sm:text-lg font-normal flex items-center space-x-2">
                <Plus className="w-5 h-5 text-[#111111]" />
                <span>Add Custom Stop (Day {activeDay || 1})</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddStopModal(false)}
                className="text-xs text-[#888888] hover:text-[#111111] cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className={LABEL}>Search Location</label>
                {isLoaded ? (
                  <PlaceAutocomplete
                    placeholder="Search for place name or address..."
                    onPlaceSelected={handleStopPlaceSelected}
                  />
                ) : (
                  <input
                    type="text"
                    disabled
                    placeholder="Loading Google Places..."
                    className={FIELD_DISABLED}
                  />
                )}
              </div>

              <div>
                <label className={LABEL}>Place Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tokyo Tower"
                  value={newStop.name}
                  onChange={(e) => setNewStop(prev => ({ ...prev, name: e.target.value }))}
                  className={FIELD}
                />
              </div>

              <div>
                <label className={LABEL}>Scheduled Time</label>
                <input
                  type="time"
                  required
                  value={newStop.time}
                  onChange={(e) => setNewStop(prev => ({ ...prev, time: e.target.value }))}
                  className={FIELD}
                />
              </div>

              <div>
                <label className={LABEL}>Address / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Buy entry tickets in advance"
                  value={newStop.note}
                  onChange={(e) => setNewStop(prev => ({ ...prev, note: e.target.value }))}
                  className={FIELD}
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#e5e5e0]">
              <button
                type="button"
                onClick={() => setShowAddStopModal(false)}
                className="px-3 py-1.5 border border-[#e5e5e0] text-[#666666] rounded hover:border-[#111111] text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-[#111111] text-white rounded text-xs font-medium hover:bg-[#333333] transition-all cursor-pointer shadow-xs"
              >
                Add Stop
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Stop Modal */}
      {showEditStopModal && activeTrip && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveEditedStop}
            className="bg-[#fbfbf9] border border-[#e5e5e0] rounded-lg max-w-md w-full p-4 sm:p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-[#e5e5e0] pb-3">
              <h3 className="font-serif text-base sm:text-lg font-normal flex items-center space-x-2">
                <Pen className="w-5 h-5 text-[#111111]" />
                <span>Edit Place in Itinerary (Day {activeDay})</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowEditStopModal(false)}
                className="text-xs text-[#888888] hover:text-[#111111] cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className={LABEL}>Search Location to Update</label>
                {isLoaded ? (
                  <PlaceAutocomplete
                    placeholder="Search for place name or address..."
                    onPlaceSelected={handleEditStopPlaceSelected}
                  />
                ) : (
                  <input
                    type="text"
                    disabled
                    placeholder="Loading Google Places..."
                    className={FIELD_DISABLED}
                  />
                )}
              </div>

              <div>
                <label className={LABEL}>Place Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tokyo Tower"
                  value={editStopForm.name}
                  onChange={(e) => setEditStopForm(prev => ({ ...prev, name: e.target.value }))}
                  className={FIELD}
                />
              </div>

              <div>
                <label className={LABEL}>Scheduled Time</label>
                <input
                  type="time"
                  required
                  value={editStopForm.time}
                  onChange={(e) => setEditStopForm(prev => ({ ...prev, time: e.target.value }))}
                  className={FIELD}
                />
              </div>

              <div>
                <label className={LABEL}>Address</label>
                <input
                  type="text"
                  placeholder="Address"
                  value={editStopForm.address}
                  onChange={(e) => setEditStopForm(prev => ({ ...prev, address: e.target.value }))}
                  className={FIELD}
                />
              </div>

              <div>
                <label className={LABEL}>Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Buy entry tickets in advance"
                  value={editStopForm.note}
                  onChange={(e) => setEditStopForm(prev => ({ ...prev, note: e.target.value }))}
                  className={FIELD}
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#e5e5e0]">
              <button
                type="button"
                onClick={() => setShowEditStopModal(false)}
                className="px-3 py-1.5 border border-[#e5e5e0] text-[#666666] rounded hover:border-[#111111] text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-[#111111] text-white rounded text-xs font-medium hover:bg-[#333333] transition-all cursor-pointer shadow-xs"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Flight Modal */}
      {showAddFlightModal && activeTrip && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleAddFlight}
            className="bg-[#fbfbf9] border border-[#e5e5e0] rounded-lg max-w-md w-full p-4 sm:p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-[#e5e5e0] pb-3">
              <h3 className="font-serif text-base sm:text-lg font-normal flex items-center space-x-2">
                <Plane className="w-5 h-5 text-sky-600" />
                <span>Add Flight Segment (Day {activeDay || 1})</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddFlightModal(false)}
                className="text-xs text-[#888888] hover:text-[#111111] cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Flight No.</label>
                  <input
                    type="text"
                    placeholder="e.g. SQ638"
                    value={newFlight.flightNumber}
                    onChange={(e) => setNewFlight(prev => ({ ...prev, flightNumber: e.target.value }))}
                    className={FIELD}
                  />
                </div>
                <div>
                  <label className={LABEL}>Airline</label>
                  <input
                    type="text"
                    placeholder="e.g. Singapore Airlines"
                    value={newFlight.airline}
                    onChange={(e) => setNewFlight(prev => ({ ...prev, airline: e.target.value }))}
                    className={FIELD}
                  />
                </div>
              </div>

              <div>
                <label className={LABEL}>Departure Airport</label>
                {isLoaded ? (
                  <PlaceAutocomplete
                    placeholder="Search departure airport (e.g. Changi Airport)..."
                    onPlaceSelected={handleDeparturePlaceSelected}
                  />
                ) : null}
                <input
                  type="text"
                  placeholder="Airport name / code (e.g. SIN)"
                  value={newFlight.departureAirport}
                  onChange={(e) => setNewFlight(prev => ({ ...prev, departureAirport: e.target.value }))}
                  className={`${FIELD} mt-1`}
                />
              </div>

              <div>
                <label className={LABEL}>Arrival Airport</label>
                {isLoaded ? (
                  <PlaceAutocomplete
                    placeholder="Search arrival airport (e.g. Haneda Airport)..."
                    onPlaceSelected={handleArrivalPlaceSelected}
                  />
                ) : null}
                <input
                  type="text"
                  placeholder="Airport name / code (e.g. HND)"
                  value={newFlight.arrivalAirport}
                  onChange={(e) => setNewFlight(prev => ({ ...prev, arrivalAirport: e.target.value }))}
                  className={`${FIELD} mt-1`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Departure Time</label>
                  <input
                    type="time"
                    required
                    value={newFlight.departureTime}
                    onChange={(e) => setNewFlight(prev => ({ ...prev, departureTime: e.target.value }))}
                    className={FIELD}
                  />
                </div>

                <div>
                  <label className={LABEL}>Arrival Time</label>
                  <input
                    type="time"
                    value={newFlight.arrivalTime}
                    onChange={(e) => setNewFlight(prev => ({ ...prev, arrivalTime: e.target.value }))}
                    className={FIELD}
                  />
                </div>
              </div>

              <div>
                <label className={LABEL}>Booking Ref / Seat</label>
                <input
                  type="text"
                  placeholder="e.g. PNR: ABC123D • Seat 14A"
                  value={newFlight.bookingRef}
                  onChange={(e) => setNewFlight(prev => ({ ...prev, bookingRef: e.target.value }))}
                  className={FIELD}
                />
              </div>

              <div>
                <label className={LABEL}>Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Terminal 3, check-in 3 hours before"
                  value={newFlight.note}
                  onChange={(e) => setNewFlight(prev => ({ ...prev, note: e.target.value }))}
                  className={FIELD}
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#e5e5e0]">
              <button
                type="button"
                onClick={() => setShowAddFlightModal(false)}
                className="px-3 py-1.5 border border-[#e5e5e0] text-[#666666] rounded hover:border-[#111111] text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-sky-700 text-white rounded text-xs font-medium hover:bg-sky-800 transition-all cursor-pointer shadow-xs"
              >
                Add Flight
              </button>
            </div>
          </form>
        </div>
      )}

      {/* New Place Modal */}
      {showNewPlaceModal && activeTrip && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleCreatePlace}
            className="bg-[#fbfbf9] border border-[#e5e5e0] rounded-lg max-w-md w-full p-4 sm:p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-[#e5e5e0] pb-3">
              <h3 className="font-serif text-base sm:text-lg font-normal flex items-center space-x-2">
                <BookmarkPlus className="w-5 h-5 text-[#111111]" />
                <span>Add Custom Place to Saved</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowNewPlaceModal(false)}
                className="text-xs text-[#888888] hover:text-[#111111] cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className={LABEL}>Category</label>
                <select
                  value={newPlace.category}
                  onChange={(e) => setNewPlace(prev => ({ ...prev, category: e.target.value }))}
                  className={SELECT} style={SELECT_STYLE}
                >
                  <option value="Places to Visit">Places to Visit</option>
                  <option value="Food & Eats">Food & Eats</option>
                  <option value="Experiences">Experiences</option>
                  <option value="Stays/Hotel">Stays/Hotel</option>
                </select>
              </div>

              <div>
                <label className={LABEL}>Search Location</label>
                {isLoaded ? (
                  <PlaceAutocomplete
                    placeholder="Search place on Google Maps..."
                    onPlaceSelected={handleCustomPlaceSelected}
                  />
                ) : (
                  <input
                    type="text"
                    disabled
                    placeholder="Loading Google Places..."
                    className={FIELD_DISABLED}
                  />
                )}
              </div>

              <div>
                <label className={LABEL}>Place Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Senso-ji Temple"
                  value={newPlace.name}
                  onChange={(e) => setNewPlace(prev => ({ ...prev, name: e.target.value }))}
                  className={FIELD}
                />
              </div>

              <div>
                <label className={LABEL}>Address / Area</label>
                <input
                  type="text"
                  placeholder="e.g. Asakusa, Taito City, Tokyo"
                  value={newPlace.address}
                  onChange={(e) => setNewPlace(prev => ({ ...prev, address: e.target.value }))}
                  className={FIELD}
                />
              </div>

              <div>
                <label className={LABEL}>Notes / Description</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Try melonpan at Nakamise street"
                  value={newPlace.note}
                  onChange={(e) => setNewPlace(prev => ({ ...prev, note: e.target.value }))}
                  className={TEXTAREA}
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#e5e5e0]">
              <button
                type="button"
                onClick={() => setShowNewPlaceModal(false)}
                className="px-3 py-1.5 border border-[#e5e5e0] text-[#666666] rounded hover:border-[#111111] text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-[#111111] text-white rounded text-xs font-medium hover:bg-[#333333] transition-all cursor-pointer shadow-xs"
              >
                Save Place
              </button>
            </div>
          </form>
        </div>
      )}

      {/* New Trip Modal */}
      {showNewTripModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleCreateTrip}
            className="bg-[#fbfbf9] border border-[#e5e5e0] rounded-lg max-w-md w-full p-4 sm:p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-[#e5e5e0] pb-3">
              <h3 className="font-serif text-base sm:text-lg font-normal flex items-center space-x-2">
                <Globe className="w-5 h-5 text-[#111111]" />
                <span>Create New Itinerary</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowNewTripModal(false)}
                className="text-xs text-[#888888] hover:text-[#111111] cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className={LABEL}>Search Destination</label>
                {isLoaded ? (
                  <PlaceAutocomplete
                    placeholder="Search city or destination (e.g. Tokyo, Paris)..."
                    onPlaceSelected={handleTripPlaceSelected}
                  />
                ) : (
                  <input
                    type="text"
                    disabled
                    placeholder="Loading Google Places..."
                    className={FIELD_DISABLED}
                  />
                )}
              </div>

              <div>
                <label className={LABEL}>Trip Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tokyo & Kyoto Trip"
                  value={newTripForm.name}
                  onChange={(e) => setNewTripForm(prev => ({ ...prev, name: e.target.value }))}
                  className={FIELD}
                />
              </div>

              <div>
                <label className={LABEL}>Subtitle / Region</label>
                <input
                  type="text"
                  placeholder="e.g. Japan"
                  value={newTripForm.subName}
                  onChange={(e) => setNewTripForm(prev => ({ ...prev, subName: e.target.value }))}
                  className={FIELD}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Start Date</label>
                  <input
                    type="date"
                    required
                    value={newTripForm.startDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewTripForm(prev => ({
                        ...prev,
                        startDate: val,
                        endDate: prev.endDate && prev.endDate < val ? val : prev.endDate
                      }));
                    }}
                    className={FIELD}
                  />
                </div>

                <div>
                  <label className={LABEL}>End Date</label>
                  <input
                    type="date"
                    required
                    min={newTripForm.startDate || undefined}
                    value={newTripForm.endDate}
                    onChange={(e) => setNewTripForm(prev => ({ ...prev, endDate: e.target.value }))}
                    className={FIELD}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#e5e5e0]">
              <button
                type="button"
                onClick={() => setShowNewTripModal(false)}
                className="px-3 py-1.5 border border-[#e5e5e0] text-[#666666] rounded hover:border-[#111111] text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-[#111111] text-white rounded text-xs font-medium hover:bg-[#333333] transition-all cursor-pointer shadow-xs"
              >
                Create Itinerary
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
