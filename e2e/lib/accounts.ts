/* Credentials come from the environment, never from a file in the repo.
 *
 * .env is tracked by git in this project, so anything written there is
 * published. These are read at run time instead, from a file git is told to
 * ignore (e2e/.env.local) or from real environment variables in a terminal.
 *
 * Every signed-in spec asks for what it needs through `account()`, and skips
 * itself when that is not set — so the public tests still run for somebody who
 * has supplied nothing at all. */
export type RoleName = "marketer" | "business" | "admin";

export type Account = { email: string; password: string };

export function account(role: RoleName): Account | null {
  const email = process.env[`WASLA_${role.toUpperCase()}_EMAIL`];
  const password = process.env[`WASLA_${role.toUpperCase()}_PASSWORD`];
  if (!email || !password) return null;
  return { email, password };
}

/** True when the suite is allowed to create and change real things.
 *  Off by default: this runs against the live database, and a robot that
 *  places orders every time it runs is a robot filling somebody's shop with
 *  rubbish. Turn it on deliberately, for one run, with WASLA_WRITES=1. */
export const writesAllowed = process.env.WASLA_WRITES === "1";
