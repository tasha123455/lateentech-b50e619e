import { test as base } from "@playwright/test";
import { installRelay } from "./relay";

/**
 * The suite's own `test`, which every spec imports in place of Playwright's.
 *
 * It is Playwright's, with one thing added: a page that can reach the internet
 * even where the browser cannot. That does nothing at all unless WASLA_RELAY=1,
 * so on a laptop and on CI this is exactly `@playwright/test`.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await installRelay(page);
    await use(page);
  },
});

export { expect } from "@playwright/test";
