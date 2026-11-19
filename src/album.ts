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

/** Downloads the photo at its full size. */
export const downloadAlbumPhoto = async (photo: AlbumPhoto): Promise<Blob> => {
  let response: Response;
  try {
    response = await fetch(`${photo.url}=w${photo.width}-h${photo.height}`);
  } catch {
    throw new Error('No connection to Google Photos');
  }
  if (!response.ok) throw new Error(`Google Photos answered ${response.status}`);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('Not a photo');

  return blob;
};
