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
          // Fallback: query via RPC-less path failed; try admin.rpc unavailable — accept only when nothing configured.
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

        const apiKey = process.env.PROGRESSIER_API_KEY;
        const progressierId = process.env.PROGRESSIER_ID ?? "nUtQboT7clW7ctdwUT0Y";
        if (!apiKey) {
          // Gracefully no-op if key not configured — the in-app notification still saved.
          console.warn("[push] PROGRESSIER_API_KEY not set; skipping push");
          return new Response(JSON.stringify({ ok: true, skipped: "no_api_key" }), {
            headers: { "content-type": "application/json" },
          });
        }

        try {
          // Progressier caps title at 50 chars and body at 100 chars — an
          // oversized value causes Progressier to reject the whole request,
          // and since this whole path is fire-and-forget (errors here never
          // surface to the admin), that rejection was silently swallowed.
          // Trim defensively so a longer admin comment can't take down the
          // entire push (title included).
          const pushTitle = (payload.title ?? "").slice(0, 50);
          const pushBody = (payload.body ?? "").slice(0, 100);

          // The photo lives inside `data`, under different keys depending on
          // notification kind: admin-composed messages use `photo`, order
          // notifications use `product_photo`. Check both so any kind of
          // notification with an attached photo shows it in the push.
          const notifData = (payload.data ?? {}) as { photo?: string; product_photo?: string };
          const image = notifData.product_photo || notifData.photo || undefined;

          const res = await fetch(`https://progressier.app/${progressierId}/send`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              recipients: { id: payload.user_id },
              title: pushTitle,
              body: pushBody,
              url: "/dashboard",
              ...(image ? { image } : {}),
            }),
          });
          const text = await res.text();
          if (!res.ok) {
            console.error("[push] Progressier error", res.status, text);
            return new Response(JSON.stringify({ ok: false, status: res.status }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          console.error("[push] fetch failed", e);
          return new Response(JSON.stringify({ ok: false }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
