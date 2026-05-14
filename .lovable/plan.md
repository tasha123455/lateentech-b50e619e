## Problem

On the business dashboard, when you tap **Products** or **Orders** in the bottom nav, the content shows up far down the screen with no left/right padding, instead of starting at the top like the Home page.

## Root cause

In `src/components/dashboard/lateen/business.body.html`, the page sections are nested wrong:

```text
<div outer wrapper, min-height:860px>
  <div class="app" padding + min-height:860px>
     <div id="pg-home"> ... </div>
  </div>          <-- .app closes here
  <div id="pg-products"> ... </div>   <-- OUTSIDE .app
  <div id="pg-orders"> ... </div>     <-- OUTSIDE .app
  <div id="pg-notif"> ... </div>      <-- OUTSIDE .app
</div>
```

Because `.app` has `min-height: 860px` and reserves all the padding, when Home is hidden `.app` still occupies ~860px of empty space, and Products / Orders / Notifications render *below* it, with no horizontal padding. That's exactly the "pushed down" behavior on screen.

## Fix

Move the closing `</div>` of `.app` so it wraps all four page sections (`pg-home`, `pg-products`, `pg-orders`, `pg-notif`). Concretely in `business.body.html`:

- Remove the stray `</div>` at line 350 (the one that closes `.app` right after `pg-home`).
- Add a matching `</div>` just before line 403 (right after `pg-notif` closes), so `.app` now wraps every page.

No CSS, JS, or business logic changes — purely structural HTML so each page inherits `.app`'s padding and the only-one-page-visible layout collapses correctly.

## Files

- `src/components/dashboard/lateen/business.body.html`

## Verification

After the edit I'll screenshot `/dashboard` on the current viewport (559×1866) and switch to Products and Orders to confirm both pages start right under the topbar with proper side padding, matching the Home page position.
