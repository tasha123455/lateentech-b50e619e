## Goal

Undo the last change to the install banner, keep the notification-prompt changes.

## Change

**`src/components/InstallPrompt.tsx`** — remove the 4-second fallback timer added in the last turn (the one that force-shows the "Add to Home Screen" hint when the browser never fires the install event). Restore the original cleanup block so the banner only appears when:
- the browser fires `beforeinstallprompt` (or it was stashed on `window.__waslaBIP`), or
- the visitor is on iOS Safari (manual Share → Add to Home Screen hint).

## Kept as-is

**`src/components/NotificationConsentModal.tsx`** — no changes:
- asks on the first visit for signed-in users (in-browser, not only installed app),
- iOS still requires the installed home-screen app before asking,
- after "Not now", it reappears every 20 visits until notifications are turned on.
