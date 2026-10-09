import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    "name": "prompt-md",
    "compatibilityDate": "2026-10-01",
    "domains": ["prompt-md.matthewphillips.info"],
    "observability": {
      "enabled": true
    }
  }
});
