import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 45000,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    channel: process.platform === "win32" ? "msedge" : undefined,
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        process.platform === "win32"
          ? "..\\.venv\\Scripts\\python.exe -B ..\\scripts\\browser_backend.py"
          : "../.venv/bin/python -B ../scripts/browser_backend.py",
      url: "http://127.0.0.1:8000/api/school-branding/",
      reuseExistingServer: false,
      timeout: 90000,
    },
    {
      command:
        "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
