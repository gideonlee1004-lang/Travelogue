import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleMap, MarkerF, PolylineF } from '@react-google-maps/api';
import { Plus, Minus, LocateFixed, Maximize2 } from 'lucide-react';
import { MAP_OPTIONS, pinForPlace, flightPin, stayPin, shortName, COLORS } from '../theme.js';
import { getCurvedPath } from '../lib/helpers.js';

const CONTAINER = { width: '100%', height: '100%' };
const hasCoords = o => o && o.lat != null && o.lng != null && !Number.isNaN(Number(o.lat)) && !Number.isNaN(Number(o.lng));
const ll = o => ({ lat: Number(o.lat), lng: Number(o.lng) });

const DASH = { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 };
const ROAD_CASING = { strokeColor: '#fffdf8', strokeOpacity: 0.95, strokeWeight: 7, zIndex: 1 };
const roadLine = { strokeOpacity: 0, zIndex: 2, icons: [{ icon: { ...DASH, strokeColor: COLORS.sageDeep }, offset: '0', repeat: '12px' }] };
const straightLine = { strokeOpacity: 0, zIndex: 2, icons: [{ icon: { ...DASH, strokeColor: COLORS.sage, strokeOpacity: 0.75 }, offset: '0', repeat: '16px' }] };
// --- Which name labels fit? ---
// Stops in a city are often a few hundred metres apart, so their names would pile up.
// Work out where each pin lands on screen at the current zoom and keep a label only
// if it is clear of the labels already kept and of the other pins.
const toPixels = (p, zoomLevel) => {
  const scale = 256 * 2 ** zoomLevel;
  const sin = Math.min(0.9999, Math.max(-0.9999, Math.sin((p.lat * Math.PI) / 180)));
  return { x: ((p.lng + 180) / 360) * scale, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale };
};
const textWidth = text => [...text].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e7f ? 11.5 : 6.4), 16);
const overlaps = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

function fittingLabels(items, zoomLevel) {
  const placed = items.map(it => ({ ...it, at: toPixels(it.position, zoomLevel) }));
  const pinBoxes = placed.map(p => ({ l: p.at.x - 15, r: p.at.x + 15, t: p.at.y - 46, b: p.at.y + 4 }));
  const kept = [];
  const visible = new Set();
  placed.forEach((p, i) => {
    const w = textWidth(p.text);
    const box = { l: p.at.x - w / 2, r: p.at.x + w / 2, t: p.at.y + 5, b: p.at.y + 25 };
    if (kept.some(k => overlaps(k, box))) return;
    if (pinBoxes.some((pin, j) => j !== i && overlaps(pin, box))) return;
    kept.push(box);
    visible.add(p.key);
  });
  return visible;
}

const flightLine = { strokeOpacity: 0, zIndex: 2, icons: [{ icon: { ...DASH, strokeColor: '#4f6d8a' }, offset: '0', repeat: '15px' }] };

/**
 * Styled map used across pages.
 *  places   – saved places (icon pins)
 *  stops    – itinerary stops in order; flights are drawn as arcs
 *  stays    – stays (bed pins)
 *  segments – [{ path, road }] route pieces between stops. When omitted and `route`
 *             is true, stops are joined with straight dashed lines.
 *  numbered – show each stop's order on its pin
 *  labels   – show each stop's name under its pin
 *  focus    – 'all' zooms to everything; 'ground' zooms to stops and stays and lets flights run off the edge
 */
export function TripMap({
  isLoaded, loadError, center, zoom = 11,
  places = [], stops = [], stays = [], route = true, segments = null,
  numbered = false, labels = false, focus = 'all',
  fitKey, padding = null, className = '', controls = true, onExpand, onMarkerClick,
  highlightId = null
}) {
  const [map, setMap] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(zoom);
  const mapRef = useRef(null);
  const onLoad = useCallback(m => { mapRef.current = m; setMap(m); }, []);
  const onZoomChanged = useCallback(() => {
    const z = mapRef.current?.getZoom?.();
    if (typeof z === 'number') setZoomLevel(z);
  }, []);
  const onUnmount = useCallback(() => setMap(null), []);
  const lastFit = useRef('');

  // The same stay is usually pinned to several nights; draw it once.
  const uniqueStays = useMemo(() => {
    const seen = new Set();
    return stays.filter(s => {
      if (!hasCoords(s)) return false;
      const key = `${s.name}|${Number(s.lat).toFixed(5)}|${Number(s.lng).toFixed(5)}`;
      return seen.has(key) ? false : seen.add(key);
    });
  }, [stays]);

  // What the map zooms to. With focus="ground", a flight does not drag the view out to
  // another continent: the map stays on the day's stops and the arc runs off the edge.
  const points = useMemo(() => {
    const ground = [];
    stops.forEach(s => { if (!s.isFlight && hasCoords(s)) ground.push(ll(s)); });
    places.forEach(p => { if (hasCoords(p)) ground.push(ll(p)); });
    uniqueStays.forEach(s => ground.push(ll(s)));
    const airports = [];
    stops.forEach(s => {
      if (!s.isFlight) return;
      if (hasCoords({ lat: s.departureLat, lng: s.departureLng })) airports.push({ lat: Number(s.departureLat), lng: Number(s.departureLng) });
      if (hasCoords({ lat: s.arrivalLat, lng: s.arrivalLng })) airports.push({ lat: Number(s.arrivalLat), lng: Number(s.arrivalLng) });
    });
    return focus === 'ground' && ground.length ? ground : [...ground, ...airports];
  }, [places, stops, uniqueStays, focus]);

  // Pins stand ~50px above their spot and names hang below it, so the view needs more
  // room at the top than at the sides, and the controls need room on the right.
  const pad = useMemo(() => padding || { top: 58, right: controls ? 54 : 28, bottom: labels ? 30 : 22, left: 28 }, [padding, controls, labels]);

  const fit = useCallback(() => {
    if (!map) return;
    if (points.length > 1) {
      const b = new window.google.maps.LatLngBounds();
      points.forEach(p => b.extend(p));
      map.fitBounds(b, pad);
    } else if (points.length === 1) {
      map.panTo(points[0]); map.setZoom(14);
    } else if (center) {
      map.panTo(center); map.setZoom(zoom);
    }
  }, [map, points, center, zoom, pad]);

  useEffect(() => {
    if (!map) return;
    const key = `${fitKey || ''}|${points.map(p => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join(';')}`;
    if (lastFit.current === key) return;
    lastFit.current = key;
    fit();
  }, [map, points, fitKey, fit]);

  const lines = useMemo(() => {
    if (segments) return segments.filter(s => s?.path?.length > 1);
    if (!route) return [];
    const pts = stops.filter(s => !s.isFlight && hasCoords(s)).map(ll);
    return pts.slice(1).map((p, i) => ({ path: [pts[i], p], road: false }));
  }, [segments, stops, route]);

  // Stops first (in visiting order), then stays: earlier entries win a contested spot.
  const shownLabels = useMemo(() => {
    if (!labels) return new Set();
    const items = [];
    stops.forEach((s, i) => { if (!s.isFlight && hasCoords(s)) items.push({ key: s.id || `s_${i}`, position: ll(s), text: shortName(s.name) }); });
    uniqueStays.forEach((s, i) => items.push({ key: `stay_${i}_${s.name}`, position: ll(s), text: shortName(s.name) }));
    return fittingLabels(items, zoomLevel);
  }, [labels, stops, uniqueStays, zoomLevel]);

  const zoomBy = d => { if (map) map.setZoom((map.getZoom() || zoom) + d); };

  let order = 0;
  return (
    <div className={`${/\babsolute\b/.test(className) ? '' : 'relative'} overflow-hidden bg-[#f1ead9] ${className}`} style={{ minHeight: 160 }}>
      {loadError ? (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-ink-3 p-4 text-center">The map could not be loaded. Check your connection and reload the page.</div>
      ) : !isLoaded ? (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-ink-3">Loading map…</div>
      ) : (
        <div className="absolute inset-0">
          <GoogleMap mapContainerStyle={CONTAINER} center={center || { lat: 35.68, lng: 139.76 }} zoom={zoom} options={MAP_OPTIONS} onLoad={onLoad} onUnmount={onUnmount} onZoomChanged={onZoomChanged}>
            {lines.map((seg, i) => (
              <React.Fragment key={`seg_${i}_${seg.road ? 'r' : 's'}_${seg.path.length}`}>
                {seg.road && <PolylineF path={seg.path} options={ROAD_CASING} />}
                <PolylineF path={seg.path} options={seg.road ? roadLine : straightLine} />
              </React.Fragment>
            ))}

            {places.map((p, i) => {
              if (!hasCoords(p)) return null;
              const active = highlightId === p.id;
              const pin = pinForPlace(p, { size: active ? 46 : 36 });
              return <MarkerF key={p.id || `p_${i}`} position={ll(p)} icon={pin.icon} title={p.name} zIndex={active ? 50 : 10}
                onClick={onMarkerClick ? () => onMarkerClick(p) : undefined} />;
            })}

            {stops.map((s, i) => {
              if (s.isFlight) {
                const dep = { lat: s.departureLat ?? s.lat, lng: s.departureLng ?? s.lng };
                const arr = { lat: s.arrivalLat, lng: s.arrivalLng };
                if (!hasCoords(dep) || !hasCoords(arr)) return null;
                const path = getCurvedPath(dep, arr);
                const mid = path[Math.floor(path.length / 2)];
                return (
                  <React.Fragment key={s.id || `f_${i}`}>
                    <PolylineF path={path} options={flightLine} />
                    <MarkerF position={mid} icon={flightPin().icon} title={s.name} zIndex={20} />
                  </React.Fragment>
                );
              }
              if (!hasCoords(s)) return null;
              order += 1;
              const key = s.id || `s_${i}`;
              const pin = pinForPlace(s, { size: 38, badge: numbered ? order : '', label: shownLabels.has(key) ? shortName(s.name) : '' });
              return <MarkerF key={key} position={ll(s)} icon={pin.icon} label={pin.label} title={s.name} zIndex={30 + order}
                onClick={onMarkerClick ? () => onMarkerClick(s) : undefined} />;
            })}

            {uniqueStays.map((s, i) => {
              const key = `stay_${i}_${s.name}`;
              const pin = stayPin({ label: shownLabels.has(key) ? shortName(s.name) : '' });
              return <MarkerF key={key} position={ll(s)} icon={pin.icon} label={pin.label} title={`Stay: ${s.name}`} zIndex={25} />;
            })}
          </GoogleMap>
        </div>
      )}

      {controls && isLoaded && !loadError && (
        <div className="absolute right-2.5 bottom-2.5 flex flex-col gap-1.5">
          {onExpand && (
            <button onClick={onExpand} className="w-9 h-9 rounded-lg bg-paper/95 border border-line shadow-sm flex items-center justify-center text-ink-2 hover:text-ink cursor-pointer" title="Open larger map" aria-label="Open larger map">
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={fit} className="w-9 h-9 rounded-lg bg-paper/95 border border-line shadow-sm flex items-center justify-center text-ink-2 hover:text-ink cursor-pointer" title="Show everything" aria-label="Show everything">
            <LocateFixed className="w-4 h-4" />
          </button>
          <div className="rounded-lg bg-paper/95 border border-line shadow-sm overflow-hidden">
            <button onClick={() => zoomBy(1)} className="w-9 h-9 flex items-center justify-center text-ink-2 hover:text-ink border-b border-line cursor-pointer" aria-label="Zoom in"><Plus className="w-4 h-4" /></button>
            <button onClick={() => zoomBy(-1)} className="w-9 h-9 flex items-center justify-center text-ink-2 hover:text-ink cursor-pointer" aria-label="Zoom out"><Minus className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
