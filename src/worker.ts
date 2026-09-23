import { server } from "~/server/app";

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export default {
  fetch(request: Request, env: { ASSETS?: AssetsBinding } & Record<string, unknown>, ctx: any) {
    // Requests under /api/* reach the Worker first (see run_worker_first in
    // wrangler.jsonc); everything else is served from static assets with
    // single-page-application fallback.
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith("/api/") && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return server.fetch(request, env, ctx);
  },
};
