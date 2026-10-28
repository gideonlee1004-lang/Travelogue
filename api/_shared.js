import { readJsonWithMeta, sharedPathFor } from './_lib.js';

export function canRead(doc, userId) {
  return !!doc?.members?.some(m => m.id === userId);
}

export function memberRole(doc, userId) {
  return doc?.members?.find(m => m.id === userId)?.role || null;
}

export function summary(doc, userId, includeInvite = false) {
  const role = memberRole(doc, userId);
  return {
    id: doc.id, role, members: doc.members.map(({ id, name, email, role }) => ({ id, name, email, role })),
    updatedAt: doc.updatedAt, lastEditedBy: doc.lastEditedBy,
    ...(includeInvite && role === 'owner' ? { inviteToken: doc.inviteToken } : {})
  };
}

export async function getShared(id) {
  const path = sharedPathFor(id);
  if (!path) return { value: null, etag: null };
  return readJsonWithMeta(path);
}

export function pointer(trip, shareId) {
  return { id: trip.id, sharedId: shareId };
}
