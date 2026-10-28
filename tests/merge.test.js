import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeTrip, MergeConflict } from '../api/_merge.js';

const original = () => ({
  name: 'Hokkaido',
  schedule: { 1: [{ id: 'a', name: 'Morning', time: '09:00' }, { id: 'b', name: 'Evening', time: '19:00' }] },
  savedPlaces: [{ id: 'p1', name: 'Cafe', note: 'Coffee' }],
  staysByDay: { 1: { name: 'Hotel One', address: 'Sapporo' } }
});

test('merges changes to separate trip properties', () => {
  const base = original(), mine = structuredClone(base), theirs = structuredClone(base);
  mine.name = 'Niseko'; theirs.staysByDay[1].name = 'Hotel Two';
  const result = mergeTrip(base, mine, theirs);
  assert.equal(result.name, 'Niseko');
  assert.equal(result.staysByDay[1].name, 'Hotel Two');
});

test('merges two different properties of the same saved place', () => {
  const base = original(), mine = structuredClone(base), theirs = structuredClone(base);
  mine.savedPlaces[0].note = 'Breakfast';
  theirs.savedPlaces[0].name = 'Local Cafe';
  const result = mergeTrip(base, mine, theirs);
  assert.equal(result.savedPlaces[0].note, 'Breakfast');
  assert.equal(result.savedPlaces[0].name, 'Local Cafe');
});

test('keeps two different newly added stops', () => {
  const base = original(), mine = structuredClone(base), theirs = structuredClone(base);
  mine.schedule[1].push({ id: 'new1', name: 'Lunch' });
  theirs.schedule[1].push({ id: 'new2', name: 'Market' });
  assert.deepEqual(mergeTrip(base, mine, theirs).schedule[1].map(s => s.id), ['a', 'b', 'new2', 'new1']);
});

test('preserves local stop order when remote changed a different place', () => {
  const base = original(), mine = structuredClone(base), theirs = structuredClone(base);
  mine.schedule[1].reverse();
  theirs.schedule[1][0].time = '08:00';
  const result = mergeTrip(base, mine, theirs);
  assert.deepEqual(result.schedule[1].map(s => s.id), ['b', 'a']);
  assert.equal(result.schedule[1][1].time, '08:00');
});

test('detects conflicting edits to the same field', () => {
  const base = original(), mine = structuredClone(base), theirs = structuredClone(base);
  mine.name = 'Osaka'; theirs.name = 'Kyoto';
  assert.throws(() => mergeTrip(base, mine, theirs), MergeConflict);
});

test('explicit keep mine changes only the overlapping field', () => {
  const base = original(), mine = structuredClone(base), theirs = structuredClone(base);
  mine.name = 'Osaka'; theirs.name = 'Kyoto'; theirs.staysByDay[1].address = 'Tokyo';
  const result = mergeTrip(base, mine, theirs, { preferLocal: true });
  assert.equal(result.name, 'Osaka');
  assert.equal(result.staysByDay[1].address, 'Tokyo');
});

test('does not bring back deleted places when other entries change', () => {
  const base = original(), mine = structuredClone(base), theirs = structuredClone(base);
  mine.savedPlaces = [];
  theirs.schedule[1][0].name = 'Early Lunch';
  const result = mergeTrip(base, mine, theirs);
  assert.deepEqual(result.savedPlaces, []);
  assert.equal(result.schedule[1][0].name, 'Early Lunch');
});
