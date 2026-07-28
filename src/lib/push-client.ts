// Browser-side push notification helpers (self-hosted VAPID).
import { supabase } from "@/integrations/supabase/client";

const SW_PATH = "/sw.js";

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

/**
 * Silent bootstrap: registers the SW and (only if permission was already granted
 * previously) refreshes the push subscription row. NEVER shows a permission prompt.
 * Safe to call on every sign-in.
 */
export async function subscribeToPush(userId: string): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.register(SW_PATH);
    await navigator.serviceWorker.ready;
    if (Notification.permission !== "granted") return; // never auto-prompt
    await persistSubscription(userId, registration);
  } catch (e) {
    console.warn("[push] bootstrap failed", e);
  }
}

/**
 * Explicit opt-in from a custom in-app prompt. Requests permission, subscribes,
 * and stores the subscription. Returns final permission state.
 */
export async function requestPushPermissionAndSubscribe(
  userId: string,
): Promise<NotificationPermission | "unsupported"> {
  if (!isPushSupported()) return "unsupported";
  try {
    const registration = await navigator.serviceWorker.register(SW_PATH);
    await navigator.serviceWorker.ready;
    let perm = Notification.permission;
    if (perm === "default") perm = await Notification.requestPermission();
    if (perm !== "granted") return perm;
    await persistSubscription(userId, registration);
    return "granted";
  } catch (e) {
    console.warn("[push] opt-in failed", e);
    return Notification.permission;
  }
}

async function persistSubscription(userId: string, registration: ServiceWorkerRegistration) {
  const res = await fetch("/api/public/notifications/vapid-public-key");
  const { publicKey } = (await res.json()) as { publicKey?: string };
  if (!publicKey) return;

  const desiredKey = urlBase64ToUint8Array(publicKey);

  let subscription = await registration.pushManager.getSubscription();
  // If an existing subscription was created with a different applicationServerKey
  // (e.g. a stale Progressier subscription on the same SW scope), our VAPID
  // sends will silently fail. Detect the mismatch and re-subscribe.
  if (subscription) {
    const existingKey = subscription.options?.applicationServerKey;
    const mismatch =
      !existingKey ||
      new Uint8Array(existingKey).toString() !== desiredKey.toString();
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
  const json = subscription.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

  // Reinstalling the PWA or re-subscribing always yields a brand-new endpoint
  // token, so upsert-by-endpoint alone can't dedupe it — remove this user's
  // other subscription rows first so we don't accumulate dead ones forever.
  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .neq("endpoint", json.endpoint);

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    },
    { onConflict: "endpoint" },
  );
  if (error) console.warn("[push] failed to save subscription", error);
}

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
