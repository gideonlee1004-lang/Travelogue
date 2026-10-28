// Read the JSON *and* its current ETag from the same private Blob revision.
// `head()` reads origin metadata while an ordinary `get()` can see stale CDN
// content. A stale ETag must never be paired with a new one when saving trips.
export class SnapshotChangedError extends Error {
  constructor(message, diagnostic = {}) {
    super(message);
    this.diagnostic = diagnostic;
  }
}
export class SnapshotReadError extends Error {}

// Vercel Blob metadata returns a strong ETag (e.g. "abc"), while the private
// content endpoint may return a weak form (W/"abc") of that same identifier.
// For a *fresh, cache-bypassed read of the same Blob*, compare the opaque
// identifiers, but ALWAYS use the original strong HEAD ETag for ifMatch.
// A weak HTTP ETag is NEVER suitable as an If-Match write precondition.
// Different identifiers, malformed validators and weak HEAD values all fail
// closed rather than risking an overwrite of a different revision.
export function strongEtagToken(value) {
  if (typeof value !== 'string') return null;
  const etag = value.trim();
  if (!etag || /^W\//i.test(etag)) return null;
  if (etag.startsWith('"') !== etag.endsWith('"')) return null;
  const token = etag.startsWith('"') ? etag.slice(1, -1) : etag;
  return token && !/["\r\n]/.test(token) ? token : null;
}

// Accept a weak validator ONLY for comparing an origin GET's identifier with
// the strong identifier returned by head(). This is NOT HTTP strong equality.
// The strong HEAD ETag remains the only validator used for a conditional PUT.
export function contentEtagToken(value) {
  if (typeof value !== 'string') return null;
  const tag = value.trim();
  if (/^W\//i.test(tag)) {
    // A weak HTTP ETag has the form W/"opaque-token" (not W/token).
    if (!/^W\/"[^"\r\n]+"$/i.test(tag)) return null;
    return strongEtagToken(tag.slice(2));
  }
  return strongEtagToken(tag);
}

function etagShape(etag) {
  return {
    present: typeof etag === 'string' && etag.length > 0,
    length: typeof etag === 'string' ? etag.length : 0,
    quoted: typeof etag === 'string' && etag.startsWith('"') && etag.endsWith('"'),
    weak: typeof etag === 'string' && /^W\//i.test(etag)
  };
}

function cacheSignals(response) {
  const age = response.headers?.get('age');
  const cache = response.headers?.get('x-vercel-cache') || response.headers?.get('cf-cache-status');
  return {
    cacheAgeSeconds: age && /^\d+$/.test(age) ? Number(age) : null,
    cacheStatus: /^(HIT|MISS|STALE|BYPASS|DYNAMIC)$/i.test(cache || '') ? cache.toUpperCase() : null
  };
}

// Injectable dependencies allow verifying these safety guarantees without
// requiring access to a user's Vercel Blob store in the automated tests.
export async function readVerifiedBlobSnapshot(pathname, { token, headFn, fetchFn = fetch }) {
  if (!token) throw new SnapshotReadError('Blob token is not configured.');

  let meta;
  try {
    meta = await headFn(pathname, { token });
  } catch (error) {
    if (error?.name === 'BlobNotFoundError') return { value: null, etag: null };
    throw new SnapshotReadError('Unable to check the latest Blob metadata.');
  }
  if (!meta?.url || !meta?.etag) {
    throw new SnapshotReadError('Blob metadata is missing its URL or ETag.');
  }

  // Obtain the URL from the Blob API, not from a user request. Restrict the host
  // before attaching the read-write token to any HTTP request.
  let url;
  try {
    url = new URL(meta.url);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.private.blob.vercel-storage.com')) {
      throw new Error('unexpected origin');
    }
    // Vercel documents this query param as the consistent-read / CDN-bypass mechanism.
    url.searchParams.set('cache', '0');
  } catch {
    throw new SnapshotReadError('Blob metadata contained an unexpected private-storage URL.');
  }

  let response;
  try {
    response = await fetchFn(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' },
      cache: 'no-store'
    });
  } catch {
    throw new SnapshotReadError('Unable to fetch the latest Blob content.');
  }

  // A concurrent delete/replace during the read is retriable. Do not let a
  // missing response turn into an unconditional overwrite of an existing Blob.
  if (response.status === 404) throw new SnapshotChangedError('Blob changed while reading.');
  if (!response.ok) throw new SnapshotReadError(`Latest Blob read failed (HTTP ${response.status}).`);

  const downloadedEtag = response.headers.get('etag');
  const metadataToken = strongEtagToken(meta.etag);
  const contentToken = contentEtagToken(downloadedEtag);
  if (!metadataToken || !contentToken || metadataToken !== contentToken) {
    // Diagnose without logging blob paths, raw ETags, data, or tokens.
    // Never write when opaque identifiers are missing or disagree.
    throw new SnapshotChangedError('Blob content and metadata refer to different revisions.', {
      mismatch: !metadataToken ? 'invalid_metadata_etag' :
        !contentToken ? 'missing_or_invalid_content_etag' : 'different_etag_values',
      metadataTag: etagShape(meta.etag),
      contentTag: etagShape(downloadedEtag),
      ...cacheSignals(response)
    });
  }

  try {
    // Only the strong validator from head() can be used as the put() ifMatch.
    return { value: JSON.parse(await response.text()), etag: meta.etag };
  } catch {
    throw new SnapshotReadError('The saved Blob content is not valid JSON.');
  }
}
