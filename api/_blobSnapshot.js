// Read a private Vercel Blob's JSON and ETag in one consistent origin request.
// "useCache: false" bypasses the Blob CDN's potentially stale data after an
// overwrite. Never combine the JSON from one GET with an ETag from a HEAD or
// another GET: that could allow a stale edit to overwrite a newer document.
export class SnapshotReadError extends Error {}

function strongEtag(value) {
  if (typeof value !== 'string') return false;
  const tag = value.trim();
  if (!tag || /^W\//i.test(tag) || /[\r\n]/.test(tag)) return false;
  if (tag.startsWith('"') !== tag.endsWith('"')) return false;
  const inner = tag.startsWith('"') ? tag.slice(1, -1) : tag;
  return !!inner && !inner.includes('"');
}

// The SDK normally supplies blob.etag. Its raw response headers provide a
// same-response fallback for SDK/edge variants that omit the metadata field.
// Do NOT fall back to head(): that metadata might belong to different content.
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

// Read-only requests may safely load data without an ETag. Mutations MUST
// request requireEtag: true, so an existing record is never written without
// a verified ETag from the same response as the document body.
export async function readConsistentBlobSnapshot(pathname, {
  token, getFn, waitFn = delay, attempts = 3, requireEtag = false
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
        status ? `Unable to read Vercel Blob (HTTP ${status}). Please retry.` :
          'Unable to read Vercel Blob. Check the Blob connection and retry.'
      );
    }

    if (result == null || result.statusCode === 404) return { value: null, etag: null };
    if (RETRYABLE_STATUSES.has(result.statusCode) && attempt + 1 < attempts) {
      await waitFn(250 * (attempt + 1));
      continue;
    }
    if (result.statusCode !== 200 || !result.stream) {
      throw new SnapshotReadError(`Unable to read Vercel Blob (HTTP ${result.statusCode}).`);
    }

    const etag = responseEtag(result);
    if (requireEtag && !etag) {
      throw new SnapshotReadError(
        'Blob did not return a valid ETag for a safe update. No changes were written. '
        + 'Check the Vercel Blob connection and SDK version.'
      );
    }
    try {
      const value = JSON.parse(await new Response(result.stream).text());
      return { value, etag };
    } catch {
      throw new SnapshotReadError('The saved Blob content is not valid JSON; no changes were written.');
    }
  }
  throw new SnapshotReadError('Unable to read Vercel Blob after retries.');
}
