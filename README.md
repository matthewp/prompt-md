# prompt.md

**The prompt-native web framework.**

For thirty years, web development has meant translating what you want into code a computer can execute. prompt.md removes the translation step. You describe each page in plain English, and prompt.md produces the response at request time using the language model of your choice.

There are no components, no templates and no build step. Your Markdown files are the application.

```md
<!-- routes/index.md -->
The homepage for a neighborhood bakery. Show today's specials,
opening hours, and a button to order a birthday cake.
```

```sh
npx prompt.md
```

That's the whole app.

## Why prompt.md

**Zero code.** Every line of code is a liability: something to test, review, secure and maintain. A prompt.md application has no code to maintain.

**Always fresh.** Traditional frameworks serve the same output until someone deploys a change. prompt.md generates every response at request time, so every visitor gets a page made for them.

**Complete URL coverage.** With most frameworks, any URL you didn't plan for returns a 404. prompt.md works out what the visitor was looking for and serves it, so dead links can't happen.

**Provider-agnostic.** prompt.md runs on [pi-ai](https://www.npmjs.com/package/@earendil-works/pi-ai) and supports Anthropic, OpenAI, Google, OpenRouter, Cloudflare AI Gateway, Groq, Mistral, xAI and dozens more. Switching vendors takes one environment variable.

**Streaming by default.** Responses stream to the browser as they are generated. Users see content arrive in real time.

**Stateless architecture.** prompt.md keeps no database, session store or cache, so it has none to provision.

## Quick start

You need Node.js 20.12 or later and an API key for any supported provider.

```sh
mkdir my-app && cd my-app
mkdir routes
echo "A landing page for a productivity app called Tempo." > routes/index.md

export OPENROUTER_API_KEY=sk-or-...
MODEL=openrouter/anthropic/claude-haiku-5.5 npx prompt.md
```

Open http://localhost:3000.

To install it globally instead:

```sh
npm install -g prompt.md
prompt.md            # serves ./routes
prompt.md site/      # serves ./site
prompt.md build      # renders ./routes to ./dist
```

## Routing

prompt.md uses file-based routing. Each `.md` file in your routes directory becomes a URL.

| File | URL |
|---|---|
| `routes/index.md` | `/` |
| `routes/about.md` | `/about` |
| `routes/docs/index.md` | `/docs` |
| `routes/docs/install.md` | `/docs/install` |
| `routes/blog/[slug].md` | `/blog/:slug` |

Static routes take priority over dynamic ones. Route files are read on every request, so edits take effect immediately without a restart.

### Dynamic routes

Wrap a path segment in brackets to capture it. The value is passed to the model by name:

```md
<!-- routes/products/[id].md -->
A product detail page. `id` is the product's SKU. Show a photo placeholder,
price, a description and an Add to Cart button.
```

### Response formats

Routes produce HTML by default. To serve another format, include its extension before `.md`:

| File | URL | Content-Type |
|---|---|---|
| `routes/feed.xml.md` | `/feed.xml` | `application/xml` |
| `routes/api/users.json.md` | `/api/users.json` | `application/json` |
| `routes/robots.txt.md` | `/robots.txt` | `text/plain` |
| `routes/styles.css.md` | `/styles.css` | `text/css` |

Also supported: `.js`, `.svg` and `.csv`.

### Handling requests

The model receives each request's method, path, route parameters, query string, content type, user agent, cookies and body. To handle a form, describe what should happen:

```md
<!-- routes/contact.md -->
A contact form with name, email and message fields that POSTs to /contact.

On POST, thank the sender by name and confirm we'll reply to their email
within two business days.
```

### Unmatched URLs

When no route file matches, prompt.md infers the intended page from the URL and generates it. To return a standard 404 instead, set `HALLUCINATE_404=0`.

## Writing good routes

A route file is a brief for a very fast, very literal designer.

- **Say what the page is for.** "A pricing page for a B2B analytics tool with three tiers" works better than "pricing".
- **Say what must appear.** List required sections, links and calls to action.
- **Set the tone.** "Warm and casual" or "clinical and precise" changes the result more than you'd expect.
- **Describe state honestly.** prompt.md has no database. When a page needs data, the model supplies plausible data.

## Configuration

prompt.md is configured with environment variables.

| Variable | Description |
|---|---|
| `MODEL` | **Required.** `provider/model-id`, for example `anthropic/claude-sonnet-5-5`. |
| `PORT` | Port to listen on. Defaults to `3000`. |
| `REASONING` | Thinking level: `minimal`, `low`, `medium`, `high`, `xhigh` or `max`, depending on the model. Higher levels improve quality but delay the first byte. |
| `MAX_TOKENS` | Maximum length of each response. |
| `HALLUCINATE_404` | Set to `0` to return 404 for unmatched URLs. |

If `MODEL` names an unknown model, prompt.md lists the valid IDs for that provider. If the provider's credentials are missing, it says which variables to set.

### Providers

Credentials are read from the provider's usual environment variable.

```sh
# Anthropic
ANTHROPIC_API_KEY=... MODEL=anthropic/claude-sonnet-5-5 prompt.md

# OpenAI
OPENAI_API_KEY=... MODEL=openai/gpt-5-mini prompt.md

# OpenRouter (keep the model's own slash)
OPENROUTER_API_KEY=... MODEL=openrouter/anthropic/claude-haiku-5.5 prompt.md

# Cloudflare AI Gateway
CLOUDFLARE_API_KEY=... CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_GATEWAY_ID=... \
  MODEL=cloudflare-ai-gateway/claude-sonnet-5-5 prompt.md
```

For Cloudflare AI Gateway, `CLOUDFLARE_API_KEY` is a Cloudflare API token. It authenticates to the gateway, and the upstream provider is paid through the gateway's unified billing or a provider key stored in the gateway. Model IDs come in three forms: Anthropic (`claude-sonnet-5-5`), OpenAI (`gpt-5-mini`) and Workers AI (`workers-ai/@cf/zai-org/glm-5.3-flash`).

See the [pi-ai documentation](https://www.npmjs.com/package/@earendil-works/pi-ai) for the full provider list.

## Static generation

For sites that don't need per-request generation, prompt.md can render everything ahead of time and write plain files you can deploy to any static host.

```sh
MODEL=openrouter/anthropic/claude-haiku-5.5 npx prompt.md build
```

The build starts with every static route, then follows the links in each generated page. Dynamic routes are rendered for every value the site actually links to: if your homepage links to `/blog/launch-day`, `routes/blog/[slug].md` is rendered with `slug: "launch-day"`. Links to URLs with no route file are generated the same way the dev server generates them, so the static site has complete URL coverage too.

| Option | Default | |
|---|---|---|
| `--out <dir>` | `dist` | Output directory. Emptied before each build. |
| `--max-pages <n>` | `50` | Stop discovering new pages after this many. |
| `--concurrency <n>` | `4` | Pages rendered in parallel. |

Pages are written with clean URLs. `/about` becomes `about/index.html`, and routes with an extension are written as-is, so `/feed.xml` becomes `feed.xml`. The build prints the cost of each page and the total.

Static output is generated once, so every visitor sees the same version of each page. Run the build again to get a new site. Forms that POST need the dev server.

### Deploying to Cloudflare Workers

`dist/` is plain HTML, so it can be served as a Worker's static assets. With the [`cf` CLI](https://www.npmjs.com/package/cf), add a `cloudflare.config.ts` that names the Worker and a `wrangler.config.ts` that points `assetsDirectory` at `dist`, install `cf` and `wrangler` as dev dependencies, then:

```sh
npm run build && cf deploy
```

To check the build first, `cf dev` serves `dist/` locally on the same runtime, at http://localhost:8787.

This repository's own site is deployed this way. See `cloudflare.config.ts` and `wrangler.config.ts`.

## Using it as a library

`createHandler` returns a standard Node request handler, so prompt.md can be mounted in an existing server:

```js
import { createServer } from "node:http";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { createHandler } from "prompt.md";

const models = builtinModels();
const model = models.getModel("anthropic", "claude-sonnet-5-5");

createServer(createHandler({ routesDir: "./routes", models, model })).listen(3000);
```

## Observability

Each request is logged with the route that handled it and its cost in US dollars:

```
GET /about -> about.md $0.0031
GET /careers/senior-wizard -> (hallucinated) $0.0044
```

## Production considerations

- **Caching.** prompt.md sends `Cache-Control: no-store`, so every visitor gets their own response.
- **Status codes.** Every response is a 200.
- **Consistency.** Two requests to the same URL may produce different pages. Plan your QA process with this in mind.
- **Cost.** Every page view is an inference request. Your hosting bill scales with your traffic and is paid to your model provider.
- **Security.** Request data, including the body, is passed to the model. Treat route files and their output with the same care as any other untrusted input.

## License

MIT
