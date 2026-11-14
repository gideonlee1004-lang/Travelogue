import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays, Users, Route as RouteIcon, ListChecks, BedDouble, Wallet, StickyNote, Sparkles, Wand2, Plus, ChevronLeft, ChevronRight,
  ArrowUpRight, MoreHorizontal, Plane, Footprints, Bus, Car, Hotel, MapPin, Clock, Ruler, Layers, Pen, Trash2, ArrowUp, ArrowDown,
  Share2, Calendar, AlertTriangle, RefreshCw, GitBranch, Landmark, Utensils, Sparkle, Check, X, ExternalLink
} from 'lucide-react';
import { HeroArt, Card, Btn, EmptyNote, IconBadge, Chip } from '../components/Shell.jsx';
import { PlacePhoto, CoverImage } from '../components/PlacePhoto.jsx';
import { TripMap } from '../components/TripMap.jsx';
import { categoryMeta, COLORS, cityOf } from '../theme.js';
import {
  formatRange, formatDayDate, getDayDateString, getDepartureDate, checkIsClosed, useLegTravel, pickLeg, formatDuration, formatDistance,
  getGroupedStays, haversineKm, addMinutes, sortStopsByTime
} from '../lib/helpers.js';

const TABS = [
  { key: 'plan', label: 'Plan', Icon: ListChecks },
  { key: 'route', label: 'Route', Icon: RouteIcon },
  { key: 'stays', label: 'Stays', Icon: BedDouble },
  { key: 'budget', label: 'Budget', Icon: Wallet },
  { key: 'notes', label: 'Notes', Icon: StickyNote }
];

const DURATIONS = [30, 45, 60, 90, 120, 180, 240];

function stopKind(stop) {
  if (stop.isFlight) return { label: 'Flight', Icon: Plane };
  const t = (stop.types || []).join(' ');
  if (/restaurant|food|cafe|bakery|bar|market/.test(t) || stop.category === 'Food & Eats') return { label: 'Food & Local Dining', Icon: Utensils };
  if (/lodging|hotel/.test(t) || stop.category === 'Stays/Hotel') return { label: 'Stay', Icon: BedDouble };
  if (/park|garden|nature|mountain|beach|observation/.test(t)) return { label: 'Nature & Views', Icon: Sparkle };
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

/* --- Leg between two stops: travel estimate row --- */
function LegRow({ from, to, departure, onLeg, index }) {
  const { loading, data } = useLegTravel(from, to, departure);
  const leg = pickLeg(data);
  useEffect(() => { if (!loading) onLeg?.(index, leg); }, [loading, leg?.seconds, leg?.meters]); // eslint-disable-line
  const Icon = leg?.mode?.Icon || Footprints;
  const label = leg?.mode?.label === 'Transit' ? 'Train / Bus' : leg?.mode?.label || 'Walk';
  const url = `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}`;
  return (
    <div className="flex items-center gap-3 pl-[62px] pr-2 py-1">
      <a href={url} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center gap-3 h-9 px-3 rounded-full bg-cream-2 border border-line text-[12px] text-ink-2 hover:bg-sage-soft/60">
        <Icon className="w-4 h-4 text-ink-2" strokeWidth={1.8} />
        <span className="font-medium text-ink">{label}</span>
        <span className="text-ink-3">{loading ? '…' : leg ? `~ ${formatDuration(leg.seconds)}` : 'n/a'}</span>
        {leg?.meters != null && <span className="text-ink-3">· {formatDistance(leg.meters)}</span>}
        {!loading && data?.WALK && leg?.mode?.key !== 'WALK' && <span className="hidden sm:inline text-ink-3 ml-auto">walk {formatDuration(data.WALK.seconds)}</span>}
      </a>
    </div>
  );
}

/* --- Timeline stop card --- */
function StopCard({ stop, index, trip, day, ctx, isFirst, isLast, onMenu, menuOpen }) {
  const dateStr = getDayDateString(trip.startDate, day);
  const closed = !stop.isFlight && checkIsClosed(stop.time, stop.openingHours, dateStr);
  const kind = stopKind(stop);
  const duration = stop.duration || (stop.isFlight ? null : 60);

  return (
    <div className="relative flex items-start gap-3">
      <div className="w-12 shrink-0 text-right pt-3 relative">
        <span className="text-[13px] font-medium text-ink">{stop.time || '12:00'}</span>
        <input type="time" value={stop.time || '12:00'} onChange={e => ctx.setStopTime(day, stop.id, e.target.value)} title="Change time"
          className="absolute inset-0 w-full opacity-0 cursor-pointer" />
      </div>
      <div className="relative shrink-0 w-4 flex justify-center pt-4">
        <span className={`w-3.5 h-3.5 rounded-full border-2 ${stop.isFlight ? 'bg-[#4f6d8a] border-[#4f6d8a]' : isLast ? 'bg-sage-deep border-sage-deep' : 'bg-paper border-sage-deep'}`} />
      </div>
      <div className={`flex-1 min-w-0 tl-card p-2.5 flex items-center gap-3 ${closed ? 'border-red-200 bg-red-50/40' : ''} ${stop.isFlight ? 'bg-sky-soft/40' : ''}`}>
        {stop.isFlight ? (
          <span className="w-[72px] h-14 rounded-lg bg-sky-soft flex items-center justify-center text-[#4f6d8a] shrink-0"><Plane className="w-6 h-6" /></span>
        ) : (
          <PlacePhoto place={stop} className="w-[72px] h-14 shrink-0" rounded="rounded-lg" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-[15px] font-semibold text-ink truncate">{stop.isFlight ? (stop.arrivalAirport ? `${index === 0 ? 'Arrive at' : 'Fly to'} ${stop.arrivalAirport}${stop.destinationCode ? ` (${stop.destinationCode})` : ''}` : stop.name) : stop.name}</h4>
            {closed && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200"><AlertTriangle className="w-3 h-3" />Closed at {stop.time}</span>}
            {stop.gateChangedFrom && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">Gate changed</span>}
          </div>
          <p className="text-[12px] text-ink-3 flex items-center gap-1.5 mt-0.5 flex-wrap">
            <kind.Icon className="w-3.5 h-3.5" />
            {stop.isFlight ? (
              <>
                <span>Flight {stop.flightNumber}</span><span>•</span><span>From {stop.originCode || stop.departureAirport}</span>
                {stop.arrivalTime && <><span>•</span><span>Arrives {stop.arrivalTime}</span></>}
                {stop.departureGate && <><span>•</span><span>Gate {stop.departureGate}</span></>}
              </>
            ) : (
              <>
                <span>{kind.label}</span><span>•</span>
                <label className="relative cursor-pointer hover:text-ink">
                  {formatDuration(duration * 60)}
                  <select value={duration} onChange={e => ctx.setStopDuration(day, stop.id, Number(e.target.value))} className="absolute inset-0 opacity-0 cursor-pointer" aria-label="Duration">
                    {DURATIONS.map(d => <option key={d} value={d}>{formatDuration(d * 60)}</option>)}
                  </select>
                </label>
                {stop.note && <><span>•</span><span className="truncate max-w-[200px]">{stop.note}</span></>}
              </>
            )}
          </p>
          {stop.isFlight && stop.scheduledOut && (
            <p className="text-[11px] text-ink-3 mt-0.5 flex items-center gap-2 flex-wrap">
              <span>Terminal {stop.departureTerminal || 'TBC'}</span>
              {stop.seatNumber && <span>· Seat {stop.seatNumber}</span>}
              {stop.flightStatus && <span>· {stop.flightStatus}</span>}
              <button onClick={() => ctx.refreshSavedFlight(trip.id, day, stop, true)} className="inline-flex items-center gap-1 text-[#4f6d8a] cursor-pointer">
                <RefreshCw className={`w-3 h-3 ${ctx.refreshingFlightIds.includes(stop.id) ? 'animate-spin' : ''}`} />refresh
              </button>
              {ctx.flightRefreshErrors[stop.id] && <span className="text-red-600">{ctx.flightRefreshErrors[stop.id]}</span>}
            </p>
          )}
        </div>
        <button onClick={() => ctx.handleOpenInGoogleMaps(stop)} className="w-8 h-8 rounded-full border border-line flex items-center justify-center text-ink-2 hover:bg-cream-2 shrink-0 cursor-pointer" title="Open in Google Maps"><ArrowUpRight className="w-4 h-4" /></button>
        <div className="relative shrink-0">
          <button onClick={() => onMenu(menuOpen ? null : stop.id)} className="w-8 h-8 rounded-full flex items-center justify-center text-ink-3 hover:bg-cream-2 cursor-pointer"><MoreHorizontal className="w-4 h-4" /></button>
          {menuOpen && (
            <div className="absolute right-0 top-9 z-20 w-44 tl-card p-1 text-[13px] tl-fade">
              {!stop.isFlight && <button onClick={() => { onMenu(null); ctx.handleOpenEditStopModal(stop); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-cream-2 cursor-pointer"><Pen className="w-3.5 h-3.5" />Edit</button>}
              <button disabled={isFirst} onClick={() => { onMenu(null); ctx.handleMoveStop(day, index, -1); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-cream-2 disabled:opacity-40 cursor-pointer"><ArrowUp className="w-3.5 h-3.5" />Move up</button>
              <button disabled={isLast} onClick={() => { onMenu(null); ctx.handleMoveStop(day, index, 1); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-cream-2 disabled:opacity-40 cursor-pointer"><ArrowDown className="w-3.5 h-3.5" />Move down</button>
              {stop.lat != null && <button onClick={() => { onMenu(null); ctx.handleOpenInYahooCarNavi(stop); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-cream-2 cursor-pointer"><Car className="w-3.5 h-3.5" />Yahoo! カーナビ</button>}
              <button onClick={() => { onMenu(null); ctx.handleRemoveStop(day, index); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer"><Trash2 className="w-3.5 h-3.5" />Remove</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StayCard({ stay, day, ctx, compact = false }) {
  const details = (
    <button onClick={() => ctx.openStayModal(day, stay)} className="h-8 px-3 rounded-full border border-line text-[12px] text-ink-2 hover:bg-cream-2 inline-flex items-center gap-1 shrink-0 cursor-pointer">View Details <ChevronRight className="w-3.5 h-3.5" /></button>
  );
  return (
    <div className="tl-card p-2.5 flex items-center gap-3">
      <PlacePhoto place={{ ...stay, category: 'Stays/Hotel' }} className={`${compact ? 'w-[72px] h-14' : 'w-28 h-24'} shrink-0`} rounded="rounded-lg" />
      <div className="min-w-0 flex-1">
        <h4 className="text-[15px] font-semibold text-ink truncate">{stay.name}</h4>
        <p className="text-[12px] text-ink-3 flex items-center gap-1 truncate"><MapPin className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{stay.address || 'Address not set'}</span></p>
        {!compact && <p className="text-[12px] text-ink-3 flex items-center gap-1 mt-0.5 truncate"><Hotel className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{stay.note || '1 Room · check-in from 15:00'}</span></p>}
        {!compact && <div className="mt-2">{details}</div>}
      </div>
      {compact && details}
    </div>
  );
}

/* ---------- Page ---------- */
export default function ItineraryPage(ctx) {
  const { activeTrip: trip, activeDay, setActiveDay, isLoaded, loadError, sharedMeta, navigate } = ctx;
  const [tab, setTab] = useState('plan');
  const [menuId, setMenuId] = useState(null);
  const [legs, setLegs] = useState({});
  const legsRef = useRef({});
  const [noteDraft, setNoteDraft] = useState(trip?.notes || '');
  const [budgetForm, setBudgetForm] = useState({ label: '', amount: '', category: 'Activities' });

  useEffect(() => { setNoteDraft(trip?.notes || ''); }, [trip?.id]);
  const stopSig = Object.values(trip?.schedule?.[activeDay || 1] || []).map(s => `${s.id}:${s.time}`).join('|');
  useEffect(() => { legsRef.current = {}; setLegs({}); setMenuId(null); }, [activeDay, trip?.id, stopSig]);
  useEffect(() => {
    if (!trip?.notes && noteDraft === '') return;
    if (noteDraft === (trip?.notes || '')) return;
    const t = setTimeout(() => ctx.updateTrip({ notes: noteDraft }), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteDraft]);

  if (!trip) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        <EmptyNote action="Create a trip" onAction={() => ctx.openNewTrip()}>No itinerary yet — create a trip to start planning days.</EmptyNote>
      </div>
    );
  }

  const day = activeDay || 1;
  const days = Array.from({ length: trip.daysCount }, (_, i) => i + 1);
  const dayStops = sortStopsByTime(trip.schedule?.[day] || []);
  const stay = trip.staysByDay?.[day];
  const travelers = trip.sharedId ? Math.max(1, sharedMeta?.[trip.sharedId]?.members?.length || 1) : 1;
  const dateStr = getDayDateString(trip.startDate, day);

  const onLeg = (i, leg) => { legsRef.current = { ...legsRef.current, [i]: leg }; setLegs(legsRef.current); };
  const legList = Object.values(legs).filter(Boolean);
  const totalKm = legList.reduce((s, l) => s + (l.meters || 0), 0) / 1000;
  const transportMin = legList.reduce((s, l) => s + (l.seconds || 0), 0) / 60;
  const activityMin = dayStops.filter(s => !s.isFlight).reduce((s, st) => s + (st.duration || 60), 0);

  const flowItems = [
    ...dayStops.map(s => ({ key: s.id, label: s.isFlight ? `${s.destinationCode || 'Flight'}` : s.name.split(/[,(–-]/)[0].trim(), sub: s.isFlight ? 'Flight' : stopKind(s).label.split(' ')[0], Icon: stopKind(s).Icon, tone: s.isFlight ? 'sky' : 'sage' })),
    ...(stay ? [{ key: 'stay', label: stay.name.split(/[,(–-]/)[0].trim(), sub: 'Check-in', Icon: BedDouble, tone: 'clay' }] : [])
  ];

  const header = (
    <Card className="relative overflow-hidden">
      <HeroArt />
      <div className="relative z-10 p-4 sm:p-5 flex flex-col md:flex-row md:items-center gap-5">
        <CoverImage trip={trip} className="w-full md:w-52 h-32 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] tracking-[0.22em] uppercase text-ink-3 font-medium">My Trip Itinerary</p>
          <h1 className="font-serif text-[34px] sm:text-[40px] leading-tight text-ink">{trip.name}</h1>
          <div className="flex items-center gap-2 flex-wrap mt-2 text-[13px] text-ink-2">
            <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-paper/80 border border-line"><CalendarDays className="w-4 h-4" />{formatRange(trip.startDate, trip.daysCount)}</span>
            <span className="inline-flex items-center h-8 px-3 rounded-full bg-paper/80 border border-line">{trip.daysCount} day{trip.daysCount === 1 ? '' : 's'}</span>
            <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-paper/80 border border-line"><Users className="w-4 h-4" />{travelers} traveler{travelers === 1 ? '' : 's'}</span>
            <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-sage-soft border border-sage/30"><GitBranch className="w-4 h-4" />{trip.japaneseSub || 'Multi-city'}</span>
          </div>
        </div>
        <div className="flex md:flex-col gap-2 shrink-0">
          <Btn variant="outline" icon={Share2} onClick={ctx.handleOpenShare} className="h-9">{trip.sharedId ? 'Collaborators' : 'Share'}</Btn>
          <Btn variant="outline" icon={Calendar} onClick={ctx.handleOpenEditDatesModal} className="h-9">Edit dates</Btn>
          <Btn variant="danger" icon={Trash2} onClick={ctx.handleDeleteTrip} className="h-9">Delete</Btn>
        </div>
      </div>
    </Card>
  );

  const tabBar = (
    <Card className="p-2 flex flex-col lg:flex-row lg:items-center gap-2">
      <div className="flex gap-1 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-2 h-10 px-4 rounded-full text-[14px] whitespace-nowrap cursor-pointer ${tab === t.key ? 'bg-sage-soft text-ink font-medium' : 'text-ink-2 hover:bg-cream-2'}`}>
            <t.Icon className="w-4 h-4" strokeWidth={1.8} />{t.label}
          </button>
        ))}
      </div>
      <div className="lg:ml-auto flex gap-2 flex-wrap">
        <Btn variant="outline" icon={Sparkles} onClick={() => ctx.optimizeDay(day)} title="Reorder today's stops by shortest path">Optimize Route</Btn>
        <Btn variant="outline" icon={Wand2} onClick={() => ctx.autoPlanDay(day)} title="Fill today with unscheduled saved places">Auto Plan</Btn>
        <Btn icon={Plus} onClick={ctx.handleAddDay}>Add Day</Btn>
      </div>
    </Card>
  );

  const dayList = (
    <Card className="p-3 bg-cream-2/70 overflow-hidden">
      <div className="flex items-center justify-between px-1 mb-2">
        <h3 className="font-serif text-[18px] text-ink">Trip Plan <span className="text-[13px] text-ink-3 font-sans">({trip.daysCount} Days)</span></h3>
      </div>
      <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-0.5">
        {days.map(d => {
          const active = d === day;
          return (
            <button key={d} onClick={() => { setActiveDay(d); setTab(tab === 'plan' ? 'plan' : tab); }}
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
  const plan = (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="h-11 px-4 rounded-full bg-sage-soft font-serif text-[22px] text-ink flex items-center">Day {day}</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-[24px] leading-tight text-ink truncate">{dayTitle(trip, day)}</h2>
          <p className="text-[12px] text-ink-3">{formatDayDate(trip.startDate, day)} <span className="mx-1">•</span> {dayStops.map(cityOf).find(Boolean) || trip.japaneseSub}</p>
        </div>
        <div className="flex gap-1.5">
          <button disabled={day <= 1} onClick={() => setActiveDay(day - 1)} className="w-9 h-9 rounded-full border border-line flex items-center justify-center text-ink-2 hover:bg-cream-2 disabled:opacity-40 cursor-pointer"><ChevronLeft className="w-4 h-4" /></button>
          <button disabled={day >= trip.daysCount} onClick={() => setActiveDay(day + 1)} className="w-9 h-9 rounded-full border border-line flex items-center justify-center text-ink-2 hover:bg-cream-2 disabled:opacity-40 cursor-pointer"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="relative mt-5 space-y-2.5">
        {dayStops.length > 0 && <span className="absolute left-[69px] top-5 bottom-5 border-l-2 border-dashed border-line-2" />}
        {dayStops.length === 0 && (
          <EmptyNote>No stops on Day {day} yet. Add a stop, a flight, or let Auto Plan pull from your saved places.</EmptyNote>
        )}
        {dayStops.map((stop, idx) => {
          const prev = idx > 0 ? dayStops[idx - 1] : null;
          const canLeg = prev && !prev.isFlight && !stop.isFlight && prev.lat != null && stop.lat != null;
          return (
            <React.Fragment key={stop.id}>
              {canLeg && <LegRow index={idx} from={{ lat: Number(prev.lat), lng: Number(prev.lng) }} to={{ lat: Number(stop.lat), lng: Number(stop.lng) }} departure={getDepartureDate(dateStr, stop.time)} onLeg={onLeg} />}
              <StopCard stop={stop} index={idx} trip={trip} day={day} ctx={ctx} isFirst={idx === 0} isLast={idx === dayStops.length - 1 && !stay} onMenu={setMenuId} menuOpen={menuId === stop.id} />
            </React.Fragment>
          );
        })}
        {stay && (
          <div className="relative flex items-start gap-3">
            <div className="w-12 shrink-0 text-right pt-3 text-[13px] font-medium text-ink">{stay.checkIn || '17:00'}</div>
            <div className="relative shrink-0 w-4 flex justify-center pt-3"><span className="w-5 h-5 -ml-0.5 rounded-full bg-sage-deep text-white flex items-center justify-center"><BedDouble className="w-3 h-3" /></span></div>
            <div className="flex-1 min-w-0"><StayCard stay={stay} day={day} ctx={ctx} compact /></div>
          </div>
        )}
      </div>

      <div className="mt-5 pt-4 border-t border-line flex flex-wrap gap-2">
        <Btn variant="outline" icon={Plus} onClick={ctx.openAddStop}>Add Stop</Btn>
        <Btn variant="outline" icon={Plane} onClick={ctx.handleOpenAddFlight}>Add Flight</Btn>
        <Btn variant="outline" icon={BedDouble} onClick={() => ctx.openStayModal(day, stay)}>{stay ? 'Change Stay' : 'Add Stay'}</Btn>
        {stay && <Btn variant="ghost" icon={X} onClick={() => ctx.handleUnpinStay(day)}>Remove stay</Btn>}
      </div>
    </Card>
  );

  /* ----- right column ----- */
  const right = (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="font-serif text-[18px] text-ink mb-3">Day {day} Route</h3>
        <TripMap isLoaded={isLoaded} loadError={loadError} className="h-56 rounded-xl border border-line"
          center={trip.center ? { lat: trip.center[0], lng: trip.center[1] } : undefined} zoom={trip.zoom || 11}
          stops={dayStops} stays={stay ? [stay] : []} fitKey={`day_${trip.id}_${day}`} onExpand={() => setTab('route')} />
        <h4 className="text-[14px] font-medium text-ink mt-4 mb-2">Route Flow <span className="text-ink-3 font-normal">(Day {day})</span></h4>
        {flowItems.length === 0 ? <p className="text-[12px] text-ink-3">Add stops to see the flow.</p> : (
          <div className="flex items-start gap-1 overflow-x-auto pb-1">
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

      <Card className="p-4 relative overflow-hidden">
        <h3 className="font-serif text-[18px] text-ink mb-3">Stay Tonight</h3>
        {stay ? <StayCard stay={stay} day={day} ctx={ctx} /> : (
          <EmptyNote action="Add a stay for this night" onAction={() => ctx.openStayModal(day, null)}>No stay pinned for Day {day}.</EmptyNote>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="font-serif text-[18px] text-ink mb-3">Day {day} At a Glance</h3>
        <div className="grid grid-cols-4 divide-x divide-line">
          {[
            { Icon: MapPin, v: dayStops.length, l: 'Stops' },
            { Icon: Ruler, v: totalKm ? `~ ${totalKm.toFixed(1)} km` : '–', l: 'Total Distance' },
            { Icon: Clock, v: activityMin ? `~ ${formatDuration(activityMin * 60)}` : '–', l: 'Activities' },
            { Icon: Bus, v: transportMin ? `~ ${formatDuration(transportMin * 60)}` : '–', l: 'Transport' }
          ].map(s => (
            <div key={s.l} className="flex flex-col items-center text-center px-1">
              <s.Icon className="w-4 h-4 text-clay mb-1" strokeWidth={1.8} />
              <span className="text-[13px] font-semibold text-ink leading-tight">{s.v}</span>
              <span className="text-[10px] text-ink-3 mt-0.5 leading-tight">{s.l}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );

  /* ----- other tabs ----- */
  const routeTab = (
    <Card className="p-4 sm:p-5 space-y-4">
      <h2 className="font-serif text-[24px] text-ink">Whole-trip route</h2>
      <TripMap isLoaded={isLoaded} loadError={loadError} className="h-[380px] rounded-xl border border-line"
        center={trip.center ? { lat: trip.center[0], lng: trip.center[1] } : undefined} zoom={trip.zoom || 11}
        stops={days.flatMap(d => sortStopsByTime(trip.schedule?.[d] || []))} stays={Object.values(trip.staysByDay || {})} places={trip.savedPlaces || []} fitKey={`route_${trip.id}`} />
      <div className="space-y-3">
        {days.map(d => {
          const stops = sortStopsByTime(trip.schedule?.[d] || []);
          const st = trip.staysByDay?.[d];
          if (!stops.length && !st) return null;
          return (
            <div key={d} className="flex items-start gap-3">
              <button onClick={() => { setActiveDay(d); setTab('plan'); }} className="h-8 px-2.5 rounded-lg bg-sage-soft text-[12px] font-medium text-ink shrink-0 cursor-pointer">Day {d}</button>
              <div className="flex items-center gap-1 flex-wrap text-[12px] text-ink-2">
                {stops.map((s, i) => (
                  <React.Fragment key={s.id}>
                    <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-paper border border-line">{s.isFlight ? <Plane className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}{s.isFlight ? `Flight ${s.flightNumber}` : s.name}</span>
                    {(i < stops.length - 1 || st) && <ChevronRight className="w-3 h-3 text-ink-3" />}
                  </React.Fragment>
                ))}
                {st && <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-clay-soft border border-clay/20"><BedDouble className="w-3 h-3" />{st.name}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );

  const staysTab = (
    <Card className="p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-[24px] text-ink">Stays</h2>
        <Btn icon={Plus} onClick={() => ctx.openStayModal(day, null)}>Add Stay</Btn>
      </div>
      {getGroupedStays(trip.staysByDay, trip.daysCount).length === 0 && <EmptyNote>No stays pinned yet.</EmptyNote>}
      {getGroupedStays(trip.staysByDay, trip.daysCount).map((g, i) => (
        <div key={i} className="flex items-start gap-3">
          <span className="h-8 px-2.5 rounded-lg bg-clay-soft text-[12px] font-medium text-clay-deep flex items-center shrink-0">{g.dayLabel}</span>
          <div className="flex-1 min-w-0"><StayCard stay={g.stay} day={parseInt(g.dayLabel.replace(/\D+/g, '')) || day} ctx={ctx} /></div>
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
    <Card className="p-4 sm:p-5 space-y-4">
      <div className="flex items-end justify-between">
        <h2 className="font-serif text-[24px] text-ink">Budget</h2>
        <p className="text-[13px] text-ink-2">Total <span className="font-serif text-[22px] text-ink ml-1">{budgetTotal.toLocaleString()}</span></p>
      </div>
      <form onSubmit={addBudget} className="grid grid-cols-1 sm:grid-cols-[1fr_120px_150px_auto] gap-2">
        <input value={budgetForm.label} onChange={e => setBudgetForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. JR Pass" className="h-10 px-3 rounded-xl border border-line bg-paper text-[13px] outline-none focus:border-sage" />
        <input type="number" min="0" value={budgetForm.amount} onChange={e => setBudgetForm(f => ({ ...f, amount: e.target.value }))} placeholder="Amount" className="h-10 px-3 rounded-xl border border-line bg-paper text-[13px] outline-none focus:border-sage" />
        <select value={budgetForm.category} onChange={e => setBudgetForm(f => ({ ...f, category: e.target.value }))} className="h-10 px-3 rounded-xl border border-line bg-paper text-[13px] outline-none">
          {['Flights', 'Stays', 'Food', 'Activities', 'Transport', 'Shopping', 'Other'].map(c => <option key={c}>{c}</option>)}
        </select>
        <Btn type="submit" icon={Plus}>Add</Btn>
      </form>
      {budget.length === 0 ? <EmptyNote>No expenses yet. Add flights, stays, passes and meals to track the trip cost.</EmptyNote> : (
        <ul className="divide-y divide-line">
          {budget.map(b => (
            <li key={b.id} className="flex items-center gap-3 py-2.5 text-[13px]">
              <span className="h-6 px-2 rounded-full bg-cream-2 border border-line text-[11px] text-ink-2">{b.category}</span>
              <span className="flex-1 text-ink">{b.label}</span>
              <span className="font-medium text-ink">{Number(b.amount).toLocaleString()}</span>
              <button onClick={() => ctx.updateTrip({ budget: budget.filter(x => x.id !== b.id) })} className="p-1.5 text-ink-3 hover:text-red-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  const notesTab = (
    <Card className="p-4 sm:p-5 space-y-3">
      <h2 className="font-serif text-[24px] text-ink">Notes</h2>
      <p className="text-[12px] text-ink-3">Packing lists, booking references, reminders — saved automatically{trip.sharedId ? ' and shared with collaborators' : ''}.</p>
      <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} rows={14} placeholder="Write anything about this trip…"
        className="w-full p-4 rounded-xl border border-line bg-paper text-[14px] leading-relaxed text-ink outline-none focus:border-sage resize-y" />
    </Card>
  );

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5 space-y-4" onClick={() => menuId && setMenuId(null)}>
      {header}
      {tabBar}
      <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr] xl:grid-cols-[230px_1fr_330px] gap-4 items-start">
        <div className="lg:sticky lg:top-[80px]">{dayList}</div>
        <div className="min-w-0 xl:col-span-1">
          {tab === 'plan' && plan}
          {tab === 'route' && routeTab}
          {tab === 'stays' && staysTab}
          {tab === 'budget' && budgetTab}
          {tab === 'notes' && notesTab}
        </div>
        <div className="lg:col-span-2 xl:col-span-1">{right}</div>
      </div>
    </div>
  );
}
