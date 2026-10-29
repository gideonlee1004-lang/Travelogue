import test from 'node:test';
import assert from 'node:assert/strict';
import { readConsistentBlobSnapshot, SnapshotReadError } from '../api/_blobSnapshot.js';

const trip = [{ id: 'trip1', name: 'Hokkaido' }];
const result = (body = trip, etag = '"revision-2"') => ({
  statusCode: 200, blob: { etag },
  stream: new Response(JSON.stringify(body)).body
});
const read = (getFn, extra = {}) => readConsistentBlobSnapshot('trips/user1.json', {
  token: 'test-token', getFn, waitFn: async () => {}, ...extra
});

test('consistent GET returns current JSON and its own strong ETag without HEAD', async () => {
  let called = 0;
  const data = await read(async (pathname, options) => {
    called++;
    assert.equal(pathname, 'trips/user1.json');
    assert.deepEqual(options, {
      access: 'private', token: 'test-token', useCache: false
    });
    return result();
  });
  assert.equal(called, 1);
  assert.deepEqual(data, { value: trip, etag: '"revision-2"' });
});

test('missing blob is empty (new user can create a first trip)', async () => {
  assert.deepEqual(await read(async () => null), { value: null, etag: null });
  assert.deepEqual(await read(async () => ({ statusCode: 404 })), { value: null, etag: null });
  assert.deepEqual(await read(async () => {
    const error = new Error('not found'); error.name = 'BlobNotFoundError'; throw error;
  }), { value: null, etag: null });
});

test('retries transient 503 metadata/read errors and succeeds', async () => {
  let calls = 0;
  let waits = 0;
  const data = await read(async () => {
    calls++;
    if (calls <= 2) {
      const error = new Error('Service Unavailable');
      error.statusCode = 503;
      throw error;
    }
    return result();
  }, { waitFn: async () => { waits++; } });
  assert.equal(calls, 3);
  assert.equal(waits, 2);
  assert.deepEqual(data.value, trip);
});

test('retries SDK BlobServiceNotAvailable errors without a status code', async () => {
  let calls = 0;
  const data = await read(async () => {
    calls++;
    if (calls === 1) {
      const err = new Error('The blob service is currently not available.');
      err.name = 'BlobServiceNotAvailable';
      throw err;
    }
    return result();
  });
  assert.equal(calls, 2);
  assert.deepEqual(data.value, trip);
});

test('retries 503 result status then gets good content', async () => {
  let calls = 0;
  const data = await read(async () => ++calls === 1 ? { statusCode: 503 } : result());
  assert.equal(calls, 2);
  assert.equal(data.etag, '"revision-2"');
});

test('permanent 503 fails closed, never returns empty record', async () => {
  let calls = 0;
  await assert.rejects(read(async () => {
    calls++;
    const error = new Error('unavailable'); error.status = 503; throw error;
  }), err => err instanceof SnapshotReadError && /503/.test(err.message));
  assert.equal(calls, 3);
});

test('permission error fails without retrying or assuming missing record', async () => {
  let calls = 0;
  await assert.rejects(read(async () => {
    calls++;
    const error = new Error('Forbidden'); error.statusCode = 403; throw error;
  }), SnapshotReadError);
  assert.equal(calls, 1);
});

test('never accepts missing or weak ETags for conditional writes', async () => {
  await assert.rejects(read(async () => ({ ...result(), blob: {} })), SnapshotReadError);
  await assert.rejects(read(async () => result(trip, 'W/"revision-2"')), SnapshotReadError);
  await assert.rejects(read(async () => result(trip, '"bad"token"')), SnapshotReadError);
});

test('invalid JSON prevents saving instead of overwriting existing data', async () => {
  const broken = {
    statusCode: 200, blob: { etag: '"revision-2"' },
    stream: new Response('{not-json').body
  };
  await assert.rejects(read(async () => broken), SnapshotReadError);
});

test('missing token fails without ever calling get()', async () => {
  let called = false;
  await assert.rejects(read(async () => { called = true; }, { token: '' }), SnapshotReadError);
  assert.equal(called, false);
});
