import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleMap, MarkerF, PolylineF } from '@react-google-maps/api';
import { Plus, Minus, LocateFixed, Maximize2 } from 'lucide-react';
import { MAP_OPTIONS, pinForPlace, pinForStop, STAY_PIN, COLORS, makePin } from '../theme.js';
import { fetchTravel, TRAVEL_MODES } from '../lib/helpers.js';
import { decodeRoutePolyline } from '../lib/routePolyline.js';

const CONTAINER = { width: '100%', height: '100%' };

function getCurvedPath(dep, arr, numPoints = 50) {
  const lat1 = Number(dep.lat), lng1 = Number(dep.lng), lat2 = Number(arr.lat), lng2 = Number(arr.lng);
  const midLat = (lat1 + lat2) / 2, midLng = (lng1 + lng2) / 2;
  const dx = lng2 - lng1, dy = lat2 - lat1;
  const controlLat = midLat - dx * 0.25, controlLng = midLng + dy * 0.25;
  const pts = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    pts.push({
      lat: (1 - t) * (1 - t) * lat1 + 2 * (1 - t) * t * controlLat + t * t * lat2,
      lng: (1 - t) * (1 - t) * lng1 + 2 * (1 - t) * t * controlLng + t * t * lng2
    });
  }
  return pts;
}

const hasCoords = o => o && o.lat != null && o.lng != null && !Number.isNaN(Number(o.lat));
const ll = o => ({ lat: Number(o.lat), lng: Number(o.lng) });

/**
 * Styled map used across pages.
 *  places  – saved places (category pins)
 *  stops   – itinerary stops in order (numbered pins + dashed route)
 *  stays   – stays (bed pins)
 *  route   – draw dashed line through stops (default true when stops given)
 */
export function TripMap({
  isLoaded, loadError, center, zoom = 11,
  places = [], stops = [], stays = [], route = true, routePath = null,
  roadRouting = false, routeGroups = null,
  fitKey, padding = 48, className = '', controls = true, onExpand, onMarkerClick,
  highlightId = null
}) {
  const [map, setMap] = useState(null);
  const mapOptions = useMemo(() => ({
    ...MAP_OPTIONS,
    gestureHandling: typeof window !== 'undefined' && window.matchMedia?.('(max-width: 1023px)').matches ? 'cooperative' : MAP_OPTIONS.gestureHandling
  }), []);
  const onLoad = useCallback(m => setMap(m), []);
  const onUnmount = useCallback(() => setMap(null), []);
  const lastFit = useRef('');

  const points = useMemo(() => {
    const pts = [];
    stops.forEach(s => {
      if (s.isFlight) {
        if (hasCoords({ lat: s.departureLat, lng: s.departureLng })) pts.push({ lat: Number(s.departureLat), lng: Number(s.departureLng) });
        if (hasCoords({ lat: s.arrivalLat, lng: s.arrivalLng })) pts.push({ lat: Number(s.arrivalLat), lng: Number(s.arrivalLng) });
      } else if (hasCoords(s)) pts.push(ll(s));
    });
    places.forEach(p => { if (hasCoords(p)) pts.push(ll(p)); });
    stays.forEach(s => { if (hasCoords(s)) pts.push(ll(s)); });
    return pts;
  }, [places, stops, stays]);

  useEffect(() => {
    if (!map) return;
    const key = `${fitKey || ''}|${points.map(p => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join(';')}`;
    if (lastFit.current === key) return;
    lastFit.current = key;
    if (points.length > 1) {
      const b = new window.google.maps.LatLngBounds();
      points.forEach(p => b.extend(p));
      map.fitBounds(b, { top: padding, right: padding, bottom: padding, left: padding });
    } else if (points.length === 1) {
      map.panTo(points[0]); map.setZoom(14);
    } else if (center) {
      map.panTo(center); map.setZoom(zoom);
    }
  }, [map, points, fitKey, center, zoom, padding]);

  const routeLine = useMemo(() => {
    if (roadRouting) return null;
    if (routePath) return routePath;
    if (!route) return null;
    const pts = stops.filter(s => !s.isFlight && hasCoords(s)).map(ll);
    return pts.length > 1 ? pts : null;
  }, [stops, route, routePath, roadRouting]);

  // Road geometry is fetched for adjacent stops only. Flights and day boundaries
  // break a road route; no phantom road segment is drawn through an airport flight.
  const roadSignature = JSON.stringify((roadRouting ? (routeGroups || [stops]) : []).map(group =>
    group.map(p => p?.isFlight ? null : hasCoords(p) ? ll(p) : null)
  ));
  const [roadPaths, setRoadPaths] = useState([]);
  const [roadStatus, setRoadStatus] = useState('idle');
  useEffect(() => {
    if (!roadRouting || !isLoaded || loadError) { setRoadPaths([]); setRoadStatus('idle'); return; }
    const groups = JSON.parse(roadSignature);
    const pairs = groups.flatMap(group => group.slice(1).map((to, i) => [group[i], to])
      .filter(([from, to]) => from && to && (from.lat !== to.lat || from.lng !== to.lng)));
    if (!pairs.length) { setRoadPaths([]); setRoadStatus('idle'); return; }
    let cancelled = false;
    setRoadStatus('loading');
    setRoadPaths([]);
    Promise.all(pairs.map(async ([from, to]) => {
      const result = await fetchTravel(from, to, TRAVEL_MODES[2]);
      return decodeRoutePolyline(result?.encodedPolyline);
    })).then(paths => {
      if (cancelled) return;
      setRoadPaths(paths.filter(path => path.length >= 2));
      setRoadStatus(paths.some(path => path.length >= 2) ? 'ready' : 'unavailable');
    }).catch(() => { if (!cancelled) { setRoadPaths([]); setRoadStatus('unavailable'); } });
    return () => { cancelled = true; };
  }, [roadRouting, roadSignature, isLoaded, loadError]);

  const zoomBy = d => { if (map) map.setZoom((map.getZoom() || zoom) + d); };
  const recenter = () => { lastFit.current = ''; setMap(m => m); if (map && points.length) { const b = new window.google.maps.LatLngBounds(); points.forEach(p => b.extend(p)); points.length > 1 ? map.fitBounds(b, { top: padding, right: padding, bottom: padding, left: padding }) : (map.panTo(points[0]), map.setZoom(14)); } };

  return (
    <div className={`${/\babsolute\b/.test(className) ? '' : 'relative'} overflow-hidden bg-[#f1ead9] ${className}`} style={{ minHeight: 160 }}>
      {loadError ? (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-red-600 p-4">Map could not load.</div>
      ) : !isLoaded ? (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-ink-3">Loading map…</div>
      ) : (
        <div className="absolute inset-0">
        <GoogleMap mapContainerStyle={CONTAINER} center={center || { lat: 35.68, lng: 139.76 }} zoom={zoom} options={mapOptions} onLoad={onLoad} onUnmount={onUnmount}>
          {roadRouting && roadPaths.map((path, i) => (
            <PolylineF key={`road_${i}`} path={path} options={{ strokeColor: COLORS.sageDeep, strokeWeight: 4, strokeOpacity: 0.9, zIndex: 1 }} />
          ))}
          {routeLine && (
            <PolylineF path={routeLine} options={{
              strokeOpacity: 0, strokeWeight: 3,
              icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor: COLORS.sageDeep, scale: 3 }, offset: '0', repeat: '14px' }]
            }} />
          )}
          {routeLine && routeLine.map((p, i) => (
            <MarkerF key={`dot_${i}`} position={p} icon={{
              path: window.google.maps.SymbolPath.CIRCLE, scale: 4, fillColor: '#fffdf8', fillOpacity: 1, strokeColor: COLORS.sageDeep, strokeWeight: 2
            }} zIndex={1} />
          ))}

          {places.map((p, i) => hasCoords(p) ? (
            <MarkerF key={p.id || `p_${i}`} position={ll(p)} icon={pinForPlace(p, { size: highlightId === p.id ? 48 : 38 })}
              title={p.name} zIndex={highlightId === p.id ? 50 : 10} onClick={onMarkerClick ? () => onMarkerClick(p) : undefined} />
          ) : null)}

          {stops.map((s, i) => {
            if (s.isFlight) {
              const dep = { lat: s.departureLat ?? s.lat, lng: s.departureLng ?? s.lng };
              const arr = { lat: s.arrivalLat, lng: s.arrivalLng };
              if (!hasCoords(dep) || !hasCoords(arr)) return null;
              const path = getCurvedPath(dep, arr);
              const mid = path[Math.floor(path.length / 2)];
              return (
                <React.Fragment key={s.id || `f_${i}`}>
                  <PolylineF path={path} options={{ strokeOpacity: 0, strokeWeight: 2, icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: '#4f6d8a', scale: 3 }, offset: '0', repeat: '15px' }] }} />
                  <MarkerF position={mid} icon={makePin({ color: '#4f6d8a', glyph: 'plane', size: 36 })} title={s.name} zIndex={20} />
                </React.Fragment>
              );
            }
            if (!hasCoords(s)) return null;
            return <MarkerF key={s.id || `s_${i}`} position={ll(s)} icon={pinForStop(s, i)} title={s.name} zIndex={30}
              onClick={onMarkerClick ? () => onMarkerClick(s) : undefined} />;
          })}

          {stays.map((s, i) => hasCoords(s) ? (
            <MarkerF key={s.id || `stay_${i}`} position={ll(s)} icon={STAY_PIN()} title={`Stay: ${s.name}`} zIndex={25} />
          ) : null)}
        </GoogleMap>
        </div>
      )}

      {roadRouting && roadStatus === 'unavailable' && (
        <div className="absolute bottom-3 left-3 z-10 rounded-lg border border-line bg-paper/95 px-2.5 py-1.5 text-[11px] text-ink-2 shadow-sm">Road directions unavailable</div>
      )}
      {controls && isLoaded && !loadError && (
        <div className="absolute right-3 bottom-3 flex flex-col gap-1.5">
          {onExpand && (
            <button onClick={onExpand} className="w-9 h-9 rounded-lg bg-paper/95 border border-line shadow-sm flex items-center justify-center text-ink-2 hover:text-ink cursor-pointer" title="Expand">
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={recenter} className="w-9 h-9 rounded-lg bg-paper/95 border border-line shadow-sm flex items-center justify-center text-ink-2 hover:text-ink cursor-pointer" title="Recenter">
            <LocateFixed className="w-4 h-4" />
          </button>
          <div className="rounded-lg bg-paper/95 border border-line shadow-sm overflow-hidden">
            <button onClick={() => zoomBy(1)} className="w-9 h-9 flex items-center justify-center text-ink-2 hover:text-ink border-b border-line cursor-pointer"><Plus className="w-4 h-4" /></button>
            <button onClick={() => zoomBy(-1)} className="w-9 h-9 flex items-center justify-center text-ink-2 hover:text-ink cursor-pointer"><Minus className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
