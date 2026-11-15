import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Plus, Trash2, Search, RefreshCw, AlertTriangle, Plane, Hotel, Pen, User, Lock, Mail, Database, CheckCircle2, Calendar, Users, Link2, Copy, UserMinus, X, Globe, BookmarkPlus } from 'lucide-react';
import { useJsApiLoader } from '@react-google-maps/api';
import { mergeTrip } from '../api/_merge.js';
import { TopNav, HeroArt, BrandMark } from './components/Shell.jsx';
import OverviewPage from './pages/OverviewPage.jsx';
import SavedPlacesPage from './pages/SavedPlacesPage.jsx';
import ItineraryPage from './pages/ItineraryPage.jsx';
import FlightsPage from './pages/FlightsPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import {
  sortStopsByTime, renderPriceLevel, getDayDateString, calculateDaysCount, getEndDateString, haversineKm, addMinutes
} from './lib/helpers.js';

const LIBRARIES = ['places'];

// ---- Shared form-control styles (every text box / select / date / time uses these) ----
const FIELD_BASE =
  'w-full min-w-0 border border-line rounded-lg text-base sm:text-sm text-ink placeholder:text-ink-3 ' +
  'focus:outline-none focus:border-sage transition-colors appearance-none text-left';
const FIELD = `${FIELD_BASE} bg-paper h-10 px-3`;
const FIELD_ICON = `${FIELD_BASE} bg-paper h-10 pl-9 pr-3`; // input with a leading icon
const FIELD_DISABLED = `${FIELD_BASE} bg-cream-2 text-ink-3 h-10 px-3 cursor-not-allowed`;
const TEXTAREA = `${FIELD_BASE} bg-paper px-3 py-2`;
const SELECT = `${FIELD_BASE} bg-paper h-10 pl-3 pr-9 cursor-pointer`;
const SELECT_STYLE = {
  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>'
  )}")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 0.75rem center',
  backgroundSize: '1rem'
};
const LABEL = 'block text-xs font-medium text-ink-2 mb-1';

// Google's place-search web component renders inside a shadow DOM, so we theme it
// with CSS variables to sit next to the other fields.
const PLACE_AUTOCOMPLETE_CSS = `
gmp-place-autocomplete.travelogue-place-autocomplete {
  display: block;
  width: 100%;
  color-scheme: light;
  --gmp-mat-color-surface: #fffdf8;
  --gmp-mat-color-on-surface: #2d2924;
  --gmp-mat-color-on-surface-variant: #666666;
  --gmp-mat-color-outline: #e6dfd0;
  --gmp-mat-color-outline-decorative: #e6dfd0;
  --gmp-mat-color-primary: #55663f;
  --gmp-mat-font-family: inherit;
}
`;

async function apiRequest(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
  } catch (err) {
    const e = new Error('Unable to reach Travelogue. Check your connection and try again.');
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
    const e = new Error(data?.error || `Something went wrong on the server (HTTP ${response.status}). Please try again.`);
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
                'regularOpeningHours',
                'photos'
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
              openingHours: place.regularOpeningHours || null,
              photoUrl: place.photos?.[0]?.getURI ? place.photos[0].getURI({ maxWidth: 900 }) : null
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
  const userId = currentUser?.id || null;
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

  // Restore session on page load (verified by the server)
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
  }, [userId, reloadKey]);

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
        // overwhelming the database and retain the successful results if another fails.
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
  }, [trips, userId, tripsLoaded, syncPulse, collabConflict]);

  // Every 6 seconds, check shared revisions. Only changed trips cross the network.
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
  }, [userId, tripsLoaded]);

  const [activeTripId, setActiveTripId] = useState(null);
  const [activeDay, setActiveDay] = useState(null);
  const [page, setPage] = useState(() => {
    const p = new URLSearchParams(window.location.search).get('page');
    return ['overview', 'saved', 'itinerary', 'flights', 'profile'].includes(p) ? p : 'overview';
  });
  const navigate = useCallback((next) => {
    setPage(next);
    const url = new URL(window.location.href);
    if (next === 'overview') url.searchParams.delete('page'); else url.searchParams.set('page', next);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
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
  const [newFlight, setNewFlight] = useState({ flightNumber: '', date: '', seatNumber: '', bookingRef: '' });
  const [flightMatches, setFlightMatches] = useState([]);
  const [selectedFlightIndex, setSelectedFlightIndex] = useState(0);
  const [flightLookupBusy, setFlightLookupBusy] = useState(false);
  const [flightLookupError, setFlightLookupError] = useState('');
  const [refreshingFlightIds, setRefreshingFlightIds] = useState([]);
  const [flightRefreshErrors, setFlightRefreshErrors] = useState({});
  const flightRefreshInProgressRef = useRef(new Set());

  // Stay / Hotel Modal state
  const [showStayModal, setShowStayModal] = useState(false);
  const [stayForm, setStayForm] = useState({
    name: '',
    address: '',
    lat: null,
    lng: null,
    note: '',
    checkIn: '',
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
      // Includes connection failures - account creation is refused if the database is down
      setAuthError(err.message);
    } finally {
      setAuthSubmitting(false);
    }
  };

  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  // Shows the change straight away, then saves it; a failed save is rolled back.
  const saveProfile = useCallback(async (patch) => {
    let before = null;
    setProfileError('');
    setProfileSaving(true);
    setCurrentUser(u => {
      if (!u) return u;
      before = u.profile || null;
      const base = u.profile || {};
      return {
        ...u,
        profile: {
          ...base, ...patch,
          ...(patch.prefs ? { prefs: { ...(base.prefs || {}), ...patch.prefs } } : {}),
          ...(patch.notifications ? { notifications: { ...(base.notifications || {}), ...patch.notifications } } : {})
        }
      };
    });
    try {
      await authApi({ action: 'updateProfile', profile: patch });
      return true;
    } catch (err) {
      setCurrentUser(u => (u ? { ...u, profile: before } : u));
      setProfileError(err.message || 'That change could not be saved.');
      return false;
    } finally {
      setProfileSaving(false);
    }
  }, []);

  // Profiles used to live only in this browser. Move an existing one to the account once.
  useEffect(() => {
    if (!currentUser || currentUser.profile) return;
    const key = `tl_profile_${currentUser.id}`;
    try {
      const old = JSON.parse(localStorage.getItem(key) || 'null');
      if (!old || typeof old !== 'object') return;
      const { interests: oldInterestText, ...prefs } = old.prefs || {};
      saveProfile({
        ...(typeof old.bio === 'string' ? { bio: old.bio } : {}),
        ...(Array.isArray(old.interests) ? { interests: old.interests } : {}),
        ...(Object.keys(prefs).length ? { prefs } : {}),
        ...(old.notifications ? { notifications: old.notifications } : {})
      }).then(ok => { if (ok) localStorage.removeItem(key); });
    } catch { /* nothing to move */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

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
          'userRatingCount', 'priceLevel', 'regularOpeningHours', 'types', 'editorialSummary', 'photos'
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
          types: p.types || [],
          photoUrl: p.photos?.[0]?.getURI ? p.photos[0].getURI({ maxWidth: 900 }) : null
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
      googleId: place.id || prev.googleId || null,
      photoUrl: place.photoUrl || null,
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
      googleId: place.id || prev.googleId || null,
      photoUrl: place.photoUrl || null,
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
      googleId: place.id || prev.googleId || null,
      photoUrl: place.photoUrl || null,
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
      googleId: place.id || null,
      photoUrl: place.photoUrl || null,
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
      checkIn: stayForm.checkIn || '',
      rating: stayForm.rating || null,
      priceInfo: stayForm.priceInfo || '',
      googleId: stayForm.googleId || null,
      photoUrl: stayForm.photoUrl || null
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
      checkIn: '',
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
      types: newStop.types || [],
      googleId: newStop.googleId || null,
      photoUrl: newStop.photoUrl || null
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
              types: editStopForm.types,
              googleId: editStopForm.googleId || stop.googleId || null,
              photoUrl: editStopForm.photoUrl || stop.photoUrl || null
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

  const handleOpenAddFlight = () => {
    if (!activeTrip) return;
    setNewFlight({ flightNumber: '', date: getDayDateString(activeTrip.startDate, activeDay || 1), seatNumber: '', bookingRef: '' });
    setFlightMatches([]);
    setSelectedFlightIndex(0);
    setFlightLookupError('');
    setShowAddFlightModal(true);
  };

  const handleSearchFlight = async (e) => {
    e.preventDefault();
    if (!newFlight.flightNumber.trim() || !newFlight.date) return;
    setFlightLookupBusy(true);
    setFlightLookupError('');
    setFlightMatches([]);
    try {
      const response = await apiRequest('/api/flights', {
        method: 'POST', body: JSON.stringify({
          action: 'lookup', flightNumber: newFlight.flightNumber.trim(), date: newFlight.date
        })
      });
      if (!response.flights?.length) {
        setFlightLookupError('No published schedule found for that flight number and departure date. Check the number/date or try again nearer departure.');
        return;
      }
      setFlightMatches(response.flights);
      setSelectedFlightIndex(0);
    } catch (err) {
      setFlightLookupError(err.message);
    } finally {
      setFlightLookupBusy(false);
    }
  };

  const handleAddFlight = () => {
    const selected = flightMatches[selectedFlightIndex];
    if (!activeTrip || !selected) return;
    // The selected date, not the currently opened day tab, determines the itinerary day.
    const targetDay = calculateDaysCount(activeTrip.startDate, selected.flightDate);
    if (selected.flightDate < activeTrip.startDate || targetDay < 1 || targetDay > activeTrip.daysCount) {
      setFlightLookupError(`Flight departs on ${selected.flightDate}, outside this trip (${activeTrip.startDate} to ${getEndDateString(activeTrip.startDate, activeTrip.daysCount)}). Edit trip dates first.`);
      return;
    }
    if (!selected.departureTime) {
      setFlightLookupError('No local departure time was returned for this flight. Please try the lookup again.');
      return;
    }

    const createdFlightStop = {
      ...selected,
      id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      isFlight: true,
      category: 'Flights',
      name: `Flight ${selected.flightNumber} (${selected.originCode || 'Departure'} → ${selected.destinationCode || 'Arrival'})`,
      time: selected.departureTime,
      seatNumber: newFlight.seatNumber.trim(),
      bookingRef: newFlight.bookingRef.trim(),
      note: '',
      address: `${selected.originCode || selected.departureAirport} → ${selected.destinationCode || selected.arrivalAirport}`,
      lat: selected.departureLat ?? selected.arrivalLat ?? activeTrip.center[0],
      lng: selected.departureLng ?? selected.arrivalLng ?? activeTrip.center[1],
      types: ['flight', 'airport']
    };
    setTrips(prev => prev.map(trip => {
      if (trip.id !== activeTrip.id) return trip;
      const current = trip.schedule[targetDay] || [];
      return {
        ...trip,
        schedule: { ...trip.schedule, [targetDay]: sortStopsByTime([...current, createdFlightStop]) }
      };
    }));
    setActiveDay(targetDay);
    setShowAddFlightModal(false);
    setNewFlight({ flightNumber: '', date: '', seatNumber: '', bookingRef: '' });
    setFlightMatches([]);
  };

  const refreshSavedFlight = useCallback(async (tripId, day, flight, force = false) => {
    if (!flight?.isFlight || !flight?.scheduledOut || !flight.flightDate ||
        flightRefreshInProgressRef.current.has(flight.id)) return;
    const now = Date.now();
    const due = !flight.lastChecked || now - Date.parse(flight.lastChecked) >= 10 * 60 * 1000;
    if (!force && !due) return;
    flightRefreshInProgressRef.current.add(flight.id);
    setRefreshingFlightIds(prev => [...prev, flight.id]);
    setFlightRefreshErrors(prev => ({ ...prev, [flight.id]: '' }));
    try {
      const result = await apiRequest('/api/flights', {
        method: 'POST', body: JSON.stringify({ action: 'refresh', flight: {
          flightNumber: flight.flightNumber, flightDate: flight.flightDate,
          operatingIdent: flight.operatingIdent, faFlightId: flight.faFlightId,
          originCode: flight.originCode, originIcao: flight.originIcao,
          scheduledOut: flight.scheduledOut
        } })
      });
      if (!result.details || result.details.outsideWindow) return;
      setTrips(prev => prev.map(trip => {
        if (trip.id !== tripId) return trip;
        const old = trip.schedule?.[day] || [];
        if (!old.some(item => item.id === flight.id)) return trip;
        const updated = old.map(item => {
          if (item.id !== flight.id) return item;
          // Null means unavailable, not a confirmed deletion of airport gate data.
          const details = Object.fromEntries(Object.entries(result.details)
            .filter(([key, val]) => val !== null && val !== undefined && key !== 'outsideWindow'));
          const gateChanged = item.departureGate && details.departureGate && item.departureGate !== details.departureGate;
          return {
            ...item, ...details,
            ...(gateChanged ? { gateChangedFrom: item.departureGate } : {})
          };
        });
        return { ...trip, schedule: { ...trip.schedule, [day]: updated } };
      }));
    } catch (err) {
      setFlightRefreshErrors(prev => ({ ...prev, [flight.id]: err.message }));
    } finally {
      flightRefreshInProgressRef.current.delete(flight.id);
      setRefreshingFlightIds(prev => prev.filter(id => id !== flight.id));
    }
  }, []);

  // While Travelogue is open: refresh flight-day gates every 10 minutes, plus on return to the tab.
  useEffect(() => {
    if (!currentUser || !tripsLoaded) return;
    const checkFlights = () => {
      if (document.hidden) return;
      const trip = tripsRef.current.find(t => t.id === activeTripId);
      if (!trip) return;
      const now = new Date();
      for (const [day, stops] of Object.entries(trip.schedule || {})) {
        for (const flight of stops || []) {
          if (!flight.isFlight || !flight.scheduledOut || !flight.flightDate) continue;
          let originToday = '';
          try {
            const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
              year: 'numeric', month: '2-digit', day: '2-digit', timeZone: flight.departureTimezone || 'UTC'
            }).formatToParts(now).map(part => [part.type, part.value]));
            originToday = `${parts.year}-${parts.month}-${parts.day}`;
          } catch { originToday = now.toISOString().slice(0, 10); }
          const msUntilDeparture = Date.parse(flight.scheduledOut) - now.getTime();
          if (originToday === flight.flightDate || (msUntilDeparture > -8 * 3600000 && msUntilDeparture < 24 * 3600000)) {
            refreshSavedFlight(trip.id, day, flight);
          }
        }
      }
    };
    checkFlights();
    const timer = window.setInterval(checkFlights, 10 * 60 * 1000);
    const onVisible = () => checkFlights();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [activeTripId, userId, tripsLoaded, refreshSavedFlight]);

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
      types: newPlace.types || [],
      googleId: newPlace.googleId || null,
      photoUrl: newPlace.photoUrl || null
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
      types: recommendedItem.types || [],
      googleId: recommendedItem.googleId || null,
      photoUrl: recommendedItem.photoUrl || null
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

  // ---- Itinerary helpers used by the redesigned pages ----
  const updateTrip = (patch) => {
    if (!activeTrip) return;
    setTrips(prev => prev.map(trip => (trip.id === activeTrip.id ? { ...trip, ...patch } : trip)));
  };

  const setStopTime = (day, stopId, newTime) => {
    setTrips(prev => prev.map(trip => {
      if (trip.id !== activeTrip?.id) return trip;
      const updated = (trip.schedule[day] || []).map(s => (s.id === stopId ? { ...s, time: newTime } : s));
      return { ...trip, schedule: { ...trip.schedule, [day]: sortStopsByTime(updated) } };
    }));
  };

  const setStopDuration = (day, stopId, duration) => {
    setTrips(prev => prev.map(trip => {
      if (trip.id !== activeTrip?.id) return trip;
      const updated = (trip.schedule[day] || []).map(s => (s.id === stopId ? { ...s, duration } : s));
      return { ...trip, schedule: { ...trip.schedule, [day]: updated } };
    }));
  };

  // Nearest-neighbour ordering from the first stop; times are re-spaced using each stop's duration.
  const optimizeDay = (day) => {
    if (!activeTrip) return;
    const stops = sortStopsByTime(activeTrip.schedule?.[day] || []);
    const movable = stops.filter(s => !s.isFlight && s.lat != null && s.lng != null);
    if (movable.length < 3) { alert('Add at least three located stops to optimise the route.'); return; }
    if (!confirm(`Reorder Day ${day} stops by shortest path and re-space their times?`)) return;
    const flights = stops.filter(s => s.isFlight);
    const remaining = [...movable];
    const ordered = [remaining.shift()];
    while (remaining.length) {
      const last = ordered[ordered.length - 1];
      let bestIdx = 0, best = Infinity;
      remaining.forEach((s, i) => { const d = haversineKm(last, s); if (d < best) { best = d; bestIdx = i; } });
      ordered.push(remaining.splice(bestIdx, 1)[0]);
    }
    let t = ordered[0].time || '09:00';
    const retimed = ordered.map((s, i) => {
      if (i > 0) {
        const prev = ordered[i - 1];
        const travelMin = Math.min(90, Math.max(10, Math.round(haversineKm(prev, s) * 12)));
        t = addMinutes(t, (prev.duration || 60) + travelMin);
      }
      return { ...s, time: t };
    });
    updateTrip({ schedule: { ...activeTrip.schedule, [day]: sortStopsByTime([...flights, ...retimed]) } });
  };

  // Fill a day with saved places that are not yet scheduled anywhere in the trip.
  const autoPlanDay = (day) => {
    if (!activeTrip) return;
    const scheduledNames = new Set(Object.values(activeTrip.schedule || {}).flat().map(s => (s.name || '').toLowerCase()));
    const stay = activeTrip.staysByDay?.[day];
    const pool = (activeTrip.savedPlaces || []).filter(p => !scheduledNames.has((p.name || '').toLowerCase()) && p.category !== 'Stays/Hotel' && p.lat != null);
    if (!pool.length) { alert('No unscheduled saved places left. Save a few places first.'); return; }
    const anchor = stay || activeTrip.schedule?.[day]?.find(s => !s.isFlight) || pool[0];
    const picked = [...pool].sort((a, b) => haversineKm(anchor, a) - haversineKm(anchor, b)).slice(0, 4);
    if (!confirm(`Add ${picked.length} saved place${picked.length === 1 ? '' : 's'} to Day ${day}?`)) return;
    const existing = sortStopsByTime(activeTrip.schedule?.[day] || []);
    let t = existing.length ? addMinutes(existing[existing.length - 1].time || '09:00', (existing[existing.length - 1].duration || 60) + 30) : '09:30';
    const created = picked.map((p, i) => {
      if (i > 0) t = addMinutes(t, 60 + 30);
      return { ...p, address: p.address || p.area || '', id: `s_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`, time: t, duration: 60 };
    });
    updateTrip({ schedule: { ...activeTrip.schedule, [day]: sortStopsByTime([...existing, ...created]) } });
    setActiveDay(day);
  };

  const openStayModal = (day, currentStay) => {
    // Editing a stay that spans several nights edits all of those nights together.
    let fromDay = day, toDay = day;
    if (currentStay && activeTrip) {
      const same = d => {
        const other = activeTrip.staysByDay?.[d];
        return !!other && other.name === currentStay.name && (other.address || '') === (currentStay.address || '');
      };
      if (same(day)) {
        while (fromDay > 1 && same(fromDay - 1)) fromDay -= 1;
        while (toDay < activeTrip.daysCount && same(toDay + 1)) toDay += 1;
      }
    }
    setStayForm({
      name: currentStay?.name || '',
      address: currentStay?.address || '',
      lat: currentStay?.lat ?? null,
      lng: currentStay?.lng ?? null,
      note: currentStay?.note || '',
      checkIn: currentStay?.checkIn || '',
      rating: currentStay?.rating || null,
      priceInfo: currentStay?.priceInfo || '',
      googleId: currentStay?.googleId || null,
      photoUrl: currentStay?.photoUrl || null,
      fromDay,
      toDay
    });
    setShowStayModal(true);
  };

  const openNewTrip = (prefill = {}) => {
    setNewTripForm(prev => ({ ...prev, ...prefill }));
    setShowNewTripModal(true);
  };

  const openAddStop = () => {
    if (activeDay === null) setActiveDay(1);
    setShowAddStopModal(true);
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
      <div className="min-h-screen bg-cream flex items-center justify-center text-xs text-ink-3">
        Opening Travelogue…
      </div>
    );
  }

  // Mandated Login Page when not authenticated
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-cream text-ink flex flex-col justify-center items-center px-4 py-8 sm:py-12 font-sans relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[260px] opacity-90"><HeroArt /></div>
        <div className="relative w-full max-w-md tl-card p-6 sm:p-8 space-y-6 mt-16">
          <div className="text-center space-y-1">
            <BrandMark className="w-14 h-12 mx-auto" />
            <h1 className="font-serif text-3xl tracking-tight">Travelogue</h1>
            <p className="text-xs text-ink-3 tracking-wide">Plan, explore, and remember · by Li Ze Ying</p>
          </div>

          <div className="p-3 bg-sage-mist border border-sage/20 rounded-xl text-xs text-ink-2 flex items-center space-x-2">
            <Database className="w-4 h-4 text-sage-deep shrink-0" />
            <span>Sign in to manage and sync your travel itineraries.</span>
          </div>

          <div className="flex p-1 rounded-full bg-cream-2 text-xs">
            <button
              type="button"
              onClick={() => { setAuthMode('login'); setAuthError(''); setAuthSuccess(''); }}
              className={`flex-1 py-2 rounded-full font-medium transition-all cursor-pointer ${authMode === 'login' ? 'bg-paper shadow-sm text-ink' : 'text-ink-3 hover:text-ink'}`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('register'); setAuthError(''); setAuthSuccess(''); }}
              className={`flex-1 py-2 rounded-full font-medium transition-all cursor-pointer ${authMode === 'register' ? 'bg-paper shadow-sm text-ink' : 'text-ink-3 hover:text-ink'}`}
            >
              Create Account
            </button>
          </div>

          {authError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {authSuccess && (
            <div className="p-3 bg-green-50 border border-green-200 text-green-800 text-xs rounded-xl flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-green-600" />
              <span>{authSuccess}</span>
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4 text-xs">
            {authMode === 'register' && (
              <div>
                <label className={LABEL}>Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
                  <input type="text" required placeholder="e.g. Alex Tan" value={authForm.name}
                    onChange={(e) => setAuthForm(prev => ({ ...prev, name: e.target.value }))} className={FIELD_ICON} />
                </div>
              </div>
            )}

            <div>
              <label className={LABEL}>Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
                <input type="email" required placeholder="e.g. user@example.com" value={authForm.email}
                  onChange={(e) => setAuthForm(prev => ({ ...prev, email: e.target.value }))} className={FIELD_ICON} />
              </div>
            </div>

            <div>
              <label className={LABEL}>Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
                <input type="password" required placeholder="••••••••" value={authForm.password}
                  onChange={(e) => setAuthForm(prev => ({ ...prev, password: e.target.value }))} className={FIELD_ICON} />
              </div>
            </div>

            <button
              type="submit"
              disabled={authSubmitting}
              className="w-full bg-sage-deep text-white py-3 rounded-full text-xs font-medium hover:bg-[#46553a] transition-all flex items-center justify-center space-x-1.5 shadow-sm mt-2 cursor-pointer disabled:opacity-60"
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
      <div className="min-h-screen bg-cream text-ink flex flex-col justify-center items-center px-4 font-sans">
        <div className="w-full max-w-md bg-paper border border-red-200 rounded-2xl p-6 space-y-4 shadow-sm text-center">
          <AlertTriangle className="w-8 h-8 mx-auto text-red-500" />
          <h2 className="font-serif text-xl">Your trips could not be loaded</h2>
          <p className="text-xs text-ink-2 break-words">{dbError}</p>
          <div className="flex items-center justify-center space-x-2 text-xs">
            <button
              onClick={() => setReloadKey(k => k + 1)}
              disabled={isDbSyncing}
              className="px-4 py-2 bg-sage-deep text-white rounded hover:bg-[#46553a] cursor-pointer"
            >
              {isDbSyncing ? 'Retrying...' : 'Retry'}
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 border border-line rounded hover:border-sage cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pageCtx = {
    user: currentUser, trips, activeTrip, activeTripId, setActiveTripId, activeDay, setActiveDay, sharedMeta,
    isLoaded, loadError, navigate, isDbSyncing, dbError, saveProfile, profileSaving, profileError,
    filterCategory, setFilterCategory, searchQuery, setSearchQuery, filteredPlaces,
    recommendations, isRecLoading, recCategory, setRecCategory, fetchRecommendations,
    handleAddToDay, handleDeleteSavedPlace, handleAddRecommendedToSaved,
    openNewPlace: () => setShowNewPlaceModal(true), openNewTrip, openAddStop, openStayModal,
    handleOpenShare, handleOpenEditDatesModal, handleDeleteTrip, handleAddDay,
    handleMoveStop, handleRemoveStop, handleOpenEditStopModal, handleOpenAddFlight, handleUnpinStay,
    handleOpenInGoogleMaps, handleOpenInYahooCarNavi, refreshSavedFlight, refreshingFlightIds, flightRefreshErrors,
    setStopTime, setStopDuration, updateTrip, optimizeDay, autoPlanDay, handleLogout
  };
  const pages = { overview: OverviewPage, saved: SavedPlacesPage, itinerary: ItineraryPage, flights: FlightsPage, profile: ProfilePage };
  const Page = pages[page] || OverviewPage;
  const notificationCount = (collabConflict ? 1 : 0) + (dbError ? 1 : 0) + Object.values(flightRefreshErrors).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-cream text-ink flex flex-col font-sans tl-page-bottom">
      <style>{PLACE_AUTOCOMPLETE_CSS}</style>
      <TopNav page={page} onNavigate={navigate} user={currentUser} notifications={notificationCount}
        onBell={() => navigate('flights')} onAvatar={() => navigate('profile')} />

      {dbError && (
        <div className="bg-red-50 border-b border-red-200 text-red-700 text-xs px-4 py-2 flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="break-words">{dbError}</span>
          <button onClick={() => setSyncPulse(v => v + 1)} className="underline font-medium cursor-pointer shrink-0">Retry saving</button>
        </div>
      )}

      {collabConflict && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-xs px-4 py-3 flex flex-wrap items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span>Someone edited the same field. Your changes are still on this device. Choose which version to keep.</span>
          <button onClick={() => handleResolveConflict(true)} className="px-3 py-1.5 bg-sage-deep text-white rounded-full cursor-pointer">Keep my changes</button>
          <button onClick={() => handleResolveConflict(false)} className="px-3 py-1.5 border border-amber-400 rounded-full cursor-pointer">Load their version</button>
        </div>
      )}

      <div className="flex-1 w-full">
        <Page {...pageCtx} />
      </div>

      <footer className="max-w-[1400px] mx-auto w-full px-4 sm:px-6 py-5 text-[11px] text-ink-3 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2"><BrandMark className="w-5 h-5" /> Travelogue · by Li Ze Ying</span>
        <span className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${dbError ? 'bg-red-500' : isDbSyncing ? 'bg-amber-500' : 'bg-sage'}`} />{dbError ? 'Not saved' : isDbSyncing ? 'Saving…' : 'All changes saved'}</span>
      </footer>

      {/* Invitation link: guests join using their own signed-in account. */}
      {pendingInvite && (
        <div className="fixed inset-0 z-[70] bg-ink/50 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-paper rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center gap-2"><Users className="w-5 h-5" /><h3 className="font-serif text-xl">Join a shared trip</h3></div>
            <p className="text-sm text-ink-2">Accept this invitation to co-edit the itinerary using your Travelogue account. Other collaborators can see your name and email address.</p>
            {joinError && <p className="text-xs text-red-600">{joinError}</p>}
            <div className="flex gap-3 justify-end">
              <button disabled={joinBusy} onClick={clearInvitation} className="text-xs px-4 py-2 rounded-full border border-line cursor-pointer">Cancel</button>
              <button disabled={joinBusy || !tripsLoaded} onClick={handleJoinTrip} className="text-xs px-4 py-2 rounded-full bg-sage-deep text-white cursor-pointer disabled:opacity-50">
                {joinBusy ? 'Joining...' : 'Join as editor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sharing and collaborator management */}
      {showShareModal && activeTrip && (
        <div className="fixed inset-0 z-[60] bg-ink/40 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-cream border border-line rounded-xl shadow-xl p-5 sm:p-6 w-full max-w-lg max-h-[90dvh] overflow-y-auto space-y-5">
            <div className="flex justify-between items-center border-b border-line pb-3">
              <div className="flex items-center gap-2"><Users className="w-5 h-5" /><h3 className="font-serif text-lg">Trip collaboration</h3></div>
              <button onClick={() => setShowShareModal(false)} className="p-1.5 rounded hover:bg-cream-2 cursor-pointer" aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
            {shareError && <div className="text-xs text-red-700 bg-red-50 p-3 rounded">{shareError}</div>}
            {!activeTrip.sharedId ? (
              <div className="space-y-4">
                <p className="text-sm text-ink-2">Invite friends to edit saved places, daily schedules, flights and stays together. Everyone needs a Travelogue account.</p>
                <button disabled={shareBusy} onClick={handleEnableSharing} className="w-full px-4 py-3 bg-sage-deep text-white text-xs rounded-full disabled:opacity-50 cursor-pointer">
                  {shareBusy ? 'Enabling...' : 'Enable co-editing & generate invite link'}
                </button>
              </div>
            ) : !shareDetails ? (
              <p className="text-xs text-ink-2">{shareBusy ? 'Loading shared trip...' : 'Unable to load sharing details.'}</p>
            ) : (
              <div className="space-y-5">
                <div className="text-xs flex items-center gap-2 text-ink-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Automatic sync • checks for changes every 6 seconds</div>
                {shareDetails.role === 'owner' && (
                  <section className="space-y-2">
                    <p className="font-medium text-sm flex items-center gap-1.5"><Link2 className="w-4 h-4" /> Invitation link</p>
                    <p className="text-xs text-ink-2">Anyone with this link can join as an editor after signing in. Share it only with people you trust.</p>
                    <div className="flex gap-2">
                      <input readOnly aria-label="Invitation link" value={shareLink} onFocus={e => e.target.select()} className={FIELD} />
                      <button onClick={handleCopyShareLink} className="px-3 py-2 bg-sage-deep text-white rounded-full flex gap-1 items-center text-xs cursor-pointer"><Copy className="w-4 h-4" />{linkCopied ? 'Copied' : 'Copy'}</button>
                    </div>
                    <button onClick={() => handleShareAction('regenerate')} disabled={shareBusy} className="text-xs underline text-ink-2 hover:text-ink cursor-pointer disabled:opacity-50">Reset invitation link</button>
                  </section>
                )}
                <section className="space-y-2">
                  <h4 className="font-medium text-sm">Collaborators ({shareDetails.members?.length || 0})</h4>
                  <div className="divide-y border-y border-line">
                    {(shareDetails.members || []).map(member => (
                      <div key={member.id} className="py-3 flex justify-between items-center gap-2">
                        <div className="min-w-0"><p className="text-xs font-medium truncate">{member.name} <span className="text-ink-3">· {member.role}</span></p><p className="text-[11px] text-ink-3 truncate">{member.email}</p></div>
                        {shareDetails.role === 'owner' && member.role === 'editor' && (
                          <button disabled={shareBusy} onClick={() => handleShareAction('remove', { memberId: member.id })} title="Remove editor" className="p-2 text-red-600 cursor-pointer disabled:opacity-50"><UserMinus className="w-4 h-4" /></button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
                <div className="border-t border-line pt-3">
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
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveEditedDates}
            className="bg-cream border border-line rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-xl max-h-[90dvh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="font-serif text-base sm:text-lg font-normal flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-ink" />
                <span>Edit Itinerary Dates</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowEditDatesModal(false)}
                className="text-xs text-ink-3 hover:text-ink cursor-pointer"
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
              <p className="text-[11px] text-ink-3">
                Total Duration: {calculateDaysCount(editDatesForm.startDate, editDatesForm.endDate)} day(s)
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setShowEditDatesModal(false)}
                className="px-4 py-2 border border-line text-ink-2 rounded-full hover:border-sage text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-sage-deep text-white rounded-full text-xs font-medium hover:bg-[#46553a] transition-all cursor-pointer shadow-xs"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Stay / Hotel modal */}
      {showStayModal && activeTrip && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleSetStayForDays}
            className="bg-cream border border-line rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-xl max-h-[90dvh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="font-serif text-base sm:text-lg font-normal flex items-center space-x-2">
                <Hotel className="w-5 h-5 text-amber-600" />
                <span>Add Stay / Hotel</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowStayModal(false)}
                className="text-xs text-ink-3 hover:text-ink cursor-pointer"
              >
                Close
              </button>
            </div>

            {/* Quick Selector from Saved Places */}
            {activeTrip.savedPlaces && activeTrip.savedPlaces.length > 0 && (
              <div className="space-y-1.5 text-xs">
                <label className="block text-xs font-medium text-ink-2">Select from Saved Places</label>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 bg-paper border border-line rounded">
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
                          : 'bg-cream-2 border-line text-ink-2 hover:border-amber-400'
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
                    placeholder="Loading place search…"
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
                <label className={LABEL}>Check-in from (optional)</label>
                <input
                  type="time"
                  value={stayForm.checkIn || ''}
                  onChange={(e) => setStayForm(prev => ({ ...prev, checkIn: e.target.value }))}
                  className={FIELD}
                />
              </div>

              <div>
                <label className={LABEL}>Note / Confirmation Ref</label>
                <input
                  type="text"
                  placeholder="e.g. Booking ref 12345, late arrival arranged"
                  value={stayForm.note}
                  onChange={(e) => setStayForm(prev => ({ ...prev, note: e.target.value }))}
                  className={FIELD}
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setShowStayModal(false)}
                className="px-4 py-2 border border-line text-ink-2 rounded-full hover:border-sage text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-clay text-white rounded-full text-xs font-medium hover:bg-clay-deep transition-all cursor-pointer shadow-xs"
              >
                Save Accommodation
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Stop Modal */}
      {showAddStopModal && activeTrip && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleAddDirectStop}
            className="bg-cream border border-line rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-xl max-h-[90dvh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="font-serif text-base sm:text-lg font-normal flex items-center space-x-2">
                <Plus className="w-5 h-5 text-ink" />
                <span>Add Custom Stop (Day {activeDay || 1})</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddStopModal(false)}
                className="text-xs text-ink-3 hover:text-ink cursor-pointer"
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
                    placeholder="Loading place search…"
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

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setShowAddStopModal(false)}
                className="px-4 py-2 border border-line text-ink-2 rounded-full hover:border-sage text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-sage-deep text-white rounded-full text-xs font-medium hover:bg-[#46553a] transition-all cursor-pointer shadow-xs"
              >
                Add Stop
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Stop Modal */}
      {showEditStopModal && activeTrip && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveEditedStop}
            className="bg-cream border border-line rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-xl max-h-[90dvh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="font-serif text-base sm:text-lg font-normal flex items-center space-x-2">
                <Pen className="w-5 h-5 text-ink" />
                <span>Edit Place in Itinerary (Day {activeDay})</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowEditStopModal(false)}
                className="text-xs text-ink-3 hover:text-ink cursor-pointer"
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
                    placeholder="Loading place search…"
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

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setShowEditStopModal(false)}
                className="px-4 py-2 border border-line text-ink-2 rounded-full hover:border-sage text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-sage-deep text-white rounded-full text-xs font-medium hover:bg-[#46553a] transition-all cursor-pointer shadow-xs"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Flight Modal — flight number and departure date only; airports/times come from the schedule lookup. */}
      {showAddFlightModal && activeTrip && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-cream border border-line rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-xl max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="font-serif text-base sm:text-lg font-normal flex items-center gap-2">
                <Plane className="w-5 h-5 text-sky-600" /> Add Flight
              </h3>
              <button type="button" onClick={() => setShowAddFlightModal(false)}
                className="text-xs text-ink-3 hover:text-ink cursor-pointer">Close</button>
            </div>

            <form onSubmit={handleSearchFlight} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Flight number *</label>
                  <input required type="text" placeholder="e.g. SQ638" value={newFlight.flightNumber}
                    onChange={e => { setNewFlight(prev => ({ ...prev, flightNumber: e.target.value.toUpperCase() })); setFlightMatches([]); setFlightLookupError(''); }}
                    className={FIELD} />
                </div>
                <div>
                  <label className={LABEL}>Departure date *</label>
                  <input required type="date" value={newFlight.date}
                    onChange={e => { setNewFlight(prev => ({ ...prev, date: e.target.value })); setFlightMatches([]); setFlightLookupError(''); }}
                    className={FIELD} />
                </div>
              </div>
              <button type="submit" disabled={flightLookupBusy}
                className="w-full flex justify-center items-center gap-2 rounded-full bg-sky-700 text-white text-xs font-semibold py-2.5 disabled:opacity-50 cursor-pointer">
                {flightLookupBusy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                {flightLookupBusy ? 'Searching schedules…' : 'Find scheduled flight'}
              </button>
            </form>

            {flightLookupError && <p role="alert" className="text-xs text-red-700 rounded bg-red-50 border border-red-200 p-2">{flightLookupError}</p>}

            {flightMatches.length > 0 && (
              <div className="space-y-3">
                <label className={LABEL}>{flightMatches.length > 1 ? 'Several flights match. Select yours.' : 'Scheduled flight found'}</label>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {flightMatches.map((flight, idx) => (
                    <label key={`${flight.scheduledOut}_${flight.originCode}_${idx}`}
                      className={`flex items-start gap-2 p-3 cursor-pointer rounded border text-xs ${selectedFlightIndex === idx ? 'border-sky-600 bg-sky-50' : 'border-line bg-paper'}`}>
                      <input type="radio" name="selectedFlight" className="mt-0.5" checked={selectedFlightIndex === idx}
                        onChange={() => setSelectedFlightIndex(idx)} />
                      <div className="space-y-1 min-w-0">
                        <div className="font-semibold">{flight.originCode} → {flight.destinationCode}</div>
                        <div>{flight.departureAirport} → {flight.arrivalAirport}</div>
                        <div className="text-ink-2">{flight.departureTime || 'Time unavailable'} → {flight.arrivalTime || 'Time unavailable'} (local airport times)</div>
                        <div className="text-ink-2">Departure terminal: {flight.departureTerminal || 'Not published'} · Gate: {flight.departureGate || 'Not assigned'}</div>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>Seat number (optional)</label>
                    <input type="text" placeholder="e.g. 14A" value={newFlight.seatNumber}
                      onChange={e => setNewFlight(prev => ({ ...prev, seatNumber: e.target.value }))} className={FIELD} />
                  </div>
                  <div>
                    <label className={LABEL}>Booking reference (optional)</label>
                    <input type="text" placeholder="e.g. ABC123" value={newFlight.bookingRef}
                      onChange={e => setNewFlight(prev => ({ ...prev, bookingRef: e.target.value }))} className={FIELD} />
                  </div>
                </div>
                <p className="text-[11px] text-ink-3">Terminal and gate depend on airline/airport reporting. Gate details are checked again automatically on flight day while the app is open. Seat and booking reference are visible to trip collaborators.</p>
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <button type="button" onClick={() => setShowAddFlightModal(false)} className="px-4 py-2 border border-line text-ink-2 rounded-full text-xs cursor-pointer">Cancel</button>
              <button type="button" onClick={handleAddFlight} disabled={!flightMatches.length || flightLookupBusy}
                className="px-4 py-2 bg-sky-700 text-white rounded-full text-xs font-medium disabled:opacity-40 cursor-pointer">Add Flight</button>
            </div>
          </div>
        </div>
      )}

      {/* New Place Modal */}
      {showNewPlaceModal && activeTrip && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleCreatePlace}
            className="bg-cream border border-line rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-xl max-h-[90dvh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="font-serif text-base sm:text-lg font-normal flex items-center space-x-2">
                <BookmarkPlus className="w-5 h-5 text-ink" />
                <span>Add Custom Place to Saved</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowNewPlaceModal(false)}
                className="text-xs text-ink-3 hover:text-ink cursor-pointer"
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
                    placeholder="Search for a place…"
                    onPlaceSelected={handleCustomPlaceSelected}
                  />
                ) : (
                  <input
                    type="text"
                    disabled
                    placeholder="Loading place search…"
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

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setShowNewPlaceModal(false)}
                className="px-4 py-2 border border-line text-ink-2 rounded-full hover:border-sage text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-sage-deep text-white rounded-full text-xs font-medium hover:bg-[#46553a] transition-all cursor-pointer shadow-xs"
              >
                Save Place
              </button>
            </div>
          </form>
        </div>
      )}

      {/* New Trip Modal */}
      {showNewTripModal && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleCreateTrip}
            className="bg-cream border border-line rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-xl max-h-[90dvh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="font-serif text-base sm:text-lg font-normal flex items-center space-x-2">
                <Globe className="w-5 h-5 text-ink" />
                <span>Create New Itinerary</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowNewTripModal(false)}
                className="text-xs text-ink-3 hover:text-ink cursor-pointer"
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
                    placeholder="Loading place search…"
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

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setShowNewTripModal(false)}
                className="px-4 py-2 border border-line text-ink-2 rounded-full hover:border-sage text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-sage-deep text-white rounded-full text-xs font-medium hover:bg-[#46553a] transition-all cursor-pointer shadow-xs"
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
