import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { apiNotFoundHandler } from "~/lib/hono";
import { server } from "~/server/app";

const distDir = resolve(process.cwd(), "dist");

// Serve the built SPA assets. Runs after the API routes, so /api/* is unaffected.
server.use("*", serveStatic({ root: distDir }));

// SPA fallback: client-side routes serve index.html; unmatched /api/* and
// missing asset files (paths with an extension) stay JSON 404s.
server.get("*", async (c) => {
  const { pathname } = new URL(c.req.url);
  if (pathname.startsWith("/api/") || extname(pathname) !== "") {
    return apiNotFoundHandler(c);
  }
  const html = await readFile(resolve(distDir, "index.html"), "utf8").catch(() => null);
  if (!html) {
    return c.text("Frontend not built. Run `pnpm build` first.", 404);
  }
  return c.html(html);
});

const port = Number(process.env.PORT || 3000);

serve({ fetch: server.fetch, port }, (info) => {
  console.log(`Server listening on http://localhost:${info.port}`);
});
