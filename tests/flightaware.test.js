import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFlightNumber, localDate, lookupFlight, refreshFlight, AeroError } from '../api/_flightAware.js';

process.env.AEROAPI_KEY = 'test-key-only';

function mockedAeroApi({ scheduled = [], flights = [], status = 200 } = {}) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url: String(url), options });
    const path = url.pathname;
    let body;
    if (path.includes('/schedules/')) body = { scheduled };
    else if (path.includes('/airports/RJTT')) body = {
      code_iata: 'HND', code_icao: 'RJTT', name: 'Tokyo Haneda', timezone: 'Asia/Tokyo',
      latitude: 35.5494, longitude: 139.7798
    };
    else if (path.includes('/airports/WSSS')) body = {
      code_iata: 'SIN', code_icao: 'WSSS', name: 'Changi', timezone: 'Asia/Singapore',
      latitude: 1.3644, longitude: 103.9915
    };
    else if (path.includes('/flights/')) body = { flights };
    else throw new Error(`Unexpected request ${path}`);
    return { ok: status === 200, status, json: async () => body };
  };
  return { fetcher, calls };
}

const scheduledFlight = {
  ident: 'SIA638', ident_iata: 'SQ638', ident_icao: 'SIA638',
  actual_ident_icao: 'SIA638', scheduled_out: '2026-12-05T16:40:00Z',
  scheduled_in: '2026-12-06T00:00:00Z', origin: 'WSSS', origin_iata: 'SIN', origin_icao: 'WSSS',
  destination: 'RJTT', destination_iata: 'HND', destination_icao: 'RJTT', fa_flight_id: null
};
const liveFlight = {
  ident: 'SIA638', ident_iata: 'SQ638', fa_flight_id: 'SIA638-abc',
  origin: { code_iata: 'SIN', code_icao: 'WSSS' },
  scheduled_out: '2026-12-05T16:40:00Z',
  terminal_origin: '3', gate_origin: 'B8', terminal_destination: '3', gate_destination: '112',
  status: 'Scheduled', cancelled: false,
  estimated_out: '2026-12-05T16:55:00Z'
};

test('flight number parser accepts airline+digits, rejects malformed input', () => {
  assert.deepEqual(parseFlightNumber(' sq 638 '), { ident: 'SQ638', airline: 'SQ', number: 638, suffix: '' });
  assert.equal(parseFlightNumber('test flight'), null);
  assert.equal(parseFlightNumber('777777'), null);
});

test('local flight day resolves by departure airport timezone, not UTC date', () => {
  assert.equal(localDate('2026-12-05T16:40:00Z', 'Asia/Singapore'), '2026-12-06');
});

test('scheduled lookup uses flight number and date only and enriches airports for map', async () => {
  const mock = mockedAeroApi({ scheduled: [scheduledFlight] });
  const results = await lookupFlight('SQ638', '2026-12-06', { fetcher: mock.fetcher, now: new Date('2026-11-03') });
  assert.equal(results.length, 1);
  assert.equal(results[0].flightNumber, 'SQ638');
  assert.equal(results[0].departureTime, '00:40');
  assert.equal(results[0].arrivalTime, '09:00');
  assert.equal(results[0].departureTerminal, null);
  assert.equal(results[0].departureGate, null);
  assert.equal(results[0].originCode, 'SIN');
  assert.equal(results[0].destinationCode, 'HND');
  assert.equal(results[0].departureLat, 1.3644);
  assert.equal(results[0].arrivalLng, 139.7798);
  assert.equal(mock.calls.filter(c => c.url.includes('/schedules/')).length, 1);
  assert.match(mock.calls[0].url, /airline=SQ/);
  assert.match(mock.calls[0].url, /flight_number=638/);
  assert.equal(mock.calls[0].options.headers['x-apikey'], 'test-key-only');
  assert.equal(JSON.stringify(results).includes('test-key-only'), false);
});

test('lookup never returns a departure from a different local day', async () => {
  const mock = mockedAeroApi({ scheduled: [scheduledFlight] });
  const result = await lookupFlight('SQ638', '2026-12-05', { fetcher: mock.fetcher, now: new Date('2026-11-03') });
  assert.equal(result.length, 0);
});

test('lookup near departure includes reported terminal and gate from live endpoint', async () => {
  const mock = mockedAeroApi({ scheduled: [scheduledFlight], flights: [liveFlight] });
  const results = await lookupFlight('SQ638', '2026-12-06', { fetcher: mock.fetcher, now: new Date('2026-12-05') });
  assert.equal(results[0].departureTerminal, '3');
  assert.equal(results[0].departureGate, 'B8');
  assert.equal(results[0].faFlightId, liveFlight.fa_flight_id);
});

test('refresh retrieves changes to gate without requesting airport input', async () => {
  const mock = mockedAeroApi({ flights: [{ ...liveFlight, gate_origin: 'B12' }] });
  const details = await refreshFlight({
    flightNumber: 'SQ638', flightDate: '2026-12-06', scheduledOut: scheduledFlight.scheduled_out,
    originCode: 'SIN', originIcao: 'WSSS', faFlightId: 'SIA638-abc'
  }, { fetcher: mock.fetcher, now: new Date('2026-12-05') });
  assert.equal(details.departureGate, 'B12');
  assert.equal(details.departureTerminal, '3');
  assert.equal(details.outsideWindow, false);
});

test('refresh outside live API window does not spend a paid request', async () => {
  const mock = mockedAeroApi();
  const details = await refreshFlight({
    flightNumber: 'SQ638', flightDate: '2026-12-06', scheduledOut: scheduledFlight.scheduled_out,
    originCode: 'SIN'
  }, { fetcher: mock.fetcher, now: new Date('2026-11-03') });
  assert.equal(details.outsideWindow, true);
  assert.equal(mock.calls.length, 0);
});

test('bad input is rejected before an AeroAPI request is made', async () => {
  const mock = mockedAeroApi();
  await assert.rejects(lookupFlight('wrong', '2026-12-06', { fetcher: mock.fetcher }), AeroError);
  assert.equal(mock.calls.length, 0);
});
