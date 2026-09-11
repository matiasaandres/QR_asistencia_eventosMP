import test from 'node:test';
import assert from 'node:assert/strict';
import { readSpreadsheet, validateSpreadsheetFile } from '../src/services/spreadsheet.js';

function fileFromText(name, text) {
  const bytes = new TextEncoder().encode(text);
  return { name, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer };
}

test('rechaza formatos heredados o ejecutables y archivos sobredimensionados', () => {
  assert.throws(() => validateSpreadsheetFile({ name: 'nomina.xls', size: 100 }), /Formato no permitido/);
  assert.throws(() => validateSpreadsheetFile({ name: 'nomina.js', size: 100 }), /Formato no permitido/);
  assert.throws(() => validateSpreadsheetFile({ name: 'nomina.xlsx', size: 6 * 1024 * 1024 }), /supera el máximo/);
});

test('lee CSV acotado respetando comillas y encabezados', async () => {
  const result = await readSpreadsheet(fileFromText('nomina.csv', 'Nombre,Curso,Capacidad\n"Pérez, Ana",6A,4'));
  assert.deepEqual(result.Datos, [{ Nombre: 'Pérez, Ana', Curso: '6A', Capacidad: '4' }]);
});

test('reconoce CSV separado por punto y coma generado por Excel en español', async () => {
  const result = await readSpreadsheet(fileFromText('nomina.csv', 'Nombre;Curso;Capacidad\nAna;6A;4'));
  assert.deepEqual(result.Datos, [{ Nombre: 'Ana', Curso: '6A', Capacidad: '4' }]);
});

test('detiene CSV con más filas que el límite indicado', async () => {
  const file = fileFromText('nomina.csv', 'Nombre\nAna\nBeto\nCarla');
  await assert.rejects(() => readSpreadsheet(file, { maxRows: 2 }), /supera el máximo/);
});
