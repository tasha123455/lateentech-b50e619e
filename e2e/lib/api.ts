/**
 * The app's own back end, driven the way the app drives it.
 *
 * Every call here goes out with one of the three test accounts' own tokens —
 * the same token their browser holds. There is no service key and no way in
 * past the row-level rules, which is the point: anything this file manages to
 * do, somebody signed in as that account could do too. A guard that stops it
 * here is a guard that works, and one that does not is a hole.
 *
 * It exists next to the browser specs rather than inside them because a state
 * machine is not a thing to test by clicking. Reaching "delivered, then
 * rejected, then re-uploaded, then approved again" through the interface would
 * be forty slow steps that fail for layout reasons; here it is four calls that
 * fail only if the rule is wrong.
 */

import { account, backend, type RoleName } from "./accounts.ts";

export type Json = Record<string, unknown>;

/** What the server said, whether or not it liked the question. */
export type Reply<T = unknown> = {
  ok: boolean;
  status: number;
  body: T;
  /** The message, when it refused. Empty when it did not. */
  error: string;
};

/* Fields and assignments written out rather than declared in the constructor
   signature: `node --experimental-strip-types` erases types without compiling,
   so a parameter property — which is a type annotation that also generates
   code — leaves nothing behind and the class comes up empty. */
export class Session {
  readonly role: RoleName;
  readonly userId: string;
  private readonly token: string;
  private readonly url: string;
  private readonly key: string;

  constructor(role: RoleName, userId: string, token: string, url: string, key: string) {
    this.role = role;
    this.userId = userId;
    this.token = token;
    this.url = url;
    this.key = key;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  private async send<T>(path: string, init: RequestInit): Promise<Reply<T>> {
    const res = await fetch(`${this.url}${path}`, init);
    const text = await res.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    const message =
      body && typeof body === "object" && body !== null
        ? String((body as Json).message ?? (body as Json).error ?? "")
        : typeof body === "string" ? body : "";
    return { ok: res.ok, status: res.status, body: body as T, error: res.ok ? "" : message || text.slice(0, 300) };
  }

  /** A database function, by the name the app calls it by. */
  rpc<T = unknown>(fn: string, args: Json = {}): Promise<Reply<T>> {
    return this.send<T>(`/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(args),
    });
  }

  select<T = unknown[]>(table: string, query: string): Promise<Reply<T>> {
    return this.send<T>(`/rest/v1/${table}?${query}`, { method: "GET", headers: this.headers() });
  }

  insert<T = unknown[]>(table: string, row: Json): Promise<Reply<T>> {
    return this.send<T>(`/rest/v1/${table}`, {
      method: "POST",
      headers: this.headers({ Prefer: "return=representation" }),
      body: JSON.stringify(row),
    });
  }

  update<T = unknown[]>(table: string, query: string, patch: Json): Promise<Reply<T>> {
    return this.send<T>(`/rest/v1/${table}?${query}`, {
      method: "PATCH",
      headers: this.headers({ Prefer: "return=representation" }),
      body: JSON.stringify(patch),
    });
  }

  delete<T = unknown[]>(table: string, query: string): Promise<Reply<T>> {
    return this.send<T>(`/rest/v1/${table}?${query}`, {
      method: "DELETE",
      headers: this.headers({ Prefer: "return=representation" }),
    });
  }

  /** Puts a file in a storage bucket, at a path, as this account.
   *
   *  The path matters as much as the bytes: the receipts bucket is fenced so
   *  that the first folder has to be the uploader's own id, which is why a
   *  made-up path uploads nothing and then cannot be signed — the dashboard
   *  asks for a signed url, gets a 400, and logs it. Callers should build the
   *  path from `userId`, the way the app's own upload does. */
  async upload(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<Reply<unknown>> {
    const res = await fetch(`${this.url}/storage/v1/object/${bucket}/${path}`, {
      method: "POST",
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.token}`,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: bytes as unknown as BodyInit,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, body: text, error: res.ok ? "" : text.slice(0, 300) };
  }
}

const cache = new Map<RoleName, Session>();

/** Signs the role in, once per run, and hands back something to call with. */
export async function session(role: RoleName): Promise<Session> {
  const had = cache.get(role);
  if (had) return had;

  const who = account(role);
  if (!who) throw new Error(`No account configured for ${role}. Set WASLA_${role.toUpperCase()}_EMAIL and _PASSWORD.`);
  const be = backend();
  if (!be) throw new Error("No backend configured. Set WASLA_SUPABASE_URL and WASLA_SUPABASE_ANON_KEY.");
  const url = be.url.replace(/\/$/, "");

  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: be.key, "Content-Type": "application/json" },
    body: JSON.stringify({ email: who.email, password: who.password }),
  });
  if (!res.ok) throw new Error(`Supabase refused the ${role} sign-in (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const s = (await res.json()) as { access_token: string; user: { id: string } };

  const made = new Session(role, s.user.id, s.access_token, url, be.key);
  cache.set(role, made);
  return made;
}

/** True when the reply is a refusal whose message says what it should. */
export function refused(r: Reply, matching: RegExp): boolean {
  return !r.ok && matching.test(r.error);
}
