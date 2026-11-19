/** Small helpers shared by the API routes. */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {...init, headers: {'Cache-Control': 'no-store', ...init.headers}});
}

/** Runs a route, turning thrown HttpErrors (and anything else) into JSON error answers. */
export async function handle(run: () => Promise<Response>) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HttpError) return json({error: error.message}, {status: error.status});
    console.error(error);
    return json({error: 'Something went wrong, try again later'}, {status: 500});
  }
}
