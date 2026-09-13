import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignSeats,
  autoAssignCourseOwners,
  buildSeatOwners,
  createCcbbVenue,
  createEmptySeatPlan,
  createGridVenue,
  createVisualVenue,
  getAllSeats,
  getOwnersForCourse,
  getStudentSeats,
  normalizeVenue,
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
  assert.ok(venue.floors.every((floor) => floor.layout?.width && floor.layout?.height));
  assert.ok(venue.floors.every((floor) => floor.sections.every((section) => section.layout)));
});

test('hidrata el plano espacial en recintos CCBB guardados anteriormente', () => {
  const current = createCcbbVenue();
  const legacy = {
    ...current,
    floors: current.floors.map(({ layout, ...floor }) => ({
      ...floor,
      sections: floor.sections.map(({ layout: sectionLayout, ...section }) => section)
    }))
  };
  const hydrated = normalizeVenue(legacy);
  assert.ok(hydrated.floors.every((floor) => floor.layout));
  assert.ok(hydrated.floors.every((floor) => floor.sections.every((section) => section.layout)));
  assert.deepEqual(getAllSeats(hydrated).map((seat) => seat.id), getAllSeats(current).map((seat) => seat.id));
});

test('cada escuela puede crear establecimientos adicionales con un plano simple', () => {
  const venue = createGridVenue({ name: 'Gimnasio Norte', rows: 4, seatsPerRow: 6 });
  assert.match(venue.id, /^gimnasio-norte-/);
  assert.equal(venue.seatCount, 24);
  assert.equal(venue.floors[0].sections[0].rows.length, 4);
});

test('crea un recinto visual con escenario, filas y columnas configurables', () => {
  const venue = createVisualVenue({
    name: 'Teatro Municipal',
    rows: 3,
    seatsPerRow: 4,
    rowLabelStyle: 'numbers',
    sectionName: 'Platea',
    stageLabel: 'Escenario principal',
    stagePosition: 'bottom'
  });
  assert.equal(venue.templateKey, 'visual-grid');
  assert.deepEqual(venue.stage, { label: 'Escenario principal', position: 'bottom' });
  assert.equal(venue.floors[0].sections[0].name, 'Platea');
  assert.deepEqual(venue.floors[0].sections[0].rows, ['1', '2', '3']);
  assert.equal(venue.seatCount, 12);
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

test('filtra la nómina por curso incluyendo familias con hermanos en cursos distintos', () => {
  const owners = buildSeatOwners([
    { id: 'A', name: 'Ana', course: '1°', familyId: 'F1', familyMaxCapacity: 2 },
    { id: 'B', name: 'Beto', course: '2°', familyId: 'F1', familyMaxCapacity: 2 },
    { id: 'C', name: 'Carla', course: '2°', maxCapacity: 1 }
  ]);
  assert.equal(getOwnersForCourse(owners, '1°').length, 1);
  assert.equal(getOwnersForCourse(owners, '2°').length, 2);
});

test('distribuye automáticamente los cupos reservados sin tocar otros cursos', () => {
  const venue = createGridVenue({ name: 'Teatro', rows: 2, seatsPerRow: 5 });
  const seatIds = getAllSeats(venue).map((seat) => seat.id);
  const empty = createEmptySeatPlan('evento-auto', venue);
  const reservedForCourse = assignSeats(empty, seatIds.slice(0, 5), { course: '3°', color: '#2563eb' });
  const mixedPlan = assignSeats(reservedForCourse, [seatIds[5]], { course: '4°', color: '#dc2626' });
  const owners = [
    { id: 'A', type: 'student', name: 'Ana', capacity: 1 },
    { id: 'F1', type: 'family', name: 'Familia F1', capacity: 3 },
    { id: 'B', type: 'student', name: 'Beto', capacity: 2 }
  ];
  const result = autoAssignCourseOwners(mixedPlan, '3°', owners);
  assert.equal(result.assignedOwners, 2);
  assert.equal(result.assignedSeats, 4);
  assert.equal(result.pendingOwners, 1);
  assert.equal(result.remainingSeats, 1);
  assert.equal(result.plan.assignments[seatIds[5]].course, '4°');
  assert.equal(Object.values(result.plan.assignments).filter((assignment) => assignment.ownerId === 'F1').length, 3);
});

test('completa cupos parciales y no duplica una familia ya asignada en otro curso', () => {
  const venue = createGridVenue({ name: 'Salón', rows: 2, seatsPerRow: 4 });
  const seatIds = getAllSeats(venue).map((seat) => seat.id);
  let plan = createEmptySeatPlan('evento-familia', venue);
  plan = assignSeats(plan, [seatIds[0]], { course: '1°', color: '#2563eb', ownerType: 'family', ownerId: 'F1', ownerName: 'Familia F1' });
  plan = assignSeats(plan, seatIds.slice(1, 5), { course: '2°', color: '#dc2626' });
  const owners = [
    { id: 'F1', type: 'family', name: 'Familia F1', capacity: 2 },
    { id: 'A', type: 'student', name: 'Ana', capacity: 2 }
  ];
  const result = autoAssignCourseOwners(plan, '2°', owners);
  assert.equal(result.assignedOwners, 2);
  assert.equal(result.assignedSeats, 3);
  assert.equal(result.pendingOwners, 0);
  assert.equal(Object.values(result.plan.assignments).filter((assignment) => assignment.ownerId === 'F1').length, 2);
  assert.equal(Object.values(result.plan.assignments).filter((assignment) => assignment.ownerId === 'A').length, 2);
});

test('un evento puede funcionar sin establecimiento ni plano de asientos', () => {
  const plan = createEmptySeatPlan('evento-sin-recinto');
  assert.equal(plan.venueId, '');
  assert.equal(plan.venueName, '');
  assert.deepEqual(plan.assignments, {});
  assert.deepEqual(summarizeSeatPlan(plan, null), { total: 0, assigned: 0, withOwner: 0, available: 0, courses: 0 });
});
