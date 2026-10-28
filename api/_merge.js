// Three-way merge used by the collaboration API (pure and independently tested).
// Field-level edits and objects with stable ids can be merged without lost updates.
export class MergeConflict extends Error {
  constructor(path) {
    super(`Conflicting edits at ${path || 'trip'}`);
    this.path = path;
  }
}

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const obj = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keyed = arr => Array.isArray(arr) && arr.every(v => obj(v) && typeof v.id === 'string') &&
  new Set(arr.map(v => v.id)).size === arr.length;

export function mergeTrip(base, local, remote, { preferLocal = false } = {}) {
  function merge(a, b, c, path) {
    if (eq(b, a)) return c;
    if (eq(c, a) || eq(b, c)) return b;
    if (obj(b) && obj(c) && (obj(a) || a === undefined)) {
      const result = {};
      for (const key of new Set([...Object.keys(a || {}), ...Object.keys(b), ...Object.keys(c)])) {
        const value = merge(a?.[key], b[key], c[key], `${path}.${key}`);
        if (value !== undefined) result[key] = value;
      }
      return result;
    }
    if (Array.isArray(b) && Array.isArray(c) && (Array.isArray(a) || a === undefined) &&
        keyed(b) && keyed(c) && keyed(a || [])) {
      const old = new Map((a || []).map(v => [v.id, v]));
      const mine = new Map(b.map(v => [v.id, v]));
      const theirs = new Map(c.map(v => [v.id, v]));
      const baseOrder = (a || []).map(v => v.id).filter(id => mine.has(id) && theirs.has(id));
      const localOrder = b.map(v => v.id).filter(id => old.has(id) && theirs.has(id));
      const remoteOrder = c.map(v => v.id).filter(id => old.has(id) && mine.has(id));
      const reorderedLocal = !eq(localOrder, baseOrder);
      const reorderedRemote = !eq(remoteOrder, baseOrder);
      if (reorderedLocal && reorderedRemote && !eq(localOrder, remoteOrder) && !preferLocal) {
        throw new MergeConflict(`${path}.order`);
      }
      // Preserve deliberate drag/arrow reordering while keeping newly added stops.
      const first = (reorderedLocal && (!reorderedRemote || preferLocal)) ? b : c;
      const second = first === b ? c : b;
      const ids = [...new Set([...first.map(v => v.id), ...second.map(v => v.id)])];
      return ids.map(id => merge(old.get(id), mine.get(id), theirs.get(id), `${path}[${id}]`))
        .filter(item => item !== undefined);
    }
    if (preferLocal) return b;
    throw new MergeConflict(path);
  }
  return merge(base, local, remote, 'trip');
}
