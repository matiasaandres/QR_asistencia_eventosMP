import ExcelJS from 'exceljs';

const output = new URL('../public/Plantilla_Carga_Masiva_MundoPalabra.xlsx', import.meta.url);
const workbook = new ExcelJS.Workbook();
workbook.creator = 'MundoPalabra Acceso';

const students = workbook.addWorksheet('Estudiantes', {
  views: [{ state: 'frozen', ySplit: 1, showGridLines: false }]
});
students.columns = [
  { header: 'Nombre', key: 'name', width: 34 },
  { header: 'Curso', key: 'course', width: 22 },
  { header: 'Capacidad', key: 'capacity', width: 14 }
];
students.getRow(1).height = 26;
students.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
students.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } };
students.dataValidations.add('C2:C5001', {
  type: 'whole',
  operator: 'between',
  allowBlank: true,
  formulae: [0, 50],
  showErrorMessage: true,
  errorTitle: 'Capacidad inválida',
  error: 'Ingresa un número entero entre 0 y 50.'
});
students.autoFilter = 'A1:C1';

const instructions = workbook.addWorksheet('Instrucciones', { views: [{ showGridLines: false }] });
instructions.columns = [{ width: 10 }, { width: 35 }, { width: 52 }, { width: 32 }];
instructions.addRow(['Cómo completar la carga masiva']);
instructions.mergeCells('A1:D1');
instructions.addRow(['Completa una fila por estudiante en la hoja “Estudiantes” y luego sube este mismo archivo en la aplicación.']);
instructions.mergeCells('A2:D2');
instructions.addRow([]);
instructions.addRow(['Paso', 'Acción', 'Importante', 'Ejemplo']);
[
  [1, 'Abre la hoja Estudiantes.', 'No cambies los nombres de las columnas.', 'Nombre, Curso, Capacidad'],
  [2, 'Escribe cada alumno en una fila nueva.', 'No agregues una columna de código: la app lo genera.', 'Martina Pérez Morales'],
  [3, 'Ingresa la capacidad como número.', 'Usa un valor entre 0 y 50.', 5],
  [4, 'Guarda el archivo en formato .xlsx.', 'No elimines la hoja Estudiantes.', 'Nómina_2026.xlsx'],
  [5, 'En la app, selecciona Importar Excel / CSV.', 'Espera la confirmación de guardado.', 'Importación completada']
].forEach((row) => instructions.addRow(row));
instructions.getRow(1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
instructions.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
instructions.getRow(4).font = { bold: true, color: { argb: 'FFFFFFFF' } };
instructions.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } };
instructions.eachRow((row, rowNumber) => {
  if (rowNumber >= 5) row.height = 34;
  row.alignment = { vertical: 'middle', wrapText: true };
});

await workbook.xlsx.writeFile(output);
console.log(`Plantilla generada: ${output.pathname}`);
