# Travelogue — Vercel Blob ETag troubleshooting (2026-11-03)

## What was changed

- **Read requests do not require an ETag.** A missing/weak ETag should not prevent users from signing in or viewing saved itineraries.
- **Mutations still require a strong ETag.** Existing records are updated with `ifMatch` and never overwritten blindly; new records are created with `allowOverwrite: false`.
- **Same-response fallback.** When `get().blob.etag` is absent, the code checks the ETag in that SAME response's headers. It intentionally does not combine a separate `head()` ETag with JSON from an earlier GET, which can race.
- **Fresh reads and retry.** Reads use `useCache:false`; an actual `412`/`409` write conflict retries from a fresh read after a brief delay, and redundant writes that have no data change are skipped.
- **No flight UI changes.** AeroAPI flight number/date lookup, seats, booking reference, flight-day terminal/gate refresh, and all other features are preserved.

## Deployment

1. Use the complete updated ZIP as your project source; make sure the old `package-lock.json` is **removed**. The original ZIP's lockfile did not list `@vercel/blob`, even though its `package.json` requires `@vercel/blob@2.8.2`. Keeping that old lockfile makes `npm ci` fail.
2. On a machine with access to npm, run **`npm install`** in the project directory. This installs dependencies and generates a correct `package-lock.json`. Commit/upload the generated lockfile together with `package.json`. After that, `npm ci` is appropriate for clean deployments.
3. Check Vercel Project → Settings → Environment Variables: your connected private Blob store must provide `TRAVELOGUE_DB_READ_WRITE_TOKEN` (or `BLOB_READ_WRITE_TOKEN`). Flight lookup separately needs `AEROAPI_KEY`.
4. Redeploy. Test sign-in, loading a personal trip, saving a new trip, editing an existing trip, and editing the same shared trip from two tabs.

## Interpreting common errors

- **"Blob did not return a valid ETag for a safe update" / HTTP 503:** The SDK did not provide a usable strong ETag even in its same-response headers. A write is deliberately prevented to avoid overwriting concurrent edits. Check the private Blob store, token and SDK installed in the Vercel build.
- **HTTP 409 / "Record was modified by another request":** A genuine optimistic concurrency conflict. The app retries read-merge-write, but can surface a conflict if simultaneous updates continue. Close duplicate tabs and reload if it persists.
- **HTTP 401:** Expired/missing session; sign in again.
- **HTTP 403 or Blob service unavailable:** Verify Blob environment token, permissions, and Vercel function logs.
- **`npm ci` says package-lock is out of sync:** Regenerate the lockfile via `npm install` locally and commit both files.

To find the failing request, open the browser's Network tab, filter for `/api/trips` or `/api/collaboration`, and read the JSON `error` field. Review Vercel function logs for `[Travelogue] Blob conditional write rejected`. Logs intentionally omit record paths, names, contents and tokens.

## Validation

`npm test` runs all included Node tests, including mocked Blob status errors, optional metadata, header-based ETags, strict conditional writes, AeroAPI lookups and trip merge tests. A live Blob test needs an actual connected Vercel Blob store, so the included tests cannot prove a deployed storage service is working.
