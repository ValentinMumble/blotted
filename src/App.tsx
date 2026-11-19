import {useCallback, useEffect, useMemo, useRef, useState, type PointerEvent} from 'react';
import {Backdrop} from './Backdrop';
import {downloadAlbumPhoto, type AlbumPhoto} from './album';
import {AlbumDialog} from './AlbumDialog';
import {download, exportPageImage, exportPdf, type ExportPhoto} from './exporters';
import {DEFAULT_CROP, cleanSettings, cm, computeSheet, type Crop, type Settings} from './layout';
import {Inspector, SettingsPanel} from './Panels';
import {ADD_PHOTOS_INPUT, REPLACE_PHOTO_INPUT, newId, openPickerOnKey, openPhoto, type Photo} from './photos';
import {SheetView} from './SheetView';
import {deleteBlob, loadPhotos, loadSettings, saveBlob, savePhotoList, saveSettings} from './storage';

interface SwapDrag {
  id: string;
  x: number;
  y: number;
  overId: string | null;
}

const SAVE_DELAY_MS = 400;

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actualSize, setActualSize] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** Photos being opened and kept: how many are done out of how many were picked. */
  const [adding, setAdding] = useState<{done: number; total: number} | null>(null);
  const [swap, setSwap] = useState<SwapDrag | null>(null);
  const [fileOver, setFileOver] = useState(false);
  const [albumOpen, setAlbumOpen] = useState(false);
  const replaceTarget = useRef<string | null>(null);

  const sheet = useMemo(
    () =>
      computeSheet(
        settings,
        photos.map(photo => ({id: photo.id, spanX: photo.spanX, spanY: photo.spanY})),
      ),
    [settings, photos],
  );
  const photosById = useMemo(() => new Map(photos.map(photo => [photo.id, photo])), [photos]);
  const selectedIndex = photos.findIndex(photo => photo.id === selectedId);
  const selected = -1 === selectedIndex ? null : photos[selectedIndex];

  const say = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4200);

    return () => clearTimeout(timer);
  }, [toast]);

  // The photos kept from last time come back first.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const kept = await loadPhotos();
      const opened: Photo[] = [];
      for (const stored of kept) {
        try {
          opened.push({...stored, ...(await openPhoto(stored.blob))});
        } catch {
          // A file this browser can no longer read is left out.
        }
      }
      if (cancelled) return;
      setPhotos(opened);
      setLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => saveSettings(settings), [settings]);

  // Saving waits for a drag or a run of changes to settle.
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(
      () => savePhotoList(photos.map(({id, name, spanX, spanY, crop}) => ({id, name, spanX, spanY, crop}))),
      SAVE_DELAY_MS,
    );

    return () => clearTimeout(timer);
  }, [photos, loaded]);

  // Counts photos in and out of the loader, so two batches added at once add up.
  const startAdding = useCallback(
    (count: number) => setAdding(current => ({done: current?.done ?? 0, total: (current?.total ?? 0) + count})),
    [],
  );
  const finishOne = useCallback(
    () =>
      setAdding(current => {
        if (!current) return null;
        const done = current.done + 1;

        return done >= current.total ? null : {...current, done};
      }),
    [],
  );

  /**
   * Adds photos from files or from an album, one at a time: each lands on the sheet as soon as it is open, while the
   * loader counts the rest. What could not be read is listed in one message.
   */
  const addSources = useCallback(
    async (sources: {name: string; load: () => Promise<Blob>}[], failure: (names: string[]) => string) => {
      if (!sources.length) return;
      startAdding(sources.length);
      const unreadable: string[] = [];
      for (const source of sources) {
        try {
          const opened = await openPhoto(await source.load());
          const id = newId();
          await saveBlob(id, opened.blob);
          const photo: Photo = {id, name: source.name, ...opened, spanX: 1, spanY: 1, crop: DEFAULT_CROP};
          setPhotos(current => [...current, photo]);
        } catch {
          unreadable.push(source.name);
        } finally {
          finishOne();
        }
      }
      if (unreadable.length) say(failure(unreadable));
    },
    [say, startAdding, finishOne],
  );

  const addFiles = useCallback(
    (files: File[]) =>
      addSources(
        files.map(file => ({name: file.name, load: async () => file})),
        names =>
          `Couldn't open ${names.length > 1 ? `${names.length} files` : names[0]}. Save as JPEG or PNG and try again.`,
      ),
    [addSources],
  );

  const addAlbumPhotos = (albumPhotos: AlbumPhoto[]) =>
    addSources(
      albumPhotos.map((photo, index) => ({name: `Album photo ${index + 1}`, load: () => downloadAlbumPhoto(photo)})),
      names => `Couldn't get ${names.length} ${1 === names.length ? 'photo' : 'photos'} from the album. Try again.`,
    );

  const replacePhoto = useCallback(
    async (id: string, file: File) => {
      startAdding(1);
      try {
        const opened = await openPhoto(file);
        await saveBlob(id, opened.blob);
        setPhotos(current =>
          current.map(photo => {
            if (photo.id !== id) return photo;
            URL.revokeObjectURL(photo.url);

            return {...photo, ...opened, name: file.name, crop: DEFAULT_CROP};
          }),
        );
      } catch {
        say(`Couldn't open ${file.name}. Save it as JPEG or PNG and try again.`);
      } finally {
        finishOne();
      }
    },
    [say, startAdding, finishOne],
  );

  const updatePhoto = useCallback((id: string, changes: Partial<Photo>) => {
    setPhotos(current => current.map(photo => (photo.id === id ? {...photo, ...changes} : photo)));
  }, []);

  const setCrop = useCallback((id: string, crop: Crop) => updatePhoto(id, {crop}), [updatePhoto]);

  const removePhoto = (id: string) => {
    const photo = photosById.get(id);
    if (photo) URL.revokeObjectURL(photo.url);
    deleteBlob(id);
    setPhotos(current => current.filter(item => item.id !== id));
    setSelectedId(null);
  };

  const clearPhotos = () => {
    for (const photo of photos) {
      URL.revokeObjectURL(photo.url);
      deleteBlob(photo.id);
    }
    setPhotos([]);
    setSelectedId(null);
  };

  const movePhoto = (id: string, offset: number) =>
    setPhotos(current => {
      const from = current.findIndex(photo => photo.id === id);
      const to = from + offset;
      if (-1 === from || to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[from], next[to]] = [next[to], next[from]];

      return next;
    });

  const swapPhotos = (firstId: string, secondId: string) =>
    setPhotos(current => {
      const first = current.findIndex(photo => photo.id === firstId);
      const second = current.findIndex(photo => photo.id === secondId);
      if (-1 === first || -1 === second) return current;
      const next = [...current];
      [next[first], next[second]] = [next[second], next[first]];

      return next;
    });

  const moveToEnd = (id: string) =>
    setPhotos(current => {
      const photo = current.find(item => item.id === id);

      return photo ? [...current.filter(item => item.id !== id), photo] : current;
    });

  /** Drags a photo by its handle; dropped on another photo, the two swap; on an empty place, it moves to the end. */
  const startSwap = (id: string, event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(id);
    const targetAt = (x: number, y: number) => {
      const element = document.elementFromPoint(x, y);
      const tile = element?.closest<HTMLElement>('[data-photo-id]');

      return {overId: tile?.dataset.photoId ?? null, free: Boolean(element?.closest('[data-free-slot]'))};
    };
    const move = (moveEvent: globalThis.PointerEvent) =>
      setSwap({
        id,
        x: moveEvent.clientX,
        y: moveEvent.clientY,
        overId: targetAt(moveEvent.clientX, moveEvent.clientY).overId,
      });
    const end = (endEvent: globalThis.PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      const target = targetAt(endEvent.clientX, endEvent.clientY);
      if ('pointerup' === endEvent.type) {
        if (target.overId && target.overId !== id) swapPhotos(id, target.overId);
        else if (target.free) moveToEnd(id);
      }
      setSwap(null);
    };
    setSwap({id, x: event.clientX, y: event.clientY, overId: null});
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const exportPhotos = (): Map<string, ExportPhoto> =>
    new Map(photos.map(photo => [photo.id, {blob: photo.blob, preview: photo.preview, crop: photo.crop}]));

  const onExportPdf = async () => {
    if (!sheet || !photos.length || busy) return;
    setBusy('pdf');
    try {
      download(await exportPdf(sheet, exportPhotos(), settings), 'blotted.pdf');
    } catch {
      say("Couldn't make the PDF. Try again, or with fewer photos.");
    } finally {
      setBusy(null);
    }
  };

  const onExportImage = async (page: number) => {
    if (!sheet || busy) return;
    setBusy(`image-${page}`);
    try {
      const name = sheet.pageCount > 1 ? `blotted-page-${page + 1}.jpg` : 'blotted.jpg';
      download(await exportPageImage(sheet, page, exportPhotos(), settings), name);
    } catch {
      say("Couldn't make the image. Try again.");
    } finally {
      setBusy(null);
    }
  };

  // Escape lets go of the chosen photo; a pasted image is added.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ('Escape' === event.key) setSelectedId(null);
    };
    const onPaste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])].filter(file => file.type.startsWith('image/'));
      if (files.length) addFiles(files);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  }, [addFiles]);

  const squares = sheet ? sheet.across * sheet.down * sheet.pageCount : 0;
  const swapPhoto = swap ? photosById.get(swap.id) : undefined;

  return (
    <div className={['app', selected && 'has-selection'].filter(Boolean).join(' ')}>
      <Backdrop />
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            🖼️
          </span>
          <h1>
            Blotted <small>since 1943</small>
          </h1>
        </div>
        <div className="actions">
          <label
            className="button"
            htmlFor={ADD_PHOTOS_INPUT}
            role="button"
            tabIndex={0}
            onKeyDown={openPickerOnKey(ADD_PHOTOS_INPUT)}
          >
            {adding ? 'Adding…' : 'Add photos'}
          </label>
          <button type="button" className="button album" onClick={() => setAlbumOpen(true)}>
            Album link
          </button>
          <button
            type="button"
            className="button primary"
            disabled={!sheet || !photos.length || null !== busy}
            onClick={onExportPdf}
          >
            {'pdf' === busy ? 'Making PDF…' : `Export ${settings.paper} PDF`}
          </button>
        </div>
        <input
          id={ADD_PHOTOS_INPUT}
          className="file-input"
          type="file"
          accept="image/*"
          multiple
          tabIndex={-1}
          aria-hidden="true"
          onChange={event => {
            addFiles([...(event.target.files ?? [])]);
            event.target.value = '';
          }}
        />
        <input
          id={REPLACE_PHOTO_INPUT}
          className="file-input"
          type="file"
          accept="image/*"
          tabIndex={-1}
          aria-hidden="true"
          onChange={event => {
            const file = event.target.files?.[0];
            if (file && replaceTarget.current) replacePhoto(replaceTarget.current, file);
            event.target.value = '';
          }}
        />
      </header>

      <div className="layout">
        <main
          className={['stage', fileOver && 'file-over'].filter(Boolean).join(' ')}
          onPointerDown={event => {
            if (!(event.target as HTMLElement).closest('.tile, .inspector')) setSelectedId(null);
          }}
          onDragOver={event => {
            if (!event.dataTransfer.types.includes('Files')) return;
            event.preventDefault();
            setFileOver(true);
          }}
          onDragLeave={event => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFileOver(false);
          }}
          onDrop={event => {
            event.preventDefault();
            setFileOver(false);
            const files = [...event.dataTransfer.files].filter(file => file.type.startsWith('image/') || !file.type);
            if (files.length) addFiles(files);
          }}
        >
          {sheet ? (
            <>
              <p className="summary">
                <span>
                  {photos.length} {1 === photos.length ? 'photo' : 'photos'} on {sheet.pageCount}{' '}
                  {1 === sheet.pageCount ? 'page' : 'pages'}
                </span>
                <span>
                  {squares} squares of {cm(settings.square)} cm
                </span>
                <span className="zoom-switch">
                  <button type="button" aria-pressed={!actualSize} onClick={() => setActualSize(false)}>
                    Fit
                  </button>
                  <button type="button" aria-pressed={actualSize} onClick={() => setActualSize(true)}>
                    100%
                  </button>
                </span>
              </p>
              {loaded && !photos.length ? (
                <p className="empty-hint">
                  Drop photos on the page, press + or Album link to add them. They stay on this device.
                </p>
              ) : null}
              <div className="pages">
                {Array.from({length: sheet.pageCount}, (_, page) => (
                  <figure className="page" key={page}>
                    <figcaption>
                      <span>
                        {settings.paper} page {page + 1}
                        {sheet.pageCount > 1 ? ` of ${sheet.pageCount}` : ''}
                      </span>
                      <button
                        type="button"
                        className="link-button"
                        disabled={null !== busy || !sheet.placements.some(placement => page === placement.page)}
                        onClick={() => onExportImage(page)}
                      >
                        {`image-${page}` === busy ? 'Making image…' : 'Save as image'}
                      </button>
                    </figcaption>
                    <div className="page-scroll">
                      <SheetView
                        sheet={sheet}
                        page={page}
                        photos={photosById}
                        settings={settings}
                        actualSize={actualSize}
                        selectedId={selectedId}
                        dropTargetId={swap?.overId && swap.overId !== swap.id ? swap.overId : null}
                        onSelect={setSelectedId}
                        onCrop={setCrop}
                        onStartSwap={startSwap}
                        onReplaceWithFile={replacePhoto}
                      />
                    </div>
                  </figure>
                ))}
              </div>
              <p className="print-note">
                Print the PDF at 100% (“Actual size”), not “Fit to page”, so each square is exactly{' '}
                {cm(settings.square)} cm. Photos never leave this device.
              </p>
            </>
          ) : (
            <p className="empty-hint">
              A photo of {cm(settings.slotWidth * settings.square)} × {cm(settings.slotHeight * settings.square)} cm
              doesn't fit on {settings.paper} with these margins. Make the squares, the photo shape or the margin
              smaller.
            </p>
          )}
        </main>

        <aside className="side">
          {selected && sheet ? (
            <Inspector
              photo={selected}
              sheet={sheet}
              index={selectedIndex}
              count={photos.length}
              onChange={changes => updatePhoto(selected.id, changes)}
              onReplace={() => {
                replaceTarget.current = selected.id;
              }}
              onMove={offset => movePhoto(selected.id, offset)}
              onRemove={() => removePhoto(selected.id)}
              onClose={() => setSelectedId(null)}
            />
          ) : null}
          <SettingsPanel
            settings={settings}
            sheet={sheet}
            photoCount={photos.length}
            onChange={changes => setSettings(current => cleanSettings({...current, ...changes}))}
            onClearPhotos={clearPhotos}
          />
        </aside>
      </div>

      {swap && swapPhoto ? (
        <div className="swap-ghost" style={{transform: `translate(${swap.x}px, ${swap.y}px)`}} aria-hidden="true">
          <img src={swapPhoto.url} alt="" />
        </div>
      ) : null}
      <AlbumDialog open={albumOpen} onClose={() => setAlbumOpen(false)} onAdd={addAlbumPhotos} />
      {adding || !loaded ? (
        <div className={['loader', !loaded && !adding && 'restoring'].filter(Boolean).join(' ')} role="status">
          <span className="loader-ring" aria-hidden="true" />
          <span className="loader-text">
            {adding
              ? `Adding ${adding.total > 1 ? `photos ${Math.min(adding.done + 1, adding.total)} of ${adding.total}` : 'photo'}…`
              : 'Loading your photos…'}
          </span>
          {adding && adding.total > 1 ? (
            <span className="loader-bar" aria-hidden="true">
              <span style={{width: `${(adding.done / adding.total) * 100}%`}} />
            </span>
          ) : null}
        </div>
      ) : null}
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
