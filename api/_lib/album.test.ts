import {describe, expect, test} from 'vitest';
import {albumLink, parseAlbum} from './album';

describe('albumLink', () => {
  test('takes Google Photos links', () => {
    expect(albumLink(' https://photos.app.goo.gl/AbC123 ').hostname).toBe('photos.app.goo.gl');
    expect(albumLink('https://photos.google.com/share/AF1Qip?key=x').hostname).toBe('photos.google.com');
  });

  test('refuses anything else', () => {
    expect(() => albumLink('https://example.com/album')).toThrow(/not a Google Photos album link/);
    expect(() => albumLink('http://photos.app.goo.gl/AbC123')).toThrow();
    expect(() => albumLink('not a link')).toThrow(/Paste the link/);
  });
});

test('parseAlbum lists each photo once, in order, with its full size and the title', () => {
  const html = `<meta property="og:title" content="Buvards &amp; friends">
    <script>AF_initDataCallback({data:[null,[["AF1Qa",["https://lh3.googleusercontent.com/pw/AAA",4032,3024,null],1],
    ["AF1Qb",["https://lh3.googleusercontent.com/pw/BBB",3024,4032,null],2],
    ["AF1Qa",["https://lh3.googleusercontent.com/pw/AAA",4032,3024,null],1]]],
    ["https://lh3.googleusercontent.com/a/OWNER",96,96]]})</script>`;
  expect(parseAlbum(html)).toEqual({
    title: 'Buvards & friends',
    photos: [
      {url: 'https://lh3.googleusercontent.com/pw/AAA', width: 4032, height: 3024},
      {url: 'https://lh3.googleusercontent.com/pw/BBB', width: 3024, height: 4032},
    ],
  });
});
