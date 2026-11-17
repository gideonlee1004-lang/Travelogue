import React, { useMemo } from 'react';
import { Plane, Plus, RefreshCw, CalendarDays, Armchair, Ticket, DoorOpen, Building2, AlertTriangle, ChevronRight, Trash2 } from 'lucide-react';
import { Hero, Card, Btn, EmptyNote, IconBadge, SectionTitle } from '../components/Shell.jsx';
import { TripMap } from '../components/TripMap.jsx';
import { formatDayDate } from '../lib/helpers.js';

function FlightCard({ flight, trip, day, ctx }) {
  const busy = ctx.refreshingFlightIds.includes(flight.id);
  const err = ctx.flightRefreshErrors[flight.id];
  const fmt = iso => {
    if (!iso) return null;
    try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: flight.departureTimezone || 'UTC' }); } catch { return null; }
  };
  return (
    <Card className="p-4 sm:p-5">
      <div className="sm:flex sm:items-start sm:gap-4">
        <IconBadge icon={Plane} tone="sky" className="hidden sm:flex w-11 h-11 rounded-2xl" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Plane className="sm:hidden w-5 h-5 text-[#5a7386]" strokeWidth={1.8} />
            <h3 className="font-serif text-[22px] text-ink leading-tight">{flight.flightNumber}</h3>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-cream-2 border border-line text-ink-2">{trip.name} · Day {day}</span>
            {flight.flightStatus && <span className={`text-[11px] px-2 py-0.5 rounded-full border ${flight.cancelled ? 'bg-red-50 border-red-200 text-red-700' : 'bg-sage-soft border-sage/30 text-sage-deep'}`}>{flight.cancelled ? 'Cancelled' : flight.flightStatus}</span>}
            {flight.gateChangedFrom && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Gate changed from {flight.gateChangedFrom}</span>}
          </div>
          <p className="text-[12px] text-ink-3 mt-1 flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5 shrink-0" />{formatDayDate(trip.startDate, day, true)}{flight.airline ? ` · ${flight.airline}` : ''}</p>

          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
            <div className="min-w-0">
              <p className="font-serif text-[30px] leading-none text-ink">{flight.originCode || '—'}</p>
              <p className="text-[12px] text-ink-2 truncate mt-1">{flight.departureAirport || 'Departure'}</p>
              <p className="text-[13px] font-medium text-ink mt-0.5">{flight.departureTime || flight.time || '--:--'}{flight.estimatedDepartureTime && fmt(flight.estimatedDepartureTime) !== (flight.departureTime || '') ? <span className="text-amber-700 text-[11px] ml-1">est. {fmt(flight.estimatedDepartureTime)}</span> : null}</p>
            </div>
            <div className="flex flex-col items-center text-ink-3">
              <span className="w-12 sm:w-24 border-t border-dashed border-line-2 relative"><Plane className="w-4 h-4 absolute -top-2 left-1/2 -translate-x-1/2 text-[#4f6d8a] bg-paper" /></span>
            </div>
            <div className="text-right min-w-0">
              <p className="font-serif text-[30px] leading-none text-ink">{flight.destinationCode || '—'}</p>
              <p className="text-[12px] text-ink-2 truncate mt-1">{flight.arrivalAirport || 'Arrival'}</p>
              <p className="text-[13px] font-medium text-ink mt-0.5">{flight.arrivalTime || '--:--'}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
            {[
              { Icon: Building2, l: 'Terminal', v: flight.departureTerminal || 'Not published' },
              { Icon: DoorOpen, l: 'Gate', v: flight.departureGate || 'Not assigned' },
              { Icon: Armchair, l: 'Seat', v: flight.seatNumber || '—' },
              { Icon: Ticket, l: 'Booking ref', v: flight.bookingRef || '—' }
            ].map(i => (
              <div key={i.l} className="rounded-xl bg-cream-2 border border-line px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-ink-3 flex items-center gap-1"><i.Icon className="w-3 h-3" />{i.l}</p>
                <p className="font-medium text-ink mt-0.5 truncate">{i.v}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-3 flex-wrap text-[11px] text-ink-3">
            <span>{flight.lastChecked ? `Last checked ${new Date(flight.lastChecked).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : 'Live status not checked yet'}</span>
            {flight.scheduledOut && (
              <button onClick={() => ctx.refreshSavedFlight(trip.id, day, flight, true)} disabled={busy} className="inline-flex items-center gap-1 text-[#4f6d8a] font-medium disabled:opacity-50 cursor-pointer">
                <RefreshCw className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} />Refresh
              </button>
            )}
            <button onClick={() => { ctx.setActiveTripId(trip.id); ctx.setActiveDay(day); ctx.navigate('itinerary'); }} className="inline-flex items-center gap-1 text-ink-2 hover:text-ink cursor-pointer">Open day <ChevronRight className="w-3 h-3" /></button>
            {err && <span className="text-red-600">{err}</span>}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function FlightsPage(ctx) {
  const { trips, activeTrip, isLoaded, loadError } = ctx;
  const flights = useMemo(() => trips.flatMap(trip =>
    Object.entries(trip.schedule || {}).flatMap(([day, stops]) => (stops || []).filter(s => s.isFlight).map(f => ({ flight: f, trip, day: Number(day) })))
  ).sort((a, b) => (a.flight.flightDate || '').localeCompare(b.flight.flightDate || '') || (a.flight.time || '').localeCompare(b.flight.time || '')), [trips]);

  const activeFlights = flights.filter(f => f.trip.id === activeTrip?.id);
  const others = flights.filter(f => f.trip.id !== activeTrip?.id);

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5 space-y-6">
      <Hero eyebrow="Flights" title={<span className="tl-underline">Your Flights</span>} subtitle="Every booked leg across your trips, with live terminal and gate updates.">
        <div className="mt-4"><Btn icon={Plus} onClick={ctx.handleOpenAddFlight} disabled={!activeTrip}>Add Flight{activeTrip ? ` to ${activeTrip.name}` : ''}</Btn></div>
      </Hero>

      {flights.length > 0 && (
        <Card className="overflow-hidden h-[220px] sm:h-[260px] relative">
          <TripMap isLoaded={isLoaded} loadError={loadError} className="absolute inset-0" stops={flights.map(f => f.flight)} route={false} fitKey="flights" zoom={4} center={{ lat: 20, lng: 100 }} />
        </Card>
      )}

      {flights.length === 0 ? (
        <EmptyNote action={activeTrip ? 'Add your first flight' : undefined} onAction={ctx.handleOpenAddFlight}>No flights saved yet. Add a flight number and date, and the schedule is filled in for you.</EmptyNote>
      ) : (
        <>
          {activeTrip && (
            <section>
              <SectionTitle icon={Plane} title={activeTrip.name} count={`${activeFlights.length} flight${activeFlights.length === 1 ? '' : 's'}`} subtitle="Current trip" />
              {activeFlights.length === 0 ? <EmptyNote action="Add a flight" onAction={ctx.handleOpenAddFlight}>No flights on this trip yet.</EmptyNote> : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">{activeFlights.map(f => <FlightCard key={f.flight.id} {...f} ctx={ctx} />)}</div>
              )}
            </section>
          )}
          {others.length > 0 && (
            <section>
              <SectionTitle icon={Plane} title="Other trips" count={`${others.length}`} />
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">{others.map(f => <FlightCard key={f.flight.id} {...f} ctx={ctx} />)}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
