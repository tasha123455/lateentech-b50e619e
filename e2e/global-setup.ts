import { request } from "@playwright/test";
import { canProvision, ensureAccount } from "./lib/provision";

/* Before anything runs: make sure the accounts the signed-in tests need exist.
 *
 * Only when a service key was given. Without one this does nothing at all and
 * the signed-in tests skip themselves, which is what should happen on a live
 * site — the key is the thing that decides, and it is not in the repository.
 *
 * Credentials are handed to the tests through the environment of this process,
 * which the workers are started from. They are never written to a file. */
export default async function globalSetup() {
  if (!canProvision()) return;

  const api = await request.newContext(
    process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {},
  );
  try {
    for (const role of ["marketer", "business", "admin"] as const) {
      const who = await ensureAccount(api, role);
      const key = role.toUpperCase();
      // Anything set by hand wins: somebody naming a specific account meant it.
      if (!process.env[`WASLA_${key}_EMAIL`]) process.env[`WASLA_${key}_EMAIL`] = who.email;
      if (!process.env[`WASLA_${key}_PASSWORD`]) process.env[`WASLA_${key}_PASSWORD`] = who.password;
      console.log(`[accounts] ${role}: ${who.email}`);
    }
  } catch (e) {
    /* Not fatal. Throwing here ends the whole run before a single test starts,
       which is how a run asking only "can this browser subscribe to push" —
       a question needing no account at all — died in setup with nothing to
       show for it. Not being able to make accounts should cost exactly the
       tests that need accounts, and those skip themselves when the
       credentials are absent. */
    console.warn(`[accounts] could not be prepared, so the signed-in tests will skip: ${String(e)}`);
  } finally {
    await api.dispose();
  }
}
