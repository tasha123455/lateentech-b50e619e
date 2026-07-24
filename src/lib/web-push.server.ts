// Self-hosted Web Push sender. Replaces the old Progressier integration.
//
// Implements:
//   - RFC 8292 (VAPID)                        -> signed JWT identifying this server
//   - RFC 8291 (Message Encryption for Web Push) + RFC 8188 (aes128gcm)
//                                              -> encrypts the notification payload
//
// Everything here uses the Web Crypto API (`crypto.subtle`), which is a native,
// spec-compliant global in the Cloudflare Workers runtime — no npm dependency
// (like the Node-only `web-push` package) needed, and nothing to `npm install`.
//
// Server-only. Never import this from client code.

const te = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

export type VapidKeys = {
  /** base64url, raw uncompressed P-256 point (65 bytes). Safe to expose publicly. */
  publicKey: string;
  /** JWK (JSON Web Key) for the matching P-256 private key. Secret — server-only. */
  privateKeyJwk: JsonWebKey;
  /** "mailto:you@example.com" or "https://yoursite.com" — required by the spec, sent to push services. */
  subject: string;
};

export type PushSubscriptionRecord = {
  endpoint: string;
  p256dh: string; // base64url, client's ECDH public key (65 bytes raw)
  auth: string; // base64url, client's 16-byte auth secret
};

/**
 * Encrypts a JSON-serializable payload per RFC 8291 (aes128gcm) for a single subscription.
 * Returns the raw bytes to POST as the request body.
 */
async function encryptPayload(payloadBytes: Uint8Array, sub: PushSubscriptionRecord): Promise<Uint8Array> {
  const uaPublicRaw = fromB64url(sub.p256dh);
  const authSecret = fromB64url(sub.auth);

  const uaPublicKey = await crypto.subtle.importKey(
    "raw",
    uaPublicRaw as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  const asKeyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", asKeyPair.publicKey));

  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaPublicKey } as EcdhKeyDeriveParams, asKeyPair.privateKey, 256),
  );

  // RFC 8291 §3.3: combine the ECDH secret with the subscription's auth secret.
  const keyInfo = concat(te.encode("WebPush: info"), new Uint8Array([0]), uaPublicRaw, asPublicRaw);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  // RFC 8188 aes128gcm: per-message random salt derives the actual content-encryption key.
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cekInfo = concat(te.encode("Content-Encoding: aes128gcm"), new Uint8Array([0]));
  const nonceInfo = concat(te.encode("Content-Encoding: nonce"), new Uint8Array([0]));
  const cek = await hkdf(salt, ikm, cekInfo, 16);
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  // Single-record message: append the "last record" delimiter (0x02), no extra padding.
  const plaintext = concat(payloadBytes, new Uint8Array([2]));

  const cekKey = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, cekKey, plaintext as BufferSource),
  );

  const rs = 4096; // record size, must be > plaintext length + 17
  const rsBytes = new Uint8Array(4);
  new DataView(rsBytes.buffer).setUint32(0, rs, false);
  const idlen = new Uint8Array([asPublicRaw.length]);

  // aes128gcm header (RFC 8188 §2.1): salt | rs | idlen | keyid, then the ciphertext.
  return concat(salt, rsBytes, idlen, asPublicRaw, ciphertext);
}

async function buildVapidAuthHeader(endpoint: string, vapid: VapidKeys): Promise<string> {
  const url = new URL(endpoint);
  const aud = `${url.protocol}//${url.host}`;
  const now = Math.floor(Date.now() / 1000);

  const header = { typ: "JWT", alg: "ES256" };
  const claims = { aud, exp: now + 12 * 3600, sub: vapid.subject };
  const encHeader = b64url(te.encode(JSON.stringify(header)));
  const encClaims = b64url(te.encode(JSON.stringify(claims)));
  const signingInput = `${encHeader}.${encClaims}`;

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    vapid.privateKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, te.encode(signingInput)),
  );

  const jwt = `${signingInput}.${b64url(sig)}`;
  return `vapid t=${jwt}, k=${vapid.publicKey}`;
}

export type SendResult =
  | { ok: true }
  | { ok: false; gone: true } // 404/410 — subscription is dead, caller should delete it
  | { ok: false; gone: false; status: number; body: string };

/**
 * Sends one push message to one subscription. Caller is responsible for looking up
 * subscriptions and deleting ones where `gone: true` comes back.
 */
export async function sendWebPush(
  sub: PushSubscriptionRecord,
  payload: Record<string, unknown>,
  vapid: VapidKeys,
): Promise<SendResult> {
  const payloadBytes = te.encode(JSON.stringify(payload));
  const body = await encryptPayload(payloadBytes, sub);
  const authHeader = await buildVapidAuthHeader(sub.endpoint, vapid);

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
      Authorization: authHeader,
    },
    body: body as BodyInit,
  });

  if (res.status === 404 || res.status === 410) {
    return { ok: false, gone: true };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, gone: false, status: res.status, body: text };
  }
  return { ok: true };
}

/** Reads VAPID keys from environment. Returns null if not configured (caller should no-op). */
export function readVapidKeysFromEnv(): VapidKeys | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateJwkRaw = process.env.VAPID_PRIVATE_KEY_JWK;
  const subject = process.env.VAPID_SUBJECT || "mailto:support@lateen.online";
  if (!publicKey || !privateJwkRaw) return null;
  try {
    const privateKeyJwk = JSON.parse(privateJwkRaw) as JsonWebKey;
    return { publicKey, privateKeyJwk, subject };
  } catch {
    return null;
  }
}
