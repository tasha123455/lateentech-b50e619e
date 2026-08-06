import type { Page } from "@playwright/test";

/**
 * Fetches the page's requests from node instead of from the browser.
 *
 * Only needed in a sandbox whose browser cannot reach the internet while its
 * node can — which is the case for the assistant's own environment, where curl
 * and git work and every browser gets its connection cut whatever proxy it is
 * pointed at. Without this there is no way to drive the live site from there at
 * all, and the whole suite has to wait on somebody else's machine.
 *
 * Off unless WASLA_RELAY=1. On an ordinary laptop, or on a CI runner, the
 * browser has its own perfectly good connection and this would only add a hop
 * and a chance to get something wrong.
 *
 * It is not a perfect mirror and should not be mistaken for one. Requests are
 * re-issued by node, so the browser's own connection reuse, HTTP/2 and any
 * timing that depends on them are not what a real visitor would get. What it is
 * good for is what the page does and what it draws; what it is not good for is
 * anything measured in milliseconds.
 */
export async function installRelay(page: Page): Promise<void> {
  if (process.env.WASLA_RELAY !== "1") return;

  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    if (!/^https?:/i.test(url)) return route.continue();

    try {
      const headers = { ...req.headers() };
      // Node sets these itself; passing the browser's copies confuses it.
      delete headers.host;
      delete headers["accept-encoding"];

      const res = await fetch(url, {
        method: req.method(),
        headers,
        body: req.postDataBuffer() ?? undefined,
        // A redirect is the page's business, not the relay's.
        redirect: "manual",
      });

      const out = Object.fromEntries(res.headers);
      // node has already decoded the body, so these two now describe a body
      // that no longer exists and make the browser reject what it is given.
      delete out["content-encoding"];
      delete out["content-length"];

      await route.fulfill({
        status: res.status,
        headers: out,
        body: Buffer.from(await res.arrayBuffer()),
      });
    } catch {
      // Let the browser see a failed request rather than a hung one.
      await route.abort();
    }
  });
}
