import type { APIRequestContext } from "@playwright/test";
import { backend, serviceKey, type RoleName } from "./accounts.ts";

/* Making the accounts the signed-in tests need, instead of asking a person to.
 *
 * This runs only when a service key is present, and a service key can read and
 * change everything in the database — so what it does is kept small, named, and
 * confined to this file. It makes three accounts, on a domain that cannot
 * receive mail, and gives each the role its tests need. It creates nothing else
 * and deletes nothing it did not create.
 *
 * Everything here is done the way the site's own back end would do it: a role
 * row, a wallet row, a profile filled in. There is no new door in the app, and
 * nothing here is reachable from a browser. */

/** example.com is reserved by the RFCs and can never receive mail, so these
 *  addresses cannot reach a person, be signed in to from a inbox link, or be
 *  mistaken for a customer. It is also a shape every address validator accepts,
 *  which `.invalid` is not always. */
const TEST_EMAIL = (role: RoleName) => `wasla-e2e-${role}@example.com`;

/** Not a secret — these accounts exist only on a pre-launch database and can
 *  only be reached by somebody who already holds the service key. It is fixed
 *  rather than random so a run can find the accounts a previous run made, and
 *  so the orders they place accumulate into something worth looking at. */
const TEST_PASSWORD = "wasla-e2e-Ln7Qx24pR!";

export type TestAccount = { email: string; password: string; id: string };

type Http = {
  get: (p: string) => Promise<unknown>;
  post: (p: string, body: unknown, prefer?: string) => Promise<unknown>;
  patch: (p: string, body: unknown) => Promise<unknown>;
  del: (p: string) => Promise<void>;
};

function http(api: APIRequestContext, base: string, key: string): Http {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  const check = async (what: string, res: { ok(): boolean; status(): number; text(): Promise<string> }) => {
    if (!res.ok()) throw new Error(`${what} → ${res.status()}: ${(await res.text()).slice(0, 300)}`);
    const body = await res.text();
    return body ? JSON.parse(body) : null;
  };
  return {
    get: async (p) => check(`GET ${p}`, await api.get(base + p, { headers })),
    post: async (p, data, prefer) =>
      check(`POST ${p}`, await api.post(base + p, { headers: prefer ? { ...headers, Prefer: prefer } : headers, data })),
    patch: async (p, data) => check(`PATCH ${p}`, await api.patch(base + p, { headers, data })),
    del: async (p) => { await check(`DELETE ${p}`, await api.delete(base + p, { headers })); },
  };
}

/** True when this run is allowed to make its own accounts. */
export function canProvision(): boolean {
  return !!backend() && !!serviceKey();
}

/**
 * The account for a role, made if it is not there yet.
 *
 * Safe to call on every run: an account that already exists is found and
 * reused, so the products and orders it has built up survive from one run to
 * the next.
 */
export async function ensureAccount(api: APIRequestContext, role: RoleName): Promise<TestAccount> {
  const be = backend();
  const key = serviceKey();
  if (!be || !key) throw new Error("ensureAccount needs the backend and a service key");

  const auth = http(api, be.url.replace(/\/$/, ""), key);
  const rest = http(api, be.url.replace(/\/$/, "") + "/rest/v1", key);
  const email = TEST_EMAIL(role);

  let id = await findUser(auth, email);
  if (!id) {
    const made = (await auth.post("/auth/v1/admin/users", {
      email,
      password: TEST_PASSWORD,
      // No inbox exists for these, and none is needed: confirming here is what
      // makes the account usable without one.
      email_confirm: true,
    })) as { id: string };
    id = made.id;
  } else {
    // The password is the whole way in, so it is re-asserted rather than
    // assumed — an account left over from an older run may not have this one.
    await auth.patch(`/auth/v1/admin/users/${id}`, { password: TEST_PASSWORD });
  }

  await giveRole(rest, id, email, role);
  return { email, password: TEST_PASSWORD, id };
}

/** The user id for an email, or null. Pages through the admin list rather than
 *  relying on a filter parameter, which differs between versions of the auth
 *  server and fails quietly when it is not understood. */
async function findUser(auth: Http, email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const body = (await auth.get(`/auth/v1/admin/users?page=${page}&per_page=200`)) as {
      users?: { id: string; email?: string }[];
    };
    const users = body.users ?? [];
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (users.length < 200) return null;
  }
  return null;
}

async function giveRole(rest: Http, id: string, email: string, role: RoleName) {
  /* A profile row is made by a trigger the moment the account exists, so this
     fills it in rather than creating it. The details are the ones the sign-up
     form would have collected. */
  await rest.patch(`/profiles?id=eq.${id}`, {
    full_name: `Wasla ${role} test`,
    phone: "+218910000000",
    country: "LY",
    city: "Tripoli",
    ...(role === "business" ? { business_name: "Wasla test shop" } : {}),
  });

  if (role === "admin") {
    /* An admin is invited by email before they ever sign in, and claims the
       invitation on arrival. Writing the invitation is what the Admins page
       does; claiming it is what the app already does by itself. */
    await rest.post(
      "/admin_accounts",
      {
        email,
        full_name: "Wasla admin test",
        phone: "+218910000000",
        markets: ["LY"],
        pages: ["users", "products", "orders", "receipts", "payouts", "reports", "admins"],
        active: true,
      },
      "resolution=merge-duplicates",
    );
    return;
  }

  await rest.post("/user_roles", { user_id: id, role }, "resolution=ignore-duplicates");
  await rest.post("/wallets", { user_id: id }, "resolution=ignore-duplicates");
}

/** Removes the three accounts and everything that hangs off them.
 *
 *  Not called by any test. It is here so that clearing up is one command rather
 *  than an afternoon in the dashboard, for the day the site goes live and these
 *  should no longer exist. */
export async function removeAccounts(api: APIRequestContext): Promise<string[]> {
  const be = backend();
  const key = serviceKey();
  if (!be || !key) throw new Error("removeAccounts needs the backend and a service key");

  const auth = http(api, be.url.replace(/\/$/, ""), key);
  const rest = http(api, be.url.replace(/\/$/, "") + "/rest/v1", key);
  const gone: string[] = [];

  for (const role of ["marketer", "business", "admin"] as const) {
    const email = TEST_EMAIL(role);
    if (role === "admin") await rest.del(`/admin_accounts?email=eq.${encodeURIComponent(email)}`);
    const id = await findUser(auth, email);
    if (!id) continue;
    await auth.del(`/auth/v1/admin/users/${id}`);
    gone.push(email);
  }
  return gone;
}
