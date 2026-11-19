import {useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent} from 'react';
import {drawDots} from './exporters';
import {
  MAX_ZOOM,
  clamp,
  coverBox,
  dotPositions,
  panCrop,
  type Crop,
  type FreeSlot,
  type Placement,
  type Settings,
  type Sheet,
} from './layout';
import type {Photo} from './photos';

interface SheetViewProps {
  sheet: Sheet;
  page: number;
  photos: Map<string, Photo>;
  settings: Settings;
  actualSize: boolean;
  selectedId: string | null;
  dropTargetId: string | null;
  onSelect: (id: string) => void;
  onCrop: (id: string, crop: Crop) => void;
  onStartSwap: (id: string, event: PointerEvent) => void;
  onAddPhotos: () => void;
  onReplaceWithFile: (id: string, file: File) => void;
}

/** Where a rectangle in millimetres sits on the page, as percentages, so the page can be any size on screen. */
const placeOnPage = (sheet: Sheet, rect: {x: number; y: number; width: number; height: number}): CSSProperties => ({
  left: `${(rect.x / sheet.width) * 100}%`,
  top: `${(rect.y / sheet.height) * 100}%`,
  width: `${(rect.width / sheet.width) * 100}%`,
  height: `${(rect.height / sheet.height) * 100}%`,
});

export function SheetView(props: SheetViewProps) {
  const {sheet, page, photos, settings, actualSize} = props;
  const placements = sheet.placements.filter(placement => page === placement.page);
  const freeSlots = sheet.freeSlots.filter(slot => page === slot.page);

  return (
    <div className="sheet-frame" style={{width: actualSize ? `${sheet.width}mm` : undefined}}>
      <div className="halo" aria-hidden="true" />
      <div className="sheet" style={{aspectRatio: `${sheet.width} / ${sheet.height}`}}>
        {freeSlots.map(slot => (
          <FreeSlotButton key={`${slot.column}-${slot.row}`} sheet={sheet} slot={slot} onAdd={props.onAddPhotos} />
        ))}
        {placements.map(placement => {
          const photo = photos.get(placement.id);

          return photo ? (
            <Tile
              key={placement.id}
              sheet={sheet}
              placement={placement}
              photo={photo}
              selected={props.selectedId === photo.id}
              dropTarget={props.dropTargetId === photo.id}
              onSelect={props.onSelect}
              onCrop={props.onCrop}
              onStartSwap={props.onStartSwap}
              onReplaceWithFile={props.onReplaceWithFile}
            />
          ) : null;
        })}
        <DotsLayer sheet={sheet} settings={settings} />
      </div>
    </div>
  );
}

function FreeSlotButton({sheet, slot, onAdd}: {sheet: Sheet; slot: FreeSlot; onAdd: () => void}) {
  return (
    <button type="button" className="free-slot" data-free-slot="" style={placeOnPage(sheet, slot)} onClick={onAdd}>
      <span aria-hidden="true">+</span>
      <span className="visually-hidden">Add photos</span>
    </button>
  );
}

interface TileProps {
  sheet: Sheet;
  placement: Placement;
  photo: Photo;
  selected: boolean;
  dropTarget: boolean;
  onSelect: (id: string) => void;
  onCrop: (id: string, crop: Crop) => void;
  onStartSwap: (id: string, event: PointerEvent) => void;
  onReplaceWithFile: (id: string, file: File) => void;
}

const KEY_STEP = 0.04;

function Tile({
  sheet,
  placement,
  photo,
  selected,
  dropTarget,
  onSelect,
  onCrop,
  onStartSwap,
  onReplaceWithFile,
}: TileProps) {
  const element = useRef<HTMLDivElement>(null);
  const drag = useRef<{x: number; y: number; crop: Crop; width: number; height: number; moved: boolean} | null>(null);
  const frameAspect = placement.width / placement.height;
  const photoAspect = photo.width / photo.height;
  const box = coverBox(photoAspect, frameAspect, photo.crop);
  // Read by the wheel listener, which is added once.
  const latest = useRef({photo, onCrop});
  latest.current = {photo, onCrop};

  // Pinch on a trackpad (or Ctrl and the wheel) zooms the photo. A plain wheel still scrolls the page.
  useEffect(() => {
    const tile = element.current!;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const {photo: current, onCrop: crop} = latest.current;
      const zoom = clamp(current.crop.zoom * Math.exp(-event.deltaY * 0.01), 1, MAX_ZOOM);
      crop(current.id, {...current.crop, zoom});
    };
    tile.addEventListener('wheel', onWheel, {passive: false});

    return () => tile.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('.grip')) return;
    onSelect(photo.id);
    // On a touch screen the first tap only chooses the photo, so the page still scrolls under a finger.
    if ('mouse' !== event.pointerType && !selected) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      crop: photo.crop,
      width: rect.width,
      height: rect.height,
      moved: false,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    const dragX = event.clientX - start.x;
    const dragY = event.clientY - start.y;
    if (!start.moved && Math.hypot(dragX, dragY) < 3) return;
    start.moved = true;
    onCrop(photo.id, panCrop(start.crop, dragX / start.width, dragY / start.height, photoAspect, frameAspect));
  };

  const endDrag = () => (drag.current = null);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [KEY_STEP, 0],
      ArrowRight: [-KEY_STEP, 0],
      ArrowUp: [0, KEY_STEP],
      ArrowDown: [0, -KEY_STEP],
    };
    if (event.key in moves) {
      event.preventDefault();
      const [moveX, moveY] = moves[event.key];
      onCrop(photo.id, panCrop(photo.crop, moveX, moveY, photoAspect, frameAspect));
    } else if ('+' === event.key || '=' === event.key || '-' === event.key) {
      event.preventDefault();
      const zoom = clamp(photo.crop.zoom * ('-' === event.key ? 1 / 1.1 : 1.1), 1, MAX_ZOOM);
      onCrop(photo.id, {...photo.crop, zoom});
    }
  };

  return (
    <div
      ref={element}
      className={['tile', selected && 'selected', dropTarget && 'drop-target'].filter(Boolean).join(' ')}
      data-photo-id={photo.id}
      style={{...placeOnPage(sheet, placement), touchAction: selected ? 'none' : 'pan-x pan-y'}}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      aria-label={`${photo.name}. Drag to move it in its frame, arrow keys too.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onFocus={() => onSelect(photo.id)}
      onKeyDown={onKeyDown}
      onDragOver={event => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onDrop={event => {
        const file = event.dataTransfer.files[0];
        if (!file) return;
        event.preventDefault();
        event.stopPropagation();
        onReplaceWithFile(photo.id, file);
      }}
    >
      <img
        src={photo.url}
        alt=""
        draggable={false}
        style={{
          width: `${box.width * 100}%`,
          height: `${box.height * 100}%`,
          left: `${box.left * 100}%`,
          top: `${box.top * 100}%`,
        }}
      />
      <span
        className="grip"
        role="button"
        aria-label="Drag onto another photo to swap them"
        title="Drag onto another photo to swap them"
        onPointerDown={event => onStartSwap(photo.id, event)}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M6 3v14M6 3 3 6M6 3l3 3M14 17V3M14 17l-3-3M14 17l3-3" />
        </svg>
      </span>
    </div>
  );
}

/** The cut-line dots, drawn the same way as in the exports, at the screen's own sharpness. */
function DotsLayer({sheet, settings}: {sheet: Sheet; settings: Settings}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify([sheet.width, sheet.height, sheet.gridX, sheet.gridY, sheet.across, sheet.down, settings]);
  const latest = useRef({settings, sheet});
  latest.current = {settings, sheet};

  useEffect(() => {
    const layer = canvas.current!;
    const draw = () => {
      const {settings: current, sheet: paper} = latest.current;
      const ratio = window.devicePixelRatio || 1;
      layer.width = Math.round(layer.clientWidth * ratio);
      layer.height = Math.round(layer.clientHeight * ratio);
      const context = layer.getContext('2d')!;
      context.clearRect(0, 0, layer.width, layer.height);
      drawDots(context, dotPositions(paper, current), layer.width / paper.width);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(layer);

    return () => observer.disconnect();
  }, [key]);

  return <canvas ref={canvas} className="dots" aria-hidden="true" />;
}
