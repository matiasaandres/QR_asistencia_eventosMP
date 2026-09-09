import { mkdir, writeFile } from 'node:fs/promises';
import { createManagementReportPdf } from '../src/services/managementReport.js';

// Synthetic data only: this sample is never a report of the live event.
const students = Array.from({ length: 14 }, (_, course) => Array.from({ length: 21 }, (_, index) => ({
  name: `Alumno ficticio ${course + 1}-${index + 1}`,
  course: `${Math.floor(course / 2) + 1}° Básico ${course % 2 ? 'B' : 'A'}`,
  maxCapacity: 5, enteredCount: index < 16 - course % 5 ? 1 + index % 4 : 0
}))).flat();
const logs = students.filter((student) => student.enteredCount).map((student, index) => ({
  count: student.enteredCount, doorName: `Puerta ${index % 2 + 1}`,
  timestamp: `2026-09-09T${String(14 + index % 5).padStart(2, '0')}:15:00-03:00`
}));
const doc = await createManagementReportPdf({ event: { name: 'Evento institucional - Ejemplo de informe' }, students, logs,
  generatedAt: new Date('2026-09-09T19:00:00-03:00'), demo: true });
await mkdir(new URL('../output/pdf/', import.meta.url), { recursive: true });
await writeFile(new URL('../output/pdf/Informe_Direccion_UTP_Ejemplo.pdf', import.meta.url), new Uint8Array(doc.output('arraybuffer')));
console.log(`Informe de ejemplo generado: ${doc.getNumberOfPages()} páginas.`);
