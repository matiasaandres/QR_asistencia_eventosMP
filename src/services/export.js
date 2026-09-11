import { getCapacityState } from './checkinPolicy';
import { getUniqueCapacityStudents } from './familyPolicy.js';
import { createExcelDownload } from './spreadsheet.js';

export async function exportToExcel({ event, students, logs, organization }) {
  const overviewRows = [
    { Campo: 'Escuela', Valor: organization?.name || event?.institution || 'Acceso Escolar' },
    { Campo: 'Evento', Valor: event?.name || 'Evento' },
    { Campo: 'Fecha del evento', Valor: event?.date || '' },
    { Campo: 'Generado', Valor: new Date().toLocaleString('es-CL') }
  ];

  const studentsData = students.map((student) => {
    const capacity = getCapacityState(student);
    const extraGuest = student.familyExtraGuest || student.extraGuest;
    return {
      'Código': student.id,
      'Estudiante': student.name,
      'Curso': student.course,
      'Capacidad Autorizada': capacity.maxCapacity,
      'Personas Ingresadas': capacity.enteredCount,
      'Personas Actualmente Dentro': capacity.insideCount,
      'Cupos Restantes': Math.max(0, capacity.maxCapacity - capacity.enteredCount),
      'Estado Acceso': capacity.isDisabled
        ? 'DESHABILITADO'
        : capacity.hasExtraGuest
          ? 'CUPO EXTRA'
          : capacity.enteredCount >= capacity.maxCapacity
            ? 'COMPLETO'
            : capacity.enteredCount > 0 ? 'PARCIAL' : 'PENDIENTE',
      'Cupo Extraordinario': capacity.hasExtraGuest ? 'Sí' : 'No',
      'Nombre Persona Extra': extraGuest?.name || '',
      'Parentesco Persona Extra': extraGuest?.relationship || '',
      'Último Registro': (student.familyLastEntryAt || student.lastEntryAt) ? new Date(student.familyLastEntryAt || student.lastEntryAt).toLocaleString('es-CL') : 'Sin ingresos'
    };
  });

  const logsData = logs.map((log) => ({
    'Fecha': log.formattedDate || '',
    'Hora': log.formattedTime || '',
    'Estudiante': log.studentName || '',
    'Curso': log.course || '',
    'Código': log.studentId || '',
    'Tipo de Movimiento': log.movementType === 'EXIT' ? 'Salida' : log.movementType === 'REENTRY' ? 'Reingreso' : 'Ingreso',
    'Personas en este Movimiento': log.count || 0,
    'Total Acumulado': log.accumulated || 0,
    'Personas Dentro Después': log.insideAfter ?? log.accumulated ?? 0,
    'Punto / Puerta': log.doorName || 'Acceso Principal',
    'Cupo Extraordinario': log.isExtra ? 'Sí' : 'No',
    'Nombre Persona Extra': log.guestName || '',
    'Parentesco': log.relationship || ''
  }));

  const courseStats = {};
  getUniqueCapacityStudents(students.filter((student) => !getCapacityState(student).isAccessBlocked)).forEach((student) => {
    const capacity = getCapacityState(student);
    const course = student.course || 'Sin Curso';
    if (!courseStats[course]) {
      courseStats[course] = {
        'Curso': course,
        'Total Estudiantes': 0,
        'Familias que Asistieron': 0,
        'Familias Pendientes': 0,
        'Total Personas Ingresadas': 0
      };
    }
    const row = courseStats[course];
    row['Total Estudiantes'] += 1;
    if (capacity.enteredCount > 0) {
      row['Familias que Asistieron'] += 1;
      row['Total Personas Ingresadas'] += capacity.enteredCount;
    } else row['Familias Pendientes'] += 1;
  });

  const courseRows = Object.values(courseStats).map((stat) => ({
    ...stat,
    '% Asistencia Familiar': `${((stat['Familias que Asistieron'] / stat['Total Estudiantes']) * 100).toFixed(1)}%`
  }));
  const cleanEventName = (event?.name || 'Acceso_Escolar').replace(/[^a-zA-Z0-9_-]/g, '_');
  const dateStr = new Date().toISOString().slice(0, 10);

  await createExcelDownload({
    fileName: `Reporte_${cleanEventName}_${dateStr}.xlsx`,
    sheets: [
      { name: 'Información', rows: overviewRows },
      { name: 'Resumen Estudiantes', rows: studentsData },
      { name: 'Bitácora de Movimientos', rows: logsData },
      { name: 'Estadísticas por Curso', rows: courseRows }
    ]
  });
}
