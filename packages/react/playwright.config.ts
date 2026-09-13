import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  use: { baseURL: "http://127.0.0.1:4175" },
  webServer: {
    command: "npm run build:example && npm run preview:example -- --port 4175 --strictPort",
    url: "http://127.0.0.1:4175", reuseExistingServer: false,
  },
});
