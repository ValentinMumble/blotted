import {useId, useState, type FormEvent} from 'react';
import {lastAlbumLink, readAlbum, thumbnailOf, type Album, type AlbumPhoto} from './album';

interface AlbumPickerProps {
  /** Addresses of the album photos already on the sheet: they start unticked. */
  added: Set<string>;
  onClose: () => void;
  onAdd: (photos: AlbumPhoto[]) => void;
}

/**
 * Paste a shared album link, see its photos, pick which to add. In the side column on a wide screen, so the sheet
 * stays in view; a drawer from the bottom on a phone.
 */
export function AlbumPicker({added, onClose, onAdd}: AlbumPickerProps) {
  const linkId = useId();
  const [link, setLink] = useState(lastAlbumLink);
  const [album, setAlbum] = useState<Album | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const find = async (event: FormEvent) => {
    event.preventDefault();
    if (!link.trim() || reading) return;
    setReading(true);
    setError(null);
    try {
      const found = await readAlbum(link);
      setAlbum(found);
      setChosen(new Set(found.photos.map(photo => photo.url).filter(url => !added.has(url))));
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
  const alreadyAdded = album ? album.photos.filter(photo => added.has(photo.url)).length : 0;

  return (
    <>
      <div className="album-scrim" aria-hidden="true" onClick={onClose} />
      <section className="panel album-panel" aria-labelledby={`${linkId}-title`}>
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
            <button type="submit" className="button" disabled={!link.trim() || reading}>
              {reading ? 'Reading…' : 'Find photos'}
            </button>
          </div>
          {album ? null : (
            <p className="hint">In Google Photos, open the album, then Share and Create link. Paste that link here.</p>
          )}
        </form>

        {error ? (
          <p className="album-error" role="alert">
            {error}
          </p>
        ) : null}

        {album ? (
          <>
            <div className="album-actions">
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
              <span className="album-count">
                {picked.length} of {album.photos.length} chosen
                {alreadyAdded ? `, ${alreadyAdded} already on the sheet` : ''}
              </span>
              <span className="album-bar-buttons">
                <button
                  type="button"
                  className="link-button"
                  onClick={() =>
                    setChosen(new Set(album.photos.map(photo => photo.url).filter(url => !added.has(url))))
                  }
                >
                  All new
                </button>
                <button type="button" className="link-button" onClick={() => setChosen(new Set())}>
                  None
                </button>
              </span>
            </div>
            {album.title ? <p className="album-title">{album.title}</p> : null}
            <div className="album-grid">
              {album.photos.map((photo, index) => (
                <button
                  key={photo.url}
                  type="button"
                  className="album-thumb"
                  aria-pressed={chosen.has(photo.url)}
                  aria-label={`Photo ${index + 1}${added.has(photo.url) ? ', already on the sheet' : ''}`}
                  onClick={() => toggle(photo.url)}
                >
                  <img src={thumbnailOf(photo)} alt="" loading="lazy" />
                  {added.has(photo.url) ? <span className="album-added">Added</span> : null}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </section>
    </>
  );
}
