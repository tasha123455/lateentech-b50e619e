import { request } from "@playwright/test";
import { canProvision, removeAccounts } from "../lib/provision.ts";

/* Deletes the three accounts the suite makes for itself, and everything the
 * database hangs off them.
 *
 * Run this when the site is about to go live, together with taking the service
 * key back out of the secret store. Those two things are the whole of the
 * clearing up.
 *
 *   WASLA_SUPABASE_SERVICE_KEY=… npm run accounts:remove
 */
async function main() {
  if (!canProvision()) {
    console.error("Nothing to do: no service key, so no accounts were ever made from here.");
    process.exit(1);
  }
  const api = await request.newContext(
    process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {},
  );
  try {
    const gone = await removeAccounts(api);
    console.log(gone.length ? `Removed:\n  ${gone.join("\n  ")}` : "Already gone.");
  } finally {
    await api.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
