import test from 'node:test';
import assert from 'node:assert/strict';
import { collectTripUpdates } from '../api/_tripUpdates.js';

const record = (id, etag, userId = 'u1') => ({
  value: { id: `shr_${id}`, trip: { id, name: id }, members: [{ id: userId }] }, etag
});
const canRead = (doc, userId) => doc.members.some(m => m.id === userId);
const summary = doc => ({ id: doc.id });
const pointers = [
  { id: 'one', sharedId: 'shr_one' },
  { id: 'two', sharedId: 'shr_two' },
  { id: 'removed', sharedId: 'shr_removed' },
  { id: 'private', name: 'Local Trip' }
];
const fetch = async id => ({
  shr_one: record('one', 'etag1'),
  shr_two: record('two', 'etag2'),
  shr_removed: record('removed', 'etag3', 'different-user')
})[id];

test('poll omits unmodified trip bodies while reporting current valid pointers', async () => {
  const result = await collectTripUpdates(pointers, 'u1', { shr_one: 'etag1', shr_two: 'older' },
    fetch, canRead, summary);
  assert.deepEqual(result.pointers, [pointers[0], pointers[1]]);
  assert.deepEqual(result.trips, [{ id: 'two', name: 'two' }]);
  assert.deepEqual(result.versions, { shr_two: 'etag2' });
  assert.deepEqual(result.shared, { shr_two: { id: 'shr_two' } });
});

test('first poll sends all accessible trips; identical poll sends zero bodies', async () => {
  const initial = await collectTripUpdates(pointers, 'u1', {}, fetch, canRead, summary);
  assert.equal(initial.trips.length, 2);
  const repeat = await collectTripUpdates(pointers, 'u1', initial.versions, fetch, canRead, summary);
  assert.deepEqual(repeat.trips, []);
  assert.deepEqual(repeat.versions, {});
});

test('missing shared doc is treated as removed, never returned to an old editor', async () => {
  const result = await collectTripUpdates(pointers, 'u1', {}, async id =>
    id === 'shr_one' ? { value: null, etag: null } : fetch(id), canRead, summary);
  assert.deepEqual(result.pointers, [pointers[1]]);
  assert.equal(result.trips.length, 1);
});
