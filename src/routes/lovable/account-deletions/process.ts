import { createFileRoute } from "@tanstack/react-router";

// Processes account_deletion_requests whose grace period has elapsed.
// Triggered by a pg_cron job (see migration
// 20260726020000_account_deletion_cron.sql) roughly every 15 minutes.
//
// For each due request this calls supabaseAdmin.auth.admin.deleteUser(),
// the exact same call the admin "Delete account" button in the users page
// makes (adminDeleteUserFn in admin-users.functions.ts) — so a scheduled
// deletion has identical effect to an admin manually pressing delete.
// Deleting the auth user cascades (ON DELETE CASCADE) to profiles,
// user_roles, and the account_deletion_requests row itself, so there's
// nothing to clean up manually on success.
export const Route = createFileRoute("/lovable/account-deletions/process")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Verify the shared secret from vault (matches the pg_cron job's header),
        // same pattern as /lovable/email/queue/process and the push webhook.
        const auth = request.headers.get("authorization") ?? "";
        const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!bearer) return new Response("Missing bearer", { status: 401 });

        let expected = "";
        try {
          const { data } = await supabaseAdmin
            .schema("vault" as never)
            .from("decrypted_secrets" as never)
            .select("decrypted_secret")
            .eq("name", "account_deletion_cron_secret")
            .maybeSingle();
          const row = data as { decrypted_secret?: string } | null;
          expected = row?.decrypted_secret ?? "";
        } catch {
          /* expected stays empty -> request rejected below */
        }

        if (!expected || bearer !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { data: due, error: dueErr } = await supabaseAdmin
          .from("account_deletion_requests" as never)
          .select("id, user_id, scheduled_for")
          .eq("status", "scheduled")
          .lte("scheduled_for", new Date().toISOString());

        if (dueErr) {
          console.error("[account-deletions] failed to load due requests", dueErr);
          return Response.json({ error: "Failed to load due requests" }, { status: 500 });
        }

        const rows = (due ?? []) as Array<{ id: string; user_id: string; scheduled_for: string }>;
        let processed = 0;
        const failures: Array<{ id: string; user_id: string; error: string }> = [];

        for (const row of rows) {
          try {
            const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(row.user_id);
            if (delErr) throw delErr;
            processed++;
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.error("[account-deletions] failed to delete user", { id: row.id, user_id: row.user_id, error: message });
            failures.push({ id: row.id, user_id: row.user_id, error: message });
          }
        }

        return Response.json({ ok: true, processed, failed: failures.length, failures });
      },
    },
  },
});
