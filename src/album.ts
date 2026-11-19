// A Google Photos album shared by link: Blotted's server lists its photos (api/album.ts), then the browser downloads
// the chosen ones straight from Google, at full size.

export interface AlbumPhoto {
  url: string;
  width: number;
  height: number;
}

export interface Album {
  title: string | null;
  photos: AlbumPhoto[];
}

const LINK_KEY = 'blotted.albumLink';

export const lastAlbumLink = (): string => {
  try {
    return localStorage.getItem(LINK_KEY) ?? '';
  } catch {
    return '';
  }
};

const keepAlbumLink = (link: string) => {
  try {
    localStorage.setItem(LINK_KEY, link);
  } catch {
    // Not kept: the field starts empty next time.
  }
};

/** The album's photos. Plain errors: no network, a page instead of data (a Wi-Fi login), or the server's message. */
export const readAlbum = async (link: string): Promise<Album> => {
  let response: Response;
  try {
    response = await fetch(`/api/album?url=${encodeURIComponent(link.trim())}`);
  } catch {
    throw new Error('No connection to Blotted');
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('No connection to Blotted');
  }
  if (!response.ok) throw new Error((body as {error?: string}).error ?? "Couldn't read that album");
  keepAlbumLink(link.trim());

  return body as Album;
};

/** A square thumbnail of the photo, for picking. */
export const thumbnailOf = (photo: AlbumPhoto, size = 300): string => `${photo.url}=w${size}-h${size}-c`;

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

/** The photo at this size, through Blotted's server: Google serves album photos without CORS headers. */
const fetchPhoto = async (photo: AlbumPhoto, width: number, height: number): Promise<Response> => {
  try {
    return await fetch(
      `/api/album?photo=${encodeURIComponent(photo.url)}&w=${Math.round(width)}&h=${Math.round(height)}`,
    );
  } catch {
    throw new Error('No connection to Blotted');
  }
};

/** A smaller fallback size, if the full one cannot come through: at most this many pixels on the long side. */
const FALLBACK_EDGE = 2400;

/**
 * Downloads the photo at its full size. When Google asks to slow down, it waits and tries again; if the full size
 * still fails, it takes the photo at 2400 px on the long side rather than none.
 */
export const downloadAlbumPhoto = async (photo: AlbumPhoto): Promise<Blob> => {
  const scale = Math.min(1, FALLBACK_EDGE / Math.max(photo.width, photo.height));
  const attempts: [number, number, number][] = [
    [photo.width, photo.height, 0],
    [photo.width, photo.height, 1500],
    [photo.width * scale, photo.height * scale, 3000],
  ];
  let lastStatus = 0;
  for (const [width, height, delay] of attempts) {
    if (delay) await wait(delay);
    const response = await fetchPhoto(photo, width, height);
    if (response.ok) {
      const blob = await response.blob();
      if (blob.type.startsWith('image/')) return blob;
    }
    lastStatus = response.status;
  }
  throw new Error(`Google Photos answered ${lastStatus}`);
};
