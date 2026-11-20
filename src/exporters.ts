// Turns the sheet into files at print size: a PDF with one exact page per sheet, or a JPEG of one page. Photos are
// drawn at 300 dpi; in the PDF the dots are vector circles, sharp at any zoom.

import {
  DOT_COLOUR,
  DOT_DIAMETER,
  dotPositions,
  drawPlan,
  type Crop,
  type Placement,
  type Settings,
  type Sheet,
} from './layout';
import {withImage} from './photos';

export interface ExportPhoto {
  /** The original, opened only while it is drawn. */
  blob: Blob;
  /** The screen copy, drawn instead if this device cannot open the original. */
  preview: Blob;
  crop: Crop;
}

const PRINT_DPI = 300;
const PX_PER_MM = PRINT_DPI / 25.4;

/** Paints the dots of a page, given millimetres to pixels. */
export const drawDots = (context: CanvasRenderingContext2D, dots: [number, number][], scale: number): void => {
  const radius = (DOT_DIAMETER / 2) * scale;
  context.fillStyle = DOT_COLOUR;
  context.beginPath();
  for (const [x, y] of dots) {
    context.moveTo(x * scale + radius, y * scale);
    context.arc(x * scale, y * scale, radius, 0, Math.PI * 2);
  }
  context.fill();
};

const drawPhoto = (
  context: CanvasRenderingContext2D,
  photo: ExportPhoto,
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<void> => {
  const draw = (image: CanvasImageSource, imageWidth: number, imageHeight: number) => {
    const {source, target} = drawPlan(imageWidth, imageHeight, width / height, photo.crop);
    // Zoomed out, the photo is smaller than its frame: the rest of the frame is white paper.
    context.fillStyle = '#ffffff';
    context.fillRect(x, y, width, height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      image,
      source.x,
      source.y,
      source.width,
      source.height,
      x + target.x * width,
      y + target.y * height,
      target.width * width,
      target.height * height,
    );
  };

  // A phone short of memory may not open a very big original: the export then uses the screen copy, never fails.
  return withImage(photo.blob, draw).catch(() => withImage(photo.preview, draw));
};

const canvasOf = (width: number, height: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);

  return [canvas, canvas.getContext('2d')!] as const;
};

const placementsOn = (sheet: Sheet, page: number): Placement[] =>
  sheet.placements.filter(placement => page === placement.page);

/** A JPEG of one page at 300 dpi, the paper's exact size. */
export const exportPageImage = async (
  sheet: Sheet,
  page: number,
  photos: Map<string, ExportPhoto>,
  settings: Settings,
): Promise<Blob> => {
  const [canvas, context] = canvasOf(sheet.width * PX_PER_MM, sheet.height * PX_PER_MM);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const onPage = placementsOn(sheet, page);
  for (const placement of onPage) {
    const photo = photos.get(placement.id);
    if (!photo) continue;
    await drawPhoto(
      context,
      photo,
      placement.x * PX_PER_MM,
      placement.y * PX_PER_MM,
      placement.width * PX_PER_MM,
      placement.height * PX_PER_MM,
    );
  }
  drawDots(context, dotPositions(sheet, settings), PX_PER_MM);

  return new Promise((resolve, reject) =>
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('No image'))), 'image/jpeg', 0.95),
  );
};

/** A PDF with one page per sheet page, at the paper's exact size: print it at 100% for exact squares. */
export const exportPdf = async (sheet: Sheet, photos: Map<string, ExportPhoto>, settings: Settings): Promise<Blob> => {
  const {jsPDF} = await import('jspdf');
  const orientation = sheet.width > sheet.height ? 'landscape' : 'portrait';
  const pdf = new jsPDF({unit: 'mm', format: [sheet.width, sheet.height], orientation, compress: true});
  const dots = dotPositions(sheet, settings);
  for (let page = 0; page < sheet.pageCount; page++) {
    if (page > 0) pdf.addPage([sheet.width, sheet.height], orientation);
    pdf.setFillColor('#ffffff');
    pdf.rect(0, 0, sheet.width, sheet.height, 'F');
    const onPage = placementsOn(sheet, page);
    for (const placement of onPage) {
      const photo = photos.get(placement.id);
      if (!photo) continue;
      const [canvas, context] = canvasOf(placement.width * PX_PER_MM, placement.height * PX_PER_MM);
      await drawPhoto(context, photo, 0, 0, canvas.width, canvas.height);
      const jpeg = canvas.toDataURL('image/jpeg', 0.92);
      canvas.width = canvas.height = 0;
      pdf.addImage(jpeg, 'JPEG', placement.x, placement.y, placement.width, placement.height);
    }
    pdf.setFillColor(DOT_COLOUR);
    for (const [x, y] of dots) pdf.circle(x, y, DOT_DIAMETER / 2, 'F');
  }

  return pdf.output('blob');
};

/** Hands a file to the browser's downloads. */
export const download = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
