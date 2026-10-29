// Incremental co-editing responses. Keep the list of accessible shared pointers
// authoritative, but only send trip bodies when their Blob ETag changed.
// We still read an uncached snapshot to enforce current membership on every poll.
export async function collectTripUpdates(personal, userId, knownVersions, getShared, canRead, summary) {
  const pointers = (Array.isArray(personal) ? personal : [])
    .filter(t => t && typeof t.id === 'string' && typeof t.sharedId === 'string');
  const documents = await Promise.all(pointers.map(async t => {
    const { value: doc, etag } = await getShared(t.sharedId);
    return doc && canRead(doc, userId) && doc.trip?.id === t.id
      ? { pointer: { id: t.id, sharedId: t.sharedId }, doc, etag }
      : null;
  }));
  const active = documents.filter(Boolean);
  const trips = [];
  const versions = {};
  const shared = {};
  for (const { pointer, doc, etag } of active) {
    if (knownVersions?.[pointer.sharedId] === etag) continue;
    trips.push(doc.trip);
    versions[pointer.sharedId] = etag;
    shared[pointer.sharedId] = summary(doc, userId);
  }
  return { pointers: active.map(item => item.pointer), trips, versions, shared };
}
