// MongoDB Atlas document store with optimistic concurrency control.
//
// Every record (user, personal trip list, shared trip) is one document in a
// single collection:  { _id: <path>, value: <JSON>, rev: <opaque string>, updatedAt }
// `rev` plays the role the Blob ETag used to: it changes on every write, and a
// conditional write only succeeds if the stored `rev` still matches. MongoDB
// single-document updates are atomic, so compare-and-set needs no extra locking.
//
// The collection is injected so the logic can be unit-tested without a server.
import crypto from 'node:crypto';

export class StoreError extends Error {}
export class ConflictError extends Error {}

const newRev = () => crypto.randomUUID();
const isDuplicateKey = err => err?.code === 11000;

export function createStore(getCollection) {
  async function col() {
    try {
      return await getCollection();
    } catch (err) {
      if (err instanceof StoreError) throw err;
      throw new StoreError('Unable to connect to MongoDB Atlas. Check the connection settings and retry.');
    }
  }

  async function guard(fn) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ConflictError || err instanceof StoreError) throw err;
      throw new StoreError('Unable to reach MongoDB Atlas. Please retry.');
    }
  }

  // -> { value, etag }   (value:null, etag:null when the record does not exist)
  async function read(path) {
    const c = await col();
    const doc = await guard(() => c.findOne({ _id: path }));
    return doc ? { value: doc.value, etag: doc.rev } : { value: null, etag: null };
  }

  // ifMatch: only write if the stored rev still equals it.
  // overwrite:false (and no ifMatch): create only, fail if the record exists.
  // -> { etag }
  async function write(path, data, { overwrite = true, ifMatch } = {}) {
    const c = await col();
    const rev = newRev();
    const fields = { value: data, rev, updatedAt: new Date() };
    return guard(async () => {
      if (ifMatch) {
        const res = await c.updateOne({ _id: path, rev: ifMatch }, { $set: fields });
        if (!res.matchedCount) throw new ConflictError('Record was modified by another request');
        return { etag: rev };
      }
      if (!overwrite) {
        try {
          await c.insertOne({ _id: path, ...fields });
        } catch (err) {
          if (isDuplicateKey(err)) throw new ConflictError('Record was modified by another request');
          throw err;
        }
        return { etag: rev };
      }
      await c.updateOne({ _id: path }, { $set: fields }, { upsert: true });
      return { etag: rev };
    });
  }

  async function remove(path, { ifMatch } = {}) {
    const c = await col();
    return guard(async () => {
      const res = await c.deleteOne(ifMatch ? { _id: path, rev: ifMatch } : { _id: path });
      if (ifMatch && !res.deletedCount) throw new ConflictError('Record was modified by another request');
      return { deleted: !!res.deletedCount };
    });
  }

  return { read, write, remove };
}

// ---------- Real MongoDB connection (cached across warm serverless invocations) ----------

export const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = process.env.MONGODB_DB || 'travelogue';
const COLLECTION = process.env.MONGODB_COLLECTION || 'records';

export const isConfigured = () => !!MONGODB_URI;

export async function getMongoCollection() {
  if (!MONGODB_URI) {
    throw new StoreError('Unable to connect to MongoDB Atlas: MONGODB_URI is not configured on the server.');
  }
  if (!globalThis.__travelogueMongo) {
    globalThis.__travelogueMongo = (async () => {
      const { MongoClient } = await import('mongodb');
      const client = new MongoClient(MONGODB_URI, {
        serverSelectionTimeoutMS: 8000,
        maxPoolSize: 10
      });
      await client.connect();
      return client.db(DB_NAME).collection(COLLECTION);
    })().catch(err => {
      globalThis.__travelogueMongo = null; // allow a retry on the next request
      throw err;
    });
  }
  return globalThis.__travelogueMongo;
}
