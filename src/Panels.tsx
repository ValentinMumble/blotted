import {useEffect, useId, useState, type ReactNode} from 'react';
import {
  DEFAULT_CROP,
  DEFAULT_SETTINGS,
  LIMITS,
  MAX_ZOOM,
  cm,
  dotStep,
  type Paper,
  type Settings,
  type Sheet,
  type Sizing,
} from './layout';
import {REPLACE_PHOTO_INPUT, SPANS, openPickerOnKey, type Photo} from './photos';

/** The usual blotter tab: a quarter inch, 30 by 30 on a 7.5 inch sheet. */
const BLOTTER_SQUARE_MM = 6.35;

interface Option<Value> {
  value: Value;
  label: string;
}

function Segmented<Value extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option<Value>[];
  value: Value | null;
  onChange: (value: Value) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A number field that lets you type freely and only passes on numbers inside its limits. */
function NumberField({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
  children,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  children?: ReactNode;
}) {
  const id = useId();
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  return (
    <div className="number-field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <span className="number-input">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={text}
          onChange={event => {
            setText(event.target.value);
            const number = Number(event.target.value.replace(',', '.'));
            if ('' !== event.target.value && Number.isFinite(number) && number >= min && number <= max)
              onChange(number);
          }}
          onBlur={() => setText(String(value))}
        />
        <span className="unit">{unit}</span>
      </span>
      {children}
    </div>
  );
}

interface InspectorProps {
  photo: Photo;
  sheet: Sheet;
  index: number;
  count: number;
  onChange: (changes: Partial<Photo>) => void;
  onReplace: () => void;
  onMove: (offset: number) => void;
  onRemove: () => void;
  onClose: () => void;
}

export function Inspector({
  photo,
  sheet,
  index,
  count,
  onChange,
  onReplace,
  onMove,
  onRemove,
  onClose,
}: InspectorProps) {
  const spanValue = SPANS.findIndex(span => span.spanX === photo.spanX && span.spanY === photo.spanY);
  const width = Math.min(photo.spanX, sheet.columns) * sheet.slotWidth;
  const height = Math.min(photo.spanY, sheet.rows) * sheet.slotHeight;
  const zoomId = useId();

  return (
    <section className="panel inspector" aria-label="Selected photo">
      <header className="panel-head">
        <div>
          <h2>Photo {index + 1}</h2>
          <p className="photo-name" title={photo.name}>
            {photo.name}
          </p>
        </div>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5 5l10 10M15 5 5 15" />
          </svg>
        </button>
      </header>

      <div className="field">
        <span className="field-label">Size</span>
        <Segmented
          label="Photo size"
          options={SPANS.map((span, spanIndex) => ({value: spanIndex, label: span.label}))}
          value={spanValue}
          onChange={spanIndex => onChange({spanX: SPANS[spanIndex].spanX, spanY: SPANS[spanIndex].spanY})}
        />
        <p className="hint">
          {cm(width)} × {cm(height)} cm
        </p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor={zoomId}>
          Zoom
        </label>
        <input
          id={zoomId}
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={photo.crop.zoom}
          onChange={event => onChange({crop: {...photo.crop, zoom: Number(event.target.value)}})}
        />
        <p className="hint">Drag the photo to choose what shows. Pinch to zoom.</p>
      </div>

      <div className="button-row">
        <label
          className="button"
          htmlFor={REPLACE_PHOTO_INPUT}
          role="button"
          tabIndex={0}
          onClick={onReplace}
          onKeyDown={event => {
            onReplace();
            openPickerOnKey(REPLACE_PHOTO_INPUT)(event);
          }}
        >
          Replace photo
        </label>
        <button type="button" className="button" onClick={() => onChange({crop: DEFAULT_CROP})}>
          Reset crop
        </button>
      </div>
      <div className="button-row">
        <button type="button" className="button" disabled={0 === index} onClick={() => onMove(-1)}>
          Move earlier
        </button>
        <button type="button" className="button" disabled={index === count - 1} onClick={() => onMove(1)}>
          Move later
        </button>
        <button type="button" className="button danger" onClick={onRemove}>
          Remove
        </button>
      </div>
    </section>
  );
}

const SHAPES: {label: string; slotWidth: number; slotHeight: number}[] = [
  {label: '3:4', slotWidth: 6, slotHeight: 8},
  {label: '1:1', slotWidth: 6, slotHeight: 6},
  {label: '4:3', slotWidth: 8, slotHeight: 6},
];

interface SettingsPanelProps {
  settings: Settings;
  sheet: Sheet | null;
  photoCount: number;
  onChange: (changes: Partial<Settings>) => void;
  onClearPhotos: () => void;
}

export function SettingsPanel({settings, sheet, photoCount, onChange, onClearPhotos}: SettingsPanelProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    if (!confirmClear) return;
    const timer = setTimeout(() => setConfirmClear(false), 4000);

    return () => clearTimeout(timer);
  }, [confirmClear]);
  const shapeIndex = SHAPES.findIndex(
    shape => shape.slotWidth * settings.slotHeight === shape.slotHeight * settings.slotWidth,
  );
  const step = dotStep(settings);
  const isBlotter = Math.abs(settings.square - BLOTTER_SQUARE_MM) < 0.01;

  return (
    <section className="panel" aria-label="Sheet settings">
      <header className="panel-head">
        <h2>Sheet</h2>
      </header>

      <div className="field">
        <span className="field-label">Paper</span>
        <Segmented<Paper>
          label="Paper"
          options={[
            {value: 'A4', label: 'A4'},
            {value: 'Letter', label: 'Letter'},
          ]}
          value={settings.paper}
          onChange={paper => onChange({paper})}
        />
      </div>

      <div className="field-grid">
        <NumberField
          label="Square"
          unit="mm"
          value={settings.square}
          min={LIMITS.square.min}
          max={LIMITS.square.max}
          step={0.05}
          onChange={square => onChange({square})}
        >
          <p className="hint">
            Usual blotter: ¼ in (6.35 mm).{' '}
            {isBlotter ? null : (
              <button type="button" className="link-button" onClick={() => onChange({square: BLOTTER_SQUARE_MM})}>
                Use it
              </button>
            )}
          </p>
        </NumberField>
        <NumberField
          label="Blank edge"
          unit="mm"
          value={settings.margin}
          min={LIMITS.margin.min}
          max={LIMITS.margin.max}
          step={1}
          onChange={margin => onChange({margin})}
        >
          <p className="hint">White border around the grid. Printers can't print the last 3 to 5 mm.</p>
        </NumberField>
      </div>

      <div className="field">
        <span className="field-label">Photo shape</span>
        <Segmented
          label="Photo shape"
          options={SHAPES.map((shape, index) => ({value: index, label: shape.label}))}
          value={-1 === shapeIndex ? null : shapeIndex}
          onChange={index => onChange({slotWidth: SHAPES[index].slotWidth, slotHeight: SHAPES[index].slotHeight})}
        />
      </div>

      <div className="field">
        <span className="field-label">Photo size</span>
        <Segmented<Sizing>
          label="Photo size"
          options={[
            {value: 'auto', label: 'Fit the page'},
            {value: 'fixed', label: 'Fixed'},
          ]}
          value={settings.sizing}
          onChange={sizing =>
            onChange(
              'fixed' === sizing && sheet ? {sizing, slotWidth: sheet.squaresX, slotHeight: sheet.squaresY} : {sizing},
            )
          }
        />
      </div>
      {'fixed' === settings.sizing ? (
        <div className="field-grid">
          <NumberField
            label="Across"
            unit="squares"
            value={settings.slotWidth}
            min={LIMITS.slot.min}
            max={LIMITS.slot.max}
            step={1}
            onChange={slotWidth => onChange({slotWidth: Math.round(slotWidth)})}
          />
          <NumberField
            label="Down"
            unit="squares"
            value={settings.slotHeight}
            min={LIMITS.slot.min}
            max={LIMITS.slot.max}
            step={1}
            onChange={slotHeight => onChange({slotHeight: Math.round(slotHeight)})}
          />
        </div>
      ) : null}
      {sheet ? (
        <p className="hint">
          {'auto' === settings.sizing ? 'Photos grow to fill the page and shrink as you add more. ' : ''}
          Each photo is {cm(sheet.slotWidth)} × {cm(sheet.slotHeight)} cm ({sheet.squaresX} × {sheet.squaresY} squares),{' '}
          {sheet.columns} × {sheet.rows} per page.
        </p>
      ) : null}

      <header className="panel-head sub">
        <h3>Dots</h3>
      </header>
      <div className="field-grid">
        <NumberField
          label="Spacing"
          unit="mm"
          value={settings.dotSpacing}
          min={LIMITS.dotSpacing.min}
          max={LIMITS.dotSpacing.max}
          step={0.5}
          onChange={dotSpacing => onChange({dotSpacing})}
        >
          <p className="hint">
            {1 === Math.round(settings.square / step)
              ? 'A dot at each corner of the squares only.'
              : `A dot every ${step.toFixed(2).replace(/\.?0+$/, '')} mm, ${Math.round(settings.square / step) - 1} between corners.`}
          </p>
        </NumberField>
      </div>
      <div className="button-row end">
        <button type="button" className="button quiet" onClick={() => onChange(DEFAULT_SETTINGS)}>
          Reset sheet
        </button>
        {photoCount > 0 ? (
          <button
            type="button"
            className="button danger"
            onClick={() => {
              if (!confirmClear) return setConfirmClear(true);
              setConfirmClear(false);
              onClearPhotos();
            }}
          >
            {confirmClear ? `Remove all ${photoCount}?` : 'Remove all photos'}
          </button>
        ) : null}
      </div>
    </section>
  );
}
