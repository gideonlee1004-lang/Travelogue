import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays, Users, Route as RouteIcon, ListChecks, BedDouble, Wallet, StickyNote, Sparkles, Wand2, Plus, ChevronLeft, ChevronRight,
  MoreHorizontal, Plane, Car, MapPin, Clock, Pen, Trash2, ArrowUp, ArrowDown, Map as MapIcon,
  Share2, Calendar, AlertTriangle, RefreshCw, GitBranch, Landmark, Utensils, Trees, Check, X
} from 'lucide-react';
import { HeroArt, Card, Btn, EmptyNote, IconBadge, Chip } from '../components/Shell.jsx';
import { PlacePhoto, CoverImage } from '../components/PlacePhoto.jsx';
import { TripMap } from '../components/TripMap.jsx';
import { cityOf, shortName } from '../theme.js';
import {
  formatRange, formatDayDate, getDayDateString, getDepartureDate, checkIsClosed, useLegTravel, useRoutePaths, formatDuration, formatDistance,
  getGroupedStays, sortStopsByTime, TRAVEL_MODES, modeByKey
} from '../lib/helpers.js';

const TABS = [
  { key: 'plan', label: 'Plan', Icon: ListChecks },
  { key: 'route', label: 'Route', Icon: RouteIcon },
  { key: 'stays', label: 'Stays', Icon: BedDouble },
  { key: 'budget', label: 'Budget', Icon: Wallet },
  { key: 'notes', label: 'Notes', Icon: StickyNote }
];

const DURATIONS = [30, 45, 60, 90, 120, 180, 240];
const ROUTE_MODE_KEY = 'tl_route_mode';

const hasPoint = s => s && s.lat != null && s.lng != null && !Number.isNaN(Number(s.lat)) && !Number.isNaN(Number(s.lng));
const point = s => ({ lat: Number(s.lat), lng: Number(s.lng) });
const sameStay = (a, b) => !!a && !!b && a.name === b.name && (a.address || '') === (b.address || '');

function stopKind(stop) {
  if (stop.isFlight) return { label: 'Flight', Icon: Plane };
  const t = (stop.types || []).join(' ');
  if (/restaurant|food|cafe|bakery|bar|market/.test(t) || stop.category === 'Food & Eats') return { label: 'Food & Local Dining', Icon: Utensils };
  if (/lodging|hotel/.test(t) || stop.category === 'Stays/Hotel') return { label: 'Stay', Icon: BedDouble };
  if (/park|garden|nature|mountain|beach|observation/.test(t)) return { label: 'Nature & Views', Icon: Trees };
  return { label: 'Sightseeing', Icon: Landmark };
}

function dayTitle(trip, day) {
  const stops = sortStopsByTime(trip.schedule?.[day] || []).filter(s => !s.isFlight);
  const flights = (trip.schedule?.[day] || []).filter(s => s.isFlight);
  const city = stops.map(cityOf).find(Boolean) || trip.japaneseSub || trip.name;
  if (day === 1 && flights.length) return `${city} Arrival & Highlights`;
  if (day === trip.daysCount && flights.length) return `Departure from ${city}`;
  if (!stops.length && !flights.length) return 'Free day';
  const kinds = stops.map(s => stopKind(s).label);
  const food = kinds.filter(k => k.startsWith('Food')).length, nature = kinds.filter(k => k.startsWith('Nature')).length;
  if (nature >= 2) return `${city} Nature & Culture`;
  if (food >= 2) return `${city} Food & Discovery`;
  return `${city} Discovery`;
}

// The legs worth routing: consecutive non-flight stops that both have coordinates.
function legsFor(stops, dateStr) {
  const legs = [];
  stops.forEach((stop, i) => {
    const prev = i > 0 ? stops[i - 1] : null;
    if (prev && !prev.isFlight && !stop.isFlight && hasPoint(prev) && hasPoint(stop)) {
      const from = point(prev), to = point(stop);
      legs.push({ index: i, key: `${from.lat},${from.lng}>${to.lat},${to.lng}`, from, to, departure: getDepartureDate(dateStr, stop.time) });
    }
  });
  return legs;
}

/* --- Walk / Transit / Car switch for the line drawn on the map --- */
function ModeSwitch({ value, onChange }) {
  return (
    <div className="inline-flex rounded-full bg-cream-2 border border-line p-0.5" role="group" aria-label="Route shown on the map">
      {TRAVEL_MODES.map(m => (
        <button key={m.key} onClick={() => onChange(m.key)} aria-pressed={value === m.key}
          className={`h-7 px-2 rounded-full text-[12px] inline-flex items-center gap-1 cursor-pointer ${value === m.key ? 'bg-paper text-ink font-medium shadow-sm' : 'text-ink-2 hover:text-ink'}`}>
          <m.Icon className="w-3.5 h-3.5" strokeWidth={1.8} />{m.label}
        </button>
      ))}
    </div>
  );
}

/* --- Between two stops: how long it takes on foot, by transit and by car --- */
function LegRow({ leg, onLeg, routeMode }) {
  const { loading, data } = useLegTravel(leg.from, leg.to, leg.departure);
  useEffect(() => { if (!loading) onLeg(leg.key, data); }, [loading, data, leg.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = data?.[routeMode];
  return (
    <div className="flex items-center gap-1.5 pl-[30px] sm:pl-[92px] text-[12px]">
      {TRAVEL_MODES.map(m => {
        const r = data?.[m.key];
        const url = `https://www.google.com/maps/dir/?api=1&origin=${leg.from.lat},${leg.from.lng}&destination=${leg.to.lat},${leg.to.lng}&travelmode=${m.gmaps}`;
        return (
          <a key={m.key} href={url} target="_blank" rel="noopener noreferrer" title={`Directions ${m.verb}`}
            className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full border whitespace-nowrap ${m.key === routeMode ? 'bg-sage-soft border-sage/30 text-ink' : 'bg-cream-2 border-line text-ink-2'} hover:border-line-2`}>
            <m.Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
            <span className="tabular-nums">{loading ? '…' : r ? formatDuration(r.seconds) : '–'}</span>
          </a>
        );
      })}
      {shown?.meters != null && <span className="hidden sm:inline text-ink-3 ml-1">{formatDistance(shown.meters)} {modeByKey(routeMode).verb}</span>}
    </div>
  );
}

function TimeEdit({ value, onChange, className = '' }) {
  return (
    <label className={`relative inline-block cursor-pointer ${className}`} title="Change time">
      <span className="tabular-nums">{value || '12:00'}</span>
      <input type="time" value={value || '12:00'} onChange={e => onChange(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" aria-label="Scheduled time" />
    </label>
  );
}

/* --- Buttons that hand a place over to a navigation app --- */
function NaviButtons({ place, ctx, className = '' }) {
  if (!hasPoint(place)) return null;
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <button onClick={() => ctx.handleOpenInYahooCarNavi(place)} title="Start car navigation in the Yahoo!カーナビ app"
        className="h-8 px-3 rounded-full bg-paper border border-line text-[12px] font-medium text-ink inline-flex items-center gap-1.5 whitespace-nowrap hover:bg-cream-2 cursor-pointer">
        <Car className="w-3.5 h-3.5 text-clay-deep" strokeWidth={2} />Yahoo!カーナビ
      </button>
      <button onClick={() => ctx.handleOpenInGoogleMaps(place)} title="Open in Google Maps"
        className="h-8 px-3 rounded-full bg-paper border border-line text-[12px] text-ink-2 inline-flex items-center gap-1.5 whitespace-nowrap hover:bg-cream-2 cursor-pointer">
        <MapIcon className="w-3.5 h-3.5" strokeWidth={1.8} />Map
      </button>
    </div>
  );
}

/* --- Timeline stop card --- */
function StopCard({ stop, index, order, trip, day, ctx, isFirst, isLast, onMenu, menuOpen }) {
  const dateStr = getDayDateString(trip.startDate, day);
  const closed = !stop.isFlight && checkIsClosed(stop.time, stop.openingHours, dateStr);
  const kind = stopKind(stop);
  const duration = stop.duration || (stop.isFlight ? null : 60);
  const setTime = v => ctx.setStopTime(day, stop.id, v);
  const title = stop.isFlight
    ? (stop.arrivalAirport ? `${index === 0 ? 'Arrive at' : 'Fly to'} ${stop.arrivalAirport}${stop.destinationCode ? ` (${stop.destinationCode})` : ''}` : stop.name)
    : stop.name;

  return (
    <div className="relative flex items-start gap-2.5 sm:gap-3">
      <div className="hidden sm:block w-12 shrink-0 text-right pt-3.5 text-[13px] font-medium text-ink">
        <TimeEdit value={stop.time} onChange={setTime} />
      </div>
      <div className="relative shrink-0 w-5 flex justify-center pt-3.5">
        {stop.isFlight ? (
          <span className="w-5 h-5 rounded-full bg-[#4f6d8a] text-white flex items-center justify-center"><Plane className="w-3 h-3" /></span>
        ) : (
          <span className="w-5 h-5 rounded-full bg-paper border-[1.5px] border-sage-deep text-sage-deep text-[10.5px] font-bold flex items-center justify-center tabular-nums">{order}</span>
        )}
      </div>

      <div className={`flex-1 min-w-0 tl-card p-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 ${closed ? 'border-red-200 bg-red-50/40' : ''} ${stop.isFlight ? 'bg-sky-soft/40' : ''}`}>
        {stop.isFlight ? (
          <span className="w-14 h-14 sm:w-[72px] rounded-lg bg-sky-soft flex items-center justify-center text-[#4f6d8a] shrink-0"><Plane className="w-6 h-6" /></span>
        ) : (
          <PlacePhoto place={stop} className="w-14 h-14 sm:w-[72px] shrink-0" rounded="rounded-lg" />
        )}

        <div className="min-w-0 flex-1 basis-[110px]">
          <h4 className="text-[15px] font-semibold text-ink leading-snug line-clamp-2">{title}</h4>
          <p className="text-[12px] text-ink-3 flex items-center gap-x-2.5 gap-y-0.5 mt-0.5 flex-wrap">
            {stop.isFlight ? (
              <>
                <TimeEdit value={stop.time} onChange={setTime} className="sm:hidden font-medium text-ink" />
                <span className="whitespace-nowrap">Flight {stop.flightNumber}</span>
                <span className="whitespace-nowrap">From {stop.originCode || stop.departureAirport}</span>
                {stop.arrivalTime && <span className="whitespace-nowrap">Arrives {stop.arrivalTime}</span>}
                {stop.departureGate && <span className="whitespace-nowrap">Gate {stop.departureGate}</span>}
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <TimeEdit value={stop.time} onChange={setTime} className="sm:hidden font-medium text-ink" />
                  <span className="sm:hidden">•</span>
                  <label className="relative cursor-pointer text-ink-2 underline decoration-dotted underline-offset-2" title="Change how long you stay">
                    {formatDuration(duration * 60)}
                    <select value={duration} onChange={e => ctx.setStopDuration(day, stop.id, Number(e.target.value))} className="absolute inset-0 w-full opacity-0 cursor-pointer" aria-label="Time spent here">
                      {DURATIONS.map(d => <option key={d} value={d}>{formatDuration(d * 60)}</option>)}
                    </select>
                  </label>
                </span>
                <span className="inline-flex items-center gap-1 whitespace-nowrap"><kind.Icon className="w-3.5 h-3.5" />{kind.label}</span>
              </>
            )}
          </p>
          {!stop.isFlight && stop.note && <p className="text-[12px] text-ink-2 mt-0.5 line-clamp-1">{stop.note}</p>}
          {(closed || stop.gateChangedFrom) && (
            <p className="flex flex-wrap gap-1.5 mt-1">
              {closed && <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200"><AlertTriangle className="w-3 h-3" />Closed at {stop.time}</span>}
              {stop.gateChangedFrom && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">Gate changed</span>}
            </p>
          )}
          {stop.isFlight && stop.scheduledOut && (
            <p className="text-[11px] text-ink-3 mt-0.5 flex items-center gap-x-2.5 gap-y-0.5 flex-wrap">
              <span className="whitespace-nowrap">Terminal {stop.departureTerminal || 'TBC'}</span>
              {stop.seatNumber && <span className="whitespace-nowrap">Seat {stop.seatNumber}</span>}
              {stop.flightStatus && <span className="whitespace-nowrap">{stop.flightStatus}</span>}
              <button onClick={() => ctx.refreshSavedFlight(trip.id, day, stop, true)} className="inline-flex items-center gap-1 text-[#4f6d8a] font-medium cursor-pointer">
                <RefreshCw className={`w-3 h-3 ${ctx.refreshingFlightIds.includes(stop.id) ? 'animate-spin' : ''}`} />Refresh
              </button>
              {ctx.flightRefreshErrors[stop.id] && <span className="text-red-600">{ctx.flightRefreshErrors[stop.id]}</span>}
            </p>
          )}
        </div>

        {!stop.isFlight && <NaviButtons place={stop} ctx={ctx} className="order-last w-full sm:order-none sm:w-auto" />}

        <div className="relative shrink-0 self-start sm:self-center">
          <button onClick={e => { e.stopPropagation(); onMenu(menuOpen ? null : stop.id); }} aria-label="More actions" aria-expanded={menuOpen}
            className="w-9 h-9 rounded-full flex items-center justify-center text-ink-3 hover:bg-cream-2 cursor-pointer"><MoreHorizontal className="w-4 h-4" /></button>
          {menuOpen && (
            <div className="absolute right-0 top-10 z-20 w-44 tl-card p-1 text-[13px] tl-fade" onClick={e => e.stopPropagation()}>
              {!stop.isFlight && <button onClick={() => { onMenu(null); ctx.handleOpenEditStopModal(stop); }} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-cream-2 cursor-pointer"><Pen className="w-3.5 h-3.5" />Edit</button>}
              <button disabled={isFirst} onClick={() => { onMenu(null); ctx.handleMoveStop(day, index, -1); }} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-cream-2 disabled:opacity-40 cursor-pointer"><ArrowUp className="w-3.5 h-3.5" />Move up</button>
              <button disabled={isLast} onClick={() => { onMenu(null); ctx.handleMoveStop(day, index, 1); }} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-cream-2 disabled:opacity-40 cursor-pointer"><ArrowDown className="w-3.5 h-3.5" />Move down</button>
              <button onClick={() => { onMenu(null); ctx.handleRemoveStop(day, index); }} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer"><Trash2 className="w-3.5 h-3.5" />Remove</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* --- Tonight's stay, pinned above the timeline (check-in can happen at any point in the day) --- */
function PinnedStay({ stay, previous, day, trip, ctx }) {
  const movedOut = previous && !sameStay(previous, stay);
  // Which night of this stay is it? Check-in only matters on the first one.
  let night = 1, nights = 1;
  if (stay) {
    for (let d = day - 1; d >= 1 && sameStay(trip.staysByDay?.[d], stay); d--) { night += 1; nights += 1; }
    for (let d = day + 1; d <= trip.daysCount && sameStay(trip.staysByDay?.[d], stay); d++) nights += 1;
  }
  const detail = !stay ? ''
    : night > 1 ? `Night ${night} of ${nights}`
    : [stay.checkIn && `Check-in from ${stay.checkIn}`, nights > 1 && `${nights} nights`].filter(Boolean).join(' • ') || stay.address || 'Address not set';
  if (!stay) {
    return (
      <div className="rounded-xl border border-dashed border-line-2 bg-cream-2/60 px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-ink-2">
        <BedDouble className="w-4 h-4 text-ink-3 shrink-0" />
        <span className="flex-1 min-w-[150px]">
          No stay set for tonight.
          {previous && <span className="block text-[12px] text-ink-3">Checking out of {previous.name} this morning.</span>}
        </span>
        <button onClick={() => ctx.openStayModal(day, null)} className="h-8 px-3 rounded-full bg-paper border border-line text-[12px] font-medium text-ink inline-flex items-center gap-1.5 hover:bg-cream-2 cursor-pointer"><Plus className="w-3.5 h-3.5" />Add stay</button>
      </div>
    );
  }
  return (
    <div className="relative rounded-xl border border-line bg-cream-2/70 p-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
      <PlacePhoto place={{ ...stay, category: 'Stays/Hotel' }} className="w-14 h-14 shrink-0" rounded="rounded-lg" />
      <div className="min-w-0 flex-1 basis-[150px] pr-8 sm:pr-0">
        <p className="text-[12px] text-ink-3 flex items-center gap-1"><BedDouble className="w-3.5 h-3.5" />Staying tonight</p>
        <h4 className="text-[15px] font-semibold text-ink leading-snug line-clamp-1">{stay.name}</h4>
        <p className="text-[12px] text-ink-3 line-clamp-1">{detail}{stay.note ? ` • ${stay.note}` : ''}</p>
        {movedOut && <p className="text-[12px] text-ink-3 line-clamp-1">Checking out of {previous.name} this morning.</p>}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto">
        <NaviButtons place={stay} ctx={ctx} />
        <button onClick={() => ctx.openStayModal(day, stay)} className="h-8 px-3 rounded-full bg-paper border border-line text-[12px] text-ink-2 inline-flex items-center gap-1.5 hover:bg-cream-2 cursor-pointer"><Pen className="w-3.5 h-3.5" />Edit</button>
        <button onClick={() => ctx.handleUnpinStay(day)} title="Remove this stay from tonight" aria-label="Remove this stay from tonight"
          className="absolute top-1.5 right-1.5 sm:static w-8 h-8 rounded-full text-ink-3 hover:bg-paper hover:text-red-600 inline-flex items-center justify-center cursor-pointer"><X className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

function StayCard({ stay, day, ctx }) {
  return (
    <div className="tl-card p-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
      <PlacePhoto place={{ ...stay, category: 'Stays/Hotel' }} className="w-20 h-20 shrink-0" rounded="rounded-lg" />
      <div className="min-w-0 flex-1 basis-[150px]">
        <h4 className="text-[15px] font-semibold text-ink leading-snug line-clamp-2">{stay.name}</h4>
        <p className="text-[12px] text-ink-3 flex items-start gap-1 mt-0.5"><MapPin className="w-3.5 h-3.5 shrink-0 mt-px" /><span className="line-clamp-2">{stay.address || 'Address not set'}</span></p>
        {(stay.checkIn || stay.note) && (
          <p className="text-[12px] text-ink-3 mt-0.5 line-clamp-1">{[stay.checkIn && `Check-in from ${stay.checkIn}`, stay.note].filter(Boolean).join(' • ')}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto">
        <NaviButtons place={stay} ctx={ctx} />
        <button onClick={() => ctx.openStayModal(day, stay)} className="h-8 px-3 rounded-full bg-paper border border-line text-[12px] text-ink-2 inline-flex items-center gap-1.5 hover:bg-cream-2 cursor-pointer"><Pen className="w-3.5 h-3.5" />Edit</button>
      </div>
    </div>
  );
}

/* ---------- Page ---------- */
export default function ItineraryPage(ctx) {
  if (!ctx.activeTrip) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        <EmptyNote action="Create a trip" onAction={() => ctx.openNewTrip()}>No itinerary yet. Create a trip to start planning your days.</EmptyNote>
      </div>
    );
  }
  return <Itinerary {...ctx} />;
}

function Itinerary(ctx) {
  const { activeTrip: trip, activeDay, setActiveDay, isLoaded, loadError, sharedMeta } = ctx;
  const [tab, setTab] = useState('plan');
  const [menuId, setMenuId] = useState(null);
  const [legTimes, setLegTimes] = useState({});
  const [noteDraft, setNoteDraft] = useState(trip.notes || '');
  const [budgetForm, setBudgetForm] = useState({ label: '', amount: '', category: 'Activities' });
  const [routeMode, setRouteModeState] = useState(() => {
    try { const m = localStorage.getItem(ROUTE_MODE_KEY); return TRAVEL_MODES.some(x => x.key === m) ? m : 'DRIVE'; } catch { return 'DRIVE'; }
  });
  const setRouteMode = m => { setRouteModeState(m); try { localStorage.setItem(ROUTE_MODE_KEY, m); } catch { /* ignore */ } };
  const activeDayChip = useRef(null);

  const day = Math.min(activeDay || 1, trip.daysCount);
  const days = useMemo(() => Array.from({ length: trip.daysCount }, (_, i) => i + 1), [trip.daysCount]);
  const dayStops = useMemo(() => sortStopsByTime(trip.schedule?.[day] || []), [trip.schedule, day]);
  const stay = trip.staysByDay?.[day];
  const previousStay = day > 1 ? trip.staysByDay?.[day - 1] : null;
  const travelers = trip.sharedId ? Math.max(1, sharedMeta?.[trip.sharedId]?.members?.length || 1) : 1;
  const dateStr = getDayDateString(trip.startDate, day);

  // Opening a trip that is under way lands on today rather than on Day 1.
  useEffect(() => {
    if (activeDay != null) return;
    const [y, m, d] = (trip.startDate || '').split('-').map(Number);
    const now = new Date();
    const today = y && m && d ? Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(y, m - 1, d)) / 86400000) + 1 : 1;
    setActiveDay(today >= 1 && today <= trip.daysCount ? today : 1);
  }, [trip.id, activeDay]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setNoteDraft(trip.notes || ''); }, [trip.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const stopSig = dayStops.map(s => `${s.id}:${s.time}:${s.lat},${s.lng}`).join('|');
  useEffect(() => { setMenuId(null); }, [day, trip.id, stopSig]);
  useEffect(() => {
    if (noteDraft === (trip.notes || '')) return;
    const t = setTimeout(() => ctx.updateTrip({ notes: noteDraft }), 600);
    return () => clearTimeout(t);
  }, [noteDraft]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { activeDayChip.current?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, [day]);

  // Road geometry for the map, in whichever way of travelling is selected.
  const dayLegs = useMemo(() => legsFor(dayStops, dateStr), [stopSig, dateStr]); // eslint-disable-line react-hooks/exhaustive-deps
  const daySegments = useRoutePaths(dayLegs, routeMode);
  const tripStops = useMemo(() => days.flatMap(d => sortStopsByTime(trip.schedule?.[d] || [])), [days, trip.schedule]);
  const tripLegs = useMemo(
    () => (tab === 'route' ? days.flatMap(d => legsFor(sortStopsByTime(trip.schedule?.[d] || []), getDayDateString(trip.startDate, d))) : []),
    [tab, days, trip.schedule, trip.startDate]
  );
  const tripSegments = useRoutePaths(tripLegs, routeMode, tab === 'route');
  const straightLegs = daySegments.filter(s => !s.road).length;

  // Keyed by the two places, so times survive re-ordering and day changes.
  const onLeg = (key, data) => setLegTimes(prev => (prev[key] === data ? prev : { ...prev, [key]: data }));
  const totals = TRAVEL_MODES.map(m => {
    const found = dayLegs.map(l => legTimes[l.key]?.[m.key]).filter(Boolean);
    return { mode: m, seconds: found.reduce((s, r) => s + r.seconds, 0), meters: found.reduce((s, r) => s + r.meters, 0), complete: found.length === dayLegs.length && dayLegs.length > 0 };
  });
  const activityMin = dayStops.filter(s => !s.isFlight).reduce((s, st) => s + (st.duration || 60), 0);
  const mode = modeByKey(routeMode);

  const flowItems = dayStops.map(s => ({
    key: s.id, label: s.isFlight ? `${s.destinationCode || 'Flight'}` : shortName(s.name, 22),
    sub: s.isFlight ? 'Flight' : stopKind(s).label.split(' ')[0], Icon: stopKind(s).Icon, tone: s.isFlight ? 'sky' : 'sage'
  }));

  const header = (
    <Card className="relative overflow-hidden">
      <HeroArt />
      <div className="relative z-10 p-4 sm:p-5 flex flex-col md:flex-row md:items-center gap-3 md:gap-5">
        <CoverImage trip={trip} className="w-full md:w-52 h-24 sm:h-32 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] tracking-[0.22em] uppercase text-ink-3 font-medium">My Trip Itinerary</p>
          <h1 className="font-serif text-[30px] sm:text-[40px] leading-tight text-ink">{trip.name}</h1>
          <div className="flex items-center gap-2 flex-wrap mt-2 text-[13px] text-ink-2">
            <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-paper/80 border border-line"><CalendarDays className="w-4 h-4" />{formatRange(trip.startDate, trip.daysCount)}</span>
            <span className="inline-flex items-center h-8 px-3 rounded-full bg-paper/80 border border-line">{trip.daysCount} day{trip.daysCount === 1 ? '' : 's'}</span>
            <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-paper/80 border border-line"><Users className="w-4 h-4" />{travelers} traveler{travelers === 1 ? '' : 's'}</span>
            <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-sage-soft border border-sage/30"><GitBranch className="w-4 h-4" />{trip.japaneseSub || 'Multi-city'}</span>
          </div>
        </div>
        <div className="flex md:flex-col gap-2 shrink-0">
          <Btn variant="outline" icon={Share2} onClick={ctx.handleOpenShare} className="h-9 flex-1 md:flex-none">{trip.sharedId ? 'Collaborators' : 'Share'}</Btn>
          <Btn variant="outline" icon={Calendar} onClick={ctx.handleOpenEditDatesModal} className="h-9 flex-1 md:flex-none whitespace-nowrap">Edit dates</Btn>
          <Btn variant="danger" icon={Trash2} onClick={ctx.handleDeleteTrip} className="h-9 max-md:px-3" aria-label="Delete trip" title="Delete trip"><span className="hidden md:inline">Delete</span></Btn>
        </div>
      </div>
    </Card>
  );

  const tabBar = (
    <Card className="p-2 flex flex-col lg:flex-row lg:items-center gap-2">
      <div className="flex gap-1 tl-strip">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} aria-pressed={tab === t.key}
            className={`flex items-center gap-2 h-10 px-3.5 sm:px-4 rounded-full text-[14px] whitespace-nowrap shrink-0 cursor-pointer ${tab === t.key ? 'bg-sage-soft text-ink font-medium' : 'text-ink-2 hover:bg-cream-2'}`}>
            <t.Icon className="w-4 h-4" strokeWidth={1.8} />{t.label}
          </button>
        ))}
      </div>
      <div className="lg:ml-auto flex gap-2">
        <Btn variant="outline" icon={Sparkles} onClick={() => ctx.optimizeDay(day)} title="Reorder today's stops by shortest path" className="flex-1 lg:flex-none whitespace-nowrap">Optimize Route</Btn>
        <Btn variant="outline" icon={Wand2} onClick={() => ctx.autoPlanDay(day)} title="Fill today with unscheduled saved places" className="flex-1 lg:flex-none whitespace-nowrap">Auto Plan</Btn>
        <Btn icon={Plus} onClick={ctx.handleAddDay} className="max-lg:hidden">Add Day</Btn>
      </div>
    </Card>
  );

  // Phones: days as a strip you swipe. Larger screens: the full list at the side.
  const dayStrip = (
    <div className="lg:hidden tl-strip flex gap-2 -mx-4 px-4 pb-0.5">
      {days.map(d => {
        const active = d === day;
        return (
          <button key={d} ref={active ? activeDayChip : null} onClick={() => setActiveDay(d)} aria-pressed={active}
            className={`shrink-0 rounded-xl border px-3 py-1.5 text-left cursor-pointer ${active ? 'bg-sage-deep border-sage-deep text-white' : 'bg-paper border-line text-ink'}`}>
            <span className="block text-[13px] font-semibold leading-tight">Day {d}</span>
            <span className={`block text-[11px] leading-tight whitespace-nowrap ${active ? 'text-white/80' : 'text-ink-3'}`}>{formatDayDate(trip.startDate, d) || '—'}</span>
          </button>
        );
      })}
      <button onClick={ctx.handleAddDay} className="shrink-0 rounded-xl border border-dashed border-line-2 px-3 text-[13px] text-ink-2 inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"><Plus className="w-3.5 h-3.5" />Add day</button>
    </div>
  );

  const dayList = (
    <Card className="hidden lg:block p-3 bg-cream-2/70 overflow-hidden">
      <div className="flex items-center justify-between px-1 mb-2">
        <h3 className="font-serif text-[18px] text-ink">Trip Plan <span className="text-[13px] text-ink-3 font-sans">({trip.daysCount} Days)</span></h3>
      </div>
      <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-0.5">
        {days.map(d => {
          const active = d === day;
          return (
            <button key={d} onClick={() => setActiveDay(d)}
              className={`w-full flex items-center gap-3 p-2 rounded-xl border text-left cursor-pointer transition-colors ${active ? 'bg-sage-soft border-sage/30' : 'bg-paper border-line hover:bg-cream-2'}`}>
              <span className={`h-9 px-2.5 rounded-lg flex items-center text-[13px] font-medium shrink-0 ${active ? 'bg-sage-deep text-white' : 'bg-cream-2 text-ink'}`}>Day {d}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] text-ink-3">{formatDayDate(trip.startDate, d)}</span>
                <span className="block text-[13px] font-medium text-ink leading-tight line-clamp-2">{dayTitle(trip, d)}</span>
              </span>
              <ChevronRight className="w-4 h-4 text-ink-3 shrink-0" />
            </button>
          );
        })}
      </div>
      <div className="tl-waves h-16 mt-3 -mx-3 -mb-3" />
    </Card>
  );

  /* ----- centre: plan timeline ----- */
  let order = 0;
  const plan = (
    <Card className="p-3 sm:p-5">
      <div className="flex items-center gap-2.5 sm:gap-3">
        <span className="h-10 sm:h-11 px-3.5 sm:px-4 rounded-full bg-sage-soft font-serif text-[19px] sm:text-[22px] text-ink flex items-center shrink-0 whitespace-nowrap">Day {day}</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-[19px] sm:text-[24px] leading-tight text-ink line-clamp-2">{dayTitle(trip, day)}</h2>
          <p className="text-[12px] text-ink-3">{formatDayDate(trip.startDate, day)} <span className="mx-1">•</span> {dayStops.map(cityOf).find(Boolean) || trip.japaneseSub}</p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button disabled={day <= 1} onClick={() => setActiveDay(day - 1)} aria-label="Previous day" className="w-9 h-9 rounded-full border border-line flex items-center justify-center text-ink-2 hover:bg-cream-2 disabled:opacity-40 cursor-pointer"><ChevronLeft className="w-4 h-4" /></button>
          <button disabled={day >= trip.daysCount} onClick={() => setActiveDay(day + 1)} aria-label="Next day" className="w-9 h-9 rounded-full border border-line flex items-center justify-center text-ink-2 hover:bg-cream-2 disabled:opacity-40 cursor-pointer"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="mt-4"><PinnedStay stay={stay} previous={previousStay} day={day} trip={trip} ctx={ctx} /></div>

      <div className="relative mt-4 space-y-2">
        {dayStops.length > 1 && <span className="absolute left-[9px] sm:left-[69px] top-6 bottom-6 border-l-2 border-dashed border-line-2" />}
        {dayStops.length === 0 && (
          <EmptyNote>No stops on Day {day} yet. Add a stop or a flight, or use Auto Plan to pull from your saved places.</EmptyNote>
        )}
        {dayStops.map((stop, idx) => {
          const leg = dayLegs.find(l => l.index === idx);
          if (!stop.isFlight) order += 1;
          return (
            <React.Fragment key={stop.id}>
              {leg && <LegRow leg={leg} onLeg={onLeg} routeMode={routeMode} />}
              <StopCard stop={stop} index={idx} order={order} trip={trip} day={day} ctx={ctx} isFirst={idx === 0} isLast={idx === dayStops.length - 1} onMenu={setMenuId} menuOpen={menuId === stop.id} />
            </React.Fragment>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-line flex flex-wrap gap-2">
        <Btn variant="outline" icon={Plus} onClick={ctx.openAddStop}>Add Stop</Btn>
        <Btn variant="outline" icon={Plane} onClick={ctx.handleOpenAddFlight}>Add Flight</Btn>
      </div>
    </Card>
  );

  /* ----- right column ----- */
  const right = (
    <div className="space-y-4">
      <Card className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h3 className="font-serif text-[18px] text-ink">Day {day} Route</h3>
          <ModeSwitch value={routeMode} onChange={setRouteMode} />
        </div>
        <TripMap isLoaded={isLoaded} loadError={loadError} className="h-72 rounded-xl border border-line"
          center={trip.center ? { lat: trip.center[0], lng: trip.center[1] } : undefined} zoom={trip.zoom || 11}
          stops={dayStops} stays={stay ? [stay] : []} segments={daySegments} numbered labels focus="ground"
          fitKey={`day_${trip.id}_${day}`} onExpand={() => setTab('route')} />
        {dayLegs.length > 0 && (
          <p className="text-[11.5px] text-ink-3 mt-2">
            {straightLegs === 0
              ? `The line follows the route ${mode.verb}.`
              : straightLegs === dayLegs.length
                ? `No route ${mode.verb} was found, so stops are joined with straight lines.`
                : `${straightLegs} leg${straightLegs === 1 ? ' has' : 's have'} no route ${mode.verb} and ${straightLegs === 1 ? 'is' : 'are'} drawn straight.`}
          </p>
        )}
        <h4 className="text-[14px] font-medium text-ink mt-4 mb-2">Route Flow <span className="text-ink-3 font-normal">(Day {day})</span></h4>
        {flowItems.length === 0 ? <p className="text-[12px] text-ink-3">Add stops to see the flow.</p> : (
          <div className="flex items-start gap-1 tl-strip pb-1">
            {flowItems.map((f, i) => (
              <React.Fragment key={f.key}>
                <div className="flex flex-col items-center w-[62px] shrink-0 text-center">
                  <IconBadge icon={f.Icon} tone={f.tone} />
                  <span className="text-[10px] text-ink mt-1 leading-tight line-clamp-2">{f.label}</span>
                  <span className="text-[9px] text-ink-3">({f.sub})</span>
                </div>
                {i < flowItems.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-ink-3 mt-3 shrink-0" />}
              </React.Fragment>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="font-serif text-[18px] text-ink mb-3">Day {day} At a Glance</h3>
        <div className="grid grid-cols-2 divide-x divide-line">
          {[
            { Icon: MapPin, v: dayStops.length, l: dayStops.length === 1 ? 'Stop' : 'Stops' },
            { Icon: Clock, v: activityMin ? formatDuration(activityMin * 60) : '–', l: 'At the stops' }
          ].map(s => (
            <div key={s.l} className="flex flex-col items-center text-center px-1">
              <s.Icon className="w-4 h-4 text-clay mb-1" strokeWidth={1.8} />
              <span className="text-[14px] font-semibold text-ink leading-tight">{s.v}</span>
              <span className="text-[11px] text-ink-3 mt-0.5 leading-tight">{s.l}</span>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-ink-2 mt-4 mb-2">Travel between stops, depending on how you go</p>
        <div className="grid grid-cols-3 gap-2">
          {totals.map(t => (
            <div key={t.mode.key} className={`rounded-xl border px-2 py-2 text-center ${t.mode.key === routeMode ? 'bg-sage-soft border-sage/30' : 'bg-cream-2 border-line'}`}>
              <t.mode.Icon className="w-4 h-4 mx-auto text-ink-2" strokeWidth={1.8} />
              <span className="block text-[13px] font-semibold text-ink leading-tight mt-1 tabular-nums">{t.seconds ? `${t.complete ? '' : '≥ '}${formatDuration(t.seconds)}` : '–'}</span>
              <span className="block text-[11px] text-ink-3 leading-tight mt-0.5">{t.meters ? formatDistance(t.meters) : t.mode.label}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );

  /* ----- other tabs ----- */
  const routeTab = (
    <Card className="p-3 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-serif text-[22px] sm:text-[24px] text-ink">Whole-trip route</h2>
        <ModeSwitch value={routeMode} onChange={setRouteMode} />
      </div>
      <TripMap isLoaded={isLoaded} loadError={loadError} className="h-[340px] sm:h-[380px] rounded-xl border border-line"
        center={trip.center ? { lat: trip.center[0], lng: trip.center[1] } : undefined} zoom={trip.zoom || 11}
        stops={tripStops} stays={Object.values(trip.staysByDay || {})} places={trip.savedPlaces || []} segments={tripSegments} focus="ground" fitKey={`route_${trip.id}`} />
      <div className="space-y-3">
        {days.map(d => {
          const stops = sortStopsByTime(trip.schedule?.[d] || []);
          const st = trip.staysByDay?.[d];
          if (!stops.length && !st) return null;
          return (
            <div key={d} className="flex items-start gap-3">
              <button onClick={() => { setActiveDay(d); setTab('plan'); }} className="h-8 px-2.5 rounded-lg bg-sage-soft text-[12px] font-medium text-ink shrink-0 cursor-pointer whitespace-nowrap">Day {d}</button>
              <div className="flex items-center gap-1 flex-wrap text-[12px] text-ink-2 min-w-0">
                {stops.map((s, i) => (
                  <React.Fragment key={s.id}>
                    <span className="inline-flex items-center gap-1 min-h-7 px-2.5 py-1 rounded-full bg-paper border border-line max-w-full"><span className="shrink-0">{s.isFlight ? <Plane className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}</span><span className="truncate">{s.isFlight ? `Flight ${s.flightNumber}` : s.name}</span></span>
                    {i < stops.length - 1 && <ChevronRight className="w-3 h-3 text-ink-3 shrink-0" />}
                  </React.Fragment>
                ))}
                {st && <span className="inline-flex items-center gap-1 min-h-7 px-2.5 py-1 rounded-full bg-clay-soft border border-clay/20 max-w-full"><BedDouble className="w-3 h-3 shrink-0" /><span className="truncate">{st.name}</span></span>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );

  const groupedStays = getGroupedStays(trip.staysByDay, trip.daysCount);
  const staysTab = (
    <Card className="p-3 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-[22px] sm:text-[24px] text-ink">Stays</h2>
        <Btn icon={Plus} onClick={() => ctx.openStayModal(day, null)}>Add Stay</Btn>
      </div>
      {groupedStays.length === 0 && <EmptyNote>No stays yet. Add one and choose the nights it covers.</EmptyNote>}
      {groupedStays.map((g, i) => (
        <div key={i} className="space-y-1.5">
          <span className="inline-flex h-7 px-2.5 rounded-lg bg-clay-soft text-[12px] font-medium text-clay-deep items-center">{g.dayLabel}</span>
          <StayCard stay={g.stay} day={parseInt(g.dayLabel.replace(/\D+/g, '')) || day} ctx={ctx} />
        </div>
      ))}
      <div className="pt-3 border-t border-line">
        <p className="text-[12px] text-ink-3 mb-2">Nights without a stay</p>
        <div className="flex flex-wrap gap-2">
          {days.filter(d => !trip.staysByDay?.[d]).map(d => <Chip key={d} icon={BedDouble} onClick={() => ctx.openStayModal(d, null)}>Day {d} · {formatDayDate(trip.startDate, d)}</Chip>)}
          {days.every(d => trip.staysByDay?.[d]) && <span className="text-[12px] text-sage-deep inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" />Every night covered</span>}
        </div>
      </div>
    </Card>
  );

  const budget = trip.budget || [];
  const budgetTotal = budget.reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const addBudget = e => {
    e.preventDefault();
    if (!budgetForm.label.trim()) return;
    ctx.updateTrip({ budget: [...budget, { id: `b_${Date.now()}`, label: budgetForm.label.trim(), amount: Number(budgetForm.amount) || 0, category: budgetForm.category }] });
    setBudgetForm({ label: '', amount: '', category: budgetForm.category });
  };
  const budgetTab = (
    <Card className="p-3 sm:p-5 space-y-4">
      <div className="flex items-end justify-between">
        <h2 className="font-serif text-[22px] sm:text-[24px] text-ink">Budget</h2>
        <p className="text-[13px] text-ink-2">Total <span className="font-serif text-[22px] text-ink ml-1 tabular-nums">{budgetTotal.toLocaleString()}</span></p>
      </div>
      <form onSubmit={addBudget} className="grid grid-cols-2 sm:grid-cols-[1fr_120px_150px_auto] gap-2">
        <input value={budgetForm.label} onChange={e => setBudgetForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. JR Pass" aria-label="What it is" className="col-span-2 sm:col-span-1 h-10 px-3 rounded-xl border border-line bg-paper text-[13px] outline-none focus:border-sage" />
        <input type="number" inputMode="decimal" min="0" value={budgetForm.amount} onChange={e => setBudgetForm(f => ({ ...f, amount: e.target.value }))} placeholder="Amount" aria-label="Amount" className="min-w-0 h-10 px-3 rounded-xl border border-line bg-paper text-[13px] outline-none focus:border-sage" />
        <select value={budgetForm.category} onChange={e => setBudgetForm(f => ({ ...f, category: e.target.value }))} aria-label="Category" className="min-w-0 h-10 px-3 rounded-xl border border-line bg-paper text-[13px] outline-none">
          {['Flights', 'Stays', 'Food', 'Activities', 'Transport', 'Shopping', 'Other'].map(c => <option key={c}>{c}</option>)}
        </select>
        <Btn type="submit" icon={Plus} className="col-span-2 sm:col-span-1">Add</Btn>
      </form>
      {budget.length === 0 ? <EmptyNote>No expenses yet. Add flights, stays, passes and meals to track what the trip costs.</EmptyNote> : (
        <ul className="divide-y divide-line">
          {budget.map(b => (
            <li key={b.id} className="flex items-center gap-3 py-2.5 text-[13px]">
              <span className="h-6 px-2 rounded-full bg-cream-2 border border-line text-[11px] text-ink-2 inline-flex items-center shrink-0">{b.category}</span>
              <span className="flex-1 min-w-0 text-ink truncate">{b.label}</span>
              <span className="font-medium text-ink tabular-nums">{Number(b.amount).toLocaleString()}</span>
              <button onClick={() => ctx.updateTrip({ budget: budget.filter(x => x.id !== b.id) })} aria-label={`Remove ${b.label}`} className="p-2 text-ink-3 hover:text-red-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  const notesTab = (
    <Card className="p-3 sm:p-5 space-y-3">
      <h2 className="font-serif text-[22px] sm:text-[24px] text-ink">Notes</h2>
      <p className="text-[12px] text-ink-3">Packing lists, booking references, reminders. Saved as you type{trip.sharedId ? ' and shared with collaborators' : ''}.</p>
      <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} rows={14} placeholder="Write anything about this trip…"
        className="w-full p-4 rounded-xl border border-line bg-paper text-[14px] leading-relaxed text-ink outline-none focus:border-sage resize-y" />
    </Card>
  );

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 sm:py-5 space-y-3 sm:space-y-4" onClick={() => menuId && setMenuId(null)}>
      {header}
      {tabBar}
      {dayStrip}
      <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr] xl:grid-cols-[230px_1fr_330px] gap-4 items-start">
        <div className="hidden lg:block lg:sticky lg:top-[80px]">{dayList}</div>
        <div className="min-w-0 xl:col-span-1">
          {tab === 'plan' && plan}
          {tab === 'route' && routeTab}
          {tab === 'stays' && staysTab}
          {tab === 'budget' && budgetTab}
          {tab === 'notes' && notesTab}
        </div>
        <div className={`min-w-0 lg:col-span-2 xl:col-span-1 ${tab === 'plan' ? '' : 'hidden xl:block'}`}>{right}</div>
      </div>
    </div>
  );
}
