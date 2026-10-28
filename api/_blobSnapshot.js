// Read the JSON *and* its current ETag from the same private Blob revision.
// `head()` reads origin metadata while an ordinary `get()` can see stale CDN
// content. A stale ETag must never be paired with a new one when saving trips.
export class SnapshotChangedError extends Error {}
export class SnapshotReadError extends Error {}

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
  if (!downloadedEtag || downloadedEtag !== meta.etag) {
    // It is unsafe to combine cached JSON with the ETag from head().
    // The caller will re-read, not perform a speculative write.
    throw new SnapshotChangedError('Blob content and metadata refer to different revisions.');
  }

  try {
    return { value: JSON.parse(await response.text()), etag: downloadedEtag };
  } catch {
    throw new SnapshotReadError('The saved Blob content is not valid JSON.');
  }
}
