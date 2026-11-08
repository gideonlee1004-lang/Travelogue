import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, ConflictError, StoreError } from '../api/_store.js';

// Minimal in-memory stand-in for the subset of the MongoDB Collection API we use.
function fakeCollection() {
  const docs = new Map();
  const matches = (d, q) => d && Object.entries(q).every(([k, v]) => d[k] === v);
  return {
    docs,
    async findOne(q) { const d = docs.get(q._id); return matches(d, q) ? structuredClone(d) : null; },
    async insertOne(doc) {
      if (docs.has(doc._id)) throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      docs.set(doc._id, structuredClone(doc));
    },
    async updateOne(q, update, opts = {}) {
      const d = docs.get(q._id);
      if (matches(d, q)) { Object.assign(d, structuredClone(update.$set)); return { matchedCount: 1 }; }
      if (opts.upsert && !d) { docs.set(q._id, { _id: q._id, ...structuredClone(update.$set) }); return { matchedCount: 0, upsertedCount: 1 }; }
      return { matchedCount: 0 };
    },
    async deleteOne(q) {
      if (matches(docs.get(q._id), q)) { docs.delete(q._id); return { deletedCount: 1 }; }
      return { deletedCount: 0 };
    }
  };
}
const make = () => { const c = fakeCollection(); return { c, store: createStore(async () => c) }; };

test('read of a missing record returns nulls', async () => {
  const { store } = make();
  assert.deepEqual(await store.read('users/x'), { value: null, etag: null });
});

test('create-only write succeeds once, then conflicts', async () => {
  const { store } = make();
  const { etag } = await store.write('users/a', { n: 1 }, { overwrite: false });
  assert.ok(etag);
  await assert.rejects(store.write('users/a', { n: 2 }, { overwrite: false }), ConflictError);
  assert.deepEqual((await store.read('users/a')).value, { n: 1 });
});

test('conditional write succeeds with current revision and rotates it', async () => {
  const { store } = make();
  const first = await store.write('t/1', [1]);
  const second = await store.write('t/1', [1, 2], { ifMatch: first.etag });
  assert.notEqual(first.etag, second.etag);
  assert.deepEqual(await store.read('t/1'), { value: [1, 2], etag: second.etag });
});

test('stale revision is rejected and nothing is overwritten', async () => {
  const { store } = make();
  const first = await store.write('t/1', 'a');
  await store.write('t/1', 'b', { ifMatch: first.etag });
  await assert.rejects(store.write('t/1', 'c', { ifMatch: first.etag }), ConflictError);
  assert.equal((await store.read('t/1')).value, 'b');
});

test('conditional write to a missing record conflicts (no accidental create)', async () => {
  const { store } = make();
  await assert.rejects(store.write('t/none', 1, { ifMatch: 'nope' }), ConflictError);
  assert.equal((await store.read('t/none')).value, null);
});

test('only one of two concurrent writers using the same revision wins', async () => {
  const { store } = make();
  const { etag } = await store.write('s/1', 0);
  const results = await Promise.allSettled([
    store.write('s/1', 'A', { ifMatch: etag }),
    store.write('s/1', 'B', { ifMatch: etag })
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.reason instanceof ConflictError).length, 1);
});

test('delete honours ifMatch', async () => {
  const { store } = make();
  const { etag } = await store.write('s/1', 1);
  await assert.rejects(store.remove('s/1', { ifMatch: 'stale' }), ConflictError);
  assert.equal((await store.read('s/1')).value, 1);
  assert.deepEqual(await store.remove('s/1', { ifMatch: etag }), { deleted: true });
  assert.equal((await store.read('s/1')).value, null);
});

test('connection and driver failures surface as StoreError without leaking details', async () => {
  const down = createStore(async () => { throw new Error('mongodb+srv://user:secret@host failed'); });
  await assert.rejects(down.read('x'), err => err instanceof StoreError && !/secret/.test(err.message));
  const flaky = createStore(async () => ({ findOne: async () => { throw new Error('socket hang up secret'); } }));
  await assert.rejects(flaky.read('x'), err => err instanceof StoreError && !/secret/.test(err.message));
});
