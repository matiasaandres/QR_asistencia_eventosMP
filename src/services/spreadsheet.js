/**
 * Lectura y generación de hojas de cálculo para importaciones y reportes.
 * Valida tamaño, extensión, estructura y número de filas antes de procesar.
 */

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;
const MAX_COLUMNS = 50;
const ALLOWED_EXTENSIONS = ['xlsx', 'csv'];

/** Obtiene la extensión de un nombre de archivo.
 * @param {string} name Nombre del archivo.
 * @returns {string} Extensión en minúsculas.
 */
function extensionOf(name = '') {
  return String(name).split('.').pop()?.toLowerCase() || '';
}

/** Valida tamaño y formato de una planilla.
 * @param {object} file Archivo seleccionado.
 * @param {{maxBytes?: number}} options Límites de validación.
 * @returns {string} Extensión validada.
 * @throws {Error} Si el archivo no cumple los límites.
 */
export function validateSpreadsheetFile(file, { maxBytes = MAX_FILE_BYTES } = {}) {
  if (!file) throw new Error('Selecciona una planilla para continuar.');
  const extension = extensionOf(file.name);
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    throw new Error('Formato no permitido. Usa una planilla .xlsx o .csv.');
  }
  if (!Number.isFinite(file.size) || file.size <= 0) throw new Error('La planilla está vacía.');
  if (file.size > maxBytes) throw new Error(`La planilla supera el máximo permitido de ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  return extension;
}

/** Convierte el valor de una celda a texto o valor simple.
 * @param {unknown} value Valor de celda.
 * @returns {unknown} Valor legible.
 */
function cellText(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return value;
  if (value.result != null) return cellText(value.result);
  if (value.text != null) return cellText(value.text);
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('');
  return String(value);
}

/** Convierte filas tabulares en objetos usando la primera fila como encabezado.
 * @param {Array<Array<unknown>>} rows Filas leídas.
 * @param {{maxRows?: number, maxColumns?: number}} options Límites.
 * @returns {Array<object>} Filas convertidas.
 * @throws {Error} Si se exceden los límites.
 */
function rowsToObjects(rows, { maxRows = MAX_ROWS, maxColumns = MAX_COLUMNS } = {}) {
  if (!rows.length) return [];
  const headers = rows[0].slice(0, maxColumns).map((value) => String(cellText(value)).trim());
  if (headers.length > maxColumns || rows.some((row) => row.length > maxColumns)) {
    throw new Error(`La planilla supera el máximo de ${maxColumns} columnas.`);
  }
  if (rows.length - 1 > maxRows) throw new Error(`La planilla supera el máximo de ${maxRows} filas.`);
  return rows.slice(1).flatMap((row) => {
    const values = row.slice(0, maxColumns).map(cellText);
    if (values.every((value) => value === '')) return [];
    return [Object.fromEntries(headers.flatMap((header, index) => header ? [[header, values[index] ?? '']] : []))];
  });
}

/** Detecta el separador más frecuente de la primera fila CSV.
 * @param {string} text Contenido CSV.
 * @returns {string} Separador detectado.
 */
function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const counts = [',', ';', '\t'].map((delimiter) => ({
    delimiter,
    count: firstLine.split(delimiter).length - 1
  }));
  return counts.sort((left, right) => right.count - left.count)[0].count > 0
    ? counts[0].delimiter
    : ',';
}

/** Analiza texto CSV respetando comillas y límites.
 * @param {string} text Contenido CSV.
 * @param {{maxRows?: number, maxColumns?: number}} options Límites.
 * @returns {Array<Array<string>>} Filas analizadas.
 * @throws {Error} Si el CSV está mal formado o excede los límites.
 */
function parseCsv(text, { maxRows = MAX_ROWS, maxColumns = MAX_COLUMNS } = {}) {
  const rows = [];
  const delimiter = detectDelimiter(text);
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else value += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === delimiter) {
      row.push(value);
      value = '';
      if (row.length > maxColumns) throw new Error(`La planilla supera el máximo de ${maxColumns} columnas.`);
    } else if (character === '\n') {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
      if (rows.length > maxRows + 1) throw new Error(`La planilla supera el máximo de ${maxRows} filas.`);
    } else value += character;
  }
  if (quoted) throw new Error('El archivo CSV contiene una celda entre comillas sin cerrar.');
  if (value || row.length) rows.push([...row, value.replace(/\r$/, '')]);
  return rows;
}

/** Carga ExcelJS bajo demanda.
 * @returns {Promise<object>} Módulo ExcelJS.
 */
async function loadExcelJs() {
  const module = await import('exceljs');
  return module.default || module;
}

/** Extrae filas de una hoja de Excel respetando límites.
 * @param {object} worksheet Hoja de ExcelJS.
 * @param {{maxRows: number, maxColumns: number}} limits Límites.
 * @returns {Array<Array<unknown>>} Filas extraídas.
 * @throws {Error} Si se excede algún límite.
 */
function worksheetRows(worksheet, limits) {
  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (sourceRow) => {
    if (rows.length >= limits.maxRows + 1) throw new Error(`La planilla supera el máximo de ${limits.maxRows} filas.`);
    const values = sourceRow.values.slice(1);
    if (values.length > limits.maxColumns) throw new Error(`La planilla supera el máximo de ${limits.maxColumns} columnas.`);
    rows.push(values);
  });
  return rows;
}

/** Lee un archivo CSV o XLSX y devuelve sus hojas como objetos.
 * @param {object} file Archivo de planilla.
 * @param {{sheetNames?: Array<string>, maxRows?: number, maxColumns?: number, maxBytes?: number}} options Opciones de lectura.
 * @returns {Promise<Object<string, Array<object>>>} Hojas leídas.
 * @throws {Error} Si el archivo es inválido o no puede leerse.
 */
export async function readSpreadsheet(file, {
  sheetNames,
  maxRows = MAX_ROWS,
  maxColumns = MAX_COLUMNS,
  maxBytes = MAX_FILE_BYTES
} = {}) {
  const extension = validateSpreadsheetFile(file, { maxBytes });
  if (extension === 'csv') {
    if (sheetNames?.length > 1) throw new Error('Un archivo CSV no puede contener varias hojas.');
    const text = new TextDecoder('utf-8', { fatal: false }).decode(await file.arrayBuffer()).replace(/^\uFEFF/, '');
    return { [sheetNames?.[0] || 'Datos']: rowsToObjects(parseCsv(text, { maxRows, maxColumns }), { maxRows, maxColumns }) };
  }

  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const requested = sheetNames?.length ? sheetNames : [workbook.worksheets[0]?.name];
  return Object.fromEntries(requested.map((name) => {
    const worksheet = workbook.getWorksheet(name);
    if (!worksheet) throw new Error(`La planilla no contiene la hoja “${name}”.`);
    return [name, rowsToObjects(worksheetRows(worksheet, { maxRows, maxColumns }), { maxRows, maxColumns })];
  }));
}

/** Genera y descarga un libro XLSX desde varias hojas.
 * @param {{sheets: Array<{name: string, rows: Array<object>}>, fileName: string}} input Datos del libro.
 * @returns {Promise<void>} Promesa de descarga.
 */
export async function createExcelDownload({ sheets, fileName }) {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MundoPalabra Acceso';
  workbook.created = new Date();

  sheets.forEach(({ name, rows }) => {
    const worksheet = workbook.addWorksheet(String(name).slice(0, 31));
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    worksheet.addRow(headers);
    rows.forEach((row) => worksheet.addRow(headers.map((header) => row[header] ?? '')));
    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.columns = headers.map((header) => ({ width: Math.min(40, Math.max(12, header.length + 2)) }));
    worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const SPREADSHEET_LIMITS = Object.freeze({
  maxBytes: MAX_FILE_BYTES,
  maxRows: MAX_ROWS,
  maxColumns: MAX_COLUMNS
});
