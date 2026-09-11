import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { readSpreadsheet } from '../src/services/spreadsheet.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = path.join(repoRoot, 'public', 'Plantilla_Carga_Masiva_MundoPalabra.xlsx');
test('la plantilla de carga masiva contiene el formato reconocido por la app', async () => {
  assert.equal(fs.existsSync(templatePath), true, 'Debe existir la plantilla Excel descargable');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Estudiantes', 'Instrucciones']);

  const rows = workbook.getWorksheet('Estudiantes').getSheetValues().slice(1).map((row) => row.slice(1));
  assert.deepEqual(rows[0], ['Nombre', 'Curso', 'Capacidad']);
  const populatedDataRows = rows.slice(1).filter((row) => row.some((value) => value != null && value !== ''));
  assert.equal(populatedDataRows.length, 0, 'La plantilla no debe incluir códigos ni estudiantes de ejemplo');

  const bytes = fs.readFileSync(templatePath);
  const parsed = await readSpreadsheet({
    name: 'Plantilla_Carga_Masiva_MundoPalabra.xlsx',
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  }, { sheetNames: ['Estudiantes'] });
  assert.deepEqual(parsed.Estudiantes, []);
});

test('la interfaz ofrece descargar la plantilla y genera los códigos en la app', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'src', 'components', 'StudentsManager.jsx'), 'utf8');
  assert.match(source, /Descargar plantilla Excel/);
  assert.match(source, /Plantilla_Carga_Masiva_MundoPalabra\.xlsx/);
  assert.match(source, /createStudentCodeGenerator/);
  assert.doesNotMatch(source, /row\['Codigo'\]|row\['ID'\]/);
});

test('el login muestra una versión coherente con package.json', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const versionSource = fs.readFileSync(path.join(repoRoot, 'src', 'config', 'appVersion.js'), 'utf8');
  const loginSource = fs.readFileSync(path.join(repoRoot, 'src', 'components', 'LoginScreen.jsx'), 'utf8');

  assert.match(versionSource, new RegExp(`APP_VERSION = ['\"]${packageJson.version}['\"]`));
  assert.match(loginSource, /Versión \{APP_VERSION\}/);
});
