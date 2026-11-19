import {albumLink, readAlbum} from './_lib/album.js';
import {handle, json} from './_lib/http.js';

/**
 * GET /api/album?url=<shared album link>: the album's title and photos (address and full size), read from its
 * public page. Google's page has no CORS headers, so the browser reads it through here. Cached for 5 minutes.
 */
export function GET(request: Request) {
  return handle(async () => {
    const link = albumLink(new URL(request.url).searchParams.get('url') ?? '');

    return json(await readAlbum(link), {
      headers: {'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600'},
    });
  });
}
