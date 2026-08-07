/**
 * Does subscribing to push actually work, and if not, what does the browser say?
 *
 * Push notifications stopped after the domain moved. Everything that could be
 * checked from outside a browser was checked and was fine: the webhook returns
 * 200, the table takes an insert from an ordinary signed-in account, the
 * constraint the upsert needs is there, the row-level rule is right, sw.js is
 * served correctly, and the VAPID key decodes to a valid P-256 point. What was
 * left was the one step that happens inside the browser — pushManager.subscribe
 * — and no amount of reading the code answers what it throws.
 *
 * So this runs it. It needs a browser with a real connection to the push
 * service, which a sandbox behind a request relay cannot give it: the
 * subscription is negotiated over the browser's own channel, not over anything
 * a test can proxy. On a GitHub runner it is an ordinary machine on an ordinary
 * connection, so the call either succeeds or fails for a real reason, and the
 * reason gets printed.
 *
 * It asserts nothing about success. A failure here is the finding, not an
 * error in the test — the point is to read the message.
 */

import { expect, test } from "../lib/test";
import { account, backend } from "../lib/accounts";

test("what happens when this browser subscribes to push", async ({ page, context }) => {
  test.skip(!account("marketer"), "set WASLA_MARKETER_EMAIL / _PASSWORD to run this");
  test.skip(!!process.env.WASLA_RELAY, "needs a browser with its own connection — the relay cannot carry a push subscription");

  await context.grantPermissions(["notifications"]);

  /* Signed in, because persistSubscription writes the row as the user. */
  const be = backend()!;
  const who = account("marketer")!;
  const res = await page.request.post(`${be.url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: be.key, "Content-Type": "application/json" },
    data: { email: who.email, password: who.password },
  });
  const session = await res.json();
  const ref = new URL(be.url).hostname.split(".")[0];
  await page.addInitScript(([k, v]) => {
    try { localStorage.setItem(k, v); localStorage.setItem("lateen_lang", "en"); } catch { /* ignore */ }
  }, [`sb-${ref}-auth-token`, JSON.stringify(session)] as const);

  await page.goto("/en/dashboard");
  await page.waitForTimeout(4000);

  const report = await page.evaluate(async () => {
    const step: Record<string, unknown> = {};
    try {
      step.permission = Notification.permission;
      step.secureContext = window.isSecureContext;
      step.origin = location.origin;

      const reg = await navigator.serviceWorker.register("/sw.js");
      step.registered = true;
      step.scope = reg.scope;

      await navigator.serviceWorker.ready;
      step.ready = true;
      step.active = !!reg.active;

      const r = await fetch("/api/public/notifications/vapid-public-key");
      const { publicKey } = await r.json();
      step.keyFetched = !!publicKey;

      const pad = "=".repeat((4 - (publicKey.length % 4)) % 4);
      const b64 = (publicKey + pad).replace(/-/g, "+").replace(/_/g, "/");
      const raw = atob(b64);
      const key = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) key[i] = raw.charCodeAt(i);
      step.keyBytes = key.length;

      const existing = await reg.pushManager.getSubscription();
      step.hadExisting = !!existing;
      if (existing) await existing.unsubscribe();

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key as BufferSource,
      });
      step.subscribed = true;
      const json = sub.toJSON() as { endpoint?: string; keys?: Record<string, string> };
      step.endpointHost = json.endpoint ? new URL(json.endpoint).host : null;
      step.hasKeys = !!(json.keys?.p256dh && json.keys?.auth);

      // And the part that writes it down, which is what the server reads.
      const { supabase } = await import("/src/integrations/supabase/client.ts").catch(() => ({ supabase: null })) as { supabase: unknown };
      step.couldImportClient = !!supabase;
    } catch (e) {
      step.threw = String(e);
      step.name = (e as Error)?.name;
    }
    return step;
  });

  // eslint-disable-next-line no-console
  console.log("PUSH-SUBSCRIBE-REPORT " + JSON.stringify(report, null, 2));
  expect(report, "the browser reported nothing at all").toBeTruthy();
});
