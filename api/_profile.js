// Validation for the editable part of an account (photo, bio, interests, travel
// preferences, notification switches). Pure functions so they can be unit-tested.

export const MAX_AVATAR_CHARS = 200_000; // ~150 KB image, far above the 320px JPEG the app uploads
const AVATAR_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
const PREF_KEYS = ['comfort', 'pace', 'companions', 'season', 'length', 'transport'];
const NOTIFICATION_KEYS = ['flights', 'shared', 'reminders'];

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : null);

// Returns a sanitised patch containing only the fields that were supplied and valid,
// or null when the input is unusable. Unknown keys are dropped.
export function cleanProfilePatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const patch = {};

  if ('avatar' in input) {
    if (input.avatar === null || input.avatar === '') patch.avatar = null;
    else if (typeof input.avatar === 'string' && input.avatar.length <= MAX_AVATAR_CHARS && AVATAR_RE.test(input.avatar)) patch.avatar = input.avatar;
    else return null;
  }

  if ('bio' in input) {
    const bio = text(input.bio, 280);
    if (bio === null) return null;
    patch.bio = bio;
  }

  if ('interests' in input) {
    if (!Array.isArray(input.interests)) return null;
    const seen = new Set();
    patch.interests = input.interests
      .map(i => text(i, 30))
      .filter(i => i && !seen.has(i.toLowerCase()) && seen.add(i.toLowerCase()))
      .slice(0, 12);
  }

  if ('prefs' in input) {
    if (!input.prefs || typeof input.prefs !== 'object' || Array.isArray(input.prefs)) return null;
    patch.prefs = {};
    for (const key of PREF_KEYS) {
      const value = text(input.prefs[key], 60);
      if (value) patch.prefs[key] = value;
    }
  }

  if ('notifications' in input) {
    if (!input.notifications || typeof input.notifications !== 'object' || Array.isArray(input.notifications)) return null;
    patch.notifications = {};
    for (const key of NOTIFICATION_KEYS) {
      if (key in input.notifications) patch.notifications[key] = !!input.notifications[key];
    }
  }

  return Object.keys(patch).length ? patch : null;
}

// Merge a patch into the stored profile. prefs / notifications merge key by key.
export function applyProfilePatch(current, patch) {
  const base = current && typeof current === 'object' ? current : {};
  const next = { ...base, ...patch };
  if (patch.prefs) next.prefs = { ...(base.prefs || {}), ...patch.prefs };
  if (patch.notifications) next.notifications = { ...(base.notifications || {}), ...patch.notifications };
  return next;
}
