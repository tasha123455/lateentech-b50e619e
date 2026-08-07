// Browser-side push notification helpers (self-hosted VAPID).
//
// Every step reports what happened. The version this replaces had six places
// where it gave up and returned nothing — a missing key, a subscription with
// no endpoint, an unsupported browser, a rejected save — and one outer catch
// that turned any thrown error into a line in a console nobody can open on a
// phone. Turning notifications on either worked or did nothing, with no way to
// tell which had happened or why, and that is why a fault that lasted hours
// could not be named.
//
// So `enablePush` returns a reason on every path, and the caller shows it.
// Nothing here is silent.
import { supabase } from "@/integrations/supabase/client";

const SW_PATH = "/sw.js";
const DEVICE_ID_KEY = "wasla_push_device_id";

/** What happened, in enough detail to act on. */
export type PushOutcome =
  | { ok: true }
  | { ok: false; reason: PushFailure; detail?: string };

export type PushFailure =
  /** This browser has no push at all. */
  | "unsupported"
  /** iOS, and the app has not been added to the home screen. */
  | "needs-install"
  /** The person said no, or the browser is refusing on their behalf. */
  | "permission-denied"
  /** The service worker would not install or activate. */
  | "worker-failed"
  /** The server did not hand over a usable key. */
  | "no-key"
  /** The browser refused to create the subscription — the push service said no. */
  | "subscribe-failed"
  /** Subscribed, but the row could not be written, so nothing can be sent. */
  | "save-failed";

/** A short, plain sentence for each, in both languages. */
export function pushFailureText(reason: PushFailure, ar: boolean): string {
  const en: Record<PushFailure, string> = {
    unsupported: "This browser cannot receive notifications.",
    "needs-install": "Add Wasla to your home screen first, then try again.",
    "permission-denied": "Notifications are blocked. Allow them for this site in your browser settings.",
    "worker-failed": "The background service could not start.",
    "no-key": "The server did not send a notification key.",
    "subscribe-failed": "Your browser's notification service refused. Check that Chrome itself is allowed to send notifications, and that you are not on a restricted network.",
    "save-failed": "Turned on, but could not be saved. Try again.",
  };
  const arabic: Record<PushFailure, string> = {
    unsupported: "هذا المتصفح ما يدعم الإشعارات.",
    "needs-install": "أضف وصلة إلى الشاشة الرئيسية، وبعدين حاول مرة ثانية.",
    "permission-denied": "الإشعارات محظورة. اسمح بها لهذا الموقع من إعدادات المتصفح.",
    "worker-failed": "ما قدرت الخدمة الخلفية تشتغل.",
    "no-key": "الخادم ما أرسل مفتاح الإشعارات.",
    "subscribe-failed": "خدمة الإشعارات في متصفحك رفضت. تأكد أن كروم نفسه مسموح له يرسل إشعارات، وأنك مش على شبكة مقيّدة.",
    "save-failed": "اتفعّلت، لكن ما انحفظت. حاول مرة ثانية.",
  };
  return (ar ? arabic : en)[reason];
}

function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
  } catch { /* ignore */ }
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try { localStorage.setItem(DEVICE_ID_KEY, id); } catch { /* ignore */ }
  return id;
}

function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** True when the app is running as an installed PWA (home-screen launch). */
export function isInstalledPWA(): boolean {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches;
  // iOS Safari exposes navigator.standalone
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return !!(standalone || iosStandalone);
}

function isIosLike(): boolean {
  try { return /iPad|iPhone|iPod/.test(navigator.userAgent); } catch { return false; }
}

/** Whether this device already holds a live subscription. */
export async function isSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
    return !!(await reg?.pushManager.getSubscription());
  } catch {
    return false;
  }
}

/**
 * Silent bootstrap: registers the worker and, only if permission was already
 * granted, refreshes the stored subscription. Never prompts. Safe on every
 * sign-in, and safe to ignore the result — nothing here is a question.
 */
export async function subscribeToPush(userId: string): Promise<PushOutcome> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  if (Notification.permission !== "granted") {
    return { ok: false, reason: "permission-denied" };
  }
  return enablePush(userId, { ask: false });
}

/**
 * Turning notifications on, deliberately.
 *
 * `ask` is what separates this from the bootstrap above: it is the only path
 * allowed to raise the browser's permission prompt, because that must follow
 * something the person actually tapped.
 */
export async function enablePush(userId: string, opts: { ask: boolean } = { ask: true }): Promise<PushOutcome> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  if (isIosLike() && !isInstalledPWA()) return { ok: false, reason: "needs-install" };

  // 1. The worker that will receive the message.
  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register(SW_PATH);
    await navigator.serviceWorker.ready;
  } catch (e) {
    return { ok: false, reason: "worker-failed", detail: String(e) };
  }

  // 2. Permission.
  let permission = Notification.permission;
  if (permission === "default" && opts.ask) {
    try { permission = await Notification.requestPermission(); }
    catch (e) { return { ok: false, reason: "permission-denied", detail: String(e) }; }
  }
  if (permission !== "granted") return { ok: false, reason: "permission-denied", detail: permission };

  // 3. The server's key.
  let desiredKey: Uint8Array;
  try {
    const res = await fetch("/api/public/notifications/vapid-public-key");
    const { publicKey } = (await res.json()) as { publicKey?: string };
    if (!publicKey) return { ok: false, reason: "no-key", detail: `status ${res.status}` };
    desiredKey = urlBase64ToUint8Array(publicKey);
    if (desiredKey.length !== 65 || desiredKey[0] !== 0x04) {
      return { ok: false, reason: "no-key", detail: `key is ${desiredKey.length} bytes` };
    }
  } catch (e) {
    return { ok: false, reason: "no-key", detail: String(e) };
  }

  // 4. The subscription itself — the step that actually talks to the push service.
  let subscription: PushSubscription | null;
  try {
    subscription = await registration.pushManager.getSubscription();
    /* A subscription made with a different key cannot receive anything we
       send, and the push service will not replace it in place — it has to be
       given up first. */
    if (subscription) {
      const existing = subscription.options?.applicationServerKey;
      const mismatch = !existing || new Uint8Array(existing).toString() !== desiredKey.toString();
      if (mismatch) {
        try { await subscription.unsubscribe(); } catch { /* ignore */ }
        subscription = null;
      }
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: desiredKey as BufferSource,
      });
    }
  } catch (e) {
    /* The name matters more than the message and survives translation, so it
       goes first: AbortError is the push service refusing, NotAllowedError is
       the browser, InvalidStateError is a subscription that would not let go. */
    const err = e as Error;
    return { ok: false, reason: "subscribe-failed", detail: `${err?.name || "Error"}: ${err?.message || String(e)}` };
  }

  const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, reason: "subscribe-failed", detail: "the subscription arrived incomplete" };
  }

  // 5. Writing it down, which is what the server reads when it sends.
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      device_id: getOrCreateDeviceId(),
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    },
    { onConflict: "device_id" },
  );
  if (error) return { ok: false, reason: "save-failed", detail: `${error.code || ""} ${error.message}`.trim() };

  return { ok: true };
}

/** Kept for the callers that expect the old name. */
export const requestPushPermissionAndSubscribe = (userId: string) => enablePush(userId, { ask: true });

/**
 * Call BEFORE `supabase.auth.signOut()` so the delete still runs with a valid
 * session (RLS scopes push_subscriptions to `user_id = auth.uid()`).
 */
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    const endpoint = subscription.endpoint;
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    await subscription.unsubscribe();
  } catch (e) {
    console.warn("[push] unsubscribe failed", e);
  }
}
