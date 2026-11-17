import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleMap, MarkerF, PolylineF } from '@react-google-maps/api';
import { Plus, Minus, LocateFixed, Maximize2, Layers3, Check, ChevronDown } from 'lucide-react';
import { MAP_OPTIONS, pinForPlace, flightPin, stayPin, shortName, COLORS } from '../theme.js';
import { createWatercolorMapType, setWatercolorOverlay, MAP_MODES, MAP_MODE_STORAGE_KEY, readMapMode, WATERCOLOR_TILE_MAX_ZOOM } from '../lib/watercolorMap.js';
import { getCurvedPath } from '../lib/helpers.js';

const CONTAINER = { width: '100%', height: '100%' };
const MAP_MODE_NAMES = { watercolor: 'Watercolor', street: 'Street Map', satellite: 'Satellite' };
const mapStorage = () => (typeof window === 'undefined' ? null : window.localStorage);
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
  const pinBoxes = placed.map(p => ({ l: p.at.x - 17, r: p.at.x + 17, t: p.at.y - 48, b: p.at.y + 5 }));
  const kept = [];
  const visible = new Set();
  placed.forEach((p, i) => {
    const w = textWidth(p.text);
    // a little wider and taller than the label itself, so near-misses count as collisions
    const box = { l: p.at.x - w / 2 - 5, r: p.at.x + w / 2 + 5, t: p.at.y + 2, b: p.at.y + 28 };
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
  const [mapMode, setMapMode] = useState(() => readMapMode(mapStorage()));
  const [mapMenuOpen, setMapMenuOpen] = useState(false);
  const [tileNotice, setTileNotice] = useState('');
  const mapRef = useRef(null);
  const watercolorLayerRef = useRef(null);
  const failedTileCount = useRef(0);
  const onTileError = useCallback(() => {
    failedTileCount.current += 1;
    // A few isolated missing Stamen tiles should not disable the entire map.
    // If the tile provider is inaccessible (e.g. missing domain authorization),
    // restore a full, navigable Google road map rather than showing empty tiles.
    if (failedTileCount.current >= 3) {
      setTileNotice('Watercolor tiles unavailable. Showing the street map. Configure Stadia Maps domain access to enable watercolor.');
      setMapMode('street');
    }
  }, []);
  const onLoad = useCallback(m => {
    mapRef.current = m;
    failedTileCount.current = 0;
    const g = window.google;
    if (g?.maps) {
      watercolorLayerRef.current = createWatercolorMapType(g, {
        apiKey: import.meta.env.VITE_STADIA_MAPS_API_KEY || '',
        onTileError
      });
    }
    setMap(m);
    const loadedZoom = m.getZoom();
    if (typeof loadedZoom === 'number') setZoomLevel(loadedZoom);
  }, [onTileError]);
  // The map component re-centres whenever it is handed a new `center` object, and callers
  // build that object afresh on every render. Left alone, any re-render after zooming to
  // the day's stops would drag the view back to the trip's centre. So the map only ever
  // gets its starting centre; every later move goes through fit() / panTo().
  const [startCenter] = useState(() => center || { lat: 35.68, lng: 139.76 });
  // Read the zoom from the map itself, both when it changes and whenever it comes to rest.
  const syncZoom = useCallback(() => {
    const z = mapRef.current?.getZoom?.();
    if (typeof z === 'number') setZoomLevel(prev => (prev === z ? prev : z));
  }, []);
  const onUnmount = useCallback(() => {
    setWatercolorOverlay(mapRef.current, watercolorLayerRef.current, false);
    watercolorLayerRef.current = null;
    mapRef.current = null;
    setMap(null);
  }, []);
  const lastFit = useRef('');

  const watercolorVisible = mapMode === 'watercolor' && zoomLevel <= WATERCOLOR_TILE_MAX_ZOOM;
  const detailedZoom = mapMode === 'watercolor' && zoomLevel > WATERCOLOR_TILE_MAX_ZOOM;
  // Never suppress Google's default airport runways, taxiways, POIs, street names,
  // transit or road geometry. The custom artwork is transparent on TOP of them.
  const mapOptions = useMemo(() => ({ ...MAP_OPTIONS, styles: [] }), []);

  useEffect(() => {
    if (!map) return;
    const nextType = mapMode === 'satellite' ? 'satellite' : 'roadmap';
    if (map.getMapTypeId() !== nextType) map.setMapTypeId(nextType);
    setWatercolorOverlay(map, watercolorLayerRef.current, watercolorVisible);
    return () => setWatercolorOverlay(map, watercolorLayerRef.current, false);
  }, [map, mapMode, watercolorVisible]);

  useEffect(() => {
    const sync = event => {
      if (event.type === 'storage' && event.key !== MAP_MODE_STORAGE_KEY) return;
      const selected = event.type === 'storage' ? readMapMode(mapStorage()) : event.detail?.mode;
      if (MAP_MODES.includes(selected)) {
        setMapMode(selected);
        setTileNotice('');
        failedTileCount.current = 0;
      }
    };
    window.addEventListener('storage', sync);
    window.addEventListener('tl-map-mode-changed', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('tl-map-mode-changed', sync);
    };
  }, []);

  const chooseMapMode = useCallback(mode => {
    if (!MAP_MODES.includes(mode)) return;
    setMapMode(mode);
    setMapMenuOpen(false);
    setTileNotice('');
    failedTileCount.current = 0;
    try { window.localStorage.setItem(MAP_MODE_STORAGE_KEY, mode); } catch { /* private browsing */ }
    window.dispatchEvent(new CustomEvent('tl-map-mode-changed', { detail: { mode } }));
  }, []);

  // The same stay is usually pinned to several nights; draw it once. And when the hotel
  // is also a stop that day, the stop's pin already marks it.
  const uniqueStays = useMemo(() => {
    const spot = o => `${Number(o.lat).toFixed(4)}|${Number(o.lng).toFixed(4)}`;
    const seen = new Set(stops.filter(s => !s.isFlight && hasCoords(s)).map(spot));
    return stays.filter(s => {
      if (!hasCoords(s)) return false;
      return seen.has(spot(s)) ? false : seen.add(spot(s));
    });
  }, [stays, stops]);

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
    <div className={`${/\babsolute\b/.test(className) ? '' : 'relative'} overflow-hidden bg-[#e7eee9] ${className}`} style={{ minHeight: 160 }}>
      {loadError ? (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-ink-3 p-4 text-center">The map could not be loaded. Check your connection and reload the page.</div>
      ) : !isLoaded ? (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-ink-3">Loading map…</div>
      ) : (
        <div className="absolute inset-0">
          <GoogleMap mapContainerStyle={CONTAINER} center={startCenter} zoom={zoom} options={mapOptions} onLoad={onLoad} onUnmount={onUnmount} onZoomChanged={syncZoom} onIdle={syncZoom}>
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

      {/* Decorative Japanese travel-journal art is anchored to the viewport,
          not falsely georeferenced to a particular country. It never takes
          pointer events, so dragging, zooming and clicking remain functional. */}
      {isLoaded && !loadError && watercolorVisible && (
        <div className={`tl-watercolor-art ${zoomLevel >= 11 ? 'tl-watercolor-art--detail' : ''}`} aria-hidden="true">
          <img className="tl-watercolor-sakura" src="/map-art/sakura.svg" alt="" />
          <img className="tl-watercolor-bamboo" src="/map-art/bamboo.svg" alt="" />
          <img className="tl-watercolor-cloud" src="/map-art/clouds.svg" alt="" />
        </div>
      )}

      {controls && isLoaded && !loadError && (
        <div className="absolute left-2.5 top-2.5 z-20 max-w-[calc(100%-5rem)]">
          <button
            type="button"
            onClick={() => setMapMenuOpen(value => !value)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#d9cbb7] bg-[#fff9ee]/95 px-3 text-[11px] font-semibold text-[#554935] shadow-md backdrop-blur-sm cursor-pointer"
            aria-label="Choose map style" aria-haspopup="true" aria-expanded={mapMenuOpen}
            title="Map appearance"
          >
            <Layers3 className="h-4 w-4 text-[#a96a3f]" />
            <span>{MAP_MODE_NAMES[mapMode]}</span>
            <ChevronDown className="h-3 w-3" />
          </button>
          {mapMenuOpen && (
            <div className="mt-1.5 w-36 rounded-xl border border-[#d9cbb7] bg-[#fffaf0] p-1 shadow-lg">
              {MAP_MODES.map(mode => (
                <button
                  type="button" key={mode} onClick={() => chooseMapMode(mode)}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[12px] text-[#554935] hover:bg-[#f1e8d6] cursor-pointer"
                  aria-pressed={mapMode === mode}
                >
                  {MAP_MODE_NAMES[mode]}
                  {mapMode === mode && <Check className="h-3.5 w-3.5 text-[#61764b]" />}
                </button>
              ))}
            </div>
          )}
          {detailedZoom && <p className="mt-1 max-w-44 rounded-lg bg-[#fff9ee]/90 px-2 py-1 text-[10px] text-[#695943] shadow-sm">Full Google map detail at close zoom</p>}
        </div>
      )}
      {tileNotice && isLoaded && !loadError && (
        <div className="absolute bottom-11 left-2.5 z-10 max-w-[calc(100%-5rem)] rounded-lg bg-[#fff9ee]/95 px-2.5 py-1.5 text-[10px] text-[#74512c] shadow-sm" role="status">
          {tileNotice}
        </div>
      )}
      {isLoaded && !loadError && watercolorVisible && (
        <div className="tl-watercolor-attribution">
          © <a href="https://stadiamaps.com/attribution/" target="_blank" rel="noopener noreferrer">Stadia Maps</a>
          {' · '}<a href="https://stamen.com/" target="_blank" rel="noopener noreferrer">Stamen Design</a>
          {' · '}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>
        </div>
      )}

      {controls && isLoaded && !loadError && (
        <div className="absolute right-2.5 bottom-2.5 z-20 flex flex-col gap-1.5">
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
