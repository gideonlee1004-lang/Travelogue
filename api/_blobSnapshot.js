// Private Vercel Blob reads for optimistic concurrency control.
// Prefer the ETag returned alongside the origin GET. Some Blob responses omit
// that metadata; for writes, a HEAD/GET/HEAD stability check can recover the
// ETag without pairing a stale document with a newer version token.
export class SnapshotReadError extends Error {}

function strongEtag(value) {
  if (typeof value !== 'string') return false;
  const tag = value.trim();
  if (!tag || /^W\//i.test(tag) || /[\r\n]/.test(tag)) return false;
  if (tag.startsWith('"') !== tag.endsWith('"')) return false;
  const inner = tag.startsWith('"') ? tag.slice(1, -1) : tag;
  return !!inner && !inner.includes('"');
}

function responseEtag(result) {
  const metadataTag = result?.blob?.etag;
  if (strongEtag(metadataTag)) return metadataTag.trim();
  const headers = result?.headers;
  const headerTag = typeof headers?.get === 'function'
    ? headers.get('etag')
    : headers?.etag ?? headers?.ETag ?? headers?.ETAG;
  return strongEtag(headerTag) ? headerTag.trim() : null;
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function errorStatus(error) {
  const code = Number(error?.statusCode ?? error?.status);
  if (Number.isInteger(code) && code > 0) return code;
  if (error?.name === 'BlobServiceNotAvailable') return 503;
  if (error?.name === 'BlobServiceRateLimited') return 429;
  return null;
}

async function cancelStream(result) {
  try { await result?.stream?.cancel?.(); } catch { /* Best-effort cleanup. */ }
}

function parseBlobJson(result) {
  if (result?.statusCode !== 200 || !result.stream) {
    throw new SnapshotReadError(`Unable to read Vercel Blob (HTTP ${result?.statusCode ?? 'unknown'}).`);
  }
  return new Response(result.stream).text().then(text => {
    try { return JSON.parse(text); } catch {
      throw new SnapshotReadError('The saved Blob content is not valid JSON; no changes were written.');
    }
  });
}

// When GET omits its ETag, HEAD alone is NOT a safe fallback: another editor
// could write between the body GET and the HEAD. Instead, check HEAD before
// AND after a new uncached GET. Both metadata reads must return the SAME ETag.
// The ensuing conditional put(ifMatch) protects the remaining race window.
async function readWithVerifiedHead(pathname, { token, getFn, headFn }) {
  if (typeof headFn !== 'function') return null;
  const before = await headFn(pathname, { token });
  if (!strongEtag(before?.etag)) return null;
  const expectedTag = before.etag.trim();
  const fresh = await getFn(pathname, { access: 'private', token, useCache: false });
  if (!fresh || fresh.statusCode === 404) return { retry: true };
  if (fresh.statusCode !== 200 || !fresh.stream) {
    if (RETRYABLE_STATUSES.has(fresh.statusCode)) return { retry: true };
    throw new SnapshotReadError(`Unable to read Vercel Blob (HTTP ${fresh.statusCode}).`);
  }
  // If the second GET does include an ETag, it must agree with HEAD too.
  const freshTag = responseEtag(fresh);
  if (freshTag && freshTag !== expectedTag) {
    await cancelStream(fresh);
    return { retry: true };
  }
  const value = await parseBlobJson(fresh);
  const after = await headFn(pathname, { token });
  if (!strongEtag(after?.etag)) return null;
  if (after.etag.trim() !== expectedTag) return { retry: true };
  return { value, etag: expectedTag };
}

// Reads can proceed without ETags. Writes require an ETag for existing data.
// No blind overwrite is ever permitted, even when the fallback cannot verify
// metadata. In tests getFn/headFn are replaceable with in-memory Blob mocks.
export async function readConsistentBlobSnapshot(pathname, {
  token, getFn, headFn, waitFn = delay, attempts = 3, requireEtag = false
}) {
  if (!token) throw new SnapshotReadError('Blob token is not configured.');
  if (typeof getFn !== 'function') throw new SnapshotReadError('Blob read function is not configured.');

  for (let attempt = 0; attempt < attempts; attempt++) {
    let initialRead = true;
    try {
      const result = await getFn(pathname, {
        access: 'private', token, useCache: false
      });
      initialRead = false;
      if (result == null || result.statusCode === 404) return { value: null, etag: null };
      if (RETRYABLE_STATUSES.has(result.statusCode)) {
        if (attempt + 1 < attempts) { await waitFn(250 * (attempt + 1)); continue; }
        throw new SnapshotReadError(`Unable to read Vercel Blob (HTTP ${result.statusCode}).`);
      }
      if (result.statusCode !== 200 || !result.stream) {
        throw new SnapshotReadError(`Unable to read Vercel Blob (HTTP ${result.statusCode}).`);
      }

      const etag = responseEtag(result);
      if (etag || !requireEtag) {
        return { value: await parseBlobJson(result), etag };
      }

      // Only mutations need fallback verification. Discard the earlier stream:
      // the document body must be read *between* the two HEAD calls.
      await cancelStream(result);
      const verified = await readWithVerifiedHead(pathname, { token, getFn, headFn });
      if (verified && !verified.retry) return verified;
      if (verified?.retry && attempt + 1 < attempts) {
        await waitFn(100 * (attempt + 1));
        continue;
      }
      if (verified?.retry) {
        throw new SnapshotReadError('The trip changed while saving. Please retry; no changes were overwritten.');
      }
      throw new SnapshotReadError(
        'Vercel Blob did not provide an ETag from either GET or verified HEAD reads. '
        + 'No changes were written. Check that the private Blob store and @vercel/blob SDK are up to date.'
      );
    } catch (error) {
      if (error instanceof SnapshotReadError) throw error;
      // An existing blob was deleted while resolving metadata. Re-read rather
      // than using the old body or returning an empty object for an update.
      if (error?.name === 'BlobNotFoundError') {
        if (initialRead) return { value: null, etag: null };
        if (attempt + 1 < attempts) { await waitFn(100 * (attempt + 1)); continue; }
        throw new SnapshotReadError('The record changed while saving. Please retry.');
      }
      const status = errorStatus(error);
      if (attempt + 1 < attempts && RETRYABLE_STATUSES.has(status)) {
        await waitFn(250 * (attempt + 1));
        continue;
      }
      throw new SnapshotReadError(
        status ? `Unable to read Vercel Blob (HTTP ${status}). Please retry.` :
          'Unable to read Vercel Blob. Check the Blob connection and retry.'
      );
    }
  }
  throw new SnapshotReadError('Unable to read Vercel Blob after retries.');
}
