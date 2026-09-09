import { collection, doc, onSnapshot, query, setDoc, Timestamp, where } from 'firebase/firestore';
import { initFirebase } from './firebase';
import { normalizeOrganization } from './organizationPolicy';

const CURRENT_ORGANIZATION_KEY = 'access_current_organization_';

export function subscribeToOrganizations(userId, onUpdate, onError) {
  const { db, isConfigured } = initFirebase();
  if (!isConfigured || !db || !userId) {
    onUpdate([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, 'organizations'), where('memberUids', 'array-contains', userId)),
    (snapshot) => onUpdate(snapshot.docs.map((item) => normalizeOrganization({
      ...item.data(), id: item.id
    })).filter((organization) => organization.status === 'active')),
    (error) => onError?.(error)
  );
}

export function subscribeToMembership(organizationId, userId, onUpdate, onError) {
  const { db, isConfigured } = initFirebase();
  if (!isConfigured || !db || !organizationId || !userId) {
    onUpdate(null);
    return () => {};
  }
  return onSnapshot(
    doc(db, 'organizations', organizationId, 'members', userId),
    (snapshot) => onUpdate(snapshot.exists() ? snapshot.data() : null),
    (error) => onError?.(error)
  );
}

export function getSavedOrganizationId(userId) {
  return localStorage.getItem(CURRENT_ORGANIZATION_KEY + userId) || '';
}

export function saveOrganizationId(userId, organizationId) {
  localStorage.setItem(CURRENT_ORGANIZATION_KEY + userId, organizationId);
}

export function subscribeToMembers(organizationId, onUpdate, onError) {
  const { db } = initFirebase();
  return onSnapshot(
    collection(db, 'organizations', organizationId, 'members'),
    (snapshot) => onUpdate(snapshot.docs.map((item) => ({ ...item.data(), id: item.id }))),
    (error) => onError?.(error)
  );
}

function createInvitationCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(36).padStart(2, '0')).join('').toUpperCase();
}

export async function createInvitation({ organization, email, role }) {
  const { db } = initFirebase();
  const code = createInvitationCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await setDoc(doc(db, 'organizationInvitations', code), {
    code,
    organizationId: organization.id,
    organizationName: organization.name,
    email: email.trim().toLowerCase(),
    role,
    status: 'active',
    createdAt: now.toISOString(),
    expiresAt: Timestamp.fromDate(expiresAt)
  });
  return { code, expiresAt: expiresAt.toISOString() };
}
