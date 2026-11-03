// FlightAware AeroAPI v4 adapter. Called only by the authenticated server-side /api/flights route.
// Never ship AEROAPI_KEY to the browser.
const BASE = 'https://aeroapi.flightaware.com/aeroapi';
const airportCache = new Map();

export function parseFlightNumber(value) {
  const ident = String(value || '').toUpperCase().replace(/[\s-]/g, '');
  const match = ident.match(/^([A-Z]{3}|[A-Z0-9]{2})(\d{1,4})([A-Z]?)$/);
  if (!match || !/[A-Z]/.test(match[1])) return null;
  return { ident, airline: match[1], number: Number(match[2]), suffix: match[3] };
}

export function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function shiftUTCDate(value, days) {
  const dt = new Date(`${value}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function localDate(iso, timezone) {
  if (!iso || !timezone) return null;
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(iso)).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch { return null; }
}

export function localTime(iso, timezone) {
  if (!iso || !timezone) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(new Date(iso));
  } catch { return ''; }
}

export function matchesIdent(flight, parsed) {
  return [flight.ident, flight.ident_iata, flight.ident_icao,
    flight.actual_ident, flight.actual_ident_iata, flight.actual_ident_icao,
    ...(Array.isArray(flight.codeshares) ? flight.codeshares : [])]
    .some(id => String(id || '').replace(/[\s-]/g, '').toUpperCase() === parsed.ident);
}

const code = (val) => String(val || '').trim().toUpperCase();
const validCode = (val) => /^[A-Z0-9]{3,4}$/.test(code(val));
const airportCode = (a) => typeof a === 'object' && a
  ? code(a.code_iata || a.code_icao || a.code) : code(a);
const airportKey = (a) => typeof a === 'object' && a
  ? code(a.code_icao || a.code_iata || a.code) : code(a);

export class AeroError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

async function request(path, params = {}, fetcher = fetch) {
  const key = process.env.AEROAPI_KEY;
  if (!key) throw new AeroError('AEROAPI_KEY is not configured in your Vercel environment variables.', 503);
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) url.searchParams.set(k, String(v));
  let response;
  try {
    response = await fetcher(url, {
      headers: { 'x-apikey': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(12000)
    });
  } catch {
    throw new AeroError('Unable to reach FlightAware. Please try again.');
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new AeroError('AeroAPI rejected the key or your plan cannot access this endpoint.', 502);
    if (response.status === 429) throw new AeroError('FlightAware rate limit reached. Try again shortly.', 429);
    if (response.status === 404) throw new AeroError('Flight not found on FlightAware.', 404);
    throw new AeroError(`FlightAware request failed (HTTP ${response.status}).`);
  }
  try { return await response.json(); }
  catch { throw new AeroError('FlightAware returned an invalid response.'); }
}

async function getAirport(id, fetcher) {
  if (!validCode(id)) return null;
  const key = code(id);
  const cached = airportCache.get(key);
  if (cached && cached.expiry > Date.now()) return cached.data;
  try {
    const data = await request(`/airports/${encodeURIComponent(key)}`, {}, fetcher);
    const result = {
      code: data.code_iata || data.code_icao || key,
      icao: data.code_icao || null,
      timezone: data.timezone || null,
      name: data.name || null,
      latitude: Number.isFinite(Number(data.latitude)) && data.latitude != null ? Number(data.latitude) : null,
      longitude: Number.isFinite(Number(data.longitude)) && data.longitude != null ? Number(data.longitude) : null
    };
    airportCache.set(key, { data: result, expiry: Date.now() + 24 * 60 * 60 * 1000 });
    return result;
  } catch { return null; } // Airport metadata is best-effort; don't fabricate information.
}

function bestLiveMatch(flights, selected) {
  const primary = flights.filter(f =>
    selected.faFlightId && f.fa_flight_id === selected.faFlightId);
  if (primary.length) return primary[0];
  const matching = flights.filter(f => {
    const flightIdents = [selected.flightNumber, selected.operatingIdent].filter(Boolean);
    if (!flightIdents.some(ident => matchesIdent(f, parseFlightNumber(ident) || { ident }))) return false;
    const dep = airportKey(f.origin);
    const old = code(selected.originIcao || selected.originCode);
    const airportMatches = dep === old || airportCode(f.origin) === code(selected.originCode);
    if (!airportMatches) return false;
    const a = Date.parse(f.scheduled_out || f.scheduled_off || '');
    const b = Date.parse(selected.scheduledOut || '');
    // A flight may move its scheduled time, but not an entire calendar day.
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 20 * 60 * 60 * 1000;
  });
  matching.sort((a, b) => Math.abs(Date.parse(a.scheduled_out || a.scheduled_off) - Date.parse(selected.scheduledOut)) -
    Math.abs(Date.parse(b.scheduled_out || b.scheduled_off) - Date.parse(selected.scheduledOut)));
  return matching[0] || null;
}

function liveFields(f) {
  if (!f) return {};
  return {
    faFlightId: f.fa_flight_id || null,
    departureTerminal: f.terminal_origin || null,
    arrivalTerminal: f.terminal_destination || null,
    departureGate: f.gate_origin || null,
    arrivalGate: f.gate_destination || null,
    estimatedDepartureTime: f.estimated_out || null,
    estimatedArrivalTime: f.estimated_in || null,
    flightStatus: f.status || null,
    cancelled: !!f.cancelled,
    actualDepartureTime: f.actual_out || null,
    actualArrivalTime: f.actual_in || null
  };
}

async function getLive(selected, fetcher) {
  const ident = selected.faFlightId || selected.operatingIdent || selected.flightNumber;
  if (!ident || !/^[A-Za-z0-9-]{3,90}$/.test(ident)) return null;
  const data = await request(`/flights/${encodeURIComponent(ident)}`, { max_pages: 2 }, fetcher);
  return bestLiveMatch(data.flights || [], selected);
}

function withinLiveWindow(date, now = new Date()) {
  const target = Date.parse(`${date}T00:00:00Z`);
  // Local departure date may be UTC +/- one day. Only use live endpoint around flight time.
  return target >= now.getTime() - 10 * 86400000 && target <= now.getTime() + 3 * 86400000;
}

export async function lookupFlight(flightNumber, date, { fetcher = fetch, now = new Date() } = {}) {
  const parsed = parseFlightNumber(flightNumber);
  if (!parsed || !isValidDate(date)) throw new AeroError('Enter a valid flight number (e.g. SQ638) and departure date.', 400);
  const t = Date.parse(`${date}T00:00:00Z`);
  if (t < now.getTime() - 92 * 86400000 || t > now.getTime() + 364 * 86400000) {
    throw new AeroError('Scheduled flights are available for up to 3 months ago and 1 year ahead.', 400);
  }
  // Search one UTC day before through two UTC days after to cover all origin timezones.
  // FlightAware schedules are not filtered by local date; verify using origin timezone.
  const schedules = await request(`/schedules/${shiftUTCDate(date, -1)}/${shiftUTCDate(date, 2)}`, {
    airline: parsed.airline, flight_number: parsed.number,
    include_codeshares: true, max_pages: 3
  }, fetcher);
  const rough = (schedules.scheduled || []).filter(s => matchesIdent(s, parsed) && s.scheduled_out);
  const airportIds = [...new Set(rough.slice(0, 30).flatMap(s => [
    s.origin_icao || s.origin, s.destination_icao || s.destination
  ]).filter(validCode))].slice(0, 12);
  const airports = new Map(await Promise.all(airportIds.map(async id => [code(id), await getAirport(id, fetcher)])));
  const matched = rough.filter(s => {
    const o = airports.get(code(s.origin_icao || s.origin));
    const exact = localDate(s.scheduled_out, o?.timezone);
    // Without timezone don't pretend to know the departure date. UTC day is a fallback
    // only when it equals the selected date.
    return exact ? exact === date : s.scheduled_out.slice(0, 10) === date;
  });
  const flights = matched.slice(0, 10).map((s, i) => {
    const origin = airports.get(code(s.origin_icao || s.origin));
    const destination = airports.get(code(s.destination_icao || s.destination));
    return {
      candidateId: String(i),
      flightNumber: parsed.ident,
      operatingIdent: s.actual_ident_icao || s.actual_ident_iata || s.actual_ident || s.ident_icao || s.ident || parsed.ident,
      faFlightId: s.fa_flight_id || null,
      flightDate: date,
      scheduledOut: s.scheduled_out,
      scheduledIn: s.scheduled_in || null,
      departureTime: localTime(s.scheduled_out, origin?.timezone),
      arrivalTime: localTime(s.scheduled_in, destination?.timezone),
      departureTimezone: origin?.timezone || '',
      arrivalTimezone: destination?.timezone || '',
      departureAirport: origin?.name || s.origin_iata || s.origin || '',
      arrivalAirport: destination?.name || s.destination_iata || s.destination || '',
      originCode: s.origin_iata || origin?.code || s.origin || '',
      destinationCode: s.destination_iata || destination?.code || s.destination || '',
      originIcao: s.origin_icao || origin?.icao || '',
      destinationIcao: s.destination_icao || destination?.icao || '',
      departureLat: origin?.latitude ?? null,
      departureLng: origin?.longitude ?? null,
      arrivalLat: destination?.latitude ?? null,
      arrivalLng: destination?.longitude ?? null,
      departureTerminal: null, arrivalTerminal: null,
      departureGate: null, arrivalGate: null,
      estimatedDepartureTime: null, estimatedArrivalTime: null,
      flightStatus: 'Scheduled', cancelled: false,
      lastChecked: null
    };
  });
  // Only need a live request for flights within the recent/live window.
  if (flights.length && withinLiveWindow(date, now)) {
    await Promise.all(flights.map(async flight => {
      try {
        const live = await getLive(flight, fetcher);
        if (live) Object.assign(flight, liveFields(live), { lastChecked: now.toISOString() });
      } catch { /* Still show published schedule, if live feed is unavailable. */ }
    }));
  }
  return flights;
}

export async function refreshFlight(selected, { fetcher = fetch, now = new Date() } = {}) {
  if (!selected || !parseFlightNumber(selected.flightNumber) || !isValidDate(selected.flightDate) ||
      !selected.scheduledOut || !validCode(selected.originIcao || selected.originCode)) {
    throw new AeroError('Saved flight is missing its AeroAPI identity.', 400);
  }
  if (!withinLiveWindow(selected.flightDate, now)) {
    return { lastChecked: null, outsideWindow: true };
  }
  const live = await getLive(selected, fetcher);
  if (!live) throw new AeroError('Live flight details are not published yet. Check again nearer departure.', 404);
  return { ...liveFields(live), lastChecked: now.toISOString(), outsideWindow: false };
}
