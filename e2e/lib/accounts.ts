/* Credentials come from the environment, never from a file in the repo.
 *
 * .env is tracked by git in this project, so anything written there is
 * published. These are read at run time instead, from a file git is told to
 * ignore (e2e/.env.local) or from real environment variables in a terminal.
 *
 * Every signed-in spec asks for what it needs through `account()`, and skips
 * itself when that is not set — so the public tests still run for somebody who
 * has supplied nothing at all. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type RoleName = "marketer" | "business" | "admin";

export type Account = { email: string; password: string };

export function account(role: RoleName): Account | null {
  const email = process.env[`WASLA_${role.toUpperCase()}_EMAIL`];
  const password = process.env[`WASLA_${role.toUpperCase()}_PASSWORD`];
  if (!email || !password) return null;
  return { email, password };
}

/** Where the app's own browser client points.
 *
 *  Taken from the environment when it is set, and otherwise from the .env this
 *  repository already carries — the same file the app is built from, so the
 *  tests cannot end up talking to a different backend than the pages they are
 *  testing. Both values are public: the url is a public address and the
 *  publishable key is compiled into every copy of the site that is served.
 *  Nothing secret is read here, and nothing secret belongs in this file. */
export function backend(): { url: string; key: string } | null {
  const url = process.env.WASLA_SUPABASE_URL || fromDotEnv("VITE_SUPABASE_URL");
  const key = process.env.WASLA_SUPABASE_ANON_KEY || fromDotEnv("VITE_SUPABASE_PUBLISHABLE_KEY");
  return url && key ? { url, key } : null;
}

let dotEnv: Record<string, string> | null = null;

function fromDotEnv(name: string): string | undefined {
  if (!dotEnv) {
    dotEnv = {};
    // Whether this was started from e2e/ or from the repository root.
    for (const where of ["../.env", ".env"]) {
      try {
        for (const line of readFileSync(resolve(process.cwd(), where), "utf8").split("\n")) {
          const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
          if (m && !(m[1] in dotEnv)) dotEnv[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
        }
      } catch { /* not there — the environment is the only source then */ }
    }
  }
  return dotEnv[name] || undefined;
}

/** True when the suite is allowed to create and change real things.
 *  Off by default: this runs against the live database, and a robot that
 *  places orders every time it runs is a robot filling somebody's shop with
 *  rubbish. Turn it on deliberately, for one run, with WASLA_WRITES=1. */
export const writesAllowed = process.env.WASLA_WRITES === "1";
