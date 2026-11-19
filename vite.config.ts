import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import react from '@vitejs/plugin-react';
import {defineConfig, type Plugin} from 'vite';
import {localApi} from './local-api.ts';

/**
 * Writes the service worker (sw/sw.js) into the build, with an id that changes with the build and the files it keeps
 * on the device: all of them, but for the fonts only the Latin ones (the others come when a page needs them).
 */
const serviceWorker = (): Plugin => ({
  name: 'blotted-service-worker',
  apply: 'build',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const files = Object.keys(bundle)
      .filter(fileName => fileName.startsWith('assets/') && !fileName.endsWith('.woff'))
      .filter(fileName => !fileName.endsWith('.woff2') || /-latin(-ext)?-/.test(fileName))
      .map(fileName => `/${fileName}`)
      .sort();
    const page = bundle['index.html'];
    const pageSource = page && 'asset' === page.type ? String(page.source) : String(Date.now());
    const build = createHash('sha256').update(files.join('\n')).update(pageSource).digest('hex').slice(0, 12);
    const source = readFileSync('sw/sw.js', 'utf8')
      .replace('__BUILD__', build)
      .replace(/\[\s*\/\* FILES \*\/\s*\]/, JSON.stringify(files));
    this.emitFile({type: 'asset', fileName: 'sw.js', source});
  },
});

export default defineConfig({
  // Port 5190 is Retrospin's and 5191 Rreel's: the three can run side by side.
  server: {host: true, port: 5194, strictPort: true},
  // `npm run dev` also answers /api/* from api/ (see local-api.ts).
  plugins: [react(), serviceWorker(), localApi()],
});
