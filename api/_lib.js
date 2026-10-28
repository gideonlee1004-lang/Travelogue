// Shared server-side helpers for Travelogue (Vercel Serverless Functions).
// Files starting with "_" inside /api are NOT exposed as routes.
import crypto from 'node:crypto';
import { put, get, head, BlobPreconditionFailedError } from '@vercel/blob';

// Your Vercel integration prefix is "TRAVELOGUE_DB", so the token variable is
// TRAVELOGUE_DB_READ_WRITE_TOKEN (not the default BLOB_READ_WRITE_TOKEN).
const TOKEN = process.env.TRAVELOGUE_DB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN || '';

const COOKIE_NAME = 'tl_session';
const SESSION_SECONDS = 60 * 60 * 24 * 7; // 7 days

export class StoreError extends Error {}
export class ConflictError extends Error {}

function ensureConfigured() {
  if (!TOKEN) {
    throw new StoreError(
      'Unable to connect to Vercel Blob: TRAVELOGUE_DB_READ_WRITE_TOKEN is not configured on the server.'
    );
  }
}

// ---------- Blob read / write (private store) ----------

export async function readJsonWithMeta(pathname) {
  ensureConfigured();
  let result;
  try {
    // @vercel/blob >= 2.6.0 supports uncached private reads. Without this,
    // ETags can be up to 60 seconds stale, making all 6 CAS writes fail.
    result = await get(pathname, { access: 'private', token: TOKEN, useCache: false });
  } catch (err) {
    if (err?.name === 'BlobNotFoundError') return { value: null, etag: null };
    throw new StoreError(`Unable to connect to Vercel Blob: ${err?.message || 'unknown error'}`);
  }
  if (!result || result.statusCode === 404) return { value: null, etag: null };
  if (result.statusCode !== 200 || !result.stream) {
    throw new StoreError(`Unable to read Vercel Blob (HTTP ${result.statusCode}).`);
  }
  try {
    const value = JSON.parse(await new Response(result.stream).text());
    // The ETag and JSON must come from the *same* origin read. Mixing a
    // cached JSON value with an ETag from head() could overwrite newer data.
    const etag = result.blob?.etag;
    if (!etag) {
      throw new Error('Blob response has no ETag; verify @vercel/blob >= 2.6.0');
    }
    return { value, etag };
  } catch (err) {
    throw new StoreError(`Unable to read data from Vercel Blob: ${err?.message || 'invalid data'}`);
  }
}

export async function readJson(pathname) {
  return (await readJsonWithMeta(pathname)).value;
}

export async function writeJson(pathname, data, { overwrite = true, ifMatch } = {}) {
  ensureConfigured();
  try {
    return await put(pathname, JSON.stringify(data), {
      access: 'private', token: TOKEN, contentType: 'application/json',
      addRandomSuffix: false, allowOverwrite: overwrite,
      ...(ifMatch ? { ifMatch } : {})
    });
  } catch (err) {
    const message = String(err?.message || '');
    if (err instanceof BlobPreconditionFailedError ||
        ['BlobPreconditionFailedError', 'BlobAlreadyExistsError', 'BlobConflictError'].includes(err?.name) ||
        [409, 412].includes(err?.status) || [409, 412].includes(err?.statusCode) ||
        /already exists|precondition failed|conflict/i.test(message)) {
      // Preserve only safe diagnostics. Never log JSON, usernames, blob paths, or tokens.
      const conflict = new ConflictError('Record was modified by another request');
      conflict.blobCode = err?.status ?? err?.statusCode ?? null;
      conflict.blobName = String(err?.name || 'UnknownBlobError');
      conflict.blobReason = /already exists/i.test(message) ? 'already_exists' :
        /precondition failed/i.test(message) ? 'precondition_failed' :
        'conflict';
      throw conflict;
    }
    throw new StoreError(`Unable to connect to Vercel Blob: ${err?.message || 'unknown error'}`);
  }
}

// Atomic read-modify-write; preserve the original six-attempt behaviour.
// Diagnose rejected conditional writes without increasing retries or overwriting blindly.
export async function updateJson(pathname, mutate, retries = 6) {
  const recordType = pathname.split('/')[0];
  const seenEtags = new Set();
  const reasons = {};
  let lastEtag = null;
  for (let i = 0; i < retries; i++) {
    const { value, etag } = await readJsonWithMeta(pathname);
    lastEtag = etag;
    seenEtags.add(etag === null ? '(missing)' : etag);
    const next = await mutate(value);
    if (next === undefined) return { value, etag };
    try {
      const written = await writeJson(pathname, next, { overwrite: !!etag, ifMatch: etag });
      return { value: next, etag: written.etag };
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err;
      const key = `${err.blobName || 'unknown'} / HTTP ${err.blobCode ?? '?'} / ${err.blobReason || 'unknown'}`;
      reasons[key] = (reasons[key] || 0) + 1;
      console.warn('[Travelogue] Blob conditional write rejected', {
        recordType, attempt: i + 1, hadReadEtag: !!etag,
        blobErrorName: err.blobName, blobHttpStatus: err.blobCode,
        reason: err.blobReason
      });
    }
  }

  // A head() check helps diagnose whether get() is returning a stale/missing
  // ETag. This only reads metadata: it never changes or overwrites trip data.
  let headExists = null;
  let headMatchesLastRead = null;
  let headDiagnosticError = null;
  try {
    const latest = await head(pathname, { token: TOKEN });
    headExists = !!latest;
    headMatchesLastRead = (latest?.etag ?? null) === lastEtag;
  } catch (err) {
    headDiagnosticError = String(err?.name || 'UnknownHeadError');
  }
  console.warn('[Travelogue] Blob ETag save conflict after retries', {
    recordType, attempts: retries, uniqueReadETags: seenEtags.size,
    lastReadHadETag: !!lastEtag, headExists, headMatchesLastRead,
    headDiagnosticError, reasons
  });
  throw new ConflictError('Too many concurrent changes. Please try again.');
}

export function sharedPathFor(id) {
  if (!/^shr_[0-9a-f-]{36}$/.test(String(id))) return null;
  return `shared/${id}.json`;
}

// ---------- Passwords ----------

export function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

export function verifyPassword(password, saltHex, expectedHashHex) {
  const { hash } = hashPassword(password, saltHex);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHashHex, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function userPathFor(email) {
  const digest = crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  return `users/${digest}.json`;
}

export function tripsPathFor(userId) {
  return `trips/${userId}.json`;
}

// ---------- Session cookie (HttpOnly, signed; nothing stored in browser storage) ----------

function sessionKey() {
  return crypto.createHash('sha256').update(`travelogue-session:${TOKEN}`).digest();
}

function sign(payload) {
  return crypto.createHmac('sha256', sessionKey()).update(payload).digest('base64url');
}

function parseCookies(header = '') {
  const out = {};
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

export function readSession(req) {
  if (!TOKEN) return null;
  const raw = parseCookies(req.headers.cookie || '')[COOKIE_NAME];
  if (!raw) return null;

  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now()) return null;
    return { id: data.id, email: data.email, name: data.name };
  } catch {
    return null;
  }
}

function cookieFlags(req) {
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https');
  return `Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
}

export function setSession(req, res, user) {
  const payload = Buffer.from(
    JSON.stringify({
      id: user.id,
      email: user.email,
      name: user.name,
      exp: Date.now() + SESSION_SECONDS * 1000
    })
  ).toString('base64url');
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${payload}.${sign(payload)}; Max-Age=${SESSION_SECONDS}; ${cookieFlags(req)}`
  );
}

export function clearSession(req, res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Max-Age=0; ${cookieFlags(req)}`);
}

// ---------- Response helper ----------

export function send(res, status, body) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(status).json(body);
}
