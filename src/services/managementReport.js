import { getCapacityState } from './checkinPolicy.js';
import { getPendingFamilies } from './pendingFamilies.js';

const TIME_ZONE = 'America/Santiago';
const percent = (value, total) => total > 0 ? Math.round(value / total * 100) : null;
const number = (value) => Number(value).toLocaleString('es-CL');
const percentage = (value) => value == null ? 'Sin base de cálculo' : `${value}%`;
const dateLabel = (date) => new Intl.DateTimeFormat('es-CL', {
  timeZone: TIME_ZONE, dateStyle: 'medium', timeStyle: 'short'
}).format(date);

export function buildManagementReportData({ students = [], logs = [] }) {
  const courses = new Map();
  let excluded = 0;
  let extraFamilies = 0;
  let available = 0;
  let aboveCapacity = 0;
  for (const student of students) {
    const state = getCapacityState(student);
    if (state.isAccessBlocked) { excluded += 1; continue; }
    const name = String(student.course || 'Sin curso');
    const course = courses.get(name) || { name, families: 0, present: 0, people: 0, capacity: 0, available: 0 };
    course.families += 1;
    course.present += state.enteredCount > 0 ? 1 : 0;
    course.people += state.enteredCount;
    course.capacity += state.maxCapacity;
    course.available += state.remaining;
    available += state.remaining;
    aboveCapacity += Math.max(0, state.enteredCount - state.maxCapacity);
    if (state.hasExtraGuest) extraFamilies += 1;
    courses.set(name, course);
  }
  const courseRows = [...courses.values()].sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))
    .map((course) => ({ ...course, pending: course.families - course.present,
      attendance: percent(course.present, course.families), usage: percent(course.people, course.capacity) }));
  const families = courseRows.reduce((sum, row) => sum + row.families, 0);
  const present = courseRows.reduce((sum, row) => sum + row.present, 0);
  const people = courseRows.reduce((sum, row) => sum + row.people, 0);
  const capacity = courseRows.reduce((sum, row) => sum + row.capacity, 0);
  const doors = new Map();
  const hours = new Map();
  let logPeople = 0;
  let invalidCounts = 0;
  let undatedPeople = 0;
  const hourFormatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
  });
  for (const log of logs) {
    const count = Number(log.count);
    if (!Number.isInteger(count) || count <= 0) { invalidCounts += 1; continue; }
    logPeople += count;
    const door = String(log.doorName || 'Sin puerta');
    doors.set(door, (doors.get(door) || 0) + count);
    const date = log.timestamp ? new Date(log.timestamp) : null;
    if (!date || Number.isNaN(date.getTime())) { undatedPeople += count; continue; }
    const key = hourFormatter.format(date);
    hours.set(key, (hours.get(key) || 0) + count);
  }
  return {
    courses: courseRows, families, present, pending: families - present, people, capacity,
    pendingFamilies: getPendingFamilies(students),
    available, aboveCapacity, excluded, extraFamilies,
    attendance: percent(present, families), usage: percent(people, capacity),
    average: present > 0 ? (people / present).toFixed(1).replace('.', ',') : 'Sin ingresos',
    logPeople, invalidCounts, undatedPeople, logCount: logs.length,
    doors: [...doors].map(([name, people]) => ({ name, people })).sort((a, b) => b.people - a.people),
    hours: [...hours].sort(([a], [b]) => a.localeCompare(b)).map(([name, people]) => ({ name: `${name}:00`, people }))
  };
}

// Vector text and charts keep the report searchable and sharp when printed.
export async function createManagementReportPdf({ event, students = [], logs = [], generatedAt = new Date(), demo = false }) {
  const { jsPDF } = await import('jspdf');
  const data = buildManagementReportData({ students, logs });
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const ink = [20, 38, 60];
  const muted = [77, 93, 110];
  const teal = [12, 125, 110];
  const blue = [30, 105, 170];
  const width = 174;
  let y = 0;
  const safe = (text) => String(text).replace(/[\u0000-\u001f]/g, ' ').replace(/[\u2010-\u2015]/g, '-');
  const font = (size = 10, bold = false, color = ink) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color);
  };
  function page() {
    if (y) doc.addPage();
    doc.setFillColor(...ink); doc.rect(0, 0, 210, 21, 'F');
    font(10, true, [255, 255, 255]); doc.text('INFORME DE ASISTENCIA AL EVENTO', 18, 10);
    font(8, false, [218, 230, 240]); doc.text(demo ? 'DEMOSTRACIÓN - DATOS FICTICIOS' : 'DIRECCIÓN Y UNIDAD TÉCNICO-PEDAGÓGICA', 18, 16);
    y = 32;
  }
  function ensure(height) { if (y + height > 273) page(); }
  function paragraph(text, { size = 10, bold = false, color = muted, gap = 4 } = {}) {
    font(size, bold, color);
    const lines = doc.splitTextToSize(safe(text), width);
    const lineHeight = size * 0.47;
    for (const line of lines) {
      ensure(lineHeight); font(size, bold, color); doc.text(line, 18, y); y += lineHeight;
    }
    y += gap;
  }
  function heading(text) {
    ensure(23); y += 2; paragraph(text, { size: 14, bold: true, color: ink, gap: 5 });
  }
  function bars(rows, { title, label, maximum, color = teal }) {
    heading(title);
    paragraph(label, { size: 9 });
    if (!rows.length) { paragraph('Sin registros disponibles para este gráfico.'); return; }
    const scale = maximum || Math.max(1, ...rows.map((row) => row.value));
    for (const row of rows) {
      font(9, true);
      const lines = doc.splitTextToSize(safe(row.name), 120);
      const height = lines.length * 4.3 + 10;
      if (y + height > 273) { page(); paragraph(`${title} (continuación)`, { bold: true }); }
      font(9, true); doc.text(lines, 18, y);
      font(9, true, color); doc.text(safe(row.detail), 192, y, { align: 'right' });
      y += lines.length * 4.3;
      doc.setFillColor(232, 238, 243); doc.roundedRect(18, y, width, 3, 1, 1, 'F');
      const barWidth = Math.min(1, Math.max(0, row.value / scale)) * width;
      if (barWidth > 0) { doc.setFillColor(...color); doc.rect(18, y, barWidth, 3, 'F'); }
      y += 10;
    }
  }
  page();
  paragraph('Informe para la gestión institucional', { size: 22, bold: true, color: ink, gap: 5 });
  paragraph(event?.name || 'Evento sin nombre', { size: 15, bold: true, color: teal });
  paragraph(`Fecha de corte: ${dateLabel(generatedAt)} (hora de Santiago).`, { size: 9 });
  if (demo) paragraph('Ejemplo de presentación. Las cifras de este documento son ficticias.', { bold: true });
  heading('1. Resumen ejecutivo');
  paragraph(data.families
    ? `Al corte del informe, ${number(data.present)} de ${number(data.families)} familias habilitadas registran al menos un ingreso (${percentage(data.attendance)}). Permanecen ${number(data.pending)} familias sin ingreso registrado. Se contabilizan ${number(data.people)} ingresos de personas asociados a la nómina habilitada, frente a ${number(data.capacity)} cupos base autorizados.`
    : 'No hay alumnos habilitados en la nómina al momento del corte. No existe una base para calcular la asistencia familiar.');
  const cards = [
    ['Familias presentes', `${number(data.present)} de ${number(data.families)}`, `${percentage(data.attendance)} de asistencia familiar`],
    ['Ingresos de personas', number(data.people), 'Acumulado de la nómina habilitada'],
    ['Familias sin ingreso', number(data.pending), 'Pendientes al momento del corte'],
    ['Uso de cupos base', percentage(data.usage), `${number(data.capacity)} personas autorizadas`]
  ];
  ensure(62);
  const cardY = y;
  cards.forEach(([label, value, detail], index) => {
    const x = 18 + (index % 2) * 89;
    const top = cardY + Math.floor(index / 2) * 30;
    doc.setFillColor(241, 246, 249); doc.roundedRect(x, top, 85, 26, 2, 2, 'F');
    font(9, true, muted); doc.text(label, x + 4, top + 6);
    font(value.length > 18 ? 12 : 19, true, ink); doc.text(value, x + 4, top + 15);
    font(8, false, muted); doc.text(detail, x + 4, top + 22);
  });
  y += 63;
  paragraph(`Cursos: ${data.courses.length}. Promedio de ingresos por familia presente: ${data.average}. Cupos disponibles por familia: ${number(data.available)}. Familias con ingreso extraordinario: ${number(data.extraFamilies)}.`, { size: 9 });
  heading('Lectura de los indicadores');
  paragraph('Familias presentes: alumnos habilitados con al menos una persona ingresada. Cada alumno representa una unidad familiar; hermanos pueden representar más de una unidad. Asistencia familiar = familias presentes / familias habilitadas.');
  paragraph('Uso de cupos base = ingresos de personas / cupos autorizados de la nómina habilitada. Puede superar el 100% por ingresos extraordinarios. Los cupos disponibles se suman por familia: el cupo libre de una familia no compensa el exceso de otra.');
  paragraph('Este informe describe participación en el evento. No mide asistencia a clases ni resultados de aprendizaje. Registra ingresos acumulados; sin datos de salida, no permite determinar la ocupación actual del recinto.', { size: 9, bold: true });

  page();
  bars(data.courses.map((course) => ({ name: course.name, value: course.attendance || 0,
    detail: `${course.present} de ${course.families} | ${percentage(course.attendance)}` })), {
    title: '2. Participación familiar por curso', label: 'Porcentaje de familias con al menos un ingreso. Escala de 0 a 100%.', maximum: 100
  });

  page();
  heading('3. Detalle por curso');
  paragraph('Totales de la nómina habilitada al corte. Los cupos corresponden a personas, no a familias.', { size: 9 });
  const columns = [18, 71, 96, 120, 146, 170];
  function tableHeader() {
    doc.setFillColor(...ink); doc.rect(18, y, width, 13, 'F');
    font(8, true, [255, 255, 255]);
    ['Curso', 'Familias\npresentes', 'Familias\nsin ingreso', 'Personas\ningresadas', 'Cupos\nbase', 'Uso de\ncupos'].forEach((label, i) => doc.text(label, columns[i] + 2, y + 4.5));
    y += 17;
  }
  tableHeader();
  const tableRows = [...data.courses, { name: 'TOTAL', present: data.present, families: data.families, pending: data.pending, people: data.people, capacity: data.capacity, usage: data.usage }];
  tableRows.forEach((row, index) => {
    font(9);
    const courseLines = doc.splitTextToSize(safe(row.name), 48);
    const height = Math.max(11, courseLines.length * 4.3 + 5);
    if (y + height > 270) { page(); heading('Detalle por curso (continuación)'); tableHeader(); }
    if (index % 2 === 0) { doc.setFillColor(241, 246, 249); doc.rect(18, y - 3.5, width, height, 'F'); }
    font(9, index === tableRows.length - 1); doc.text(courseLines, 20, y + 1);
    [`${row.present}/${row.families}`, number(row.pending), number(row.people), number(row.capacity), row.usage == null ? 'N/A' : `${row.usage}%`]
      .forEach((value, i) => doc.text(value, columns[i + 1] + 2, y + 1));
    y += height;
  });
  y += 5;
  paragraph('N/A: no hay cupos base para calcular un porcentaje. Los ingresos extraordinarios se incluyen en las personas ingresadas.', { size: 9 });

  page();
  bars(data.hours.map((hour) => ({ name: hour.name, value: hour.people, detail: `${number(hour.people)} personas` })), {
    title: '4. Ingresos por hora', label: 'Bitácora disponible completa, agrupada por fecha y hora de Santiago. Cada barra representa una hora.', color: blue
  });
  bars(data.doors.map((door) => ({ name: door.name, value: door.people, detail: `${number(door.people)} personas` })), {
    title: '5. Distribución por puerta', label: 'Personas registradas en cada acceso según la bitácora disponible.', color: blue
  });

  page();
  heading('6. Observaciones para Dirección y UTP');
  paragraph(`Dirección: se registran ${number(data.available)} cupos disponibles al sumar los saldos de cada familia y ${number(data.aboveCapacity)} ingresos por encima de los cupos base individuales. Estos valores permiten revisar la planificación de accesos y cupos de futuros eventos.`);
  if (data.hours.length) {
    const peak = data.hours.reduce((best, row) => row.people > best.people ? row : best);
    paragraph(`Operación: una de las franjas de mayor ingreso fue ${peak.name}, con ${number(peak.people)} personas. Considerar esta concentración al planificar la dotación de los accesos; no se dispone de tiempos de espera para evaluar congestión.`);
  }
  paragraph(data.pending
    ? `UTP: ${number(data.pending)} familias no presentan ingreso al corte. Revisar su participación junto con los equipos de curso y confirmar el cierre del evento antes de interpretar estos casos como inasistencia definitiva.`
    : data.families ? 'UTP: todas las unidades familiares habilitadas registran al menos un ingreso al corte.' : 'UTP: incorporar una nómina habilitada para analizar la participación por curso.');
  paragraph('Sugerencia de seguimiento: contrastar la participación con el contexto de cada curso y registrar acuerdos de comunicación para futuras actividades. Las diferencias entre cursos, por sí solas, no explican las causas de participación.');
  heading('7. Fuente, alcance y calidad de los datos');
  paragraph(`Fuente: nómina y bitácora cargadas en el panel en vivo. Se consideran ${number(data.families)} alumnos habilitados y se excluyen ${number(data.excluded)} alumnos retirados o deshabilitados del resumen y del detalle por curso. El anexo nominal identifica a los alumnos cuyas familias no registran ingresos, para seguimiento de Dirección y UTP.`);
  paragraph(`La bitácora contiene ${number(data.logCount)} movimientos y ${number(data.logPeople)} ingresos con cantidades válidas. Los gráficos de hora y puerta utilizan esta bitácora, que puede incluir alumnos actualmente excluidos de la nómina habilitada.`);
  if (data.logPeople !== data.people) paragraph(`Diferencia de fuentes: la bitácora registra ${number(data.logPeople)} ingresos y la nómina habilitada acumula ${number(data.people)}. Revisar exclusiones, modificaciones o registros disponibles antes de conciliar ambas cifras.`, { bold: true });
  if (data.invalidCounts) paragraph(`Se omitieron ${data.invalidCounts} movimientos con cantidad inválida de los gráficos operativos.`, { bold: true });
  if (data.undatedPeople) paragraph(`${number(data.undatedPeople)} ingresos no tienen una fecha válida: se incluyen en puertas y se excluyen del gráfico por hora.`, { bold: true });
  paragraph('Porcentajes redondeados al entero más cercano. Sin denominador, el porcentaje se informa como no calculable. Este documento es una fotografía de los datos disponibles al generarlo y no se actualiza después de su descarga.', { size: 9 });
  page();
  heading('8. Familias habilitadas sin ingreso');
  paragraph(`Listado nominal para seguimiento interno: ${number(data.pendingFamilies.length)} alumnos activos con cupo mayor que cero y sin ingresos al corte. Se excluyen retirados, deshabilitados y alumnos sin cupo autorizado.`);
  paragraph('La familia se identifica por el alumno asociado. No hay un registro separado de apoderados ni una agrupación de hermanos. Mientras el evento siga abierto, este listado indica llegada pendiente, no inasistencia definitiva.', { size: 9 });
  if (data.pending !== data.pendingFamilies.length) paragraph(`El resumen incluye ${data.pending - data.pendingFamilies.length} alumnos sin ingreso y sin cupo; no se incluyen en este listado de familias autorizadas para ingresar.`, { size: 9 });
  function pendingHeader() {
    doc.setFillColor(...ink); doc.rect(18, y, width, 10, 'F');
    font(9, true, [255, 255, 255]);
    doc.text('Alumno / familia asociada', 20, y + 6);
    doc.text('Curso', 111, y + 6);
    doc.text('Cupos', 175, y + 6);
    y += 15;
  }
  if (!data.pendingFamilies.length) paragraph('No hay familias habilitadas con cupo y sin ingreso registrado.');
  else {
    pendingHeader();
    data.pendingFamilies.forEach((family, index) => {
      font(9);
      const nameLines = doc.splitTextToSize(safe(family.name), 85);
      const courseLines = doc.splitTextToSize(safe(family.course), 57);
      const height = Math.max(12, Math.max(nameLines.length, courseLines.length) * 4.3 + 5);
      if (y + height > 270) { page(); heading('Familias sin ingreso (continuación)'); pendingHeader(); }
      if (index % 2 === 0) { doc.setFillColor(241, 246, 249); doc.rect(18, y - 3.5, width, height, 'F'); }
      font(9); doc.text(nameLines, 20, y + 1); doc.text(courseLines, 111, y + 1);
      doc.text(number(family.capacity), 175, y + 1);
      y += height;
    });
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i); doc.setDrawColor(210, 220, 229); doc.line(18, 280, 192, 280);
    font(8, false, muted); doc.text('Dirección y UTP | Informe de participación en el evento', 18, 286);
    doc.text(`${i} / ${pages}`, 192, 286, { align: 'right' });
  }
  doc.setProperties({ title: `Informe de asistencia - ${safe(event?.name || 'Evento')}`, subject: 'Reporte de gestión para Dirección y UTP', author: event?.institution || 'Acceso Escolar' });
  return doc;
}

export async function downloadManagementReport(input) {
  const generatedAt = new Date();
  const doc = await createManagementReportPdf({ ...input, generatedAt });
  const eventName = String(input.event?.name || 'Evento').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 70);
  doc.save(`Informe_Direccion_UTP_${eventName}_${generatedAt.toISOString().slice(0, 10)}.pdf`);
}
