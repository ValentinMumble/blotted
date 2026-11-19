// Reads a Google Photos album shared by link. Google has no public API for that (its Library API only reaches photos
// an app made itself), so this reads the album's public page, as a browser would, and picks out each photo's address
// and full size. The photos themselves are not fetched here: Google's photo server lets any page download them, at
// full size, straight into the browser.

import {HttpError} from './http.js';

export interface AlbumPhoto {
  /** The photo's base address: add "=w<width>-h<height>" for a size, "=w300-h300-c" for a square thumbnail. */
  url: string;
  width: number;
  height: number;
}

export interface Album {
  title: string | null;
  photos: AlbumPhoto[];
}

const ALBUM_HOSTS = new Set(['photos.app.goo.gl', 'photos.google.com', 'goo.gl']);
const PHOTO_PATTERN = /\["(https:\/\/lh3\.googleusercontent\.com\/pw\/[^"\\]+)",(\d+),(\d+)/g;
const BROWSER =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15';

/** The link, checked: only Google Photos addresses are fetched. */
export function albumLink(input: string): URL {
  let link: URL;
  try {
    link = new URL(input.trim());
  } catch {
    throw new HttpError(400, 'Paste the link of a Google Photos album');
  }
  if ('https:' !== link.protocol || !ALBUM_HOSTS.has(link.hostname))
    throw new HttpError(400, 'That is not a Google Photos album link (photos.app.goo.gl or photos.google.com)');

  return link;
}

const decodeHtml = (text: string) =>
  text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

/** The photos a shared album page lists, in its order, each once, with the album's title. */
export function parseAlbum(html: string): Album {
  const seen = new Set<string>();
  const photos: AlbumPhoto[] = [];
  for (const [, url, width, height] of html.matchAll(PHOTO_PATTERN)) {
    if (seen.has(url)) continue;
    seen.add(url);
    photos.push({url, width: Number(width), height: Number(height)});
  }
  const title = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1];

  return {title: title ? decodeHtml(title) : null, photos};
}

/** Fetches the album page behind a shared link and lists its photos. */
export async function readAlbum(link: URL): Promise<Album> {
  let page: Response;
  try {
    page = await fetch(link, {redirect: 'follow', headers: {'User-Agent': BROWSER, 'Accept-Language': 'en'}});
  } catch {
    throw new HttpError(502, "Couldn't reach Google Photos, try again");
  }
  if (!ALBUM_HOSTS.has(new URL(page.url).hostname)) throw new HttpError(400, 'That link does not lead to an album');
  if (!page.ok) throw new HttpError(404, 'No album at that link. Is it shared with a link?');
  const album = parseAlbum(await page.text());
  if (!album.photos.length) throw new HttpError(404, 'No photos found. Check the album is shared with a link.');

  return album;
}
