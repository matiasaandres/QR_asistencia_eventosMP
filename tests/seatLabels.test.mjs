import test from 'node:test';
import assert from 'node:assert/strict';
import { assignSeats, createEmptySeatPlan, createGridVenue, getAllSeats } from '../src/services/seatingPolicy.js';
import { buildSeatLabelRecords, createSeatLabelsPdf } from '../src/services/seatLabels.js';

test('genera etiquetas para todos los asientos o solo los asignados', () => {
  const venue = createGridVenue({ name: 'Gimnasio', rows: 2, seatsPerRow: 4 });
  const plan = assignSeats(createEmptySeatPlan('evento', venue), getAllSeats(venue).slice(0, 2).map((seat) => seat.id), {
    course: '3° A', color: '#2563eb', ownerId: 'A-1', ownerType: 'student', ownerName: 'Ana'
  });
  assert.equal(buildSeatLabelRecords({ venue, seatPlan: plan }).length, 8);
  assert.equal(buildSeatLabelRecords({ venue, seatPlan: plan, assignedOnly: true }).length, 2);
});

test('crea un PDF A4 paginado de etiquetas adhesivas', async () => {
  const venue = createGridVenue({ name: 'Teatro', rows: 5, seatsPerRow: 6 });
  const bytes = await createSeatLabelsPdf({ venue, seatPlan: createEmptySeatPlan('evento', venue), event: { name: 'Gala' } });
  const text = Buffer.from(bytes).toString('latin1');
  assert.equal(text.slice(0, 5), '%PDF-');
  assert.equal((text.match(/\/Type\s*\/Page\b/g) || []).length, 2);
});
