/**
 * Persistencia de establecimientos y planos de asientos asociados a eventos.
 * Delega las reglas de normalización y asignación en seatingPolicy.js.
 */

import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { initFirebase } from './firebase.js';
import { createEmptySeatPlan, normalizeSeatPlan, normalizeVenue } from './seatingPolicy.js';

/** Construye la clave local de establecimientos.
 * @param {string} organizationId Organización.
 * @returns {string} Clave local.
 */
const venueKey = (organizationId) => `mp_venues_${organizationId}`;
/** Construye la clave local del plano de un evento.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @returns {string} Clave local.
 */
const planKey = (organizationId, eventId) => `mp_seat_plan_${organizationId}_${eventId}`;

/** Lee un valor JSON desde almacenamiento local.
 * @param {string} key Clave local.
 * @param {unknown} fallback Valor alternativo.
 * @returns {unknown} Valor leído o alternativo.
 */
function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/** Escribe un valor JSON en almacenamiento local.
 * @param {string} key Clave local.
 * @param {unknown} value Valor a guardar.
 * @returns {void}
 */
function writeLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/** Suscribe los establecimientos de una organización.
 * @param {string} organizationId Organización.
 * @param {Function} onUpdate Callback de actualización.
 * @returns {Function} Función para cancelar la suscripción.
 */
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

/** Guarda un establecimiento normalizado.
 * @param {string} organizationId Organización.
 * @param {object} venue Establecimiento.
 * @returns {Promise<object>} Establecimiento guardado.
 */
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

/** Suscribe el plano de asientos de un evento.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {Function} onUpdate Callback de actualización.
 * @returns {Function} Función para cancelar la suscripción.
 */
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

/** Guarda el plano de asientos de un evento.
 * @param {string} organizationId Organización.
 * @param {string} eventId Evento.
 * @param {object} plan Plano de asientos.
 * @returns {Promise<object>} Plano guardado.
 */
export async function saveSeatPlan(organizationId, eventId, plan) {
  const normalized = normalizeSeatPlan({ ...plan, eventId, updatedAt: new Date().toISOString() }, eventId);
  const { db, isConfigured } = initFirebase();
  if (isConfigured && db) {
    await setDoc(doc(db, 'organizations', organizationId, 'events', eventId, 'seatPlans', 'current'), normalized);
  }
  writeLocal(planKey(organizationId, eventId), normalized);
  return normalized;
}
