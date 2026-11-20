import {describe, expect, test} from 'vitest';
import {
  DEFAULT_CROP,
  DEFAULT_SETTINGS,
  cleanSettings,
  cm,
  computeSheet,
  coverBox,
  dotPositions,
  dotStep,
  drawPlan,
  panCrop,
  type Settings,
} from './layout';

const items = (count: number) => Array.from({length: count}, (_, index) => ({id: `p${index}`, spanX: 1, spanY: 1}));
const FIXED: Settings = {...DEFAULT_SETTINGS, sizing: 'fixed'};

describe('fixed size', () => {
  test('fits 4 by 4 photos of 6 by 8 squares of 0.8 cm on A4, centred on the grid', () => {
    const sheet = computeSheet(FIXED, items(3))!;
    expect([sheet.columns, sheet.rows, sheet.slotWidth, sheet.slotHeight]).toEqual([4, 4, 48, 64]);
    expect([sheet.across, sheet.down, sheet.gridY]).toEqual([24, 35, 8.5]);
    // 35 squares fit down: the 32 the photos use start one square below the grid's top.
    expect(sheet.placements.map(placement => [placement.squareX, placement.squareY])).toEqual([
      [0, 1],
      [6, 1],
      [12, 1],
    ]);
    expect([sheet.placements[0].x, sheet.placements[0].y]).toEqual([9, 16.5]);
    expect(sheet.freeSlots).toHaveLength(13);
  });

  test('fills the gaps a big photo leaves, in reading order', () => {
    const list = items(13);
    list[5] = {...list[5], spanX: 2, spanY: 2};
    const sheet = computeSheet(FIXED, list)!;
    expect(sheet.pageCount).toBe(1);
    expect(sheet.freeSlots).toHaveLength(0);
    const big = sheet.placements.find(placement => 'p5' === placement.id)!;
    expect([big.squareX, big.squareY, big.width, big.height]).toEqual([6, 9, 96, 128]);
  });

  test('starts a new page when the first is full', () => {
    const sheet = computeSheet(FIXED, items(18))!;
    expect(sheet.pageCount).toBe(2);
    expect(sheet.placements.filter(placement => 1 === placement.page)).toHaveLength(2);
  });

  test('says when no photo fits the paper', () => {
    expect(computeSheet({...FIXED, square: 30, slotWidth: 10}, items(1))).toBeNull();
  });
});

describe('a photo with its own size', () => {
  test('takes exactly its squares, and the others flow around it', () => {
    const list = [{id: 'wide', spanX: 1, spanY: 1, size: {across: 10, down: 5}}, ...items(3)];
    const sheet = computeSheet(FIXED, list)!;
    const [wide, ...others] = sheet.placements;
    expect([wide.across, wide.down, wide.width, wide.height]).toEqual([10, 5, 80, 40]);
    // The next 6 by 8 photos start right of it on the same row of squares; the third fills the space under it.
    expect(others.map(placement => placement.squareX - wide.squareX)).toEqual([10, 16, 0]);
    expect(others[2].squareY - wide.squareY).toBe(5);
  });

  test('is kept inside the grid', () => {
    const sheet = computeSheet(FIXED, [{id: 'huge', spanX: 1, spanY: 1, size: {across: 99, down: 99}}])!;
    expect([sheet.placements[0].across, sheet.placements[0].down]).toEqual([24, 35]);
  });
});

describe('auto size', () => {
  const size = (count: number, big = false) => {
    const list = items(count);
    if (big) list[Math.min(5, count - 1)] = {...list[Math.min(5, count - 1)], spanX: 2, spanY: 2};
    const sheet = computeSheet(DEFAULT_SETTINGS, list)!;

    return [sheet.squaresX, sheet.squaresY, sheet.pageCount];
  };

  test('one photo fills the page', () => expect(size(1)).toEqual([24, 32, 1]));
  test('photos shrink as more are added, keeping 3:4', () => {
    expect(size(5)).toEqual([8, 11, 1]);
    expect(size(13, true)).toEqual([6, 8, 1]);
    expect(size(40)).toEqual([4, 5, 1]);
  });
  test('past the smallest size, photos go on more pages', () => expect(size(400)[2]).toBeGreaterThan(1));
  test('a square shape gives square photos', () => {
    const sheet = computeSheet({...DEFAULT_SETTINGS, slotWidth: 6, slotHeight: 6}, items(4))!;
    expect([sheet.squaresX, sheet.squaresY]).toEqual([12, 12]);
  });
});

describe('crop', () => {
  test('a wide photo fills a tall frame by its height, centred', () => {
    const box = coverBox(4 / 3, 3 / 4, DEFAULT_CROP);
    expect(box.height).toBeCloseTo(1);
    expect(box.width).toBeCloseTo(16 / 9);
    expect(box.left).toBeCloseTo((1 - 16 / 9) / 2);
    expect(box.top).toBeCloseTo(0);
  });

  test('zoomed in, the shown part keeps the frame shape, stays inside the photo and fills the frame', () => {
    const plan = drawPlan(2000, 1500, 3 / 4, {zoom: 2, focusX: 1, focusY: 0});
    expect(plan.source.width / plan.source.height).toBeCloseTo(3 / 4);
    expect(plan.source.x + plan.source.width).toBeCloseTo(2000);
    expect(plan.source.y).toBeCloseTo(0);
    expect(plan.target).toEqual({x: 0, y: 0, width: 1, height: 1});
  });

  test('zoomed out, the whole photo shows, smaller than the frame, centred', () => {
    const plan = drawPlan(1500, 2000, 3 / 4, {zoom: 0.5, focusX: 0.5, focusY: 0.5});
    expect(plan.source).toEqual({x: 0, y: 0, width: 1500, height: 2000});
    expect(plan.target.width).toBeCloseTo(0.5);
    expect(plan.target.x).toBeCloseTo(0.25);
  });

  test('dragging moves the photo with the finger, and stops at the edge', () => {
    expect(panCrop(DEFAULT_CROP, 0.1, 0, 4 / 3, 3 / 4).focusX).toBeLessThan(0.5);
    expect(panCrop(DEFAULT_CROP, 5, 0, 4 / 3, 3 / 4).focusX).toBe(0);
    expect(panCrop(DEFAULT_CROP, 0, 0.3, 4 / 3, 3 / 4).focusY).toBe(0.5);
    // Zoomed out, dragging right moves the smaller photo right inside its frame.
    expect(panCrop({zoom: 0.5, focusX: 0.5, focusY: 0.5}, 0.1, 0, 3 / 4, 3 / 4).focusX).toBeGreaterThan(0.5);
  });
});

describe('dots', () => {
  test('a dot at each corner only by default, the usual blotter square too', () => {
    expect(dotStep(DEFAULT_SETTINGS)).toBe(8);
    expect(dotStep({...DEFAULT_SETTINGS, square: 6.35})).toBe(6.35);
  });

  test('the whole grid, empty places too, each dot once', () => {
    const settings = {...FIXED, dotSpacing: 2};
    const sheet = computeSheet(settings, items(1))!;
    const dots = dotPositions(sheet, settings);
    // 25 vertical lines of 141 dots, 36 horizontal lines of 97, minus the 25 × 36 dots where they cross.
    expect(dots).toHaveLength(25 * 141 + 36 * 97 - 25 * 36);
    expect(new Set(dots.map(dot => dot.join())).size).toBe(dots.length);
    expect(dots).toContainEqual([sheet.gridX + 24 * 8, sheet.gridY + 35 * 8]);
    expect(dots).toContainEqual([sheet.placements[0].x + 48, sheet.placements[0].y + 64]);
  });

  test('a spacing that does not divide the square is rounded to one that does', () => {
    expect(dotStep({...DEFAULT_SETTINGS, dotSpacing: 3})).toBeCloseTo(8 / 3);
  });
});

test('settings outside their limits are brought back inside', () => {
  const cleaned = cleanSettings({square: 100, slotWidth: 2.6, paper: 'B5' as never, sizing: 'huge' as never});
  expect(cleaned.square).toBe(30);
  expect(cleaned.slotWidth).toBe(3);
  expect(cleaned.paper).toBe('A4');
  expect(cleaned.sizing).toBe('auto');
});

test('centimetres read like a ruler', () => {
  expect(cm(8)).toBe('0.8');
  expect(cm(48)).toBe('4.8');
  expect(cm(192)).toBe('19.2');
  expect(cm(210)).toBe('21');
});
