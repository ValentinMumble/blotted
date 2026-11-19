import {existsSync} from 'node:fs';
import type {Plugin} from 'vite';

/** `npm run dev` answers /api/* itself, from the routes in api/, so the site runs without `vercel dev`. */
export function localApi(): Plugin {
  return {
    name: 'blotted-local-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
        if (!url.pathname.startsWith('/api/')) return next();
        const answer = async () => {
          const name = url.pathname.slice('/api/'.length).replace(/\/$/, '');
          let result: Response;
          if (!/^[a-z-]+$/.test(name) || !existsSync(`${server.config.root}/api/${name}.ts`)) {
            result = Response.json({error: 'No such route'}, {status: 404});
          } else {
            const route = (await server.ssrLoadModule(`/api/${name}.ts`)) as Record<
              string,
              (request: Request) => Promise<Response>
            >;
            const handler = route[request.method ?? 'GET'];
            result = handler
              ? await handler(new Request(url, {method: request.method}))
              : Response.json({error: 'Method not allowed'}, {status: 405});
          }
          response.statusCode = result.status;
          result.headers.forEach((value, key) => response.setHeader(key, value));
          response.end(Buffer.from(await result.arrayBuffer()));
        };
        answer().catch(next);
      });
    },
  };
}
