/**
 * Generación bajo demanda de credenciales QR en PDF y archivos ZIP.
 * Las funciones producen archivos en memoria y no escriben datos en el servidor.
 */

import QRCode from 'qrcode';
import { getCapacityState } from './checkinPolicy.js';

const PDF_WIDTH_MM = 210;
let pdfLibraryPromise;
let zipLibraryPromise;

/** Carga de forma diferida la biblioteca PDF.
 * @returns {Promise<Function>} Constructor de jsPDF.
 */
function loadPdfLibrary() {
  pdfLibraryPromise ||= import('jspdf').then((module) => module.jsPDF);
  return pdfLibraryPromise;
}

/** Carga de forma diferida la biblioteca ZIP.
 * @returns {Promise<Function>} Constructor de JSZip.
 */
function loadZipLibrary() {
  zipLibraryPromise ||= import('jszip').then((module) => module.default);
  return zipLibraryPromise;
}

/** Sanitiza un fragmento usado en nombres de archivos.
 * @param {unknown} value Valor original.
 * @param {string} fallback Texto alternativo.
 * @param {number} maxLength Longitud máxima.
 * @returns {string} Fragmento seguro.
 */
export function safeFilePart(value, fallback = 'Sin nombre', maxLength = 100) {
  const cleaned = String(value || '')
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, maxLength);

  return cleaned || fallback;
}

/** Construye la carpeta y el nombre PDF de un estudiante.
 * @param {object} student Estudiante con curso y nombre.
 * @returns {{folderName: string, fileName: string}} Ruta lógica del PDF.
 */
export function getStudentPdfPath(student) {
  const course = safeFilePart(student?.course, 'Sin curso', 70);
  const studentName = safeFilePart(student?.name, 'Alumno', 100);
  return {
    folderName: course,
    fileName: `${studentName} - ${course}.pdf`
  };
}

/** Agrega texto centrado con salto de línea al PDF.
 * @param {object} pdf Documento jsPDF.
 * @param {unknown} text Texto que se imprimirá.
 * @param {number} y Coordenada vertical inicial.
 * @param {number} maxWidth Ancho máximo.
 * @param {number} fontSize Tamaño de fuente.
 * @param {number} lineHeight Factor de interlineado.
 * @returns {number} Coordenada vertical posterior al texto.
 */
function addCenteredWrappedText(pdf, text, y, maxWidth, fontSize, lineHeight = 1.15) {
  pdf.setFontSize(fontSize);
  const lines = pdf.splitTextToSize(String(text || ''), maxWidth);
  pdf.text(lines, PDF_WIDTH_MM / 2, y, { align: 'center' });
  return y + (lines.length * fontSize * 0.3528 * lineHeight);
}

/** Genera un PDF individual con la credencial QR del estudiante.
 * @param {{student: object, event?: object, organization?: object, seats?: Array<object>}} input Datos de la credencial.
 * @returns {Promise<Uint8Array>} PDF como bytes.
 * @throws {Error} Si faltan datos obligatorios del estudiante.
 */
export async function createStudentQrPdf({ student, event, organization, seats = [] }) {
  if (!student?.id || !student?.name || !student?.course) {
    throw new Error('El alumno debe tener código, nombre y curso para generar su PDF.');
  }

  const JsPDF = await loadPdfLibrary();
  const pdf = new JsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  });
  const eventName = event?.name || 'Control de Acceso';
  const institutionName = organization?.name || event?.institution || 'Acceso Escolar';
  const qrDataUrl = await QRCode.toDataURL(String(student.id), {
    width: 700,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0f172a',
      light: '#ffffff'
    }
  });

  pdf.setProperties({
    title: `${student.name} - ${student.course}`,
    subject: `Código QR de acceso - ${eventName}`,
    author: institutionName,
    creator: 'Acceso Escolar'
  });

  // Reproduce the on-screen credential as a centered printable card.
  pdf.setFillColor(248, 250, 252);
  pdf.rect(0, 0, PDF_WIDTH_MM, 297, 'F');

  const cardX = 18;
  const cardY = 14;
  const cardWidth = 174;
  const cardHeight = 269;
  const contentLeft = cardX + 10;
  const contentRight = cardX + cardWidth - 10;

  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.7);
  pdf.roundedRect(cardX, cardY, cardWidth, cardHeight, 5, 5, 'FD');

  // Institutional identity in the credential header.
  if (organization?.logoUrl?.startsWith('data:image/')) {
    pdf.addImage(organization.logoUrl, 'PNG', contentLeft, cardY + 8, 18, 18, undefined, 'FAST');
  } else {
    pdf.setFillColor(2, 132, 199);
    pdf.roundedRect(contentLeft, cardY + 10, 14, 14, 2.5, 2.5, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.text('QR', contentLeft + 7, cardY + 18.8, { align: 'center' });
  }

  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(11.5);
  pdf.text(institutionName, contentLeft + 18, cardY + 15.5, { maxWidth: 79 });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(100, 116, 139);
  pdf.text(eventName, contentLeft + 18, cardY + 21, { maxWidth: 79 });

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  const courseWidth = Math.min(57, Math.max(34, pdf.getTextWidth(student.course) + 10));
  const courseX = contentRight - courseWidth;
  pdf.setFillColor(240, 249, 255);
  pdf.setDrawColor(186, 230, 253);
  pdf.roundedRect(courseX, cardY + 11, courseWidth, 11, 5.5, 5.5, 'FD');
  pdf.setTextColor(7, 89, 133);
  pdf.text(student.course, courseX + (courseWidth / 2), cardY + 18.2, { align: 'center' });

  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.35);
  pdf.line(contentLeft, cardY + 31, contentRight, cardY + 31);

  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  const nameBottom = addCenteredWrappedText(pdf, student.name, cardY + 47, 150, 18, 1.05);

  pdf.setTextColor(100, 116, 139);
  pdf.setFont('courier', 'bold');
  pdf.setFontSize(10.5);
  pdf.text(`ID: ${student.id}`, PDF_WIDTH_MM / 2, nameBottom + 2.5, { align: 'center' });

  const qrSize = 104;
  const qrX = (PDF_WIDTH_MM - qrSize) / 2;
  const qrY = Math.max(cardY + 74, nameBottom + 11);
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.45);
  pdf.roundedRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, 5, 5, 'FD');
  pdf.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize, undefined, 'FAST');

  const maxCapacity = getCapacityState(student).maxCapacity;
  const capacityState = getCapacityState(student);
  const capacityLabel = capacityState.isAccessBlocked
    ? 'Credencial deshabilitada'
    : maxCapacity > 0
    ? `Válido para hasta ${maxCapacity} personas autorizadas`
    : 'Sin acceso habilitado';
  const badgeY = qrY + qrSize + 12;
  pdf.setFillColor(255, 251, 235);
  pdf.setDrawColor(253, 230, 138);
  pdf.roundedRect(49, badgeY, 112, 13, 6.5, 6.5, 'FD');
  pdf.setTextColor(146, 64, 14);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.2);
  pdf.text(capacityLabel, PDF_WIDTH_MM / 2, badgeY + 8.4, { align: 'center' });

  if (seats.length > 0) {
    const seatText = `Asientos: ${seats.map((seat) => seat.label || seat.id).join(' · ')}`;
    pdf.setTextColor(7, 89, 133);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.text(pdf.splitTextToSize(seatText, 145), PDF_WIDTH_MM / 2, badgeY + 22, { align: 'center' });
  }

  const footerLineY = cardY + cardHeight - 36;
  pdf.setDrawColor(241, 245, 249);
  pdf.line(contentLeft, footerLineY, contentRight, footerLineY);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.2);
  pdf.setTextColor(100, 116, 139);
  pdf.text(
    pdf.splitTextToSize(
      'Presenta este código en el acceso al evento (impreso o en la pantalla de tu celular). Los ingresos pueden ser simultáneos o por separado.',
      145
    ),
    PDF_WIDTH_MM / 2,
    footerLineY + 9,
    { align: 'center' }
  );

  return new Uint8Array(pdf.output('arraybuffer'));
}

/** Genera un PDF paginado con múltiples credenciales QR.
 * @param {{students: Array<object>, event?: object, organization?: object, getSeatsForStudent?: Function, onProgress?: Function}} input Datos de las credenciales.
 * @returns {Promise<Uint8Array>} PDF como bytes.
 * @throws {Error} Si no hay estudiantes para procesar.
 */
export async function createStudentsQrPdf({ students, event, organization, getSeatsForStudent, onProgress }) {
  if (!Array.isArray(students) || students.length === 0) {
    throw new Error('No hay estudiantes disponibles para generar el PDF.');
  }

  const JsPDF = await loadPdfLibrary();
  const pdf = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const institutionName = organization?.name || event?.institution || 'Acceso Escolar';
  const eventName = event?.name || 'Control de Acceso';
  const cardWidth = 92;
  const cardHeight = 132;
  const positions = [[10, 10], [108, 10], [10, 151], [108, 151]];

  for (let index = 0; index < students.length; index += 1) {
    if (index > 0 && index % positions.length === 0) pdf.addPage();
    const student = students[index];
    const [x, y] = positions[index % positions.length];
    const capacity = getCapacityState(student);
    const seats = getSeatsForStudent?.(student) || [];
    const qrDataUrl = await QRCode.toDataURL(String(student.id), {
      width: 500,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' }
    });

    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(148, 163, 184);
    pdf.setLineWidth(0.45);
    pdf.roundedRect(x, y, cardWidth, cardHeight, 3, 3, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(15, 23, 42);
    pdf.setFontSize(9.5);
    pdf.text(pdf.splitTextToSize(institutionName, 60), x + 5, y + 8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(6.8);
    pdf.text(pdf.splitTextToSize(eventName, 60), x + 5, y + 14);

    pdf.setFillColor(240, 249, 255);
    pdf.setDrawColor(186, 230, 253);
    pdf.roundedRect(x + 67, y + 5, 20, 8, 4, 4, 'FD');
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(7, 89, 133);
    pdf.setFontSize(6.8);
    pdf.text(String(student.course || 'Sin curso').slice(0, 18), x + 77, y + 10.3, { align: 'center' });

    pdf.setDrawColor(226, 232, 240);
    pdf.line(x + 5, y + 19, x + cardWidth - 5, y + 19);
    pdf.setTextColor(15, 23, 42);
    pdf.setFontSize(10.5);
    pdf.text(pdf.splitTextToSize(student.name || 'Estudiante', 80), x + (cardWidth / 2), y + 27, { align: 'center' });
    pdf.setFont('courier', 'bold');
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(7);
    pdf.text(`ID: ${student.id}`, x + (cardWidth / 2), y + 36, { align: 'center' });

    const qrSize = 48;
    const qrX = x + ((cardWidth - qrSize) / 2);
    const qrY = y + 40;
    pdf.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize, undefined, 'FAST');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(capacity.isAccessBlocked ? 185 : 146, capacity.isAccessBlocked ? 28 : 64, capacity.isAccessBlocked ? 28 : 14);
    pdf.text(
      capacity.isAccessBlocked ? 'Credencial deshabilitada' : `Hasta ${capacity.maxCapacity} personas autorizadas`,
      x + (cardWidth / 2), y + 96, { align: 'center' }
    );

    if (seats.length > 0) {
      pdf.setTextColor(7, 89, 133);
      pdf.setFontSize(7.2);
      const seatText = `Asientos: ${seats.map((seat) => seat.label || seat.id).join(' · ')}`;
      pdf.text(pdf.splitTextToSize(seatText, 80), x + (cardWidth / 2), y + 104, { align: 'center' });
    }

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.2);
    pdf.setTextColor(100, 116, 139);
    pdf.text(pdf.splitTextToSize('Presenta este QR en el acceso. Puede utilizarse impreso o desde un celular.', 78), x + (cardWidth / 2), y + 121, { align: 'center' });
    onProgress?.({ current: index + 1, total: students.length });

    if ((index + 1) % 8 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  pdf.setProperties({
    title: `Credenciales QR - ${eventName}`,
    subject: `Códigos QR de acceso - ${eventName}`,
    author: institutionName,
    creator: 'Acceso Escolar'
  });
  return new Uint8Array(pdf.output('arraybuffer'));
}

/** Genera un archivo ZIP con credenciales PDF agrupadas por curso.
 * @param {{students: Array<object>, event?: object, organization?: object, onProgress?: Function, getSeatsForStudent?: Function}} input Datos del archivo.
 * @returns {Promise<Uint8Array>} ZIP como bytes.
 * @throws {Error} Si no hay estudiantes para procesar.
 */
export async function createStudentQrArchive({ students, event, organization, onProgress, getSeatsForStudent }) {
  if (!Array.isArray(students) || students.length === 0) {
    throw new Error('No hay estudiantes disponibles para generar el archivo ZIP.');
  }

  const JSZip = await loadZipLibrary();
  const orderedStudents = [...students].sort((a, b) => {
    const courseComparison = String(a.course || '').localeCompare(String(b.course || ''), 'es');
    return courseComparison || String(a.name || '').localeCompare(String(b.name || ''), 'es');
  });
  const zip = new JSZip();
  const usedPaths = new Set();

  for (let index = 0; index < orderedStudents.length; index += 1) {
    const student = orderedStudents[index];
    const { folderName, fileName } = getStudentPdfPath(student);
    let uniqueFileName = fileName;
    let fullPath = `${folderName}/${uniqueFileName}`;

    if (usedPaths.has(fullPath.toLocaleLowerCase('es'))) {
      const baseName = fileName.replace(/\.pdf$/i, '');
      uniqueFileName = `${baseName} - ${safeFilePart(student.id, 'ID')}.pdf`;
      fullPath = `${folderName}/${uniqueFileName}`;
    }

    usedPaths.add(fullPath.toLocaleLowerCase('es'));
    const pdfBytes = await createStudentQrPdf({ student, event, organization, seats: getSeatsForStudent?.(student) || [] });
    zip.folder(folderName).file(uniqueFileName, pdfBytes, { binary: true });
    onProgress?.({ phase: 'pdfs', current: index + 1, total: orderedStudents.length });

    if ((index + 1) % 8 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const archiveBytes = await zip.generateAsync(
    {
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    },
    ({ percent }) => onProgress?.({ phase: 'zip', percent: Math.round(percent) })
  );
  const eventName = safeFilePart(event?.name, 'Evento', 80).replace(/\s+/g, '_');

  return {
    bytes: archiveBytes,
    fileName: `QR_por_alumno_${eventName}.zip`,
    pdfCount: orderedStudents.length
  };
}
