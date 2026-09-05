import * as XLSX from 'xlsx';

export function exportToExcel({ event, students, logs }) {
  const wb = XLSX.utils.book_new();

  // 1. Resumen por Estudiante
  const studentsData = students.map((s) => {
    const parsedCapacity = Number(s.maxCapacity);
    const maxCapacity = Number.isFinite(parsedCapacity) ? Math.max(0, parsedCapacity) : 5;
    const enteredCount = Number(s.enteredCount) || 0;
    const hasExtraGuest = Boolean(s.extraGuest) || enteredCount > maxCapacity;

    return {
      "Código": s.id,
      "Estudiante": s.name,
      "Curso": s.course,
      "Capacidad Autorizada": maxCapacity,
      "Personas Ingresadas": enteredCount,
      "Cupos Restantes": Math.max(0, maxCapacity - enteredCount),
      "Estado Acceso": hasExtraGuest
        ? "CUPO EXTRA"
        : enteredCount >= maxCapacity
          ? "COMPLETO"
          : enteredCount > 0
            ? "PARCIAL"
            : "PENDIENTE",
      "Cupo Extraordinario": hasExtraGuest ? 'Sí' : 'No',
      "Nombre Persona Extra": s.extraGuest?.name || '',
      "Parentesco Persona Extra": s.extraGuest?.relationship || '',
      "Último Registro": s.lastEntryAt ? new Date(s.lastEntryAt).toLocaleString('es-CL') : 'Sin ingresos'
    };
  });
  const wsStudents = XLSX.utils.json_to_sheet(studentsData);
  XLSX.utils.book_append_sheet(wb, wsStudents, "Resumen Estudiantes");

  // 2. Bitácora Detallada de Ingresos (Logs)
  const logsData = logs.map((l) => ({
    "Fecha": l.formattedDate || '',
    "Hora": l.formattedTime || '',
    "Estudiante": l.studentName || '',
    "Curso": l.course || '',
    "Código": l.studentId || '',
    "Personas en este Ingreso": l.count || 0,
    "Total Acumulado": l.accumulated || 0,
    "Punto / Puerta": l.doorName || 'Acceso Principal',
    "Cupo Extraordinario": l.isExtra ? 'Sí' : 'No',
    "Nombre Persona Extra": l.guestName || '',
    "Parentesco": l.relationship || ''
  }));
  const wsLogs = XLSX.utils.json_to_sheet(logsData);
  XLSX.utils.book_append_sheet(wb, wsLogs, "Bitácora de Ingresos");

  // 3. Estadísticas por Curso
  const courseStats = {};
  students.forEach((s) => {
    const course = s.course || 'Sin Curso';
    if (!courseStats[course]) {
      courseStats[course] = {
        "Curso": course,
        "Total Estudiantes": 0,
        "Familias que Asistieron": 0,
        "Familias Pendientes": 0,
        "Total Personas Ingresadas": 0
      };
    }
    courseStats[course]["Total Estudiantes"] += 1;
    if ((s.enteredCount || 0) > 0) {
      courseStats[course]["Familias que Asistieron"] += 1;
      courseStats[course]["Total Personas Ingresadas"] += s.enteredCount;
    } else {
      courseStats[course]["Familias Pendientes"] += 1;
    }
  });

  const courseRows = Object.values(courseStats).map((stat) => ({
    ...stat,
    "% Asistencia Familiar": ((stat["Familias que Asistieron"] / stat["Total Estudiantes"]) * 100).toFixed(1) + "%"
  }));
  const wsCourses = XLSX.utils.json_to_sheet(courseRows);
  XLSX.utils.book_append_sheet(wb, wsCourses, "Estadísticas por Curso");

  // Generate file name with event and date
  const cleanEventName = (event?.name || 'MundoPalabra_Acceso').replace(/[^a-zA-Z0-9_-]/g, '_');
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `Reporte_${cleanEventName}_${dateStr}.xlsx`;

  XLSX.writeFile(wb, fileName);
}
