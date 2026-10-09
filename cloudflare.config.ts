import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    "name": "prompt-md",
    "compatibilityDate": "2026-10-01",
    "routes": [
      { "pattern": "prompt-md.matthewphillips.info", "customDomain": true }
    ],
    "observability": {
      "enabled": true
    }
  }
});
