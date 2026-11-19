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

/** A photo address from an album, checked: only Google's photo server is fetched. */
export function photoAddress(input: string): URL {
  let address: URL;
  try {
    address = new URL(input);
  } catch {
    throw new HttpError(400, 'Give a photo address from the album');
  }
  if (
    'https:' !== address.protocol ||
    'lh3.googleusercontent.com' !== address.hostname ||
    !address.pathname.startsWith('/pw/')
  )
    throw new HttpError(400, 'That is not a Google Photos album photo');

  return address;
}

/** One album photo at the given size, streamed through as it comes, so its size is not limited. */
export async function streamPhoto(address: URL, width: number, height: number): Promise<Response> {
  const size = (value: number) => (Number.isInteger(value) && value > 0 && value <= 20000 ? value : null);
  const [photoWidth, photoHeight] = [size(width), size(height)];
  if (!photoWidth || !photoHeight) throw new HttpError(400, 'Give the photo size as w and h');
  let photo: Response;
  try {
    photo = await fetch(`${address.href}=w${photoWidth}-h${photoHeight}`, {headers: {'User-Agent': BROWSER}});
  } catch {
    throw new HttpError(502, "Couldn't reach Google Photos, try again");
  }
  if (429 === photo.status) throw new HttpError(429, 'Google Photos asks to slow down, try again in a moment');
  if (!photo.ok || !photo.body) throw new HttpError(502, `Google Photos answered ${photo.status}`);

  return new Response(photo.body, {
    headers: {
      'Content-Type': photo.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': 'private, max-age=86400',
    },
  });
}

/**
 * The album page a short link (photos.app.goo.gl) points to. Asked as a browser, Google answers a short link with a
 * page that forwards to the album by script; asked plainly, it redirects. So the redirect is read here, by hand.
 */
async function albumPage(link: URL): Promise<URL> {
  if ('photos.google.com' === link.hostname) return link;
  const answer = await fetch(link, {redirect: 'manual'});
  const target = answer.headers.get('location');
  if (!target) throw new HttpError(404, 'No album at that link. Is it shared with a link?');
  const page = new URL(target, link);
  if ('photos.google.com' !== page.hostname) throw new HttpError(400, 'That link does not lead to an album');

  return page;
}

/** Fetches the album page behind a shared link and lists its photos. */
export async function readAlbum(link: URL): Promise<Album> {
  let page: Response;
  try {
    page = await fetch(await albumPage(link), {
      redirect: 'follow',
      headers: {'User-Agent': BROWSER, 'Accept-Language': 'en'},
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "Couldn't reach Google Photos, try again");
  }
  if (!ALBUM_HOSTS.has(new URL(page.url).hostname)) throw new HttpError(400, 'That link does not lead to an album');
  if (!page.ok) throw new HttpError(404, 'No album at that link. Is it shared with a link?');
  const album = parseAlbum(await page.text());
  if (!album.photos.length) throw new HttpError(404, 'No photos found. Check the album is shared with a link.');

  return album;
}
