## Problem

Clicking **List product** (and likely a few other buttons like Save Order, Pause/Delete, Request payout) does nothing. The form's onclick handler `submitProduct()` is never reachable on `window`, so the click silently throws `ReferenceError: submitProduct is not defined`.

## Root cause

`src/components/dashboard/lateen/LateenShell.tsx` wraps the embedded dashboard script in an IIFE and then re-exports its top-level functions to `window` so inline `onclick="..."` handlers in the HTML can find them:

```ts
const names = [...src.matchAll(/^function ([A-Za-z_$][\w$]*)\s*\(/gm)].map(m => m[1]);
```

That regex only matches `function name(` — it does **not** match `async function name(`. After we made backend calls real, ~14 handlers (across the business and marketer scripts) became `async function`, including `submitProduct`, `loadProducts`, `submitOrder`, `advance`, `refreshWallet`, `refreshProfile`, etc. None of them get attached to `window`, so any inline-onclick referencing them is dead.

## Fix

Update the export-extraction in `src/components/dashboard/lateen/LateenShell.tsx` to also pick up async functions:

```ts
const names = [
  ...src.matchAll(/^(?:async\s+)?function ([A-Za-z_$][\w$]*)\s*\(/gm),
].map(m => m[1]);
```

Single-file change. After this, "List product" submits, products load and render, orders/advance/payout buttons work, and profile/wallet refresh on mount.

## Verification

- Open Business dashboard → fill product form → click **List product** → product appears in the list and in the Marketer Browse view.
- Console should be free of `submitProduct is not defined` style errors.
