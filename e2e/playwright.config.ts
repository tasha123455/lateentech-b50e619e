import { defineConfig, devices } from "@playwright/test";

/* A phone, not a laptop.
 *
 * This is not a detail. A description collapsing threw the page to the top
 * for weeks, and three separate desktop harnesses reported the page was fine:
 * the bug needed a mobile layout viewport to exist at all. Anything that runs
 * here runs at the size and with the input method the people using this app
 * actually have. */
const phone = {
  ...devices["Pixel 5"],
  viewport: { width: 412, height: 830 },
  deviceScaleFactor: 2.625,
  isMobile: true,
  hasTouch: true,
};

export default defineConfig({
  testDir: "./specs",
  /* Makes the signed-in tests' accounts when a service key is present, and does
     nothing when it is not. See global-setup.ts. */
  globalSetup: "./global-setup.ts",
  /* One at a time. These share a live database, and a second worker adding
     products while the first counts them is a test failing for reasons that
     have nothing to do with the app. */
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["html", { open: "never", outputFolder: "report" }], ["list"]],
  use: {
    baseURL: process.env.WASLA_URL || "https://wassla.online",
    /* Containers and CI images often ship a browser already. Point at it with
       WASLA_CHROMIUM rather than downloading a second copy; unset, Playwright
       uses whatever `npx playwright install` put in place, which is what a
       laptop will have. */
    ...(process.env.WASLA_CHROMIUM
      ? { launchOptions: { executablePath: process.env.WASLA_CHROMIUM } }
      : {}),
    /* Sandboxed environments route outbound traffic through a local proxy.
       A shell tool picks that up from the environment; a browser does not, so
       it is passed through explicitly. Unset — a normal laptop — nothing is
       configured and the browser talks to the network directly. */
    ...(process.env.HTTPS_PROXY
      ? {
          proxy: {
            server: process.env.HTTPS_PROXY,
            /* A dev server on this machine must never take the long way
               round. Sent through the relay, http://127.0.0.1:5199 comes back
               as the relay's own error page — which then fails every
               assertion for a reason that has nothing to do with the app. */
            bypass: "localhost,127.0.0.1,::1",
          },
        }
      : {}),
    /* Everything, every time. The point of this suite is to be able to look
       at what it saw, not only to read a pass or a fail. */
    screenshot: "on",
    video: "retain-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 20_000,
  },
  /* One project. Language is chosen by the path (/en/..., /ar/...) and not by
     the browser's locale, so the specs walk both themselves — a second project
     would only run every test twice against the same two paths. */
  projects: [{ name: "phone", use: phone }],
});
