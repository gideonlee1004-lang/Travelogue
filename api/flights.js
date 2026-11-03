// FlightAware proxy for lookup and flight-day updates. Login required.
import { readSession, send } from './_lib.js';
import { AeroError, lookupFlight, refreshFlight } from './_flightAware.js';

export default async function handler(req, res) {
  if (!readSession(req)) return send(res, 401, { error: 'Not signed in.' });
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    if (body.action === 'lookup') {
      const flights = await lookupFlight(body.flightNumber, body.date);
      return send(res, 200, { flights });
    }
    if (body.action === 'refresh') {
      const details = await refreshFlight(body.flight);
      return send(res, 200, { details });
    }
    return send(res, 400, { error: 'Unknown action.' });
  } catch (error) {
    if (error instanceof AeroError) return send(res, error.status, { error: error.message });
    if (error instanceof SyntaxError) return send(res, 400, { error: 'Invalid JSON request.' });
    console.error('AeroAPI flight request failed', error?.message);
    return send(res, 502, { error: 'Flight lookup could not be completed.' });
  }
}
