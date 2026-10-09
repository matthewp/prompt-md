import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const SYSTEM_PROMPT = `You are a web server. Each request comes with a route spec written by a developer in plain English, plus the details of the incoming HTTP request.

Respond with the exact body of the HTTP response and nothing else. No markdown code fences, no commentary, no explanation before or after. Your first character is the first byte the client receives.

When the format is HTML, write a complete document starting with <!doctype html>. Inline all CSS and JavaScript. Do not link to external assets unless the spec asks you to.

You have no database, no session storage and no memory of previous requests. If the spec implies state (a counter, a list of posts, a logged-in user), make up something plausible.`;

const MIME = {
  html: "text/html; charset=utf-8",
  json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  svg: "image/svg+xml; charset=utf-8",
  csv: "text/csv; charset=utf-8",
};

const FALLBACK_SPEC = `There is no spec for this URL. Work out from the path and query string what page the visitor probably expected to find, and serve it anyway.`;

// Walk routesDir every request. There's no route cache, so edits apply without a restart.
async function loadRoutes(routesDir) {
  const entries = await readdir(routesDir, { recursive: true, withFileTypes: true });
  const routes = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const file = join(entry.parentPath, entry.name);
    const segments = relative(routesDir, file).slice(0, -3).split(sep);

    // "about.md" -> HTML at /about; "feed.xml.md" -> XML at /feed.xml
    const last = segments[segments.length - 1];
    const ext = last.includes(".") ? last.split(".").pop() : "html";
    if (last === "index") segments.pop();

    routes.push({ file, ext, segments, dynamic: segments.some(isParam) });
  }
  // Static routes beat dynamic ones.
  return routes.sort((a, b) => a.dynamic - b.dynamic);
}

const isParam = (seg) => seg.startsWith("[") && seg.endsWith("]");

function matchRoute(routes, pathname) {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  for (const route of routes) {
    if (route.segments.length !== parts.length) continue;
    const params = {};
    const ok = route.segments.every((seg, i) => {
      if (isParam(seg)) return (params[seg.slice(1, -1)] = parts[i]), true;
      return seg === parts[i];
    });
    if (ok) return { route, params };
  }
  return null;
}

async function readBody(req, limit = 1_000_000) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) throw new Error("Request body too large");
  }
  return body;
}

// Models wrap output in ``` fences no matter how nicely you ask. Strip a leading
// fence, and hold back the tail so a trailing fence can be dropped at the end.
function fenceStripper(write) {
  let head = "";
  let started = false;
  let tail = "";
  return {
    push(text) {
      if (!started) {
        head += text;
        const t = head.trimStart();
        if (t.length < 12 && !t.includes("\n")) return;
        text = head.replace(/^\s*```[\w-]*\s*\n/, "");
        started = true;
      }
      tail += text;
      if (tail.length > 8) {
        write(tail.slice(0, -8));
        tail = tail.slice(-8);
      }
    },
    end() {
      if (!started) tail += head.replace(/^\s*```[\w-]*\s*\n?/, "");
      write(tail.replace(/\n?```\s*$/, ""));
    },
  };
}

// Find the route for a path and read its spec. Returns null when nothing matches.
export async function resolveRoute(routesDir, pathname) {
  const match = matchRoute(await loadRoutes(routesDir), pathname);
  if (!match) return null;
  return {
    file: match.route.file,
    ext: match.route.ext,
    params: match.params,
    dynamic: match.route.dynamic,
    spec: await readFile(match.route.file, "utf8"),
  };
}

export { loadRoutes };

export const fallbackRoute = (pathname) => ({
  file: null,
  ext: pathname.match(/\.(\w+)$/)?.[1] || "html",
  params: {},
  spec: FALLBACK_SPEC,
});

export const contentType = (ext) => MIME[ext] ?? MIME.txt;

// Generate one response body, calling write() with each chunk as it streams in.
export async function render({ models, model, options = {}, route, request, signal, write }) {
  const context = {
    systemPrompt: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Output format: ${route.ext}\n\n<spec>\n${route.spec}\n</spec>\n\n<request>\n${JSON.stringify(request, null, 2)}\n</request>`,
        timestamp: Date.now(),
      },
    ],
  };

  const out = fenceStripper(write);
  const s = models.streamSimple(model, context, { ...options, signal });
  for await (const event of s) {
    if (event.type === "text_delta") out.push(event.delta);
  }
  out.end();
  return s.result();
}

export function createHandler({ routesDir, models, model, options = {}, hallucinate404 = true }) {
  return async function handler(req, res) {
    const url = new URL(req.url, "http://localhost");
    try {
      const matched = await resolveRoute(routesDir, url.pathname);
      if (!matched && !hallucinate404) {
        res.writeHead(404, { "content-type": MIME.txt }).end("Not found\n");
        return;
      }
      const route = matched ?? fallbackRoute(url.pathname);
      const request = {
        method: req.method,
        path: url.pathname,
        params: route.params,
        query: Object.fromEntries(url.searchParams),
        headers: {
          "content-type": req.headers["content-type"],
          "user-agent": req.headers["user-agent"],
          cookie: req.headers.cookie,
        },
        body: ["GET", "HEAD"].includes(req.method) ? undefined : await readBody(req),
      };

      // Send headers now. The body arrives as fast as the model types it.
      res.writeHead(200, {
        "content-type": contentType(route.ext),
        "cache-control": "no-store",
        "x-powered-by": "prompt.md (vibes)",
      });

      const abort = new AbortController();
      res.on("close", () => abort.abort());

      const message = await render({
        models, model, options, route, request,
        signal: abort.signal,
        write: (text) => res.write(text),
      });
      if (message.stopReason === "error") {
        console.error(`${req.method} ${url.pathname}: ${message.errorMessage}`);
        if (route.ext === "html") res.write(`\n<!-- prompt.md: the model gave up: ${message.errorMessage} -->`);
      }
      const cost = message.usage?.cost?.total ?? 0;
      console.log(`${req.method} ${url.pathname} -> ${route.file ? relative(routesDir, route.file) : "(hallucinated)"} $${cost.toFixed(4)}`);
      res.end();
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500, { "content-type": MIME.txt });
      res.end(`\n${err.message}\n`);
    }
  };
}
