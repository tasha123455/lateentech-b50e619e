import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/notifications/push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Verify shared secret from vault (matches the DB trigger's header).
        const auth = request.headers.get("authorization") ?? "";
        const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!bearer) return new Response("Missing bearer", { status: 401 });

        let expected = "";
        try {
          const { data } = await supabaseAdmin
            .schema("vault" as never)
            .from("decrypted_secrets" as never)
            .select("decrypted_secret")
            .eq("name", "notifications_push_webhook_secret")
            .maybeSingle();
          const row = data as { decrypted_secret?: string } | null;
          expected = row?.decrypted_secret ?? "";
        } catch {
          // Fallback: query via RPC-less path failed; accept only when nothing configured.
        }

        if (!expected || bearer !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        let payload: {
          user_id?: string;
          title?: string;
          body?: string;
          id?: string;
          kind?: string;
          data?: Record<string, unknown> | null;
        };
        try {
          payload = await request.json();
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        if (!payload.user_id || !payload.title) {
          return new Response("Missing fields", { status: 400 });
        }

        // Prefer Zapier → Progressier when configured.
        const zapierWebhookUrl = process.env.ZAPIER_WEBHOOK_URL;
        if (zapierWebhookUrl) {
          const notifData = (payload.data ?? {}) as { photo?: string; product_photo?: string };
          const image = notifData.product_photo || notifData.photo || undefined;

          try {
            await fetch(zapierWebhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              mode: "no-cors",
              body: JSON.stringify({
                timestamp: new Date().toISOString(),
                triggered_from: "wasla_push_webhook",
                user_id: payload.user_id,
                notification_id: payload.id,
                kind: payload.kind,
                title: (payload.title ?? "").slice(0, 120),
                body: (payload.body ?? "").slice(0, 300),
                image,
                url: "/dashboard",
                data: payload.data,
              }),
            });
          } catch (e) {
            console.error("[push] Zapier forward failed", e);
          }

          // no-cors hides the response status, so we assume accepted and tell the caller to
          // check the Zap's run history in Zapier.
          return new Response(
            JSON.stringify({ ok: true, forwarded_to: "zapier", note: "verify in Zap run history" }),
            { headers: { "content-type": "application/json" } },
          );
        }

        // Fallback: self-hosted VAPID push (legacy).
        const { sendWebPush, readVapidKeysFromEnv } = await import("@/lib/web-push.server");
        const vapid = readVapidKeysFromEnv();
        if (!vapid) {
          console.warn("[push] ZAPIER_WEBHOOK_URL not set and VAPID keys missing; skipping push");
          return new Response(JSON.stringify({ ok: true, skipped: "no_push_provider" }), {
            headers: { "content-type": "application/json" },
          });
        }

        const pushTitle = (payload.title ?? "").slice(0, 120);
        const pushBody = (payload.body ?? "").slice(0, 300);
        const notifData = (payload.data ?? {}) as { photo?: string; product_photo?: string };
        const image = notifData.product_photo || notifData.photo || undefined;

        const { data: subs, error: subsErr } = await supabaseAdmin
          .from("push_subscriptions")
          .select("id, endpoint, p256dh, auth")
          .eq("user_id", payload.user_id);

        if (subsErr) {
          console.error("[push] failed to load subscriptions", subsErr);
          return new Response(JSON.stringify({ ok: false, error: "subscriptions_lookup_failed" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (!subs || subs.length === 0) {
          return new Response(JSON.stringify({ ok: true, sent: 0 }), {
            headers: { "content-type": "application/json" },
          });
        }

        const notifPayload = {
          title: pushTitle,
          body: pushBody,
          url: "/dashboard",
          id: payload.id,
          ...(image ? { image } : {}),
        };

        let sent = 0;
        let failed = 0;
        const staleIds: string[] = [];

        await Promise.all(
          subs.map(async (row) => {
            try {
              const result = await sendWebPush(
                { endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth },
                notifPayload,
                vapid,
              );
              if (result.ok) {
                sent += 1;
              } else if (result.gone) {
                staleIds.push(row.id);
              } else {
                failed += 1;
                console.error("[push] send failed", result.status, result.body);
              }
            } catch (e) {
              failed += 1;
              console.error("[push] send threw", e);
            }
          }),
        );

        if (staleIds.length > 0) {
          const { error: delErr } = await supabaseAdmin.from("push_subscriptions").delete().in("id", staleIds);
          if (delErr) console.error("[push] failed to clean up stale subscriptions", delErr);
        }

        return new Response(JSON.stringify({ ok: true, sent, failed, removed: staleIds.length }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
