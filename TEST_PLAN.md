# lateen.online — QA Test Plan for Claude Code

## How to use this file
1. Save this as `TEST_PLAN.md` in your project root.
2. Make sure Playwright MCP is installed (see Setup below).
3. Start Claude Code in your project folder and use the kickoff prompt in **Section 0.5** below — not a simple "work through this list" prompt. The list here is a *floor*, not the full scope.
4. For sections marked 🔧, tell Claude Code it has Supabase access so it can create test data for states that can't be reached just by clicking around (e.g. "order failed after shipping").

---

## 0.5 Methodology — read this before running anything

**This checklist is a minimum, not the assignment.** Do not treat it as a script to execute top to bottom and stop. Your actual job has three phases:

**Phase 1 — Build the real test matrix (before touching the browser)**
Read the actual codebase: every order/account state, every valid and invalid state transition, every form, every role×page×language combination. Using the categories below as a starting point, write your own expanded list to `TEST_MATRIX_GENERATED.md`. This should include:
- The full order/account **state machine** — every state, and every transition someone could attempt from it, including ones that *shouldn't* be possible (e.g. can an approved order be rejected afterward? What happens if you try? Can a refunded order be refunded again?)
- **Combinations**, not just single changes — e.g. order state × whether the business has prior order history × language × role. You don't need to test every possible combination (that number is effectively infinite) — use pairwise coverage: make sure every *pair* of relevant dimensions gets tested together at least once, even if not every triple/quadruple does. This catches the overwhelming majority of interaction bugs for a fraction of the effort of full combinatorial coverage.
- Show me `TEST_MATRIX_GENERATED.md` before executing so I can sanity-check it covers what I actually care about.

**Phase 2 — Test it adversarially**
Assume every screen has a hidden bug and your job is to find it, not to confirm things work. When something seems fine on the surface, try to break it anyway (double-submit, interrupt mid-flow, go back and forward, refresh at odd times).

**Phase 3 — Grow the list as you go**
Any time you notice something unexpected — a flicker, a snap, a delayed render, a translation mismatch, one role behaving differently from another in a way that seems unintentional — stop, log it, and **add a new test case to the matrix to probe around it further**, even if it wasn't in the original list. At the end of each session, report not just pass/fail, but which *new* cases you added that weren't in the original plan — that's the signal you're actually expanding coverage instead of just executing a script.

**Kickoff prompt:**
> Read the codebase first and build TEST_MATRIX_GENERATED.md based on TEST_PLAN.md's categories, including state-transition coverage and pairwise combinations per Section 0.5. Show it to me before testing. Once I confirm, work through it on [staging URL] using the test logins in CLAUDE.local.md, adversarially, adding new test cases whenever you notice anything unexpected. Log every bug to BUGS_FOUND.md with steps to reproduce, expected vs. actual, and a screenshot. Report new self-added cases at the end of each session, not just pass/fail counts.

---

## 0. Setup (do this once)

- [ ] Install Playwright MCP:
  `claude mcp add --transport stdio playwright -- npx -y @playwright/mcp@latest`
- [ ] Point Claude Code at a **staging environment**, not production. This testing creates real orders, refunds, uploads, and frozen accounts.
- [ ] Create dedicated test accounts for business owner, marketer, and admin roles. Give the credentials to Claude Code via `CLAUDE.local.md` (gitignored — never put credentials in the shared CLAUDE.md).
- [ ] Give Claude Code Supabase access (service role, or a seed script) so it can directly set order/account states that aren't reachable through the UI alone.

---

## 1. Order Lifecycle — every state and every path to failure

For each path: does the correct status show to the business owner? To the marketer? Is the customer-facing state accurate? Do the right notifications fire?

- [ ] Placed → receipt uploaded → approved → shipped → delivered (happy path)
- [ ] Placed → receipt uploaded → **rejected** — what does the customer see? Can they re-upload? Is the business owner notified?
- [ ] Approved → shipped → **fails before delivery** (lost, returned to sender) — does status update everywhere it's displayed?
- [ ] Delivered → **fully refunded** — does it leave "active orders"? Does order history still show it correctly?
- [ ] Delivered → **partially refunded** (e.g. 2 of 3 items) — can the UI even represent this, or does it collapse to a binary refunded/not state?
- [ ] Mixed list: some orders refunded, some active, some pending in the same view — do dashboard counts (e.g. "active orders") stay accurate?
- [ ] 🔧 Order stuck mid-state (shipped, but no further update for days) — what does staleness look like?

**Combination examples (expand well beyond these — this is a starting pattern, not the full list):**
- [ ] Order approved → refunded, where the business account **has** prior order/analytics history — does the dashboard recalculate correctly?
- [ ] Order approved → refunded, where the business account has **no** prior history — same check, does it break on the empty/edge case?
- [ ] Order approved, then an attempt to reject it afterward — does the UI prevent this, or does it silently corrupt the state?
- [ ] Order refunded, then a second refund attempted on the same order — blocked, or does it double-process?
- [ ] Order shipped, refund initiated before delivery completes — what happens to shipment tracking vs. refund status?
- [ ] Same scenarios above, repeated in Arabic — does the state display correctly, or does something revert to English/break layout under an unusual state?

---

## 2. Form & Input Testing — every combination, not just the happy path

Apply this to every form (add product, receipt upload, admin actions, marketer review, etc.):

- [ ] Submit completely empty
- [ ] Fill only field 1
- [ ] Fill only field 2
- [ ] Fill in an unusual order
- [ ] Fill required fields only, leave optional ones empty
- [ ] Fill everything correctly (happy path)
- [ ] Invalid formats: bad email, negative price, letters in a number field, excessively long text, emoji/special characters
- [ ] Boundary values: 0, 1, max length, single character
- [ ] Rapid double-submit — does it create duplicates?

---

## 3. Translation / i18n Completeness Audit

- [ ] Walk every page, every role, **in English** — flag any Arabic text that leaked through
- [ ] Walk every page, every role, **in Arabic** — flag any English text that leaked through (buttons, tooltips, error messages, placeholders, toasts)
- [ ] Confirm the Arabic layout is actually RTL-mirrored (icon direction, alignment, padding) — not just translated text glued onto an LTR layout
- [ ] Check dynamically injected content (toasts, modals, notification panel) in both languages — these load after the initial i18n pass and are the most common place for missed translations
- [ ] Confirm note prefixes ("Marketer note:", "Business owner notes:", "Admin note:") render correctly in both languages

---

## 4. Photo / Image Upload — propagation & positioning

- [ ] Upload a product photo as business owner — does it appear correctly and promptly to marketers viewing the same product?
- [ ] Test drag-to-reposition focal point — does the saved position match the preview? Does it persist after reload?
- [ ] Test cropping at different aspect ratios and sizes (very wide, very tall, tiny, huge)
- [ ] Upload a receipt photo — same propagation check to business owner/admin
- [ ] Attempt an unsupported file type or oversized file — real error message, or silent failure?

---

## 5. UI Polish & Interaction Quality

- [ ] Expand/collapse every card type — smooth, or does it stutter/jump?
- [ ] Note anything that visibly freezes or lags (which component, which role, which browser)
- [ ] Check hover/tap feedback on every button — responsive, or dead?
- [ ] Check loading states — does every async action (upload, submit, fetch) show an indicator, or can it look broken while it's just loading?

---

## 6. Account Freeze — cascade behavior

- [ ] Freeze a test account, then try every action it could take before freezing — which are actually blocked, which still silently work?
- [ ] Does freezing stop only new actions, or also affect things already in progress (e.g. an order mid-shipment)?
- [ ] Can a frozen account still view things read-only, or is everything blocked?
- [ ] Is the frozen state clearly communicated, or do actions just fail silently?

---

## 7. Product Listings Integrity

- [ ] Check every product link — broken links, missing images, missing prices, empty fields that shouldn't be empty
- [ ] Cross-check a sample of products between business owner view and marketer/public view — anything dropped or mismatched?

---

## 8. Open-ended exploration (catch what isn't listed above)

This list is deliberately incomplete. After finishing it:

- [ ] Click every button on every page, in both languages, as every role — note anything that doesn't do what it visually implies
- [ ] Try sequences a user "shouldn't" do: browser back mid-flow, refresh during an upload, same form open in two tabs
- [ ] Note anything inconsistent between roles that should behave the same way

---

## Reporting format (for BUGS_FOUND.md)

```
### [Role] [Page/Feature] — short description
- Steps to reproduce:
- Expected:
- Actual:
- Screenshot: (if visual)
- Severity: blocks core function / cosmetic / edge case
```

---

## Status — what is running, and what is blocked

Added by the browser-test work in `e2e/`. This section records where the plan
above stands against the code as it is, so nobody reads the checklist and
assumes it has all been run.

**Running now, on every push to `main` and on demand from the Actions tab.**
The whole of section 3 for the public pages, most of section 2 for the two
registration forms, and section 7's manifest and icon checks. See `e2e/README.md`.
No account is needed for any of it. One bug found and fixed so far: the Arabic
registration page failed to hydrate, which erased anything typed into it in its
first half second.

**Running now, on demand, against the live site.** Everything behind a sign-in.
The three test accounts exist and work: `e2e/specs/{marketer,business,admin}.spec.ts`
walk the dashboards, and `e2e/specs/lifecycle.spec.ts` walks §1's whole state
machine plus §6's freeze cascade. The site signs in with Google only, which a
robot cannot and should not drive, so the tests ask Supabase for a session with
an email and a password instead — details in `e2e/README.md`.

**No longer blocked on somewhere safe to run it.** Sections 1 and 6 create real
orders, refunds and frozen accounts, so they are behind `WASLA_WRITES=1` and
skip unless it is set. The owner's decision was to accept the mess while the
platform has not launched. `npm run tidy` clears up afterwards.

**Findings so far.** One real defect, in `BUGS_FOUND.md`: an order could be
rejected from any state, including after delivery, and going round that loop
paid the marketer's commission again each time. Fixed in a migration that has
not yet been applied. The matrix built in phase 1 is `TEST_MATRIX_GENERATED.md`.

**Still to run.** Section 2's forms, section 4's uploads, and section 3 against
the dashboards now that there is data in every order state to read in Arabic.

**Not planned.** Section 0's Playwright MCP: `e2e/` is a Playwright suite
already, it runs on GitHub's machines without a laptop, and it keeps its
screenshots. A second way to drive a browser would not add coverage.
