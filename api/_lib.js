// Shared server-side helpers for Travelogue (Vercel Serverless Functions).
// Files starting with "_" inside /api are NOT exposed as routes.
import crypto from 'node:crypto';
import { createStore, getMongoCollection, isConfigured, MONGODB_URI, StoreError, ConflictError } from './_store.js';

export { StoreError, ConflictError };

// Sessions are signed with SESSION_SECRET (recommended). If it is not set, a key
// is derived from MONGODB_URI so existing deployments keep working.
const SESSION_SECRET = process.env.SESSION_SECRET || MONGODB_URI;

const COOKIE_NAME = 'tl_session';
const SESSION_SECONDS = 60 * 60 * 24 * 7; // 7 days

const store = createStore(getMongoCollection);

// ---------- MongoDB Atlas read / write ----------
// Record paths ("users/<hash>", "trips/<userId>", "shared/<id>") are used as _id.

export async function readJsonWithMeta(pathname) {
  return store.read(pathname);
}

export async function readJson(pathname) {
  return (await readJsonWithMeta(pathname)).value;
}

export async function writeJson(pathname, data, { overwrite = true, ifMatch } = {}) {
  return store.write(pathname, data, { overwrite, ifMatch });
}

export async function deleteJson(pathname, { ifMatch } = {}) {
  return store.remove(pathname, { ifMatch });
}

// Atomic read-modify-write with optimistic concurrency control.
// The conditional write only succeeds if nobody changed the record since we read it.
export async function updateJson(pathname, mutate, retries = 6) {
  const recordType = pathname.split('/')[0];
  for (let i = 0; i < retries; i++) {
    const { value, etag } = await readJsonWithMeta(pathname);
    const next = await mutate(value);
    if (next === undefined || JSON.stringify(next) === JSON.stringify(value)) {
      // Avoid unnecessary version bumps that provoke conflicts in other tabs.
      return { value, etag };
    }
    try {
      // Existing record: compare-and-set on its revision. New record: create-only.
      const written = await writeJson(pathname, next, { overwrite: !!etag, ifMatch: etag || undefined });
      return { value: next, etag: written.etag };
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err;
      // Another writer won the race: re-read and re-run the mutation.
      if (i + 1 < retries) await new Promise(resolve => setTimeout(resolve, 40 * (i + 1)));
      console.warn('[Travelogue] Conditional write rejected', { recordType, attempt: i + 1 });
    }
  }
  console.warn('[Travelogue] Write conflicts exhausted', { recordType, attempts: retries });
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
  return crypto.createHash('sha256').update(`travelogue-session:${SESSION_SECRET}`).digest();
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
  if (!isConfigured()) return null;
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
