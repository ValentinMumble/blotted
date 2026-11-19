import {albumLink, photoAddress, readAlbum, streamPhoto} from './_lib/album.js';
import {handle, json} from './_lib/http.js';

/**
 * GET /api/album?url=<shared album link>: the album's title and photos (address and full size), read from its
 * public page. Cached for 5 minutes.
 *
 * GET /api/album?photo=<photo address>&w=<width>&h=<height>: one album photo at that size, streamed through. Google
 * serves album photos without CORS headers, so a page cannot download them itself. It shares this function with the
 * album: the Hobby plan allows 12 functions per deployment.
 */
export function GET(request: Request) {
  return handle(async () => {
    const params = new URL(request.url).searchParams;
    if (params.has('photo')) {
      return streamPhoto(photoAddress(params.get('photo') ?? ''), Number(params.get('w')), Number(params.get('h')));
    }
    const link = albumLink(params.get('url') ?? '');

    return json(await readAlbum(link), {
      headers: {'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600'},
    });
  });
}
