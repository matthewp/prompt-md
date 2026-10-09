import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fallbackRoute, loadRoutes, render, resolveRoute } from "./prompt.js";

const ORIGIN = "http://prompt.md.invalid";

// "/" -> index.html, "/about" -> about/index.html, "/feed.xml" -> feed.xml
function outputPath(outDir, pathname) {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const last = parts[parts.length - 1] ?? "";
  if (!last.includes(".")) parts.push("index.html");
  return join(outDir, ...parts);
}

// Same-site links in generated HTML, as pathnames.
function findLinks(html, from) {
  const links = new Set();
  for (const [, href] of html.matchAll(/\b(?:href|src)\s*=\s*["']([^"'#]+)/gi)) {
    let url;
    try {
      url = new URL(href, ORIGIN + from);
    } catch {
      continue;
    }
    if (url.origin === ORIGIN) links.add(url.pathname.replace(/(.)\/$/, "$1"));
  }
  return links;
}

export async function build({ routesDir, outDir, models, model, options = {}, hallucinate404 = true, maxPages = 50, concurrency = 4 }) {
  // Every static route is a starting point. Dynamic and made-up pages are found by following links.
  const queue = (await loadRoutes(routesDir))
    .filter((r) => !r.dynamic)
    .map((r) => "/" + r.segments.join("/"));
  const seen = new Set(queue);
  const skipped = new Set();
  let built = 0;
  let cost = 0;
  let failed = 0;

  await rm(outDir, { recursive: true, force: true });

  async function buildPage(pathname) {
    const route = (await resolveRoute(routesDir, pathname)) ?? (hallucinate404 ? fallbackRoute(pathname) : null);
    if (!route) return skipped.add(pathname);

    let body = "";
    const message = await render({
      models,
      model,
      options,
      route,
      request: { method: "GET", path: pathname, params: route.params, query: {} },
      write: (text) => (body += text),
    });
    cost += message.usage?.cost?.total ?? 0;

    const label = route.file ? relative(routesDir, route.file) : "(hallucinated)";
    if (message.stopReason === "error") {
      failed++;
      console.error(`  ✗ ${pathname} -> ${label}: ${message.errorMessage}`);
      return;
    }

    const file = outputPath(outDir, pathname);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, body);
    built++;
    console.log(`  ${pathname} -> ${relative(outDir, file)} (${label}) $${(message.usage?.cost?.total ?? 0).toFixed(4)}`);

    if (route.ext !== "html") return;
    for (const link of findLinks(body, pathname)) {
      if (seen.has(link)) continue;
      seen.add(link);
      if (seen.size > maxPages) skipped.add(link);
      else queue.push(link);
    }
  }

  // A small worker pool: each worker pulls from the queue until it's empty and nobody is still running.
  let active = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (;;) {
        const next = queue.shift();
        if (next === undefined) {
          if (active === 0) return;
          await new Promise((r) => setTimeout(r, 50));
          continue;
        }
        active++;
        try {
          await buildPage(next);
        } catch (err) {
          failed++;
          console.error(`  ✗ ${next}: ${err.message}`);
        } finally {
          active--;
        }
      }
    }),
  );

  return { built, failed, skipped: [...skipped], cost };
}
