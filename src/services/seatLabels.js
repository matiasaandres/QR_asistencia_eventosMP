import { getAllSeats } from './seatingPolicy.js';
import { safeFilePart } from './qrArchive.js';

let pdfLibraryPromise;
const loadPdfLibrary = () => {
  pdfLibraryPromise ||= import('jspdf').then((module) => module.jsPDF);
  return pdfLibraryPromise;
};

/** Construye las etiquetas en el mismo orden físico del recinto. */
export function buildSeatLabelRecords({ venue, seatPlan, assignedOnly = false } = {}) {
  return getAllSeats(venue)
    .map((seat) => ({ seat, assignment: seatPlan?.assignments?.[seat.id] || null }))
    .filter((item) => !assignedOnly || item.assignment)
    .sort((a, b) => String(a.seat.floorId).localeCompare(String(b.seat.floorId), 'es')
      || String(a.seat.sectionId).localeCompare(String(b.seat.sectionId), 'es')
      || String(a.seat.row).localeCompare(String(b.seat.row), 'es', { numeric: true })
      || Number(a.seat.number) - Number(b.seat.number));
}

/** Genera hojas A4 de 24 etiquetas adhesivas (3 × 8, 63,5 × 33,9 mm). */
export async function createSeatLabelsPdf({ venue, seatPlan, event, organization, assignedOnly = false } = {}) {
  const records = buildSeatLabelRecords({ venue, seatPlan, assignedOnly });
  if (!records.length) throw new Error(assignedOnly ? 'No hay asientos asignados para generar etiquetas.' : 'El recinto no contiene asientos.');
  const JsPDF = await loadPdfLibrary();
  const pdf = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const columns = 3;
  const rows = 8;
  const labelWidth = 63.5;
  const labelHeight = 33.9;
  const gapX = 2.5;
  const gapY = 2;
  const marginX = (210 - (columns * labelWidth) - ((columns - 1) * gapX)) / 2;
  const marginY = (297 - (rows * labelHeight) - ((rows - 1) * gapY)) / 2;
  const perPage = columns * rows;

  records.forEach(({ seat, assignment }, index) => {
    if (index > 0 && index % perPage === 0) pdf.addPage();
    const position = index % perPage;
    const column = position % columns;
    const row = Math.floor(position / columns);
    const x = marginX + (column * (labelWidth + gapX));
    const y = marginY + (row * (labelHeight + gapY));
    const color = assignment?.color || '#e2e8f0';
    const red = Number.parseInt(color.slice(1, 3), 16);
    const green = Number.parseInt(color.slice(3, 5), 16);
    const blue = Number.parseInt(color.slice(5, 7), 16);

    pdf.setDrawColor(148, 163, 184);
    pdf.setLineWidth(0.25);
    pdf.roundedRect(x, y, labelWidth, labelHeight, 2, 2, 'S');
    pdf.setFillColor(red, green, blue);
    pdf.roundedRect(x + 2.2, y + 2.2, 6, labelHeight - 4.4, 1.5, 1.5, 'F');
    pdf.setTextColor(15, 23, 42);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.text(String(seat.label || seat.id), x + 35.5, y + 11, { align: 'center', maxWidth: 50 });
    pdf.setFontSize(7.5);
    pdf.setTextColor(71, 85, 105);
    pdf.text(assignment?.course ? `Curso ${assignment.course}` : 'Asiento disponible', x + 35.5, y + 17, { align: 'center', maxWidth: 49 });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    if (assignment?.ownerName) pdf.text(pdf.splitTextToSize(assignment.ownerName, 49), x + 35.5, y + 22, { align: 'center' });
    const footer = `${venue?.name || 'Recinto'} · ${event?.name || 'Evento'}`;
    pdf.text(pdf.splitTextToSize(footer, 49), x + 35.5, y + 30, { align: 'center' });
  });

  pdf.setProperties({
    title: `Etiquetas de asientos - ${event?.name || venue?.name || 'Evento'}`,
    subject: 'Etiquetas adhesivas para identificar los asientos del recinto',
    author: organization?.name || event?.institution || 'Mundo Palabra',
    creator: 'Mundo Palabra Acceso'
  });
  return new Uint8Array(pdf.output('arraybuffer'));
}

/** Descarga las etiquetas como PDF desde el navegador. */
export async function downloadSeatLabelsPdf(input) {
  const bytes = await createSeatLabelsPdf(input);
  const downloadUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = `Etiquetas_asientos_${safeFilePart(input?.event?.name, 'Evento', 80).replace(/\s+/g, '_')}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}
