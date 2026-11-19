import {useEffect, useId, useRef, useState, type FormEvent} from 'react';
import {lastAlbumLink, readAlbum, thumbnailOf, type Album, type AlbumPhoto} from './album';

interface AlbumDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (photos: AlbumPhoto[]) => void;
}

/** Paste a shared album link, see its photos, pick which to add. */
export function AlbumDialog({open, onClose, onAdd}: AlbumDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const linkId = useId();
  const [link, setLink] = useState(lastAlbumLink);
  const [album, setAlbum] = useState<Album | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = dialog.current!;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  const find = async (event: FormEvent) => {
    event.preventDefault();
    if (!link.trim() || reading) return;
    setReading(true);
    setError(null);
    try {
      const found = await readAlbum(link);
      setAlbum(found);
      setChosen(new Set(found.photos.map(photo => photo.url)));
    } catch (failure) {
      setAlbum(null);
      setError(failure instanceof Error ? failure.message : "Couldn't read that album");
    } finally {
      setReading(false);
    }
  };

  const toggle = (url: string) =>
    setChosen(current => {
      const next = new Set(current);
      if (next.has(url)) next.delete(url);
      else next.add(url);

      return next;
    });

  const picked = album ? album.photos.filter(photo => chosen.has(photo.url)) : [];

  return (
    <dialog ref={dialog} className="album-dialog panel" onClose={onClose} aria-labelledby={`${linkId}-title`}>
      <header className="panel-head">
        <h2 id={`${linkId}-title`}>Google Photos album</h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5 5l10 10M15 5 5 15" />
          </svg>
        </button>
      </header>

      <form className="album-form" onSubmit={find}>
        <label className="field-label" htmlFor={linkId}>
          Album link
        </label>
        <div className="album-row">
          <input
            id={linkId}
            className="text-input"
            type="url"
            inputMode="url"
            placeholder="https://photos.app.goo.gl/…"
            value={link}
            onChange={event => setLink(event.target.value)}
          />
          <button type="submit" className="button primary" disabled={!link.trim() || reading}>
            {reading ? 'Reading…' : 'Find photos'}
          </button>
        </div>
        <p className="hint">In Google Photos, open the album, then Share and Create link. Paste that link here.</p>
      </form>

      {error ? (
        <p className="album-error" role="alert">
          {error}
        </p>
      ) : null}

      {album ? (
        <>
          <div className="album-bar">
            <span>
              {album.title ? `${album.title}: ` : ''}
              {picked.length} of {album.photos.length} chosen
            </span>
            <span className="album-bar-buttons">
              <button
                type="button"
                className="link-button"
                onClick={() => setChosen(new Set(album.photos.map(photo => photo.url)))}
              >
                All
              </button>
              <button type="button" className="link-button" onClick={() => setChosen(new Set())}>
                None
              </button>
            </span>
          </div>
          <div className="album-grid">
            {album.photos.map((photo, index) => (
              <button
                key={photo.url}
                type="button"
                className="album-thumb"
                aria-pressed={chosen.has(photo.url)}
                aria-label={`Photo ${index + 1}`}
                onClick={() => toggle(photo.url)}
              >
                <img src={thumbnailOf(photo)} alt="" loading="lazy" />
              </button>
            ))}
          </div>
          <div className="button-row end">
            <button type="button" className="button quiet" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="button primary"
              disabled={!picked.length}
              onClick={() => {
                onAdd(picked);
                onClose();
              }}
            >
              Add {picked.length} {1 === picked.length ? 'photo' : 'photos'}
            </button>
          </div>
        </>
      ) : null}
    </dialog>
  );
}
