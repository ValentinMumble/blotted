// The sheet's geometry, in millimetres: where each photo sits on the page, what part of it shows, and where the
// cut-line dots go. Pure functions, shared by the screen, the PDF and the image export, so all three match.

export type Paper = 'A4' | 'Letter';
export type Sizing = 'auto' | 'fixed';

export const PAPERS: Record<Paper, {width: number; height: number}> = {
  A4: {width: 210, height: 297},
  Letter: {width: 215.9, height: 279.4},
};

/** The cut-line dots: black, this wide in millimetres. */
export const DOT_DIAMETER = 0.32;
export const DOT_COLOUR = '#000000';

export interface Settings {
  paper: Paper;
  /** Side of one cut square. */
  square: number;
  /** Auto: photos grow to fill one page and shrink as more are added. Fixed: the size below. */
  sizing: Sizing;
  /** A photo's size in squares when fixed; with auto, only their ratio counts (the photo shape). */
  slotWidth: number;
  slotHeight: number;
  /** The smallest space left around the grid. */
  margin: number;
  /** Wished distance between two dots; the real one divides a square evenly. */
  dotSpacing: number;
}

export const DEFAULT_SETTINGS: Settings = {
  paper: 'A4',
  square: 8,
  sizing: 'auto',
  slotWidth: 6,
  slotHeight: 8,
  margin: 8,
  dotSpacing: 4,
};

export const LIMITS = {
  square: {min: 3, max: 30},
  slot: {min: 1, max: 40},
  margin: {min: 3, max: 30},
  dotSpacing: {min: 0.5, max: 10},
} as const;

/** The smallest photo auto sizing goes down to, in squares across; past it, photos go on more pages. */
const AUTO_MIN_SQUARES = 2;

/** What part of a photo shows in its frame: zoom 1 fills the frame, focus 0 to 1 slides the photo inside it. */
export interface Crop {
  zoom: number;
  focusX: number;
  focusY: number;
}

export const DEFAULT_CROP: Crop = {zoom: 1, focusX: 0.5, focusY: 0.5};
export const MAX_ZOOM = 5;

export interface LayoutItem {
  id: string;
  /** How many photo slots the photo covers across and down. */
  spanX: number;
  spanY: number;
}

export interface Placement {
  id: string;
  page: number;
  column: number;
  row: number;
  spanX: number;
  spanY: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FreeSlot {
  page: number;
  column: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Sheet {
  width: number;
  height: number;
  /** Photo slots across and down one page. */
  columns: number;
  rows: number;
  /** The full grid of squares printed on each page: its corner, and its squares across and down. */
  gridX: number;
  gridY: number;
  across: number;
  down: number;
  /** One photo slot, in squares and in millimetres. */
  squaresX: number;
  squaresY: number;
  slotWidth: number;
  slotHeight: number;
  originX: number;
  originY: number;
  pageCount: number;
  placements: Placement[];
  freeSlots: FreeSlot[];
}

const EPSILON = 1e-6;

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Settings read back from storage or typed in, brought inside their limits. */
export const cleanSettings = (input: Partial<Settings>): Settings => {
  const merged = {...DEFAULT_SETTINGS, ...input};
  const number = (value: unknown, fallback: number, min: number, max: number) =>
    'number' === typeof value && Number.isFinite(value) ? clamp(value, min, max) : fallback;

  return {
    paper: merged.paper in PAPERS ? merged.paper : DEFAULT_SETTINGS.paper,
    square: number(merged.square, DEFAULT_SETTINGS.square, LIMITS.square.min, LIMITS.square.max),
    sizing: 'fixed' === merged.sizing ? 'fixed' : 'auto',
    slotWidth: Math.round(number(merged.slotWidth, DEFAULT_SETTINGS.slotWidth, LIMITS.slot.min, LIMITS.slot.max)),
    slotHeight: Math.round(number(merged.slotHeight, DEFAULT_SETTINGS.slotHeight, LIMITS.slot.min, LIMITS.slot.max)),
    margin: number(merged.margin, DEFAULT_SETTINGS.margin, LIMITS.margin.min, LIMITS.margin.max),
    dotSpacing: number(merged.dotSpacing, DEFAULT_SETTINGS.dotSpacing, LIMITS.dotSpacing.min, LIMITS.dotSpacing.max),
  };
};

/** Whole squares across and down the paper, inside the margin. */
const squaresOnPaper = (settings: Settings) => {
  const {width, height} = PAPERS[settings.paper];

  return {
    across: Math.floor((width - 2 * settings.margin) / settings.square + EPSILON),
    down: Math.floor((height - 2 * settings.margin) / settings.square + EPSILON),
  };
};

/**
 * Lays the photos out with slots of the given size, in order, on as many pages as they need: each one takes the first
 * free place where it fits, row by row, so a small photo can fill a gap a bigger one left.
 */
const packSheet = (settings: Settings, items: LayoutItem[], squaresX: number, squaresY: number): Sheet | null => {
  const {width, height} = PAPERS[settings.paper];
  const {across, down} = squaresOnPaper(settings);
  const columns = Math.floor(across / squaresX);
  const rows = Math.floor(down / squaresY);
  if (columns < 1 || rows < 1) return null;

  const slotWidth = squaresX * settings.square;
  const slotHeight = squaresY * settings.square;
  // The photos sit on the full grid, centred to the nearest square, so their edges are cut lines.
  const gridX = (width - across * settings.square) / 2;
  const gridY = (height - down * settings.square) / 2;
  const originX = gridX + Math.floor((across - columns * squaresX) / 2) * settings.square;
  const originY = gridY + Math.floor((down - rows * squaresY) / 2) * settings.square;
  const pages: boolean[][][] = [];
  const emptyPage = () => Array.from({length: rows}, () => Array<boolean>(columns).fill(false));
  const fits = (page: boolean[][], column: number, row: number, spanX: number, spanY: number) => {
    if (column + spanX > columns || row + spanY > rows) return false;
    for (let line = row; line < row + spanY; line++)
      for (let cell = column; cell < column + spanX; cell++) if (page[line][cell]) return false;

    return true;
  };

  const placements: Placement[] = [];
  for (const item of items) {
    const spanX = clamp(Math.round(item.spanX), 1, columns);
    const spanY = clamp(Math.round(item.spanY), 1, rows);
    for (let pageIndex = 0; ; pageIndex++) {
      pages[pageIndex] ??= emptyPage();
      const page = pages[pageIndex];
      let placed = false;
      for (let row = 0; row < rows && !placed; row++) {
        for (let column = 0; column < columns && !placed; column++) {
          if (!fits(page, column, row, spanX, spanY)) continue;
          for (let line = row; line < row + spanY; line++)
            for (let cell = column; cell < column + spanX; cell++) page[line][cell] = true;
          placements.push({
            id: item.id,
            page: pageIndex,
            column,
            row,
            spanX,
            spanY,
            x: originX + column * slotWidth,
            y: originY + row * slotHeight,
            width: spanX * slotWidth,
            height: spanY * slotHeight,
          });
          placed = true;
        }
      }
      if (placed) break;
    }
  }

  const pageCount = Math.max(1, pages.length);
  const freeSlots: FreeSlot[] = [];
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const page = pages[pageIndex] ?? emptyPage();
    for (let row = 0; row < rows; row++)
      for (let column = 0; column < columns; column++)
        if (!page[row][column])
          freeSlots.push({
            page: pageIndex,
            column,
            row,
            x: originX + column * slotWidth,
            y: originY + row * slotHeight,
            width: slotWidth,
            height: slotHeight,
          });
  }

  return {
    width,
    height,
    gridX,
    gridY,
    across,
    down,
    columns,
    rows,
    squaresX,
    squaresY,
    slotWidth,
    slotHeight,
    originX,
    originY,
    pageCount,
    placements,
    freeSlots,
  };
};

/**
 * Lays the photos out. Fixed: slots of the set size. Auto: the biggest slots of the photo shape, in whole squares,
 * that still fit every photo on one page; past the smallest size, the photos go on more pages. Null when not even one
 * photo slot fits the paper.
 */
export const computeSheet = (settings: Settings, items: LayoutItem[]): Sheet | null => {
  if ('fixed' === settings.sizing) return packSheet(settings, items, settings.slotWidth, settings.slotHeight);

  const {across, down} = squaresOnPaper(settings);
  const ratio = settings.slotHeight / settings.slotWidth;
  let smallest: Sheet | null = null;
  for (let squaresX = across; squaresX >= AUTO_MIN_SQUARES; squaresX--) {
    const squaresY = Math.max(1, Math.round(squaresX * ratio));
    if (squaresY > down) continue;
    const sheet = packSheet(settings, items, squaresX, squaresY);
    if (!sheet) continue;
    if (1 === sheet.pageCount) return sheet;
    smallest = sheet;
  }

  return smallest;
};

/**
 * How the photo sits in its frame, as fractions of the frame: its size, and its top-left corner (zero or less, as it
 * always covers the frame).
 */
export const coverBox = (photoAspect: number, frameAspect: number, crop: Crop) => {
  const wider = photoAspect > frameAspect;
  const width = (wider ? photoAspect / frameAspect : 1) * crop.zoom;
  const height = (wider ? 1 : frameAspect / photoAspect) * crop.zoom;

  return {width, height, left: (1 - width) * crop.focusX, top: (1 - height) * crop.focusY};
};

/** The part of the photo that shows, in the photo's own pixels. */
export const sourceRect = (photoWidth: number, photoHeight: number, frameAspect: number, crop: Crop) => {
  const box = coverBox(photoWidth / photoHeight, frameAspect, crop);

  return {
    x: (-box.left / box.width) * photoWidth,
    y: (-box.top / box.height) * photoHeight,
    width: photoWidth / box.width,
    height: photoHeight / box.height,
  };
};

/** The crop after dragging the photo by a part of its frame's width and height. */
export const panCrop = (crop: Crop, dragX: number, dragY: number, photoAspect: number, frameAspect: number): Crop => {
  const box = coverBox(photoAspect, frameAspect, crop);

  return {
    ...crop,
    focusX: box.width > 1 + EPSILON ? clamp(crop.focusX - dragX / (box.width - 1), 0, 1) : crop.focusX,
    focusY: box.height > 1 + EPSILON ? clamp(crop.focusY - dragY / (box.height - 1), 0, 1) : crop.focusY,
  };
};

/** The real distance between two dots: the wished one, rounded so each side of a square has whole steps. */
export const dotStep = (settings: Settings): number =>
  settings.square / Math.max(1, Math.round(settings.square / settings.dotSpacing));

/** Every dot of a page's cut lines, once each: the edges of every square of the full grid, photos or not. */
export const dotPositions = (sheet: Sheet, settings: Settings): [number, number][] => {
  const step = dotStep(settings);
  const perSquare = Math.round(settings.square / step);
  const dots: [number, number][] = [];
  for (let line = 0; line <= sheet.across; line++)
    for (let dot = 0; dot <= sheet.down * perSquare; dot++)
      dots.push([sheet.gridX + line * settings.square, sheet.gridY + dot * step]);
  for (let line = 0; line <= sheet.down; line++)
    for (let dot = 0; dot <= sheet.across * perSquare; dot++)
      // The crossings are already on the vertical lines.
      if (0 !== dot % perSquare) dots.push([sheet.gridX + dot * step, sheet.gridY + line * settings.square]);

  return dots;
};

/** Formats millimetres as centimetres, the way a ruler reads: "0.8", "4.8", "19.2". */
export const cm = (millimetres: number): string => (millimetres / 10).toFixed(2).replace(/\.?0+$/, '');
