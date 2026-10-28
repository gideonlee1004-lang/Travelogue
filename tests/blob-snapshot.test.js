import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readVerifiedBlobSnapshot, SnapshotChangedError, SnapshotReadError
} from '../api/_blobSnapshot.js';

const ORIGIN = 'https://store123.private.blob.vercel-storage.com/trips/u1.json';
const metadata = (etag = '"rev2"') => ({ url: ORIGIN, etag });
const content = (etag = '"rev2"', value = [{ id: 'trip1' }]) => ({
  status: 200, ok: true, headers: new Headers({ etag }),
  text: async () => JSON.stringify(value)
});

test('uses cache=0 origin read and matching ETag for saved JSON', async () => {
  let requested;
  const snapshot = await readVerifiedBlobSnapshot('trips/u1.json', {
    token: 'test-token', headFn: async () => metadata(),
    fetchFn: async (url, options) => {
      requested = { url, options };
      return content();
    }
  });
  assert.deepEqual(snapshot, { value: [{ id: 'trip1' }], etag: '"rev2"' });
  assert.equal(new URL(requested.url).searchParams.get('cache'), '0');
  assert.equal(requested.options.cache, 'no-store');
  assert.equal(requested.options.headers.Authorization, 'Bearer test-token');
});

test('rejects stale GET data instead of pairing it with current HEAD ETag', async () => {
  await assert.rejects(() => readVerifiedBlobSnapshot('trips/u1.json', {
    token: 'test', headFn: async () => metadata('"rev2"'),
    fetchFn: async () => content('"rev1"', [{ id: 'older-trip' }])
  }), SnapshotChangedError);
});

test('returns empty record only when metadata confirms it does not exist', async () => {
  const snapshot = await readVerifiedBlobSnapshot('trips/u1.json', {
    token: 'test', headFn: async () => {
      const error = new Error('missing'); error.name = 'BlobNotFoundError'; throw error;
    },
    fetchFn: async () => { throw new Error('should not fetch'); }
  });
  assert.deepEqual(snapshot, { value: null, etag: null });
});

test('does not mistake missing body for absent record', async () => {
  await assert.rejects(() => readVerifiedBlobSnapshot('trips/u1.json', {
    token: 'test', headFn: async () => metadata(),
    fetchFn: async () => ({ status: 404, ok: false })
  }), SnapshotChangedError);
});

test('rejects invalid JSON instead of saving over it', async () => {
  await assert.rejects(() => readVerifiedBlobSnapshot('trips/u1.json', {
    token: 'test', headFn: async () => metadata(),
    fetchFn: async () => ({ status: 200, ok: true,
      headers: new Headers({ etag: '"rev2"' }), text: async () => 'bad json'
    })
  }), SnapshotReadError);
});

test('rejects untrusted blob metadata URL before transmitting token', async () => {
  let called = false;
  await assert.rejects(() => readVerifiedBlobSnapshot('trips/u1.json', {
    token: 'secret', headFn: async () => ({ url: 'https://bad.example/track', etag: '"rev2"' }),
    fetchFn: async () => { called = true; return content(); }
  }), SnapshotReadError);
  assert.equal(called, false);
});
