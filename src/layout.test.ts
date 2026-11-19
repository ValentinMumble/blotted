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
  panCrop,
  sourceRect,
  type Settings,
} from './layout';

const items = (count: number) => Array.from({length: count}, (_, index) => ({id: `p${index}`, spanX: 1, spanY: 1}));
const FIXED: Settings = {...DEFAULT_SETTINGS, sizing: 'fixed'};

describe('fixed size', () => {
  test('fits 4 by 4 photos of 6 by 8 squares of 0.8 cm on A4, centred', () => {
    const sheet = computeSheet(FIXED, items(3))!;
    expect([sheet.columns, sheet.rows, sheet.slotWidth, sheet.slotHeight]).toEqual([4, 4, 48, 64]);
    expect(sheet.originX).toBeCloseTo(9);
    // 35 squares fit down: the 32 the photos use start one square below the full grid's top.
    expect(sheet.originY).toBeCloseTo(16.5);
    expect([sheet.across, sheet.down, sheet.gridY]).toEqual([24, 35, 8.5]);
    expect(sheet.placements.map(placement => [placement.column, placement.row])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    expect(sheet.freeSlots).toHaveLength(13);
  });

  test('fills the gaps a big photo leaves, in reading order', () => {
    const list = items(13);
    list[5] = {...list[5], spanX: 2, spanY: 2};
    const sheet = computeSheet(FIXED, list)!;
    expect(sheet.pageCount).toBe(1);
    expect(sheet.freeSlots).toHaveLength(0);
    const big = sheet.placements.find(placement => 'p5' === placement.id)!;
    expect([big.column, big.row, big.width, big.height]).toEqual([1, 1, 96, 128]);
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

  test('the shown part keeps the frame shape and stays inside the photo', () => {
    const rect = sourceRect(2000, 1500, 3 / 4, {zoom: 2, focusX: 1, focusY: 0});
    expect(rect.width / rect.height).toBeCloseTo(3 / 4);
    expect(rect.x + rect.width).toBeCloseTo(2000);
    expect(rect.y).toBeCloseTo(0);
  });

  test('dragging right shows more of the left side, and stops at the edge', () => {
    expect(panCrop(DEFAULT_CROP, 0.1, 0, 4 / 3, 3 / 4).focusX).toBeLessThan(0.5);
    expect(panCrop(DEFAULT_CROP, 5, 0, 4 / 3, 3 / 4).focusX).toBe(0);
    expect(panCrop(DEFAULT_CROP, 0, 0.3, 4 / 3, 3 / 4).focusY).toBe(0.5);
  });
});

describe('dots', () => {
  test('4 mm apart by default: both corners and the middle of each square side', () => {
    expect(dotStep(DEFAULT_SETTINGS)).toBe(4);
  });

  test('the whole grid, empty places too, each dot once', () => {
    const settings = {...FIXED, dotSpacing: 2};
    const sheet = computeSheet(settings, items(1))!;
    const dots = dotPositions(sheet, settings);
    // 25 vertical lines of 141 dots, 36 horizontal lines of 97, minus the 25 × 36 dots where they cross.
    expect(dots).toHaveLength(25 * 141 + 36 * 97 - 25 * 36);
    expect(new Set(dots.map(dot => dot.join())).size).toBe(dots.length);
    expect(dots).toContainEqual([sheet.gridX + 24 * 8, sheet.gridY + 35 * 8]);
    expect(dots).toContainEqual([sheet.originX + 48, sheet.originY + 64]);
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
