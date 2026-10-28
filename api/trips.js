// Personal trip index and private trips. Shared trip bodies live in /shared/<id>.json.
import { StoreError, ConflictError, readJson, updateJson, tripsPathFor, readSession, send } from './_lib.js';
import { getShared, canRead, summary, pointer } from './_shared.js';

export default async function handler(req, res) {
  const session = readSession(req);
  if (!session) return send(res, 401, { error: 'Not signed in' });
  const path = tripsPathFor(session.id);

  try {
    if (req.method === 'GET') {
      const personal = await readJson(path);
      const versions = {};
      const shared = {};
      const trips = (await Promise.all((Array.isArray(personal) ? personal : []).map(async (t) => {
        if (!t?.sharedId) return t;
        const { value: doc, etag } = await getShared(t.sharedId);
        if (!doc || !canRead(doc, session.id) || doc.trip.id !== t.id) return null;
        versions[t.sharedId] = etag;
        shared[t.sharedId] = summary(doc, session.id);
        return doc.trip;
      }))).filter(Boolean);
      return send(res, 200, { trips, versions, shared });
    }

    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      if (!Array.isArray(body.trips) || body.trips.length > 150) {
        return send(res, 400, { error: 'Invalid trip list' });
      }
      const personal = [];
      for (const trip of body.trips) {
        if (!trip || typeof trip.id !== 'string') return send(res, 400, { error: 'Invalid trip' });
        if (!trip.sharedId) {
          personal.push({ ...trip, userId: session.id });
        } else {
          const { value: doc } = await getShared(trip.sharedId);
          if (!doc || !canRead(doc, session.id) || doc.trip.id !== trip.id) {
            return send(res, 403, { error: 'You no longer have access to this shared trip. Refresh.' });
          }
          personal.push(pointer(trip, trip.sharedId));
        }
      }
      // Preserve share links newly added by invite acceptances or shares since this tab last loaded.
      await updateJson(path, old => {
        const oldPointers = (Array.isArray(old) ? old : []).filter(t => t?.sharedId);
        for (const item of oldPointers) {
          if (!personal.some(t => t.sharedId === item.sharedId)) {
            const oldPrivate = personal.findIndex(t => t.id === item.id);
            if (oldPrivate >= 0) personal.splice(oldPrivate, 1);
            personal.push(item);
          }
        }
        return personal;
      });
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    if (err instanceof StoreError) return send(res, 503, { error: err.message });
    if (err instanceof ConflictError) return send(res, 409, { error: err.message });
    console.error(err);
    return send(res, 500, { error: 'Unexpected server error.' });
  }
}
