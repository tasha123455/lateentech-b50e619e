// Browser-side push notification helpers. Replaces the old Progressier script tag.
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

/**
 * Registers the service worker, asks for notification permission (if not already
 * answered), subscribes this browser/device to push, and stores the subscription
 * against `userId`. Safe to call on every sign-in — it no-ops quickly if a working
 * subscription already exists.
 */
export async function subscribeToPush(userId: string): Promise<void> {
  if (!isPushSupported()) return;
  try {
    // Respect a prior "block" — don't re-prompt every login.
    if (Notification.permission === "denied") return;

    const registration = await navigator.serviceWorker.register(SW_PATH);
    await navigator.serviceWorker.ready;

    if (Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
    }
    if (Notification.permission !== "granted") return;

    const res = await fetch("/api/public/notifications/vapid-public-key");
    const { publicKey } = (await res.json()) as { publicKey?: string };
    if (!publicKey) return; // server hasn't been configured with VAPID keys yet

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
    }

    const json = subscription.toJSON() as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

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
  } catch (e) {
    console.warn("[push] subscribe failed", e);
  }
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
