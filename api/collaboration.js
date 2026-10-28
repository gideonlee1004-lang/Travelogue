// Co-editing for signed-in Travelogue accounts; private Vercel Blob + ETag CAS.
// GET ?sharedId=... ; POST {action,...}; PUT {sharedId,baseTrip,trip,conflictMode?}.
import crypto from 'node:crypto';
import { del } from '@vercel/blob';
import {
  StoreError, ConflictError, readJson, writeJson, updateJson, tripsPathFor,
  sharedPathFor, readSession, send
} from './_lib.js';
import { mergeTrip, MergeConflict } from './_merge.js';
import { getShared, canRead, memberRole, summary, pointer } from './_shared.js';

const token = process.env.TRAVELOGUE_DB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN || '';
const privateTripPath = userId => tripsPathFor(userId);
const parse = req => typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
const safeTrip = (trip, original, shareId) => {
  if (!trip || typeof trip !== 'object' || Array.isArray(trip)) throw new Error('Invalid trip data');
  const out = { ...trip, id: original.id, userId: original.userId, sharedId: shareId };
  if (JSON.stringify(out).length > 1500000) throw new Error('Trip is too large');
  return out;
};

async function updatePointer(userId, tripId, replacement) {
  await updateJson(privateTripPath(userId), existing => {
    const list = Array.isArray(existing) ? [...existing] : [];
    const ix = list.findIndex(t => t?.id === tripId);
    if (ix >= 0) {
      if (replacement) list[ix] = replacement;
      else list.splice(ix, 1);
    } else if (replacement) list.push(replacement);
    return list;
  });
}

async function changeShared(shareId, userId, edit) {
  const path = sharedPathFor(shareId);
  if (!path) return { error: 'Invalid invitation link', status: 400 };
  let updated;
  try {
    updated = await updateJson(path, doc => {
      if (!doc || !canRead(doc, userId)) return undefined;
      return edit(doc);
    });
  } catch (err) {
    if (err instanceof MergeConflict) return { error: err.message, status: 409 };
    throw err;
  }
  if (!updated.value || !canRead(updated.value, userId)) {
    return { error: 'You do not have access to this shared trip.', status: 403 };
  }
  return { doc: updated.value, etag: updated.etag };
}

export default async function handler(req, res) {
  const session = readSession(req);
  if (!session) return send(res, 401, { error: 'Please sign in to collaborate.' });
  try {
    if (req.method === 'GET') {
      const { value: doc, etag } = await getShared(req.query.sharedId);
      if (!doc || !canRead(doc, session.id)) return send(res, 404, { error: 'Shared trip not found or no access.' });
      return send(res, 200, { trip: doc.trip, revision: etag, shared: summary(doc, session.id, true) });
    }

    if (req.method === 'PUT') {
      const body = parse(req);
      const path = sharedPathFor(body.sharedId);
      if (!path) return send(res, 400, { error: 'Invalid shared trip' });
      if (!body.baseTrip || !body.trip || body.trip.id !== body.baseTrip.id) {
        return send(res, 400, { error: 'Trip and baseTrip must refer to the same trip.' });
      }
      for (let i = 0; i < 6; i++) {
        const { value: doc, etag } = await getShared(body.sharedId);
        if (!doc || !canRead(doc, session.id)) return send(res, 403, { error: 'Access to this trip was removed.' });
        if (doc.trip.id !== body.trip.id) return send(res, 400, { error: 'Trip identifier mismatch.' });
        let nextTrip;
        try {
          nextTrip = mergeTrip(body.baseTrip, body.trip, doc.trip, {
            preferLocal: body.conflictMode === 'mine'
          });
        } catch (err) {
          if (err instanceof MergeConflict) return send(res, 409, {
            error: `${err.message}. Choose whether to keep your version or reload changes.`,
            trip: doc.trip, revision: etag
          });
          throw err;
        }
        const next = {
          ...doc,
          trip: safeTrip(nextTrip, doc.trip, doc.id),
          updatedAt: new Date().toISOString(),
          lastEditedBy: session.name
        };
        try {
          const wrote = await writeJson(path, next, { ifMatch: etag });
          return send(res, 200, {
            trip: next.trip, revision: wrote.etag, shared: summary(next, session.id)
          });
        } catch (err) {
          if (!(err instanceof ConflictError)) throw err;
        }
      }
      return send(res, 409, { error: 'The trip changed too frequently. Please try again.' });
    }

    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
    const body = parse(req);
    const { action, sharedId } = body;

    if (action === 'create') {
      if (typeof body.tripId !== 'string' || body.trip?.id !== body.tripId) {
        return send(res, 400, { error: 'Invalid trip ID' });
      }
      const personal = await readJson(privateTripPath(session.id));
      const owned = (Array.isArray(personal) ? personal : []).find(t => t.id === body.tripId);
      if (!owned) return send(res, 404, { error: 'Save the trip before sharing.' });
      if (owned.sharedId) return send(res, 409, { error: 'Trip is already shared. Refresh to get its link.' });
      const id = `shr_${crypto.randomUUID()}`;
      const sharedTrip = safeTrip(body.trip, owned, id);
      const doc = {
        id, trip: sharedTrip,
        members: [{ id: session.id, name: session.name, email: session.email, role: 'owner' }],
        inviteToken: crypto.randomBytes(24).toString('base64url'),
        updatedAt: new Date().toISOString(), lastEditedBy: session.name
      };
      const uploaded = await writeJson(sharedPathFor(id), doc, { overwrite: false });
      await updatePointer(session.id, owned.id, pointer(owned, id));
      return send(res, 200, { trip: sharedTrip, revision: uploaded.etag, shared: summary(doc, session.id, true) });
    }

    if (action === 'join') {
      const path = sharedPathFor(sharedId);
      if (!path || typeof body.inviteToken !== 'string') return send(res, 400, { error: 'Invalid invitation link.' });
      let result;
      try {
        result = await updateJson(path, doc => {
          if (!doc) throw new Error('Invitation expired or not found.');
          const supplied = Buffer.from(body.inviteToken);
          const expected = Buffer.from(doc.inviteToken);
          if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
            throw new Error('This invitation link is no longer valid.');
          }
          if (canRead(doc, session.id)) return undefined;
          return { ...doc, members: [...doc.members, {
            id: session.id, name: session.name, email: session.email, role: 'editor'
          }] };
        });
      } catch (err) {
        if (/invitation|expired/i.test(err.message)) return send(res, 403, { error: err.message });
        throw err;
      }
      if (!result.value) return send(res, 404, { error: 'Trip not found.' });
      const mine = await readJson(privateTripPath(session.id));
      const clash = (Array.isArray(mine) ? mine : []).find(t => t.id === result.value.trip.id && t.sharedId !== sharedId);
      if (clash) return send(res, 409, { error: 'A trip with this identifier is already in your account.' });
      await updatePointer(session.id, result.value.trip.id, pointer(result.value.trip, sharedId));
      return send(res, 200, {
        trip: result.value.trip, revision: result.etag, shared: summary(result.value, session.id)
      });
    }

    if (action === 'regenerate') {
      const { value: initial } = await getShared(sharedId);
      if (!initial || memberRole(initial, session.id) !== 'owner') {
        return send(res, 403, { error: 'Only the owner can reset invitation links.' });
      }
      const result = await changeShared(sharedId, session.id, doc => ({
        ...doc, inviteToken: crypto.randomBytes(24).toString('base64url')
      }));
      if (result.error) return send(res, result.status, { error: result.error });
      return send(res, 200, { shared: summary(result.doc, session.id, true) });
    }

    if (action === 'remove') {
      const { value: initial } = await getShared(sharedId);
      if (!initial || memberRole(initial, session.id) !== 'owner') return send(res, 403, { error: 'Only the owner can remove editors.' });
      if (initial.members.find(m => m.id === body.memberId)?.role !== 'editor') {
        return send(res, 400, { error: 'Editor not found.' });
      }
      const result = await changeShared(sharedId, session.id, doc => ({
        ...doc, members: doc.members.filter(m => m.id !== body.memberId || m.role === 'owner')
      }));
      if (result.error) return send(res, result.status, { error: result.error });
      // Prevent dangling shared pointers in a removed editor's personal index.
      await updatePointer(body.memberId, initial.trip.id, null);
      return send(res, 200, { shared: summary(result.doc, session.id, true) });
    }

    if (action === 'leave') {
      const { value: doc } = await getShared(sharedId);
      if (!doc || memberRole(doc, session.id) !== 'editor') return send(res, 403, { error: 'Only an editor can leave a shared trip.' });
      const result = await changeShared(sharedId, session.id, value => ({
        ...value, members: value.members.filter(m => m.id !== session.id)
      }));
      // changeShared's return is forbidden after departure, which is expected.
      if (result.error && result.status !== 403) return send(res, result.status, { error: result.error });
      await updatePointer(session.id, doc.trip.id, null);
      return send(res, 200, { ok: true });
    }

    if (action === 'stop') {
      const { value: doc, etag } = await getShared(sharedId);
      if (!doc || memberRole(doc, session.id) !== 'owner') return send(res, 403, { error: 'Only the owner can stop sharing.' });
      // Delete with ETag so no concurrent edit is inadvertently removed.
      try {
        await del(sharedPathFor(sharedId), { token, ifMatch: etag });
      } catch (err) {
        return send(res, 409, { error: 'Trip changed just now. Try again.' });
      }
      const ownCopy = { ...doc.trip };
      delete ownCopy.sharedId;
      await updatePointer(session.id, ownCopy.id, { ...ownCopy, userId: session.id });
      return send(res, 200, { trip: ownCopy });
    }

    return send(res, 400, { error: 'Unknown collaboration action.' });
  } catch (err) {
    if (err instanceof StoreError) return send(res, 503, { error: err.message });
    if (err instanceof ConflictError) return send(res, 409, { error: err.message });
    if (err instanceof SyntaxError || err.message === 'Invalid trip data' || err.message === 'Trip is too large') {
      return send(res, 400, { error: err.message });
    }
    console.error(err);
    return send(res, 500, { error: 'Unexpected collaboration server error.' });
  }
}
