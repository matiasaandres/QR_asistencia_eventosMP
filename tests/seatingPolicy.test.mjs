import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignSeats,
  buildSeatOwners,
  createCcbbVenue,
  createEmptySeatPlan,
  createGridVenue,
  getAllSeats,
  getStudentSeats,
  releaseSeats,
  summarizeSeatPlan
} from '../src/services/seatingPolicy.js';

test('el plano CCBB separa plantas y genera asientos estables y únicos', () => {
  const venue = createCcbbVenue();
  const seats = getAllSeats(venue);
  assert.equal(venue.floors.length, 2);
  assert.equal(seats.length, 619);
  assert.equal(new Set(seats.map((seat) => seat.id)).size, seats.length);
  assert.ok(seats.every((seat) => seat.label && seat.floorId && seat.sectionId));
});

test('cada escuela puede crear establecimientos adicionales con un plano simple', () => {
  const venue = createGridVenue({ name: 'Gimnasio Norte', rows: 4, seatsPerRow: 6 });
  assert.match(venue.id, /^gimnasio-norte-/);
  assert.equal(venue.seatCount, 24);
  assert.equal(venue.floors[0].sections[0].rows.length, 4);
});

test('asigna y libera varios asientos por curso y familia', () => {
  const venue = createGridVenue({ name: 'Auditorio', rows: 2, seatsPerRow: 4 });
  const seatIds = getAllSeats(venue).slice(0, 3).map((seat) => seat.id);
  const empty = createEmptySeatPlan('evento-1', venue);
  const assigned = assignSeats(empty, seatIds, {
    course: '2° básico', color: '#dc2626', ownerType: 'family', ownerId: 'FAM-01', ownerName: 'Familia FAM-01'
  });
  assert.equal(summarizeSeatPlan(assigned, venue).withOwner, 3);
  assert.equal(getStudentSeats({ id: 'A-1', familyId: 'FAM-01' }, assigned, venue).length, 3);
  assert.equal(summarizeSeatPlan(releaseSeats(assigned, [seatIds[0]]), venue).assigned, 2);
});

test('consolida hermanos como una sola familia y conserva alumnos individuales', () => {
  const owners = buildSeatOwners([
    { id: 'A', name: 'Ana', course: '1°', familyId: 'F1', familyMaxCapacity: 4 },
    { id: 'B', name: 'Beto', course: '1°', familyId: 'F1', familyMaxCapacity: 4 },
    { id: 'C', name: 'Carla', course: '2°', maxCapacity: 2 }
  ]);
  assert.equal(owners.length, 2);
  assert.equal(owners.find((owner) => owner.type === 'family').members.length, 2);
  assert.equal(owners.find((owner) => owner.type === 'student').capacity, 2);
});

test('un evento puede funcionar sin establecimiento ni plano de asientos', () => {
  const plan = createEmptySeatPlan('evento-sin-recinto');
  assert.equal(plan.venueId, '');
  assert.equal(plan.venueName, '');
  assert.deepEqual(plan.assignments, {});
  assert.deepEqual(summarizeSeatPlan(plan, null), { total: 0, assigned: 0, withOwner: 0, available: 0, courses: 0 });
});
