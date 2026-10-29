// Read a private Vercel Blob's JSON and ETag in ONE consistent origin request.
// Vercel Blob SDK >= 2.6 supports useCache: false; unlike cached reads, this
// reflects the latest write and returns the matching ETag in result.blob.etag.
// Never use a separate head() ETag with content from another request.
export class SnapshotReadError extends Error {}

function strongEtag(value) {
  if (typeof value !== 'string') return false;
  const tag = value.trim();
  if (!tag || /^W\//i.test(tag) || /[\r\n]/.test(tag)) return false;
  if (tag.startsWith('"') !== tag.endsWith('"')) return false;
  const inner = tag.startsWith('"') ? tag.slice(1, -1) : tag;
  return !!inner && !inner.includes('"');
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function errorStatus(error) {
  const code = Number(error?.statusCode ?? error?.status);
  if (Number.isInteger(code) && code > 0) return code;
  // The Blob SDK sometimes throws named errors without an HTTP status field.
  if (error?.name === 'BlobServiceNotAvailable') return 503;
  if (error?.name === 'BlobServiceRateLimited') return 429;
  return null;
}

// Allow dependency injection for tests; production uses @vercel/blob's get().
export async function readConsistentBlobSnapshot(pathname, {
  token, getFn, waitFn = delay, attempts = 3
}) {
  if (!token) throw new SnapshotReadError('Blob token is not configured.');
  if (typeof getFn !== 'function') throw new SnapshotReadError('Blob read function is not configured.');

  let result;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      result = await getFn(pathname, {
        access: 'private', token, useCache: false
      });
    } catch (error) {
      if (error?.name === 'BlobNotFoundError') return { value: null, etag: null };
      const status = errorStatus(error);
      if (attempt + 1 < attempts && RETRYABLE_STATUSES.has(status)) {
        await waitFn(250 * (attempt + 1));
        continue;
      }
      throw new SnapshotReadError(
        status ? `Unable to read Vercel Blob (HTTP ${status}). Please retry saving.` :
          'Unable to read Vercel Blob. Check the Blob connection and retry saving.'
      );
    }

    if (result == null || result.statusCode === 404) {
      return { value: null, etag: null };
    }
    if (RETRYABLE_STATUSES.has(result.statusCode) && attempt + 1 < attempts) {
      await waitFn(250 * (attempt + 1));
      continue;
    }
    if (result.statusCode !== 200 || !result.stream) {
      throw new SnapshotReadError(`Unable to read Vercel Blob (HTTP ${result.statusCode}).`);
    }

    // An ETag must come from the same read as the JSON, and must be strong for
    // conditional writes. Refuse to overwrite data when the ETag is missing.
    const etag = result.blob?.etag;
    if (!strongEtag(etag)) {
      throw new SnapshotReadError('Blob response has no valid strong ETag; save was prevented.');
    }
    try {
      return { value: JSON.parse(await new Response(result.stream).text()), etag };
    } catch {
      throw new SnapshotReadError('The saved Blob content is not valid JSON; save was prevented.');
    }
  }
  throw new SnapshotReadError('Unable to read Vercel Blob after retries.');
}
