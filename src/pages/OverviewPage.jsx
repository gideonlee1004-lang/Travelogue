import React, { useMemo } from 'react';
import {
  Search, SlidersHorizontal, CalendarDays, Plane, BedDouble, Map as MapIcon, Users, CheckCircle2, ChevronRight, ArrowRight, MapPin, Leaf, Plus, Building2
} from 'lucide-react';
import { Hero, Card, Chip, SectionTitle, Btn, EmptyNote, WavesFooter } from '../components/Shell.jsx';
import { PlaceCard } from '../components/PlaceCard.jsx';
import { CoverImage } from '../components/PlacePhoto.jsx';
import { TripMap } from '../components/TripMap.jsx';
import { INTEREST_CHIPS, cityOf } from '../theme.js';
import { formatRange } from '../lib/helpers.js';

export function tripStats(trip, sharedMeta) {
  if (!trip) return { flights: 0, stays: 0, activities: 0, cities: 0, travelers: 1, readiness: 0, savedCount: 0 };
  const allStops = Object.values(trip.schedule || {}).flat();
  const flights = allStops.filter(s => s.isFlight).length;
  const activities = allStops.filter(s => !s.isFlight).length;
  const stays = Object.keys(trip.staysByDay || {}).length;
  const distinctStays = new Set(Object.values(trip.staysByDay || {}).map(s => s.name)).size;
  const cities = new Set([...allStops.filter(s => !s.isFlight), ...(trip.savedPlaces || [])].map(cityOf).filter(Boolean)).size || (allStops.length ? 1 : 0);
  const travelers = trip.sharedId ? Math.max(1, sharedMeta?.[trip.sharedId]?.members?.length || 1) : 1;
  const savedCount = (trip.savedPlaces || []).length;
  const readiness = Math.round(
    (flights > 0 ? 25 : 0) + Math.min(25, (stays / (trip.daysCount || 1)) * 25) +
    Math.min(30, activities * 5) + Math.min(20, savedCount * 4)
  );
  return { flights, stays, distinctStays, activities, cities, travelers, readiness, savedCount };
}

export default function OverviewPage(ctx) {
  const { user, trips, activeTrip, sharedMeta, isLoaded, loadError, navigate, setActiveTripId, setActiveDay, openNewTrip, setFilterCategory, setRecCategory } = ctx;
  const stats = useMemo(() => tripStats(activeTrip, sharedMeta), [activeTrip, sharedMeta]);
  const allStops = useMemo(() => Object.values(activeTrip?.schedule || {}).flat(), [activeTrip]);
  const otherTrips = trips.filter(t => t.id !== activeTrip?.id).slice(0, 3);
  const highlights = (activeTrip?.savedPlaces || []).slice(0, 4);
  const firstName = user?.name?.split(' ')[0];

  const [query, setQuery] = React.useState('');
  const submitSearch = e => { e.preventDefault(); openNewTrip({ name: query }); };

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5 grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-6">
      {/* ---------- Sidebar: current trip ---------- */}
      <aside className="lg:sticky lg:top-[80px] self-start">
        <Card className="overflow-hidden bg-cream-2/70">
          {activeTrip ? (
            <div className="p-4">
              <p className="text-[12px] text-ink-3">Current Trip</p>
              {trips.length > 1 ? (
                <select value={activeTrip.id} onChange={e => { setActiveTripId(e.target.value); setActiveDay(null); }}
                  className="font-serif text-[22px] text-ink bg-transparent w-full outline-none cursor-pointer -ml-0.5">
                  {trips.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              ) : (
                <h2 className="font-serif text-[22px] text-ink leading-tight">{activeTrip.name}</h2>
              )}
              <p className="text-[12px] text-ink-2 flex items-center gap-1.5 mt-1"><CalendarDays className="w-3.5 h-3.5" />{formatRange(activeTrip.startDate, activeTrip.daysCount)}</p>

              <CoverImage trip={activeTrip} className="h-32 mt-3" />

              <ul className="mt-3 divide-y divide-line">
                {[
                  { Icon: Plane, label: 'Flights', sub: stats.flights ? `${stats.flights} booked` : 'Not yet added', done: stats.flights > 0, go: 'flights' },
                  { Icon: BedDouble, label: 'Stays', sub: stats.stays ? `${stats.stays} night${stats.stays === 1 ? '' : 's'}` : 'Not yet added', done: stats.stays > 0, go: 'itinerary' },
                  { Icon: MapIcon, label: 'Activities', sub: `${stats.activities} planned`, done: false, go: 'itinerary' },
                  { Icon: Users, label: 'Travelers', sub: `${stats.travelers} adult${stats.travelers === 1 ? '' : 's'}`, done: false, go: 'profile' }
                ].map(r => (
                  <li key={r.label}>
                    <button onClick={() => navigate(r.go)} className="w-full flex items-center gap-3 py-2.5 text-left cursor-pointer">
                      <r.Icon className="w-4 h-4 text-ink-2" strokeWidth={1.8} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-medium text-ink">{r.label}</span>
                        <span className="block text-[12px] text-ink-3">{r.sub}</span>
                      </span>
                      {r.done ? <CheckCircle2 className="w-4 h-4 text-sage" /> : <ChevronRight className="w-4 h-4 text-ink-3" />}
                    </button>
                  </li>
                ))}
              </ul>

              <div className="mt-2 pt-3 border-t border-line">
                <div className="flex items-center justify-between text-[12px]"><span className="text-ink-2">Trip readiness</span><span className="font-medium text-ink">{stats.readiness}%</span></div>
                <div className="tl-progress mt-1.5"><span style={{ width: `${stats.readiness}%` }} /></div>
              </div>

              <Btn className="w-full mt-4" icon={CalendarDays} onClick={() => navigate('itinerary')}>Open Itinerary <ChevronRight className="w-4 h-4" /></Btn>
            </div>
          ) : (
            <div className="p-4">
              <p className="text-[12px] text-ink-3">Current Trip</p>
              <h2 className="font-serif text-[22px] text-ink">No trip yet</h2>
              <p className="text-[13px] text-ink-2 mt-2">Start by choosing a destination.</p>
              <Btn className="w-full mt-4" icon={Plus} onClick={() => openNewTrip()}>Create a Trip</Btn>
            </div>
          )}
          <WavesFooter />
        </Card>
      </aside>

      {/* ---------- Main ---------- */}
      <main className="min-w-0 space-y-6">
        <Hero eyebrow={firstName ? `Welcome back, ${firstName}` : 'Welcome to Travelogue'}
          title={<>Plan, Explore,<br />and <span className="tl-underline">Remember</span></>}
          subtitle="A calmer way to plan your next journey." />

        <div className="flex flex-col xl:flex-row gap-3 xl:items-center">
          <form onSubmit={submitSearch} className="relative flex-1 max-w-[460px]">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-ink-3" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Where do you want to go?"
              className="w-full h-11 pl-11 pr-10 rounded-full bg-paper border border-line text-[14px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-sage" />
            <button type="button" onClick={() => openNewTrip({ name: query })} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink cursor-pointer" title="Plan a new trip"><SlidersHorizontal className="w-4 h-4" /></button>
          </form>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {INTEREST_CHIPS.map(c => (
              <Chip key={c.key} icon={c.Icon} onClick={() => { setFilterCategory(c.category); setRecCategory(c.category); navigate('saved'); }}>{c.key}</Chip>
            ))}
          </div>
        </div>

        {activeTrip ? (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.1fr] gap-4">
            <Card className="p-5 relative overflow-hidden">
              <Leaf className="absolute -right-4 -top-4 w-28 h-28 text-sage/15" strokeWidth={0.8} />
              <p className="text-[13px] text-ink-2">Your Next Trip</p>
              <button onClick={() => navigate('itinerary')} className="flex items-center gap-2 mt-0.5 group cursor-pointer">
                <h2 className="font-serif text-[30px] text-ink leading-tight">{activeTrip.name}</h2>
                <span className="w-8 h-8 rounded-full border border-line flex items-center justify-center text-ink-2 group-hover:bg-cream-2"><ChevronRight className="w-4 h-4" /></span>
              </button>
              <p className="text-[13px] text-ink-2 flex items-center gap-1.5 mt-2"><CalendarDays className="w-4 h-4" />{formatRange(activeTrip.startDate, activeTrip.daysCount)} <span className="mx-1">·</span> {activeTrip.daysCount} day{activeTrip.daysCount === 1 ? '' : 's'}</p>
              <div className="grid grid-cols-4 mt-5 divide-x divide-line">
                {[
                  { Icon: MapPin, v: stats.cities, l: 'Cities' },
                  { Icon: BedDouble, v: stats.distinctStays || stats.stays, l: 'Stays' },
                  { Icon: MapIcon, v: stats.activities, l: 'Activities' },
                  { Icon: Plane, v: stats.flights, l: 'Flights' }
                ].map(s => (
                  <div key={s.l} className="flex flex-col items-center py-1">
                    <s.Icon className="w-5 h-5 text-clay" strokeWidth={1.8} />
                    <span className="font-serif text-2xl text-ink mt-1">{s.v}</span>
                    <span className="text-[11px] text-ink-3">{s.l}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="overflow-hidden h-[230px] xl:h-auto min-h-[230px] relative">
              <TripMap isLoaded={isLoaded} loadError={loadError} className="absolute inset-0"
                center={activeTrip.center ? { lat: activeTrip.center[0], lng: activeTrip.center[1] } : undefined} zoom={activeTrip.zoom || 10}
                places={activeTrip.savedPlaces || []} stops={allStops} stays={Object.values(activeTrip.staysByDay || {})}
                route={false} fitKey={`ov_${activeTrip.id}`} onExpand={() => navigate('itinerary')} />
            </Card>
          </div>
        ) : (
          <EmptyNote action="Create your first trip" onAction={() => openNewTrip()}>No itineraries found for {user?.email}.</EmptyNote>
        )}

        {activeTrip && (
          <section>
            <SectionTitle title="Saved Trip Highlights" action={`View All (${(activeTrip.savedPlaces || []).length})`} onAction={() => navigate('saved')} />
            {highlights.length === 0 ? (
              <EmptyNote action="Browse suggestions" onAction={() => navigate('saved')}>Save a few places and they'll appear here.</EmptyNote>
            ) : (
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                {highlights.map(p => <PlaceCard key={p.id} place={p} compact photoClass="h-28" onClick={() => navigate('saved')} />)}
              </div>
            )}
          </section>
        )}

        <section className="grid grid-cols-1 xl:grid-cols-[220px_1fr] gap-4 items-start">
          <div>
            <h2 className="font-serif text-[28px] leading-tight text-ink">Discover<br />Your Next Getaway</h2>
            <span className="block w-10 h-[3px] rounded-full bg-sage mt-2 mb-3" />
            <p className="text-[13px] text-ink-2">Your other trips and fresh ideas for meaningful travel.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {otherTrips.map(t => (
              <button key={t.id} onClick={() => { setActiveTripId(t.id); setActiveDay(null); navigate('itinerary'); }} className="text-left cursor-pointer group">
                <CoverImage trip={t} className="h-28 rounded-2xl">
                  <span className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2 text-white">
                    <span className="min-w-0">
                      <span className="block font-serif text-[18px] leading-tight truncate drop-shadow">{t.name}</span>
                      <span className="block text-[11px] opacity-90 truncate">{t.japaneseSub} · {t.daysCount} days</span>
                    </span>
                    <span className="w-7 h-7 rounded-full bg-white/90 text-ink flex items-center justify-center shrink-0 group-hover:bg-white"><ArrowRight className="w-3.5 h-3.5" /></span>
                  </span>
                </CoverImage>
              </button>
            ))}
            {Array.from({ length: Math.max(0, 3 - otherTrips.length) }).map((_, i) => (
              <button key={`new_${i}`} onClick={() => openNewTrip()} className="h-28 rounded-2xl border border-dashed border-line-2 bg-cream-2/60 hover:bg-sage-soft/60 flex flex-col items-center justify-center text-ink-2 cursor-pointer">
                <Plus className="w-5 h-5" />
                <span className="text-[13px] mt-1">Plan a new trip</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
