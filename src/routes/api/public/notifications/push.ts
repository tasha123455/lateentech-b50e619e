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
          const { data, error } = await supabaseAdmin.rpc(
            "get_notifications_push_webhook_secret" as never,
          );
          if (error) {
            console.error("[push] failed to read webhook secret", error);
          } else if (typeof data === "string") {
            expected = data;
          }
        } catch (e) {
          console.error("[push] webhook secret RPC threw", e);
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

        // Self-hosted VAPID Web Push (works on Android/desktop always; iOS only
        // after the user installs the PWA to their home screen).
        const { sendWebPush, readVapidKeysFromEnv } = await import("@/lib/web-push.server");
        const vapid = readVapidKeysFromEnv();
        if (!vapid) {
          console.warn("[push] VAPID keys missing; skipping push");
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
