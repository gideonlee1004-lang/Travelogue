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

test('read-only requests work when Blob omits the ETag metadata', async () => {
  const record = await read(async () => ({ ...result(), blob: {} }));
  assert.deepEqual(record.value, trip);
  assert.equal(record.etag, null);
});

test('same-response ETag header is used when blob metadata omits it', async () => {
  const record = await read(async () => ({
    ...result(), blob: {}, headers: new Headers({ ETag: '"from-header"' })
  }), { requireEtag: true });
  assert.equal(record.etag, '"from-header"');
});

test('never accepts missing or weak ETags when a conditional write is planned', async () => {
  const strict = getFn => read(getFn, { requireEtag: true });
  await assert.rejects(strict(async () => ({ ...result(), blob: {} })), SnapshotReadError);
  await assert.rejects(strict(async () => result(trip, 'W/"revision-2"')), SnapshotReadError);
  await assert.rejects(strict(async () => result(trip, '"bad"token"')), SnapshotReadError);
});

test('read-only request ignores an unusable weak ETag', async () => {
  const record = await read(async () => result(trip, 'W/"revision-2"'));
  assert.deepEqual(record.value, trip);
  assert.equal(record.etag, null);
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

test('missing GET ETag is recovered by identical HEAD snapshots around a fresh origin GET', async () => {
  const calls = [];
  const snapshot = await read(async (path, opts) => {
    calls.push('GET');
    assert.equal(opts.useCache, false);
    return { ...result(), blob: {}, headers: new Headers() };
  }, {
    requireEtag: true,
    headFn: async (path, opts) => {
      calls.push('HEAD');
      assert.equal(path, 'trips/user1.json');
      assert.equal(opts.token, 'test-token');
      return { etag: '"revision-2"' };
    }
  });
  assert.deepEqual(calls, ['GET', 'HEAD', 'GET', 'HEAD']);
  assert.deepEqual(snapshot, { value: trip, etag: '"revision-2"' });
});

test('regression: add first flight then second flight when Blob GET does not expose ETag', async () => {
  let saved = null;
  let revision = 0;
  const getFn = async (path, opts) => {
    assert.equal(opts.useCache, false);
    return saved === null ? null : {
      statusCode: 200,
      blob: {},  // reproduces the reported missing-ETag condition
      stream: new Response(JSON.stringify(saved)).body
    };
  };
  const headFn = async () => {
    if (saved === null) throw Object.assign(new Error('not found'), { name: 'BlobNotFoundError' });
    return { etag: `"v${revision}"` };
  };
  const putFn = (body, ifMatch) => {
    if (saved !== null && ifMatch !== `"v${revision}"`) throw new Error('Unsafe write');
    if (saved === null && ifMatch) throw new Error('Unsafe creation');
    saved = body;
    revision++;
  };
  const saveFlight = async flightNumber => {
    const { value, etag } = await read(getFn, { requireEtag: true, headFn });
    const list = value || [{ id: 'trip1', schedule: { 1: [] } }];
    const updated = structuredClone(list);
    updated[0].schedule[1].push({ isFlight: true, flightNumber });
    putFn(updated, etag);
  };
  await saveFlight('SQ638');
  await saveFlight('SQ620');
  assert.equal(revision, 2);
  assert.deepEqual(saved[0].schedule[1].map(f => f.flightNumber), ['SQ638', 'SQ620']);
});

test('racing write during HEAD/GET/HEAD verification retries to preserve newer content', async () => {
  const steps = [];
  let headCalls = 0;
  let getCalls = 0;
  const snapshot = await read(async () => {
    ++getCalls;
    steps.push('GET');
    // The original GET lacks an ETag, forcing the verification fallback.
    const body = getCalls <= 1 ? { version: 1 } : { version: 2 };
    return { statusCode: 200, blob: {}, stream: new Response(JSON.stringify(body)).body };
  }, {
    requireEtag: true,
    headFn: async () => {
      headCalls++;
      steps.push('HEAD');
      // HEAD A is v1, an editor writes v2, HEAD B is v2.
      return { etag: headCalls === 1 ? '"v1"' : '"v2"' };
    }
  });
  assert.deepEqual(snapshot, { value: { version: 2 }, etag: '"v2"' });
  assert.equal(getCalls, 4);
  assert.equal(headCalls, 4);
});

test('missing ETag from HEAD fails closed, never performs an unconditional overwrite', async () => {
  let headCalls = 0;
  await assert.rejects(read(async () => ({ ...result(), blob: {} }), {
    requireEtag: true,
    headFn: async () => { headCalls++; return {}; }
  }), err => err instanceof SnapshotReadError && /No changes were written/.test(err.message));
  assert.equal(headCalls, 1);
});

test('HEAD missing record during write metadata lookup cannot be interpreted as empty content', async () => {
  let headCalls = 0;
  await assert.rejects(read(async () => ({ ...result(), blob: {} }), {
    requireEtag: true,
    attempts: 2,
    headFn: async () => {
      headCalls++;
      throw Object.assign(new Error('missing'), { name: 'BlobNotFoundError' });
    }
  }), err => err instanceof SnapshotReadError && /changed while saving/.test(err.message));
  assert.equal(headCalls, 2);
});

test('new record creation still succeeds when the first GET throws BlobNotFoundError', async () => {
  let headCalls = 0;
  const record = await read(async () => {
    throw Object.assign(new Error('not found'), { name: 'BlobNotFoundError' });
  }, { requireEtag: true, headFn: async () => { headCalls++; return {}; } });
  assert.deepEqual(record, { value: null, etag: null });
  assert.equal(headCalls, 0);
});
