import { createFileRoute } from "@tanstack/react-router";

/* Changing how somebody gets into their account.
 *
 * This has to run on the server. The sign-in address lives on auth.users and
 * the Google link lives on auth.identities; both are reachable only with the
 * service role key, which must never touch a browser. So the browser sends
 * what it wants done and this route decides whether it is allowed.
 *
 * Three things have to be true, in this order:
 *   1. the caller holds a valid session,
 *   2. that session belongs to an admin,
 *   3. they typed the unlock code.
 *
 * The code is a second lock rather than the only one: an admin who walks away
 * from an unlocked laptop should not be enough. It is read from the
 * environment, never stored in the database and never sent to the browser, so
 * the only way to have it is to have been given it.
 *
 * Set it as ADMIN_EMAIL_UNLOCK_CODE. It has no VITE_ prefix on purpose —
 * anything prefixed is compiled into the client bundle for the world to read.
 * With the variable unset the whole feature stays shut, which is the right
 * behaviour for a box that rewrites how someone signs in. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Libyan mobile: ten digits starting 091–094, the rule registration uses. */
const PHONE_RE = /^09[1-4]\d{7}$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Compares without leaking the answer in how long it takes. */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Slows a guessing run to a crawl without needing anywhere to keep a counter
 *  — this runs on workers that do not share memory. */
const pause = () => new Promise((r) => setTimeout(r, 700));

export const Route = createFileRoute("/api/admin/account-access")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const expected = process.env.ADMIN_EMAIL_UNLOCK_CODE ?? "";
        if (!expected) {
          return json({ error: "unavailable", message: "Account changes are not enabled on this environment." }, 503);
        }

        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token) return json({ error: "unauthorized" }, 401);

        let body: { code?: string; userId?: string; email?: string; phone?: string; cc?: string };
        try {
          body = await request.json();
        } catch {
          return json({ error: "bad_request" }, 400);
        }

        // 1. Who is asking?
        const { data: caller, error: callerErr } = await supabaseAdmin.auth.getUser(token);
        const callerId = caller?.user?.id;
        if (callerErr || !callerId) return json({ error: "unauthorized" }, 401);

        // 2. Are they an admin? Asked of the roles table, not of anything the
        //    browser sent — a client can claim whatever it likes.
        const { data: roles, error: roleErr } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", callerId);
        if (roleErr) return json({ error: "server_error" }, 500);
        if (!(roles ?? []).some((r) => r.role === "admin")) return json({ error: "forbidden" }, 403);

        // 3. Do they know the code?
        if (!sameSecret(String(body.code ?? ""), expected)) {
          await pause();
          return json({ error: "bad_code", message: "That code is not right." }, 403);
        }

        /* Nothing to apply means this was only the unlock step: the code is
           good, so the box may open. Nothing has changed yet. */
        const wantsEmail = body.email !== undefined;
        const wantsPhone = body.phone !== undefined;
        if (!wantsEmail && !wantsPhone) return json({ ok: true, unlocked: true });

        const userId = String(body.userId ?? "");
        if (!userId) return json({ error: "bad_request", message: "Missing account." }, 400);

        // An admin editing their own login through the support screen is
        // almost certainly a mistake, and it is the one change that could lock
        // the person making it out.
        if (userId === callerId) {
          return json({ error: "forbidden", message: "Use your own account settings for your own details." }, 403);
        }

        const email = wantsEmail ? String(body.email).trim().toLowerCase() : null;
        if (email !== null && !EMAIL_RE.test(email)) {
          return json({ error: "bad_email", message: "That does not look like an email address." }, 400);
        }

        const digits = wantsPhone ? String(body.phone).replace(/\D/g, "") : null;
        if (digits !== null && !PHONE_RE.test(digits)) {
          return json(
            { error: "bad_phone", message: "Phone must be 10 digits starting 091, 092, 093 or 094." },
            400,
          );
        }
        const cc = String(body.cc ?? "+218").trim();

        const { data: target, error: targetErr } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (targetErr || !target?.user) return json({ error: "not_found", message: "No such account." }, 404);

        const result: Record<string, unknown> = { ok: true };

        // ── The sign-in address ────────────────────────────────────────────
        let emailMoved = false;
        if (email !== null) {
          const current = (target.user.email || "").toLowerCase();
          if (current === email) {
            result.emailUnchanged = true;
          } else {
            /* email_confirm marks it verified straight away. Without it the
               account waits on a confirmation link sent to an address the
               person may well have lost — the exact situation this screen
               exists to rescue. It also has to be confirmed before Google can
               be linked to it on the next sign-in. */
            const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
              email,
              email_confirm: true,
            });
            if (updErr) {
              const dup = /already|registered|exists|duplicate/i.test(updErr.message || "");
              return json(
                {
                  error: dup ? "email_taken" : "server_error",
                  message: dup ? "Another account already uses that email." : updErr.message,
                },
                dup ? 409 : 500,
              );
            }
            emailMoved = true;
          }
          result.email = email;
        }

        // ── The phone on their profile ─────────────────────────────────────
        if (digits !== null) {
          const { error: pErr } = await supabaseAdmin
            .from("profiles")
            .update({ phone: cc + digits })
            .eq("id", userId);
          if (pErr) return json({ error: "server_error", message: pErr.message }, 500);
          result.phone = cc + digits;
        }

        /* ── Shutting the old door ──
           Runs whenever an address was submitted, including a retry where it is
           already correct: if a first attempt moved the address but failed
           here, doing it again has to be able to finish the job.

           Order matters. The address moves first, so that a failure here leaves
           the account pointing somewhere its rightful owner can reach rather
           than leaving it with no way in at all. */
        if (email !== null) {
          const { data: reset, error: resetErr } = await supabaseAdmin.rpc(
            "admin_reset_account_access" as never,
            { _user_id: userId } as never,
          );
          if (resetErr) {
            return json(
              {
                error: "revoke_failed",
                message:
                  (emailMoved ? "The email was changed, but " : "") +
                  "the old sign-in could not be cut off: " +
                  resetErr.message +
                  ". Run the pending database migration, then do this again.",
                email,
              },
              500,
            );
          }
          result.revoked = reset;
        }

        console.log("[admin] account access changed", {
          by: callerId,
          user: userId,
          email: email !== null,
          phone: digits !== null,
          revoked: result.revoked,
        });
        return json(result);
      },
    },
  },
});
