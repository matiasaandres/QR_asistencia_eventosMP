export const SEAT_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea',
  '#db2777', '#0891b2', '#65a30d', '#ea580c', '#475569'
];

const cleanId = (value, fallback = 'item') => String(value || fallback)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 60) || fallback;

function createSection({ floorId, floorCode, id, code, name, rows, seatsPerRow }) {
  const sectionId = `${floorId}-${id}`;
  const seats = rows.flatMap((row) => Array.from({ length: seatsPerRow }, (_, index) => {
    const number = index + 1;
    const label = `${floorCode}-${code}-${row}-${String(number).padStart(2, '0')}`;
    return {
      id: cleanId(label),
      label,
      floorId,
      sectionId,
      row: String(row),
      number
    };
  }));
  return { id: sectionId, code, name, columns: seatsPerRow, rows: rows.map(String), seats };
}

function range(count, start = 1) {
  return Array.from({ length: count }, (_, index) => String(index + start));
}

function alphabet(count, start = 0) {
  const labelFor = (position) => {
    let value = position + 1;
    let label = '';
    while (value > 0) {
      value -= 1;
      label = String.fromCharCode(65 + (value % 26)) + label;
      value = Math.floor(value / 26);
    }
    return label;
  };
  return Array.from({ length: count }, (_, index) => labelFor(start + index));
}

function createFloor(id, code, name, sectionDefinitions) {
  return {
    id,
    code,
    name,
    sections: sectionDefinitions.map((section) => createSection({
      floorId: id,
      floorCode: code,
      ...section
    }))
  };
}

export function createCcbbVenue() {
  const floors = [
    createFloor('planta-baja', 'PB', 'Planta baja', [
      { id: 'lateral-izquierdo', code: 'LI', name: 'Lateral izquierdo', rows: range(13), seatsPerRow: 6 },
      { id: 'central', code: 'CEN', name: 'Sector central', rows: range(10), seatsPerRow: 18 },
      { id: 'lateral-derecho', code: 'LD', name: 'Lateral derecho', rows: alphabet(13), seatsPerRow: 5 },
      { id: 'posterior', code: 'POS', name: 'Posterior escenario', rows: ['A', 'B'], seatsPerRow: 6 }
    ]),
    createFloor('planta-alta', 'PA', 'Planta alta', [
      { id: 'ala-izquierda', code: 'AI', name: 'Ala izquierda', rows: range(10), seatsPerRow: 4 },
      { id: 'bloque-izquierdo', code: 'BI', name: 'Bloque central izquierdo', rows: range(8), seatsPerRow: 11 },
      { id: 'bloque-derecho', code: 'BD', name: 'Bloque central derecho', rows: range(8), seatsPerRow: 11 },
      { id: 'ala-derecha', code: 'AD', name: 'Ala derecha', rows: range(10), seatsPerRow: 4 },
      { id: 'posterior-izquierdo', code: 'PI', name: 'Posterior izquierdo', rows: ['A', 'B'], seatsPerRow: 7 },
      { id: 'posterior-derecho', code: 'PD', name: 'Posterior derecho', rows: ['A', 'B'], seatsPerRow: 7 }
    ])
  ];
  return normalizeVenue({
    id: 'centro-cultural-ccbb-2026',
    name: 'Centro Cultural CCBB',
    description: 'Plano 2026 · escenario, planta baja y planta alta',
    templateKey: 'ccbb-2026',
    floors
  });
}

export function createGridVenue({ name, rows = 8, seatsPerRow = 10 }) {
  const safeRows = Math.trunc(Math.min(30, Math.max(1, Number(rows) || 8)));
  const safeSeats = Math.trunc(Math.min(30, Math.max(1, Number(seatsPerRow) || 10)));
  const id = `${cleanId(name, 'establecimiento')}-${Date.now().toString(36)}`;
  return normalizeVenue({
    id,
    name: String(name || 'Nuevo establecimiento').trim(),
    description: `${safeRows} filas · ${safeSeats} asientos por fila`,
    templateKey: 'grid',
    floors: [createFloor('principal', 'P', 'Planta principal', [
      { id: 'general', code: 'GEN', name: 'Sector general', rows: alphabet(safeRows), seatsPerRow: safeSeats }
    ])]
  });
}

export function normalizeVenue(venue = {}) {
  const floors = Array.isArray(venue.floors) ? venue.floors : [];
  const seatCount = floors.reduce((total, floor) => total + (floor.sections || [])
    .reduce((subtotal, section) => subtotal + (section.seats || []).length, 0), 0);
  return {
    id: cleanId(venue.id || venue.name, 'establecimiento'),
    name: String(venue.name || 'Establecimiento sin nombre').trim(),
    description: String(venue.description || '').trim(),
    templateKey: String(venue.templateKey || 'custom'),
    floors,
    seatCount,
    updatedAt: venue.updatedAt || new Date().toISOString(),
    createdAt: venue.createdAt || new Date().toISOString()
  };
}

export function getAllSeats(venue) {
  return (venue?.floors || []).flatMap((floor) => (floor.sections || [])
    .flatMap((section) => section.seats || []));
}

export function createEmptySeatPlan(eventId, venue = null) {
  return {
    id: 'current',
    eventId,
    venueId: venue?.id || '',
    venueName: venue?.name || '',
    assignments: {},
    updatedAt: new Date().toISOString()
  };
}

export function normalizeSeatPlan(plan, eventId) {
  return {
    id: 'current',
    eventId: String(plan?.eventId || eventId || ''),
    venueId: String(plan?.venueId || ''),
    venueName: String(plan?.venueName || ''),
    assignments: plan?.assignments && typeof plan.assignments === 'object' ? plan.assignments : {},
    updatedAt: plan?.updatedAt || new Date().toISOString()
  };
}

export function assignSeats(plan, seatIds, assignment) {
  const ids = [...new Set((seatIds || []).filter(Boolean))];
  if (!ids.length) throw new Error('Selecciona al menos un asiento.');
  const course = String(assignment?.course || '').trim();
  if (!course) throw new Error('Selecciona el curso antes de asignar.');
  const color = /^#[0-9a-f]{6}$/i.test(assignment?.color || '') ? assignment.color : SEAT_COLORS[0];
  const ownerId = String(assignment?.ownerId || '').trim();
  const ownerType = ownerId ? (assignment?.ownerType === 'family' ? 'family' : 'student') : '';
  const ownerName = ownerId ? String(assignment?.ownerName || '').trim() : '';
  const assignments = { ...plan.assignments };
  ids.forEach((seatId) => {
    assignments[seatId] = { course, color, ownerId, ownerType, ownerName };
  });
  return { ...plan, assignments, updatedAt: new Date().toISOString() };
}

export function releaseSeats(plan, seatIds) {
  const assignments = { ...plan.assignments };
  (seatIds || []).forEach((seatId) => delete assignments[seatId]);
  return { ...plan, assignments, updatedAt: new Date().toISOString() };
}

export function buildSeatOwners(students = []) {
  const owners = new Map();
  students.forEach((student) => {
    if (student.deleted === true || student.disabled === true) return;
    if (student.familyId) {
      const key = `family:${student.familyId}`;
      const current = owners.get(key) || {
        key,
        id: student.familyId,
        type: 'family',
        name: `Familia ${student.familyId}`,
        course: student.course,
        capacity: Number(student.familyMaxCapacity ?? student.maxCapacity) || 0,
        members: []
      };
      current.members.push(student.name);
      if (!current.course && student.course) current.course = student.course;
      owners.set(key, current);
    } else {
      owners.set(`student:${student.id}`, {
        key: `student:${student.id}`,
        id: student.id,
        type: 'student',
        name: student.name,
        course: student.course,
        capacity: Number(student.maxCapacity) || 0,
        members: [student.name]
      });
    }
  });
  return [...owners.values()].sort((a, b) => a.course.localeCompare(b.course, 'es') || a.name.localeCompare(b.name, 'es'));
}

export function getStudentSeats(student, seatPlan, venue) {
  if (!student || !seatPlan) return [];
  const ownerId = student.familyId || student.id;
  const ownerType = student.familyId ? 'family' : 'student';
  const seatsById = new Map(getAllSeats(venue).map((seat) => [seat.id, seat]));
  return Object.entries(seatPlan.assignments || {})
    .filter(([, assignment]) => assignment.ownerId === ownerId && assignment.ownerType === ownerType)
    .map(([seatId, assignment]) => ({ ...seatsById.get(seatId), ...assignment, id: seatId }))
    .sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id), 'es'));
}

export function summarizeSeatPlan(plan, venue) {
  const total = getAllSeats(venue).length;
  const values = Object.values(plan?.assignments || {});
  const assigned = values.length;
  const withOwner = values.filter((item) => item.ownerId).length;
  const courses = new Set(values.map((item) => item.course).filter(Boolean)).size;
  return { total, assigned, withOwner, available: Math.max(0, total - assigned), courses };
}
