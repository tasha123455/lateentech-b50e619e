# Bugs found

From the run described in `TEST_MATRIX_GENERATED.md`, against the live site and
the live database, signed in as the three test accounts. Every entry here was
reproduced — nothing is listed on the strength of having read the code.

---

### [Admin] Receipts — a delivered order can be rejected, and rejecting it pays the marketer again

- **Steps to reproduce:**
  1. Marketer places an order and uploads a receipt.
  2. Admin approves it. The commission goes into the marketer's `pending`.
  3. Business confirms it, then marks it delivered.
  4. Admin calls reject on that same order.
  5. Marketer uploads a new receipt — allowed, because `rejected` is a state
     re-upload accepts. The order goes back to `pending`.
  6. Admin approves it again. The approve guard is satisfied: the order really
     is pending.
  7. The commission is added to the wallet a second time. Go back to step 4 for
     a third.
- **Expected:** rejecting an order that has already been delivered is refused.
  A receipt can only be rejected while it is waiting to be looked at.
- **Actual:** the rejection succeeds from any state. The loop has no counter.
  On a scaffold of the real functions, twenty turns turned one order worth
  **20** into **420** of pending commission — `e2e/sql/prove-the-reject-guard.sql`
  prints it.
- **Also:** the shop's `sold` and `revenue` keep counting the sale after the
  rejection, because only a refund takes those back off. The order's status and
  the shop's own figures disagree from then on, permanently.
- **Why it was there:** every other step in an order's life checks what state
  the order is in first — approve wants `pending`, confirm wants `approved`,
  deliver wants `confirmed`, refund wants one of three. `admin_reject_order_with_notes`
  checked nothing. It reads as an oversight from when the only way to reach it
  was the pending-receipts queue, where the only thing on screen is a pending
  order. That is still the only route in the interface; it is not the only
  route to the function.
- **Who can do it:** it needs an administrator with receipts access to start.
  Not something a marketer can do alone — but two clicks for an administrator
  to do by accident, and unlimited money for a dishonest one to do on purpose.
  Country-scoped administrators make the second worth taking seriously.
- **Severity:** blocks core function — money.
- **Covered by:** `e2e/specs/lifecycle.spec.ts` — X1, X2–X3, X4–X5, X6, X7.
- **Fix:** `supabase/migrations/20260806210000_reject_only_what_is_waiting.sql`.
  One guard, matching the approve function's word for word, plus a `FOR UPDATE`
  so two admins in the queue at once cannot both pass it. Nothing else in the
  function changes. **Not yet applied to the live database** — see the end of
  this file.

---

### [Marketer, Admin] Product sheet — a long product code crushes the name into a vertical column

- **Steps to reproduce:** open a product whose code is long — sixteen
  characters is enough — on a phone. Either the marketer's browse sheet or the
  admin's product review sheet.
- **Expected:** the name reads as a name.
- **Actual:** it is squeezed into a column a few characters wide and breaks
  mid-word, one or two letters per line, running down the side of the card:
  W A S / L A - / E 2 E / p r o d / u c t.
- **Why:** the header is a flex row. The code pill is `white-space: nowrap`
  and `flex-shrink: 0` — correctly, since half a product code is no use to
  anybody — so it takes whatever width it needs. The name was `flex: 1;
  min-width: 0`, so it absorbed the whole shortfall, and `overflow-wrap:
  anywhere` then broke it apart rather than letting it overflow. Measured: the
  name came out **59px wide** in the reported case, and 71px and 103px in two
  others.
- **Severity:** cosmetic, but it makes the most important text on the sheet
  unreadable.
- **Found by:** the owner, by accident, on test data. Real product codes are
  short — `LT-ZPVJDQ` — so this needed a long one to show up, which is why it
  had not been seen. A long *name* alone does not trigger it.
- **Fixed:** `src/styles/marketer-dashboard.css` and
  `src/styles/admin-dashboard.css`. The name now has `min-width: 50%` and the
  row may wrap, so the code drops onto its own line rather than crushing the
  name. Both sheets share the classes, so it is one fix in two places.
- **Covered by:** `e2e/specs/product-header.spec.ts` — five cases across both
  roles and both directions, measuring the rendered width. Confirmed to fail
  on the old stylesheet and pass on the new one.

---

### [Admin] Receipts — refunding an already-refunded order gives a misleading message

- **Steps to reproduce:** refund a delivered order, then refund it again.
- **Expected:** "This order has already been refunded".
- **Actual:** "Only approved, confirmed or delivered orders can be refunded".
- **Why:** a refund leaves the order `cancelled`, so the status check fires
  before the `refunded_at` check ever runs. The second message is unreachable.
- **Severity:** cosmetic. The refund is correctly refused; only the reason
  given is unhelpful to whoever is reading it.
- **Not fixed** — it is wording, and wording is yours to decide.

---

### [All roles] Orders — a receipt whose file is missing fails silently and noisily at once

- **Steps to reproduce:** have an order whose `receipt_url` names a file that
  is not in the bucket, then open any page that lists it.
- **Expected:** the card draws, with the receipt shown as unavailable.
- **Actual:** the page asks storage to sign the path, gets a 400, logs
  "Failed to load resource" to the console, and shows nothing where the receipt
  should be. No message to the person looking at it.
- **How it was found:** by causing it — the first version of these tests wrote
  made-up receipt paths. So this is not a state the app put itself into, and it
  may never occur. It could, though: an upload that half-fails, or a file
  removed from the bucket, leaves exactly this.
- **Severity:** edge case. Nothing is lost or miscounted; the receipt is simply
  invisible with no explanation.
- **Not fixed** — outside what was asked for, and it may not be worth code.
- **Note:** the orders my own tests damaged this way are cleared by
  `e2e/sql/clear-broken-test-receipts.sql`. Until that is run, the two "no
  console errors" tests report these 400s. They are my mess, not the app's.

---

## What was tested and found sound

Worth writing down, because "no bug" is only useful if it says what was tried.

**The money, on the ordinary paths.** Approving puts the commission in
`pending` and not in `balance`. Delivering starts the refund clock and moves
nothing. A failed delivery hands the commission over straight away, in full,
because a cancelled order can never be refunded and the money is safe. A refund
takes the sale back off the shop's `sold` and `revenue`. Each figure was
checked against the exact expected number, not merely for having changed.

**Every step refuses to be taken twice.** Approve, confirm and deliver each
reject a second attempt. So does marking an order failed. So does refunding.

**Nobody can drive somebody else's half of the deal.** A marketer cannot
approve their own receipt, cannot refund, cannot confirm or deliver the shop's
order. A shop cannot re-upload a marketer's receipt.

**The tables refuse what the functions refuse.** Writing `status` straight at
the orders table, past every function, does nothing — for the marketer and for
the business alike. A marketer cannot write their own `commission`, and cannot
rewrite `receipt_url` either: the request comes back 200 with zero rows
changed, which is row-level security doing its job quietly. This matters more
than the function guards do: it is the line that holds if a function is ever
called from somewhere new.

**Stock is checked at the door.** An order for more than the shelf holds is
refused when it is placed, not when the shop comes to confirm it — earlier and
stronger than expected, so there is never a moment where a customer has been
promised something that is not there. Quantities of zero and below are refused.

**A refund needs one of the two reasons.** No reason is refused; an invented
reason is refused. A pending or rejected order cannot be refunded, because
neither has taken any money to give back.

**Freezing a shop actually freezes it.** Every one of these was refused:
confirming an order, marking one delivered, marking one failed, editing a
product, creating a product, and — from the marketer's side — placing a new
order against it. An order already in flight is held where it was rather than
lost. This section had never been exercised before; it is sound.

**A product with live orders cannot be withdrawn.** Trying to delete one comes
back `PRODUCT_LOCKED` naming how many marketers are still selling it.

---

## Still not covered

Honest gaps, not oversights:

- **The far side of the refund window.** Refusing a refund on an order
  delivered more than two days ago, and refusing one whose commission has
  already been released. Both need `delivered_at` moved into the past, which no
  account-level token may write — correctly. Needs one hand-run SQL statement
  or a service key.
- **The forms themselves.** Everything above went at the back end, which is
  where a state machine lives. Empty submits, bad formats, double-taps and
  boundary values in the product and order forms are §2 of the plan and are
  browser work.
- **Uploads.** §4 — a real photo through the real picker, focal point, odd
  aspect ratios, unsupported types.
- **The dashboards in Arabic with rows in them.** §3 passes for the public
  pages. The dashboards have only ever been walked empty; now that there are
  orders in every state, the status tags, steppers and notification bodies can
  be read in both languages.

---

## Before this fix goes anywhere near the live database

The migration is committed but **has not been run**. It sits on the branch, not
on `main`, so nothing has applied it. That was deliberate: it changes how the
live platform behaves, and that is your call, not mine.

Two things to know when you decide:

1. The change is one guard and a row lock. It cannot affect any order that is
   travelling normally, because a receipt being rejected from the queue is
   always `pending` at that moment. The only calls it turns away are the ones
   that should never have been allowed.
2. The migration ends with a commented-out query that lists any order which
   reached `delivered` and then moved backwards — the orders this bug may
   already have damaged. It deliberately repairs nothing. Real money was added
   to a real wallet, and quietly subtracting it in a migration would be a
   second unexplained movement on top of the first. On a platform that has not
   launched, the expected result is the handful the tests made and nothing
   else.

**And separately, before launch:** delete the three test accounts. Their
password is in this repository and this repository is public.
`cd e2e && npm run accounts:remove`. `npm run tidy` clears the products and
lifts any freeze a stopped run left behind.
