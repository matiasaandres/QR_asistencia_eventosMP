/**
 * Modelo de establecimientos, plantas, asientos y asignaciones por evento.
 * Las funciones de este archivo son puras para permitir pruebas y previsualizar
 * cambios antes de persistirlos.
 */

export const SEAT_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea',
  '#db2777', '#0891b2', '#65a30d', '#ea580c', '#475569'
];

/** Posiciones permitidas para el escenario del recinto. */
export const STAGE_POSITIONS = ['top', 'bottom', 'left', 'right', 'none'];

/**
 * Distribución espacial del Centro Cultural CCBB. Las medidas son coordenadas
 * lógicas (no píxeles de pantalla) para conservar la relación entre escenario,
 * pasillos, escaleras y bloques en cualquier nivel de zoom.
 */
const CCBB_SPATIAL_LAYOUT = {
  'planta-baja': {
    width: 1120,
    height: 690,
    landmarks: [
      { id: 'escenario', type: 'stage', label: 'ESCENARIO', x: 245, y: 18, width: 630, height: 68 },
      { id: 'pasillo-central', type: 'aisle', label: 'Pasillo central', x: 400, y: 520, width: 320, height: 125 }
    ],
    sections: {
      'planta-baja-lateral-izquierdo': { x: 28, y: 130, width: 190, rotation: 8, seatSize: 23, gap: 5 },
      'planta-baja-central': { x: 286, y: 118, width: 550, rotation: 0, seatSize: 24, gap: 5 },
      'planta-baja-lateral-derecho': { x: 910, y: 130, width: 165, rotation: -9, seatSize: 23, gap: 5 },
      // El inventario histórico conserva 12 IDs. Visualmente se muestran como
      // dos grupos de 3 × 2, respetando la separación lateral del plano base.
      'planta-baja-posterior': {
        x: 300,
        y: 530,
        width: 520,
        rotation: 0,
        seatSize: 24,
        gap: 7,
        seatPositions: [
          { x: 0, y: 0 }, { x: 31, y: 0 }, { x: 62, y: 0 },
          { x: 420, y: 0 }, { x: 451, y: 0 }, { x: 482, y: 0 },
          { x: 0, y: 35 }, { x: 31, y: 35 }, { x: 62, y: 35 },
          { x: 420, y: 35 }, { x: 451, y: 35 }, { x: 482, y: 35 }
        ]
      }
    }
  },
  'planta-alta': {
    width: 1120,
    height: 720,
    landmarks: [
      { id: 'escalera-izquierda', type: 'stairs', label: 'ESCALERAS', x: 150, y: 505, width: 165, height: 125 },
      { id: 'escalera-derecha', type: 'stairs', label: 'ESCALERAS', x: 795, y: 505, width: 165, height: 125 }
    ],
    sections: {
      'planta-alta-ala-izquierda': { x: 26, y: 95, width: 120, rotation: 0, seatSize: 23, gap: 5 },
      'planta-alta-bloque-izquierdo': { x: 180, y: 95, width: 330, rotation: 0, seatSize: 23, gap: 5 },
      'planta-alta-bloque-derecho': { x: 590, y: 95, width: 330, rotation: 0, seatSize: 23, gap: 5 },
      'planta-alta-ala-derecha': { x: 970, y: 95, width: 120, rotation: 0, seatSize: 23, gap: 5 },
      'planta-alta-posterior-izquierdo': { x: 340, y: 560, width: 205, rotation: 0, seatSize: 23, gap: 6 },
      'planta-alta-posterior-derecho': { x: 565, y: 560, width: 205, rotation: 0, seatSize: 23, gap: 6 }
    }
  }
};

/** Convierte un nombre en un identificador seguro y acotado.
 * @param {unknown} value Valor original.
 * @param {string} fallback Identificador alternativo.
 * @returns {string} Identificador normalizado.
 */
const cleanId = (value, fallback = 'item') => String(value || fallback)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 60) || fallback;

/** Crea una sección de asientos a partir de filas y columnas.
 * @param {object} input Definición de piso, sección y dimensiones.
 * @returns {object} Sección con sus asientos.
 */
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

/** Genera etiquetas numéricas de filas.
 * @param {number} count Cantidad de etiquetas.
 * @param {number} start Valor inicial.
 * @returns {Array<string>} Etiquetas generadas.
 */
function range(count, start = 1) {
  return Array.from({ length: count }, (_, index) => String(index + start));
}

/** Genera etiquetas alfabéticas de filas.
 * @param {number} count Cantidad de etiquetas.
 * @param {number} start Posición inicial.
 * @returns {Array<string>} Etiquetas generadas.
 */
function alphabet(count, start = 0) {
  /** Convierte una posición en una etiqueta alfabética de Excel.
   * @param {number} position Posición cero basada.
   * @returns {string} Etiqueta alfabética.
   */
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

/** Crea un piso con sus secciones normalizadas.
 * @param {string} id Identificador del piso.
 * @param {string} code Código visible.
 * @param {string} name Nombre del piso.
 * @param {Array<object>} sectionDefinitions Definiciones de secciones.
 * @returns {object} Piso construido.
 */
function createFloor(id, code, name, sectionDefinitions, layout = null) {
  return {
    id,
    code,
    name,
    ...(layout ? {
      layout: {
        width: layout.width,
        height: layout.height,
        landmarks: layout.landmarks || []
      }
    } : {}),
    sections: sectionDefinitions.map((section) => createSection({
      floorId: id,
      floorCode: code,
      ...section
    })).map((section) => ({
      ...section,
      ...(layout?.sections?.[section.id] ? { layout: layout.sections[section.id] } : {})
    }))
  };
}

/** Construye el establecimiento estándar del Centro Cultural CCBB.
 * @returns {object} Establecimiento con pisos y asientos.
 */
export function createCcbbVenue() {
  const floors = [
    createFloor('planta-baja', 'PB', 'Planta baja', [
      { id: 'lateral-izquierdo', code: 'LI', name: 'Lateral izquierdo', rows: range(13), seatsPerRow: 6 },
      { id: 'central', code: 'CEN', name: 'Sector central', rows: range(10), seatsPerRow: 18 },
      { id: 'lateral-derecho', code: 'LD', name: 'Lateral derecho', rows: alphabet(13), seatsPerRow: 5 },
      { id: 'posterior', code: 'POS', name: 'Posterior escenario', rows: ['A', 'B'], seatsPerRow: 6 }
    ], CCBB_SPATIAL_LAYOUT['planta-baja']),
    createFloor('planta-alta', 'PA', 'Planta alta', [
      { id: 'ala-izquierda', code: 'AI', name: 'Ala izquierda', rows: range(10), seatsPerRow: 4 },
      { id: 'bloque-izquierdo', code: 'BI', name: 'Bloque central izquierdo', rows: range(8), seatsPerRow: 11 },
      { id: 'bloque-derecho', code: 'BD', name: 'Bloque central derecho', rows: range(8), seatsPerRow: 11 },
      { id: 'ala-derecha', code: 'AD', name: 'Ala derecha', rows: range(10), seatsPerRow: 4 },
      { id: 'posterior-izquierdo', code: 'PI', name: 'Posterior izquierdo', rows: ['A', 'B'], seatsPerRow: 7 },
      { id: 'posterior-derecho', code: 'PD', name: 'Posterior derecho', rows: ['A', 'B'], seatsPerRow: 7 }
    ], CCBB_SPATIAL_LAYOUT['planta-alta'])
  ];
  return normalizeVenue({
    id: 'centro-cultural-ccbb-2026',
    name: 'Centro Cultural CCBB',
    description: 'Plano 2026 · escenario, planta baja y planta alta',
    templateKey: 'ccbb-2026',
    floors
  });
}

/** Construye un establecimiento rectangular configurable.
 * @param {{name: string, rows?: number, seatsPerRow?: number}} input Dimensiones y nombre.
 * @returns {object} Establecimiento normalizado.
 */
export function createGridVenue({ name, rows = 8, seatsPerRow = 10 }) {
  return createVisualVenue({ name, rows, seatsPerRow });
}

/**
 * Construye un recinto visual configurable con escenario, filas y columnas.
 * @param {{name: string, rows?: number, seatsPerRow?: number, rowLabelStyle?: 'letters'|'numbers', sectionName?: string, stageLabel?: string, stagePosition?: string}} input Configuración visual.
 * @returns {object} Recinto normalizado listo para guardar.
 */
export function createVisualVenue({
  name,
  rows = 8,
  seatsPerRow = 10,
  rowLabelStyle = 'letters',
  sectionName = 'Sector general',
  stageLabel = 'Escenario',
  stagePosition = 'top'
}) {
  const safeRows = Math.trunc(Math.min(30, Math.max(1, Number(rows) || 8)));
  const safeSeats = Math.trunc(Math.min(30, Math.max(1, Number(seatsPerRow) || 10)));
  const id = `${cleanId(name, 'establecimiento')}-${Date.now().toString(36)}`;
  const rowsList = rowLabelStyle === 'numbers' ? range(safeRows) : alphabet(safeRows);
  const safeStagePosition = STAGE_POSITIONS.includes(stagePosition) ? stagePosition : 'top';
  return normalizeVenue({
    id,
    name: String(name || 'Nuevo establecimiento').trim(),
    description: `${safeRows} filas · ${safeSeats} columnas · ${safeStagePosition === 'none' ? 'sin escenario' : 'escenario ' + safeStagePosition}`,
    templateKey: 'visual-grid',
    stage: {
      label: String(stageLabel || 'Escenario').trim().slice(0, 60),
      position: safeStagePosition
    },
    floors: [createFloor('principal', 'P', 'Planta principal', [
      { id: 'general', code: 'GEN', name: String(sectionName || 'Sector general').trim().slice(0, 80), rows: rowsList, seatsPerRow: safeSeats }
    ])]
  });
}

/** Normaliza la estructura y metadatos de un establecimiento.
 * @param {object} venue Establecimiento de origen.
 * @returns {object} Establecimiento normalizado.
 */
export function normalizeVenue(venue = {}) {
  const floors = (Array.isArray(venue.floors) ? venue.floors : []).map((floor) => {
    // Los recintos CCBB guardados antes del editor espacial reciben el layout
    // sin alterar IDs ni asignaciones de asientos existentes.
    const spatial = venue.templateKey === 'ccbb-2026' ? CCBB_SPATIAL_LAYOUT[floor.id] : null;
    if (!spatial) return floor;
    return {
      ...floor,
      layout: floor.layout || {
        width: spatial.width,
        height: spatial.height,
        landmarks: spatial.landmarks || []
      },
      sections: (floor.sections || []).map((section) => ({
        ...section,
        layout: section.layout || spatial.sections?.[section.id]
      }))
    };
  });
  const seatCount = floors.reduce((total, floor) => total + (floor.sections || [])
    .reduce((subtotal, section) => subtotal + (section.seats || []).length, 0), 0);
  return {
    id: cleanId(venue.id || venue.name, 'establecimiento'),
    name: String(venue.name || 'Establecimiento sin nombre').trim(),
    description: String(venue.description || '').trim(),
    templateKey: String(venue.templateKey || 'custom'),
    stage: {
      label: String(venue.stage?.label || 'Escenario').trim(),
      position: STAGE_POSITIONS.includes(venue.stage?.position) ? venue.stage.position : 'none'
    },
    floors,
    seatCount,
    updatedAt: venue.updatedAt || new Date().toISOString(),
    createdAt: venue.createdAt || new Date().toISOString()
  };
}

/** Devuelve todos los asientos de un establecimiento.
 * @param {object} venue Establecimiento consultado.
 * @returns {Array<object>} Asientos aplanados.
 */
export function getAllSeats(venue) {
  return (venue?.floors || []).flatMap((floor) => (floor.sections || [])
    .flatMap((section) => section.seats || []));
}

/** Crea un plano de asientos vacío para un evento.
 * @param {string} eventId Identificador del evento.
 * @param {object|null} venue Establecimiento opcional.
 * @returns {object} Plano vacío.
 */
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

/** Normaliza un plano de asientos existente.
 * @param {object} plan Plano de origen.
 * @param {string} eventId Identificador del evento.
 * @returns {object} Plano normalizado.
 */
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

/** Asigna uno o más asientos a un curso y propietario.
 * @param {object} plan Plano actual.
 * @param {Array<string>} seatIds Identificadores de asientos.
 * @param {object} assignment Datos de la asignación.
 * @returns {object} Plano actualizado.
 * @throws {Error} Si no hay asientos o curso válido.
 */
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

/** Libera asientos del plano.
 * @param {object} plan Plano actual.
 * @param {Array<string>} seatIds Asientos a liberar.
 * @returns {object} Plano actualizado.
 */
export function releaseSeats(plan, seatIds) {
  const assignments = { ...plan.assignments };
  (seatIds || []).forEach((seatId) => delete assignments[seatId]);
  return { ...plan, assignments, updatedAt: new Date().toISOString() };
}

/** Construye propietarios de asientos a partir de estudiantes activos.
 * @param {Array<object>} students Nómina del evento.
 * @returns {Array<object>} Propietarios ordenados.
 */
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
        members: [],
        courses: []
      };
      current.members.push(student.name);
      if (student.course && !current.courses.includes(student.course)) current.courses.push(student.course);
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
        members: [student.name],
        courses: [student.course].filter(Boolean)
      });
    }
  });
  return [...owners.values()].sort((a, b) => String(a.course || '').localeCompare(String(b.course || ''), 'es') || a.name.localeCompare(b.name, 'es'));
}

/** Devuelve alumnos y familias que pertenecen al curso seleccionado.
 * @param {Array<object>} owners Propietarios construidos desde la nómina.
 * @param {string} course Curso seleccionado.
 * @returns {Array<object>} Propietarios filtrados.
 */
export function getOwnersForCourse(owners = [], course = '') {
  const normalizedCourse = String(course || '').trim();
  if (!normalizedCourse) return [];
  return owners.filter((owner) => (owner.courses || [owner.course]).includes(normalizedCourse));
}

/** Asigna automáticamente los cupos reservados del curso a cada alumno/familia.
 * Conserva asignaciones manuales y nunca ocupa asientos de otro curso.
 * @param {object} plan Plano actual.
 * @param {string} course Curso que se distribuirá.
 * @param {Array<object>} owners Alumnos/familias del curso.
 * @returns {{plan: object, assignedOwners: number, assignedSeats: number, pendingOwners: number, remainingSeats: number}}
 */
export function autoAssignCourseOwners(plan, course, owners = []) {
  const normalizedCourse = String(course || '').trim();
  if (!normalizedCourse) throw new Error('Selecciona un curso antes de distribuir alumnos.');
  const assignments = { ...(plan?.assignments || {}) };
  const assignedSeatCounts = Object.values(assignments).reduce((counts, assignment) => {
    if (!assignment.ownerId) return counts;
    const key = `${assignment.ownerType}:${assignment.ownerId}`;
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());
  const availableSeatIds = Object.entries(assignments)
    .filter(([, assignment]) => assignment.course === normalizedCourse && !assignment.ownerId)
    .map(([seatId]) => seatId);
  const pendingOwners = owners.filter((owner) => {
    const capacity = Math.max(1, Math.trunc(Number(owner.capacity) || 0));
    return (assignedSeatCounts.get(`${owner.type}:${owner.id}`) || 0) < capacity;
  });
  let assignedOwners = 0;
  let assignedSeats = 0;
  pendingOwners.forEach((owner) => {
    const capacity = Math.max(1, Math.trunc(Number(owner.capacity) || 0));
    const key = `${owner.type}:${owner.id}`;
    const missingSeats = Math.max(0, capacity - (assignedSeatCounts.get(key) || 0));
    if (availableSeatIds.length < missingSeats) return;
    availableSeatIds.splice(0, missingSeats).forEach((seatId) => {
      assignments[seatId] = {
        ...assignments[seatId],
        ownerId: owner.id,
        ownerType: owner.type,
        ownerName: owner.name
      };
    });
    assignedOwners += 1;
    assignedSeats += missingSeats;
    assignedSeatCounts.set(key, capacity);
  });
  return {
    plan: { ...plan, assignments, updatedAt: new Date().toISOString() },
    assignedOwners,
    assignedSeats,
    pendingOwners: Math.max(0, pendingOwners.length - assignedOwners),
    remainingSeats: availableSeatIds.length
  };
}

/** Obtiene los asientos asignados a un estudiante o su familia.
 * @param {object} student Estudiante consultado.
 * @param {object} seatPlan Plano de asientos.
 * @param {object} venue Establecimiento del evento.
 * @returns {Array<object>} Asientos asignados.
 */
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

/** Resume ocupación, disponibilidad y cursos de un plano.
 * @param {object} plan Plano de asientos.
 * @param {object} venue Establecimiento consultado.
 * @returns {{total: number, assigned: number, withOwner: number, available: number, courses: number}} Resumen.
 */
export function summarizeSeatPlan(plan, venue) {
  const total = getAllSeats(venue).length;
  const values = Object.values(plan?.assignments || {});
  const assigned = values.length;
  const withOwner = values.filter((item) => item.ownerId).length;
  const courses = new Set(values.map((item) => item.course).filter(Boolean)).size;
  return { total, assigned, withOwner, available: Math.max(0, total - assigned), courses };
}
