#!/usr/bin/env node
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { createHandler } from "../src/prompt.js";
import { build } from "../src/build.js";

const USAGE = `Usage:
  prompt.md [routes]                 Serve routes (default ./routes)
  prompt.md build [routes] [options] Render the site to static files

Build options:
  --out <dir>        Output directory (default ./dist)
  --max-pages <n>    Stop discovering pages after n (default 50)
  --concurrency <n>  Pages rendered at once (default 4)`;

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string", default: "dist" },
    "max-pages": { type: "string", default: "50" },
    concurrency: { type: "string", default: "4" },
    help: { type: "boolean", short: "h" },
  },
});

if (flags.help) {
  console.log(USAGE);
  process.exit(0);
}

const command = positionals[0] === "build" ? positionals.shift() : "serve";
const routesDir = resolve(positionals[0] ?? "routes");
const spec = process.env.MODEL;

if (!existsSync(routesDir)) {
  console.error(`No routes directory at ${routesDir}. Create it and add an index.md, or pass a different directory: prompt.md <dir>`);
  process.exit(1);
}

const models = builtinModels();
const providerIds = models.getProviders().map((p) => p.id);

if (!spec?.includes("/")) {
  console.error(`Set MODEL to provider/model-id, e.g. MODEL=anthropic/claude-sonnet-5-5\n\nProviders: ${providerIds.join(", ")}`);
  process.exit(1);
}

const [provider, ...rest] = spec.split("/");
const model = models.getModel(provider, rest.join("/"));
if (!model) {
  const known = providerIds.includes(provider) ? models.getModels(provider).map((m) => m.id).join(", ") : "(unknown provider)";
  console.error(`Unknown model "${spec}". Models for ${provider}: ${known}`);
  process.exit(1);
}

if (!(await models.getAuth(provider))) {
  const hint = {
    "cloudflare-ai-gateway": "CLOUDFLARE_API_KEY, CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_GATEWAY_ID",
    "cloudflare-workers-ai": "CLOUDFLARE_API_KEY and CLOUDFLARE_ACCOUNT_ID",
  }[provider];
  console.error(`No credentials found for ${provider}.${hint ? ` Set ${hint}.` : " Set its API key in the environment."}`);
  process.exit(1);
}

const options = {};
if (process.env.REASONING) options.reasoning = process.env.REASONING;
if (process.env.MAX_TOKENS) options.maxTokens = Number(process.env.MAX_TOKENS);
const hallucinate404 = process.env.HALLUCINATE_404 !== "0";

if (command === "build") {
  const outDir = resolve(flags.out);
  console.log(`prompt.md building ${routesDir} -> ${outDir} with ${spec}`);
  const result = await build({
    routesDir,
    outDir,
    models,
    model,
    options,
    hallucinate404,
    maxPages: Number(flags["max-pages"]),
    concurrency: Number(flags.concurrency),
  });
  console.log(`\nBuilt ${result.built} pages for $${result.cost.toFixed(4)}.`);
  if (result.skipped.length) console.log(`Not built (no route, or over --max-pages): ${result.skipped.join(", ")}`);
  if (result.failed) {
    console.error(`${result.failed} pages failed.`);
    process.exit(1);
  }
} else {
  const port = Number(process.env.PORT ?? 3000);
  createServer(createHandler({ routesDir, models, model, options, hallucinate404 })).listen(port, () => {
    console.log(`prompt.md serving ${routesDir} with ${spec} on http://localhost:${port}`);
  });
}
