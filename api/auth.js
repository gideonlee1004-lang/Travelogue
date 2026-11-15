// POST /api/auth  { action: 'register' | 'login' | 'logout' | 'me' | 'updateProfile', email, password, name, profile }
import crypto from 'node:crypto';
import {
  StoreError,
  ConflictError,
  readJson,
  writeJson,
  updateJson,
  userPathFor,
  hashPassword,
  verifyPassword,
  setSession,
  clearSession,
  readSession,
  send
} from './_lib.js';
import { cleanProfilePatch, applyProfilePatch } from './_profile.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body || {};
  const { action } = body;

  try {
    if (action === 'logout') {
      clearSession(req, res);
      return send(res, 200, { ok: true });
    }

    if (action === 'me') {
      const session = readSession(req);
      if (!session) return send(res, 401, { error: 'Not signed in' });

      // Confirm the database is reachable and the account still exists
      const record = await readJson(userPathFor(session.email));
      if (!record) {
        clearSession(req, res);
        return send(res, 401, { error: 'Invalid Account or Password' });
      }
      return send(res, 200, { user: publicUser(record) });
    }

    // Photo, bio, interests and travel preferences live on the account so they follow
    // the user to every device.
    if (action === 'updateProfile') {
      const session = readSession(req);
      if (!session) return send(res, 401, { error: 'Not signed in' });
      const patch = cleanProfilePatch(body.profile);
      if (!patch) return send(res, 400, { error: 'That profile change could not be saved. If it was a photo, try a smaller image.' });
      const { value } = await updateJson(userPathFor(session.email), record =>
        record ? { ...record, profile: applyProfilePatch(record.profile, patch) } : undefined);
      if (!value) {
        clearSession(req, res);
        return send(res, 401, { error: 'Not signed in' });
      }
      return send(res, 200, { user: publicUser(value) });
    }

    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || !password) return send(res, 400, { error: 'Please fill in all required fields.' });

    if (action === 'register') {
      if (password.length < 6) {
        return send(res, 400, { error: 'Password must be at least 6 characters.' });
      }

      const { salt, hash } = hashPassword(password);
      const user = {
        id: `usr_${crypto.randomUUID()}`,
        email,
        name: String(body.name || '').trim() || email.split('@')[0],
        salt,
        hash,
        createdAt: new Date().toISOString()
      };

      try {
        // overwrite:false so an existing account is never replaced
        await writeJson(userPathFor(email), user, { overwrite: false });
      } catch (err) {
        if (err instanceof ConflictError) {
          return send(res, 409, { error: 'An account with this email already exists.' });
        }
        throw err;
      }

      setSession(req, res, user);
      return send(res, 200, { user: publicUser(user) });
    }

    if (action === 'login') {
      const record = await readJson(userPathFor(email));
      if (!record || !verifyPassword(password, record.salt, record.hash)) {
        return send(res, 401, { error: 'Invalid Account or Password' });
      }
      setSession(req, res, record);
      return send(res, 200, { user: publicUser(record) });
    }

    return send(res, 400, { error: 'Unknown action' });
  } catch (err) {
    if (err instanceof StoreError) return send(res, 503, { error: err.message });
    if (err instanceof ConflictError) return send(res, 409, { error: err.message });
    console.error(err);
    return send(res, 500, { error: 'Unexpected server error.' });
  }
}

function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, profile: u.profile || null };
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
