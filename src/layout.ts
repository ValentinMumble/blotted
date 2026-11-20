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
  dotSpacing: 8,
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
/** Below 1 the whole photo shows, smaller than its frame, with white around it. */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 5;

/** A size in whole squares. */
export interface SquareSize {
  across: number;
  down: number;
}

export interface LayoutItem {
  id: string;
  /** How many of the sheet's photo sizes the photo covers across and down (Normal, Wide, Tall, Big). */
  spanX: number;
  spanY: number;
  /** A size of its own in squares, which wins over the spans. */
  size?: SquareSize | null;
}

export interface Placement {
  id: string;
  page: number;
  /** Where it sits on the page's grid, and its size, in squares. */
  squareX: number;
  squareY: number;
  across: number;
  down: number;
  /** The same, in millimetres on the paper. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** An empty place the size of one photo, shown as a + to add more. */
export interface FreeSlot {
  page: number;
  squareX: number;
  squareY: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Sheet {
  width: number;
  height: number;
  /** The full grid of squares printed on each page: its corner, and its squares across and down. */
  gridX: number;
  gridY: number;
  across: number;
  down: number;
  /** The sheet's photo size, in squares and in millimetres, and how many of them fit across and down a page. */
  squaresX: number;
  squaresY: number;
  slotWidth: number;
  slotHeight: number;
  columns: number;
  rows: number;
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
 * Lays the photos out on the grid of squares, in order, on as many pages as they need: each one takes the first free
 * place where it fits, square by square and row by row, so a smaller photo fills a gap a bigger one left. A photo is
 * the sheet's photo size times its spans, or its own size. The free places left get a + each, and the whole is
 * centred on the page to the nearest square, so every photo edge is a cut line.
 */
const packSheet = (settings: Settings, items: LayoutItem[], squaresX: number, squaresY: number): Sheet | null => {
  const {width, height} = PAPERS[settings.paper];
  const {across, down} = squaresOnPaper(settings);
  if (squaresX < 1 || squaresY < 1 || squaresX > across || squaresY > down) return null;
  const columns = Math.floor(across / squaresX);
  const rows = Math.floor(down / squaresY);

  const pages: Uint8Array[] = [];
  const fits = (page: Uint8Array, left: number, top: number, wide: number, tall: number) => {
    for (let row = top; row < top + tall; row++)
      for (let column = left; column < left + wide; column++) if (page[row * across + column]) return false;

    return true;
  };
  const take = (page: Uint8Array, left: number, top: number, wide: number, tall: number) => {
    for (let row = top; row < top + tall; row++) page.fill(1, row * across + left, row * across + left + wide);
  };
  const firstFit = (page: Uint8Array, wide: number, tall: number) => {
    for (let top = 0; top + tall <= down; top++)
      for (let left = 0; left + wide <= across; left++) if (fits(page, left, top, wide, tall)) return {left, top};

    return null;
  };

  type Spot = {page: number; squareX: number; squareY: number; across: number; down: number};
  const placed: (Spot & {id: string})[] = [];
  for (const item of items) {
    const wide = item.size
      ? clamp(Math.round(item.size.across), 1, across)
      : clamp(Math.round(item.spanX), 1, columns) * squaresX;
    const tall = item.size
      ? clamp(Math.round(item.size.down), 1, down)
      : clamp(Math.round(item.spanY), 1, rows) * squaresY;
    for (let page = 0; ; page++) {
      pages[page] ??= new Uint8Array(across * down);
      const spot = firstFit(pages[page], wide, tall);
      if (!spot) continue;
      take(pages[page], spot.left, spot.top, wide, tall);
      placed.push({id: item.id, page, squareX: spot.left, squareY: spot.top, across: wide, down: tall});
      break;
    }
  }

  const pageCount = Math.max(1, pages.length);
  const free: Spot[] = [];
  for (let page = 0; page < pageCount; page++) {
    pages[page] ??= new Uint8Array(across * down);
    for (let spot = firstFit(pages[page], squaresX, squaresY); spot; spot = firstFit(pages[page], squaresX, squaresY)) {
      take(pages[page], spot.left, spot.top, squaresX, squaresY);
      free.push({page, squareX: spot.left, squareY: spot.top, across: squaresX, down: squaresY});
    }
  }

  const spots = [...placed, ...free];
  const minX = Math.min(...spots.map(spot => spot.squareX));
  const minY = Math.min(...spots.map(spot => spot.squareY));
  const usedAcross = Math.max(...spots.map(spot => spot.squareX + spot.across)) - minX;
  const usedDown = Math.max(...spots.map(spot => spot.squareY + spot.down)) - minY;
  const shiftX = Math.floor((across - usedAcross) / 2) - minX;
  const shiftY = Math.floor((down - usedDown) / 2) - minY;
  const gridX = (width - across * settings.square) / 2;
  const gridY = (height - down * settings.square) / 2;
  const onPaper = (spot: Spot) => ({
    page: spot.page,
    squareX: spot.squareX + shiftX,
    squareY: spot.squareY + shiftY,
    x: gridX + (spot.squareX + shiftX) * settings.square,
    y: gridY + (spot.squareY + shiftY) * settings.square,
    width: spot.across * settings.square,
    height: spot.down * settings.square,
  });

  return {
    width,
    height,
    gridX,
    gridY,
    across,
    down,
    squaresX,
    squaresY,
    slotWidth: squaresX * settings.square,
    slotHeight: squaresY * settings.square,
    columns,
    rows,
    pageCount,
    placements: placed.map(spot => ({id: spot.id, across: spot.across, down: spot.down, ...onPaper(spot)})),
    freeSlots: free.map(onPaper),
  };
};

/**
 * Lays the photos out. Fixed: the set photo size. Auto: the biggest photo size of the photo shape, in whole squares,
 * that still fits every photo on one page; past the smallest size, the photos go on more pages. Photos with a size
 * of their own keep it either way. Null when not even one photo fits the paper.
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
 * How the photo sits in its frame, as fractions of the frame: its size, and its top-left corner. At zoom 1 or more it
 * covers the frame; below 1 it is smaller than the frame, and the focus places it inside.
 */
export const coverBox = (photoAspect: number, frameAspect: number, crop: Crop) => {
  const wider = photoAspect > frameAspect;
  const width = (wider ? photoAspect / frameAspect : 1) * crop.zoom;
  const height = (wider ? 1 : frameAspect / photoAspect) * crop.zoom;

  return {width, height, left: (1 - width) * crop.focusX, top: (1 - height) * crop.focusY};
};

/**
 * What to draw: the part of the photo that shows, in its own pixels, and where it goes in the frame, as fractions of
 * the frame. Whether the photo is bigger than its frame (cropped) or smaller (white around it).
 */
export const drawPlan = (photoWidth: number, photoHeight: number, frameAspect: number, crop: Crop) => {
  const box = coverBox(photoWidth / photoHeight, frameAspect, crop);
  const left = Math.max(0, box.left);
  const top = Math.max(0, box.top);
  const right = Math.min(1, box.left + box.width);
  const bottom = Math.min(1, box.top + box.height);

  return {
    source: {
      x: ((left - box.left) / box.width) * photoWidth,
      y: ((top - box.top) / box.height) * photoHeight,
      width: ((right - left) / box.width) * photoWidth,
      height: ((bottom - top) / box.height) * photoHeight,
    },
    target: {x: left, y: top, width: right - left, height: bottom - top},
  };
};

/** The crop after dragging the photo by a part of its frame's width and height. */
export const panCrop = (crop: Crop, dragX: number, dragY: number, photoAspect: number, frameAspect: number): Crop => {
  const box = coverBox(photoAspect, frameAspect, crop);

  return {
    ...crop,
    focusX: Math.abs(box.width - 1) > EPSILON ? clamp(crop.focusX - dragX / (box.width - 1), 0, 1) : crop.focusX,
    focusY: Math.abs(box.height - 1) > EPSILON ? clamp(crop.focusY - dragY / (box.height - 1), 0, 1) : crop.focusY,
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
