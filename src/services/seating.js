import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { initFirebase } from './firebase.js';
import { createEmptySeatPlan, normalizeSeatPlan, normalizeVenue } from './seatingPolicy.js';

const venueKey = (organizationId) => `mp_venues_${organizationId}`;
const planKey = (organizationId, eventId) => `mp_seat_plan_${organizationId}_${eventId}`;

function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function subscribeToVenues(organizationId, onUpdate) {
  const { db, isConfigured } = initFirebase();
  if (isConfigured && db) {
    return onSnapshot(collection(db, 'organizations', organizationId, 'venues'), (snapshot) => {
      const venues = snapshot.docs.map((item) => normalizeVenue({ ...item.data(), id: item.id }));
      writeLocal(venueKey(organizationId), venues);
      onUpdate(venues, snapshot.metadata.fromCache ? 'offline' : 'cloud');
    }, () => onUpdate(readLocal(venueKey(organizationId), []), 'error'));
  }
  onUpdate(readLocal(venueKey(organizationId), []), 'local');
  return () => {};
}

export async function saveVenue(organizationId, venue) {
  const normalized = normalizeVenue(venue);
  const { db, isConfigured } = initFirebase();
  if (isConfigured && db) {
    await setDoc(doc(db, 'organizations', organizationId, 'venues', normalized.id), normalized);
  }
  const venues = readLocal(venueKey(organizationId), []);
  writeLocal(venueKey(organizationId), [...venues.filter((item) => item.id !== normalized.id), normalized]);
  return normalized;
}

export function subscribeToSeatPlan(organizationId, eventId, onUpdate) {
  const { db, isConfigured } = initFirebase();
  if (isConfigured && db) {
    return onSnapshot(doc(db, 'organizations', organizationId, 'events', eventId, 'seatPlans', 'current'), (snapshot) => {
      const plan = normalizeSeatPlan(snapshot.exists() ? snapshot.data() : createEmptySeatPlan(eventId), eventId);
      writeLocal(planKey(organizationId, eventId), plan);
      onUpdate(plan, snapshot.metadata.fromCache ? 'offline' : 'cloud');
    }, () => onUpdate(normalizeSeatPlan(readLocal(planKey(organizationId, eventId), {}), eventId), 'error'));
  }
  onUpdate(normalizeSeatPlan(readLocal(planKey(organizationId, eventId), {}), eventId), 'local');
  return () => {};
}

export async function saveSeatPlan(organizationId, eventId, plan) {
  const normalized = normalizeSeatPlan({ ...plan, eventId, updatedAt: new Date().toISOString() }, eventId);
  const { db, isConfigured } = initFirebase();
  if (isConfigured && db) {
    await setDoc(doc(db, 'organizations', organizationId, 'events', eventId, 'seatPlans', 'current'), normalized);
  }
  writeLocal(planKey(organizationId, eventId), normalized);
  return normalized;
}
