# Test matrix — built from the code, not from the checklist

Phase 1 of `TEST_PLAN.md` §0.5. Every state and guard below was read out of
`supabase/migrations/` and `src/lib/lateen-api.ts` rather than guessed, so the
"shouldn't be possible" rows are the ones the code actually leaves open, not
ones invented to look thorough.

## The order state machine, as the database enforces it

```
                 marketer places order + uploads receipt
                                  │
                                  ▼
                              pending ──────────── admin rejects ──────────▶ rejected
                                  │                                             │
                          admin approves                              marketer re-uploads
                       (commission → wallet.pending)                            │
                                  │                                             ▼
                                  ▼                                         pending
                              approved ─────── business marks failed ──▶ cancelled
                                  │                                  (commission released
                       business confirms                              to wallet.balance)
                                  │
                                  ▼
                             confirmed ─────── business marks failed ──▶ cancelled
                                  │
                       business marks delivered
                     (delivered_at set; clock starts)
                                  │
                                  ▼
                             delivered
                                  │
                    ┌─────────────┴──────────────┐
        inside refund window            window elapsed (2 days, LY)
        admin refunds                   release_matured_commission()
              │                         moves pending → balance
              ▼                                   │
         cancelled                                ▼
   (refunded_at, reason)              commission withdrawable, refund refused
```

### The guard on every transition

| Function | Who | Status guard | Other guards |
|---|---|---|---|
| `admin_approve_order` | `admin_can('adm-receipts')` | `= 'pending'` | product exists |
| `admin_reject_order_with_notes` | `admin_can('adm-receipts')` | **none** | order exists |
| `marketer_reupload_receipt` | order's own marketer | `IN ('rejected','pending')` | receipt url non-empty |
| `confirm_order` | order's `business_id` | `= 'approved'` | not frozen; stock; variants |
| `mark_delivered` | order's `business_id` | `= 'confirmed'` | not frozen |
| `mark_failed` | order's `business_id` | `NOT IN ('cancelled','rejected','delivered')` | not frozen |
| `admin_refund_order` | `admin_can('adm-receipts')` | `IN ('approved','confirmed','delivered')` | reason ∈ {not_delivered, wrong_item}; not already refunded; inside window; commission not released |

**The missing guard is the whole point of this matrix.** Every sibling constrains
the status it will act on. `admin_reject_order_with_notes` constrains nothing —
it is written as if `pending` were the only status that could ever reach it,
which was true when the only way to open it was the pending-receipts queue.

## §1 — Order lifecycle

### Happy path
| # | Case | Expect |
|---|---|---|
| L1 | pending → approved → confirmed → delivered | each step succeeds; commission lands in `pending`, not `balance` |
| L2 | after approve, marketer wallet `pending` rises by `commission × qty` | exact figure |
| L3 | after deliver, wallet unchanged; `delivered_at` set | the window has started, money has not moved |
| L4 | after deliver, product `sold` +qty and `revenue` +unit_price×qty | analytics move only on delivery |

### Rejection and re-upload
| # | Case | Expect |
|---|---|---|
| L5 | pending → rejected | marketer notified; no wallet movement |
| L6 | rejected → re-upload → pending | allowed; back in the admin queue |
| L7 | rejected → approve | refused (`Order is not pending`) |
| L8 | re-upload with empty url | refused |
| L9 | re-upload somebody else's order | refused (`Not authorized`) |

### Failure
| # | Case | Expect |
|---|---|---|
| L10 | approved → failed | cancelled; commission released to `balance` immediately |
| L11 | confirmed → failed | same |
| L12 | delivered → failed | refused |
| L13 | cancelled → failed again | refused |

### Refund
| # | Case | Expect |
|---|---|---|
| L14 | delivered → refund, no reason | refused |
| L15 | delivered → refund, invented reason | refused |
| L16 | delivered → refund, `not_delivered` | cancelled; `refunded_at`, `refund_reason` set; product `sold`/`revenue` **decremented** |
| L17 | refund the same order twice | refused (`already been refunded`) |
| L18 | pending → refund | refused |
| L19 | rejected → refund | refused |
| L20 | approved → refund (never delivered) | allowed — no window applies |
| L21 | delivered, window elapsed → refund | refused 🔧 needs a backdated `delivered_at` |
| L22 | refund after `release_matured_commission` ran | refused 🔧 same |

### Transitions that should not be possible — the adversarial set
| # | Case | Expect | Reality |
|---|---|---|---|
| **X1** | **delivered → reject** | should be refused | **allowed** |
| **X2** | **X1, then re-upload, then approve** | should be impossible | **allowed — commission credited a second time** |
| **X3** | **repeat X2 n times** | — | **wallet `pending` grows without bound** |
| X4 | confirmed → reject | should be refused | allowed |
| X5 | approved → reject | should be refused | allowed |
| X6 | cancelled/refunded → reject | should be refused | allowed |
| X7 | after X1, product `sold`/`revenue` | should come back down | stays counted |
| X8 | approve twice | refused | ✓ confirmed |
| X9 | confirm twice | refused | ✓ confirmed |
| X10 | deliver twice | refused | ✓ confirmed |
| X11 | confirm an order that is not yours | refused | ✓ confirmed |
| X12 | deliver an order that is not yours | refused | ✓ confirmed |
| X13 | approve as a marketer (no admin rights) | refused | ✓ confirmed |
| X14 | refund as a marketer | refused | ✓ confirmed |
| X15 | marketer writes `status` directly via PostgREST | refused by RLS | ✓ confirmed |
| X16 | business writes `status` directly via PostgREST | refused by RLS | ✓ confirmed |
| X17 | marketer edits `commission` on their own order | refused | ✓ confirmed |
| X17b | marketer edits `receipt_url` on their own order | refused | ✓ confirmed |

### Pairwise combinations (§1's "combination examples")
Dimensions: **status** × **prior history** × **language** × **role viewing**.
Rather than the full cross product, each pair appears at least once:

| # | Combination |
|---|---|
| C1 | refund × business with prior orders × ar × business view |
| C2 | refund × business with no history × en × marketer view |
| C3 | failed × prior history × en × admin view |
| C4 | mixed list (pending + delivered + cancelled at once) × ar × business view — do the tab counts stay right |
| C5 | mixed list × en × marketer view |
| C6 | delivered × no history × ar × admin view |

## §2 — Forms
Applied to the product form, the order form, the refund dialog.

| # | Case | Expect |
|---|---|---|
| F1 | product: empty submit | blocked, message shown |
| F2 | product: name only | blocked |
| F3 | product: negative price | rejected |
| F4 | product: price 0 | boundary — observe |
| F5 | product: qty 0 | boundary — observe |
| F6 | product: 10 000-character description | accepted or refused, never truncated silently |
| F7 | product: emoji + RTL text in the name | round-trips intact |
| F8 | product: letters in the price field | rejected |
| F9 | product: rapid double-submit | one product, not two |
| F10 | order: rapid double-submit | one order, not two |
| F11 | order: qty above stock | ✓ refused at placement (`OUT_OF_STOCK`), earlier than expected |
| F12 | order: qty 0 / negative | ✓ refused |
| F13 | refund: empty comment | observe — reason is required, comment may not be |

## §3 — Translation, with data on the page
The public sweep already runs. What is missing is every dashboard **with real
rows in it**, which is where dynamic strings live.

| # | Case |
|---|---|
| T1 | business orders, one per status, ar — no English leaks in status tags or steppers |
| T2 | marketer orders, one per status, ar — same |
| T3 | admin receipts queue with rows, ar |
| T4 | notification panel with real notifications, ar (`receipt_verified`, `order_delivered`, `order_failed`, `receipt_rejected`) |
| T5 | the note prefixes — marketer / business / admin — both languages |
| T6 | refund and failure reasons rendered in ar |
| T7 | RTL mirroring of the order stepper, not just translated words |

## §4 — Uploads
| # | Case |
|---|---|
| U1 | product photo → visible to the marketer browsing it |
| U2 | focal point saved, and still right after reload |
| U3 | very wide / very tall / tiny / huge images |
| U4 | receipt upload → visible to admin, then to business |
| U5 | unsupported type (`.txt` renamed `.jpg`, real `.pdf`) — message, not silence |
| U6 | oversized file |

## §6 — Freeze cascade
`is_business_frozen` is checked by `confirm_order`, `mark_delivered`,
`mark_failed`. Everything else is to be probed.

| # | Case | Expect |
|---|---|---|
| Z1 | frozen business confirms | refused, `ACCOUNT_FROZEN` |
| Z2 | frozen business marks delivered | refused |
| Z3 | frozen business marks failed | refused |
| Z4 | frozen business edits a product | ✓ refused |
| Z5 | frozen business creates a product | ✓ refused |
| Z6 | frozen business reads its dashboard | allowed, as it should be |
| Z7 | orders already in flight when the freeze lands | ✓ held where they were, not lost |
| Z8 | is the frozen state visibly communicated | still to look at, in the browser |
| Z9 | a marketer places a new order against a frozen shop | ✓ refused |

## §7 — Listing integrity
| # | Case |
|---|---|
| P1 | every field on a product matches between business view, marketer browse, and the public page |
| P2 | fulfilment badge: shown where it should be, absent from the admin grid |
| P3 | a paused product disappears from browse but survives in existing orders |
| P4 | a soft-deleted product keeps its orders intact |

## What cannot be tested from here

Marked 🔧 above. `delivered_at` has to be moved into the past to test the
refund window's far side, and no account-level token may write it — which is
correct, and is exactly why those two rows need either a service key or one
hand-run SQL statement. Everything else in this matrix is reachable with the
three accounts' own logins.


## Result of the first run

`e2e/specs/lifecycle.spec.ts` — 17 passed, 5 failed. The five are one cause:
`admin_reject_order_with_notes` has no status guard (X1, X2–X3, X4–X5, X6, X7).
Written up in `BUGS_FOUND.md`; fixed by
`supabase/migrations/20260806210000_reject_only_what_is_waiting.sql`, which is
**not yet applied**.

The freeze cascade (§6) had never been exercised before and is sound: every
action a frozen shop could take was refused, and an order already in flight was
held rather than lost.

### Cases added while testing, that were not in the original plan
Per §0.5 phase 3 — the ones found by noticing something, not by working down a list:

- **X2–X3** — the double-payment loop. Reached by asking what `rejected` is
  good for, once X1 showed a delivered order could be sent there: it is one of
  the two states `marketer_reupload_receipt` accepts, and that closes a circle.
- **X7** — the shop's `sold` and `revenue` after a rejection. Noticed because
  only `admin_refund_order` decrements them, so any *other* way out of
  `delivered` leaves them counting.
- **X17b** — a marketer rewriting `receipt_url` at the table. Tried after
  discovering the app's own repair path could not fix the test data, which
  raised the question of whether anything could.
- **U-missing** — what a receipt whose file is gone looks like. Found by
  breaking it accidentally, then deciding the behaviour was worth recording.
- **F11's real answer** — stock is refused when the order is *placed*, not when
  the shop confirms. The matrix predicted the wrong guard, and the code is
  stronger than the prediction.
