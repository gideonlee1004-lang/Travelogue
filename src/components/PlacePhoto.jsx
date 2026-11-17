import React, { useEffect, useState } from 'react';
import { gradientFor, categoryMeta } from '../theme.js';

// Photo resolution for saved places / stops / stays.
// 1. place.photoUrl (saved at creation time)
// 2. Google Places photo looked up by place id (googleId / placeId)
// 3. Google Places text search by name near its coordinates
// 4. soft gradient with the category icon
const photoCache = new Map(); // key -> url | null
const inflight = new Map();

function keyFor(place) {
  if (!place) return '';
  return place.googleId || place.placeId || `${place.name || ''}|${Number(place.lat).toFixed(4)}|${Number(place.lng).toFixed(4)}`;
}

export async function resolvePlacePhoto(place, maxWidth = 900) {
  if (!place) return null;
  if (place.photoUrl) return place.photoUrl;
  const key = keyFor(place);
  if (!key) return null;
  if (photoCache.has(key)) return photoCache.get(key);
  if (inflight.has(key)) return inflight.get(key);
  if (!window.google?.maps?.importLibrary) return null;

  const task = (async () => {
    try {
      const { Place } = await window.google.maps.importLibrary('places');
      let photos = null;
      const id = place.googleId || place.placeId;
      if (id) {
        try {
          const p = new Place({ id });
          await p.fetchFields({ fields: ['photos'] });
          photos = p.photos;
        } catch { photos = null; }
      }
      if ((!photos || !photos.length) && place.name) {
        const request = {
          textQuery: place.name,
          fields: ['id', 'photos', 'displayName'],
          maxResultCount: 1,
          ...(place.lat != null && place.lng != null
            ? { locationBias: { center: { lat: Number(place.lat), lng: Number(place.lng) }, radius: 1500 } }
            : {})
        };
        const { places } = await Place.searchByText(request);
        photos = places?.[0]?.photos || null;
      }
      const url = photos?.[0]?.getURI ? photos[0].getURI({ maxWidth }) : null;
      photoCache.set(key, url || null);
      return url || null;
    } catch {
      photoCache.set(key, null);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, task);
  return task;
}

export function usePlacePhoto(place, enabled = true) {
  const [url, setUrl] = useState(place?.photoUrl || photoCache.get(keyFor(place)) || null);
  const k = keyFor(place);
  useEffect(() => {
    let active = true;
    if (place?.photoUrl) { setUrl(place.photoUrl); return; }
    const cached = photoCache.get(k);
    if (cached !== undefined) { setUrl(cached); return; }
    if (!enabled) return;
    resolvePlacePhoto(place).then(u => { if (active) setUrl(u); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, place?.photoUrl, enabled]);
  return url;
}

export function PlacePhoto({ place, className = '', alt, rounded = 'rounded-xl', enabled = true, children, overlay = false }) {
  const url = usePlacePhoto(place, enabled);
  const meta = categoryMeta(place?.category);
  const Icon = meta.Icon;
  return (
    <div className={`relative overflow-hidden ${rounded} ${className}`} style={!url ? { background: gradientFor(place?.name || '') } : undefined}>
      {url ? (
        <img src={url} alt={alt || place?.name || ''} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white/80">
          <Icon className="w-8 h-8" strokeWidth={1.5} />
        </div>
      )}
      {overlay && <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />}
      {children}
    </div>
  );
}

// First photo across a trip's saved places, stops and stays. Used for covers.
export function useTripCover(trip) {
  const candidates = React.useMemo(() => {
    if (!trip) return [];
    const list = [];
    (trip.savedPlaces || []).forEach(p => list.push(p));
    Object.values(trip.schedule || {}).forEach(stops => (stops || []).forEach(s => { if (!s.isFlight) list.push(s); }));
    Object.values(trip.staysByDay || {}).forEach(s => list.push(s));
    return list.slice(0, 6);
  }, [trip]);
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let active = true;
    (async () => {
      for (const c of candidates) {
        const u = await resolvePlacePhoto(c, 1200);
        if (!active) return;
        if (u) { setUrl(u); return; }
      }
      // Fall back to a photo of the destination itself.
      if (trip?.name) {
        const u = await resolvePlacePhoto({ name: trip.name, lat: trip.center?.[0], lng: trip.center?.[1] }, 1200);
        if (active) setUrl(u || null);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id, candidates.length]);
  return url;
}

export function CoverImage({ trip, className = '', rounded = 'rounded-xl', children, overlay = true }) {
  const url = useTripCover(trip);
  return (
    <div className={`relative overflow-hidden ${rounded} ${className}`} style={!url ? { background: gradientFor(trip?.name || 'trip') } : undefined}>
      {url && <img src={url} alt={trip?.name || ''} className="absolute inset-0 w-full h-full object-cover" />}
      {overlay && <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />}
      {children}
    </div>
  );
}
