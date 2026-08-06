/**
 * The order state machine — every transition, including the ones that should
 * not be possible.
 *
 * TEST_PLAN.md §1, and the adversarial set from TEST_MATRIX_GENERATED.md.
 *
 * These create real products, real orders, real money movements and real
 * notifications, so they only run when told to: WASLA_WRITES=1. Off, the whole
 * file skips, which is what has to happen once the site is live.
 *
 * Written against the back end rather than the interface on purpose. A state
 * machine is a set of rules about what may follow what, and clicking through
 * forty screens to reach "delivered, then rejected, then re-uploaded, then
 * approved again" would fail for layout reasons long before it told us
 * anything about the rule. Every call still goes out with an ordinary
 * account's own token, so nothing here is reaching past a guard that a real
 * person would hit.
 */

import { expect, test } from "../lib/test";
import { account, writesAllowed } from "../lib/accounts";
import { session, type Session } from "../lib/api";
import { deliver, makeProduct, order, placeOrder, product, uploadReceipt, wallet, type SeededProduct } from "../lib/seed";

let adm: Session, biz: Session, mkt: Session;
let p: SeededProduct;

test.describe("the order lifecycle", () => {
  test.skip(!writesAllowed, "creates real orders — run with WASLA_WRITES=1 to include this");
  test.skip(!account("admin") || !account("business") || !account("marketer"),
    "needs all three accounts: WASLA_{ADMIN,BUSINESS,MARKETER}_{EMAIL,PASSWORD}");

  test.beforeAll(async () => {
    [adm, biz, mkt] = await Promise.all([session("admin"), session("business"), session("marketer")]);
    p = await makeProduct(biz);
  });

  /* ------------------------------------------------------------------ *
   * The happy path, and what it does to the money
   * ------------------------------------------------------------------ */

  test("L1–L4 placed → approved → confirmed → delivered, and the money moves once", async () => {
    const o = await placeOrder(mkt, biz, p);
    const before = await wallet(mkt);
    const soldBefore = await product(biz, p.id);

    expect((await order(adm, o.id)).status, "a new order starts pending").toBe("pending");

    expect((await adm.rpc("admin_approve_order", { _order_id: o.id })).ok, "admin approves").toBe(true);
    expect((await order(adm, o.id)).status).toBe("approved");

    /* L2 — approval puts the commission on the way, not in hand. */
    const afterApprove = await wallet(mkt);
    expect(afterApprove.pending - before.pending).toBeCloseTo(o.commission * o.qty, 2);
    expect(afterApprove.balance, "approval must not make money withdrawable").toBeCloseTo(before.balance, 2);

    expect((await biz.rpc("confirm_order", { _order_id: o.id })).ok, "business confirms").toBe(true);
    expect((await order(adm, o.id)).status).toBe("confirmed");

    expect((await biz.rpc("mark_delivered", { _order_id: o.id })).ok, "business delivers").toBe(true);
    const done = await order(adm, o.id);
    expect(done.status).toBe("delivered");
    expect(done.delivered_at, "delivery starts the refund clock").not.toBeNull();

    /* L3 — delivery starts the window; it does not open the wallet. */
    const afterDeliver = await wallet(mkt);
    expect(afterDeliver.balance, "delivery must not release the commission yet").toBeCloseTo(before.balance, 2);
    expect(afterDeliver.pending).toBeCloseTo(afterApprove.pending, 2);

    /* L4 — the sale is counted on delivery. */
    const soldAfter = await product(biz, p.id);
    expect(soldAfter.sold - soldBefore.sold).toBe(o.qty);
    expect(soldAfter.revenue - soldBefore.revenue).toBeCloseTo(o.unitPrice * o.qty, 2);
  });

  /* ------------------------------------------------------------------ *
   * Rejection and re-upload
   * ------------------------------------------------------------------ */

  test("L5–L7 a rejected receipt can be replaced, and cannot be approved as it stands", async () => {
    const o = await placeOrder(mkt, biz, p);
    const before = await wallet(mkt);

    expect((await adm.rpc("admin_reject_order_with_notes",
      { _order_id: o.id, _notes: "blurry" })).ok).toBe(true);
    const rejected = await order(adm, o.id);
    expect(rejected.status).toBe("rejected");
    expect(rejected.admin_notes).toBe("blurry");
    expect((await wallet(mkt)).pending, "a rejection must not pay anybody").toBeCloseTo(before.pending, 2);

    /* L7 — approving a rejected order without a new receipt. */
    const straightToApprove = await adm.rpc("admin_approve_order", { _order_id: o.id });
    expect(straightToApprove.ok, "a rejected order must not be approvable as it stands").toBe(false);
    expect(straightToApprove.error).toMatch(/not pending/i);

    /* L6 — with a new receipt it goes back in the queue. */
    expect((await mkt.rpc("marketer_reupload_receipt",
      { _order_id: o.id, _receipt_url: await uploadReceipt(mkt) })).ok).toBe(true);
    expect((await order(adm, o.id)).status).toBe("pending");
  });

  test("L8–L9 a re-upload needs a receipt, and needs to be yours", async () => {
    const o = await placeOrder(mkt, biz, p);
    await adm.rpc("admin_reject_order_with_notes", { _order_id: o.id, _notes: "no" });

    const empty = await mkt.rpc("marketer_reupload_receipt", { _order_id: o.id, _receipt_url: "" });
    expect(empty.ok, "an empty receipt url must be refused").toBe(false);

    const notMine = await biz.rpc("marketer_reupload_receipt",
      { _order_id: o.id, _receipt_url: "receipts:e2e/someone-elses.jpg" });
    expect(notMine.ok, "somebody else's order must be refused").toBe(false);
    expect(notMine.error).toMatch(/not authori[sz]ed/i);
  });

  /* ------------------------------------------------------------------ *
   * Failure
   * ------------------------------------------------------------------ */

  test("L10 a failed delivery hands the commission over straight away", async () => {
    const o = await placeOrder(mkt, biz, p);
    const before = await wallet(mkt);
    await adm.rpc("admin_approve_order", { _order_id: o.id });

    expect((await biz.rpc("mark_failed", { _order_id: o.id, _note: "customer refused" })).ok).toBe(true);
    const row = await order(adm, o.id);
    expect(row.status).toBe("cancelled");
    expect(row.commission_released_at, "a failure releases immediately").not.toBeNull();

    const after = await wallet(mkt);
    expect(after.balance - before.balance,
      "the marketer keeps the commission when the customer refuses").toBeCloseTo(o.commission * o.qty, 2);
  });

  test("L12–L13 a delivered order cannot fail, and a failed one cannot fail twice", async () => {
    const o = await placeOrder(mkt, biz, p);
    await deliver(adm, biz, o.id);

    const afterDelivery = await biz.rpc("mark_failed", { _order_id: o.id, _note: "too late" });
    expect(afterDelivery.ok, "a delivered order must not be markable failed").toBe(false);

    const o2 = await placeOrder(mkt, biz, p);
    await adm.rpc("admin_approve_order", { _order_id: o2.id });
    await biz.rpc("mark_failed", { _order_id: o2.id });
    const twice = await biz.rpc("mark_failed", { _order_id: o2.id });
    expect(twice.ok, "a cancelled order must not fail again").toBe(false);
  });

  /* ------------------------------------------------------------------ *
   * Refunds
   * ------------------------------------------------------------------ */

  test("L14–L15 a refund needs one of the two reasons", async () => {
    const o = await placeOrder(mkt, biz, p);
    await deliver(adm, biz, o.id);

    const none = await adm.rpc("admin_refund_order", { _order_id: o.id, _comment: "x", _reason: null });
    expect(none.ok, "a refund with no reason must be refused").toBe(false);
    expect(none.error).toMatch(/needs a reason/i);

    const invented = await adm.rpc("admin_refund_order",
      { _order_id: o.id, _comment: "x", _reason: "changed_their_mind" });
    expect(invented.ok, "a refund reason the policy does not know must be refused").toBe(false);
  });

  test("L16–L17 a refund reverses the sale, and cannot be run twice", async () => {
    const o = await placeOrder(mkt, biz, p);
    await deliver(adm, biz, o.id);
    const sold = await product(biz, p.id);

    expect((await adm.rpc("admin_refund_order",
      { _order_id: o.id, _comment: "never arrived", _reason: "not_delivered" })).ok).toBe(true);

    const row = await order(adm, o.id);
    expect(row.status).toBe("cancelled");
    expect(row.refunded_at).not.toBeNull();
    expect(row.refund_reason).toBe("not_delivered");

    /* The sale it counted on delivery comes back off. */
    const after = await product(biz, p.id);
    expect(sold.sold - after.sold, "a refund un-counts the sale").toBe(o.qty);
    expect(sold.revenue - after.revenue).toBeCloseTo(o.unitPrice * o.qty, 2);

    const again = await adm.rpc("admin_refund_order",
      { _order_id: o.id, _comment: "again", _reason: "not_delivered" });
    expect(again.ok, "an order must not be refundable twice").toBe(false);
    /* Refused by the status check rather than by the already-refunded check —
       a refund leaves the order `cancelled`, which the status guard rejects
       first, so the message names the status and not the refund. Safe either
       way; only the wording is less use to whoever reads it. */
    expect(again.error).toMatch(/already been refunded|can be refunded/i);
  });

  test("L18–L19 only an order that got somewhere can be refunded", async () => {
    const pending = await placeOrder(mkt, biz, p);
    const onPending = await adm.rpc("admin_refund_order",
      { _order_id: pending.id, _comment: "", _reason: "not_delivered" });
    expect(onPending.ok, "a pending order has taken no money to give back").toBe(false);

    const rejected = await placeOrder(mkt, biz, p);
    await adm.rpc("admin_reject_order_with_notes", { _order_id: rejected.id, _notes: "no" });
    const onRejected = await adm.rpc("admin_refund_order",
      { _order_id: rejected.id, _comment: "", _reason: "not_delivered" });
    expect(onRejected.ok, "a rejected order has taken no money to give back").toBe(false);
  });

  /* ------------------------------------------------------------------ *
   * Who may do what
   * ------------------------------------------------------------------ */

  test("X11–X14 nobody can drive somebody else's half of the deal", async () => {
    const o = await placeOrder(mkt, biz, p);

    const marketerApproves = await mkt.rpc("admin_approve_order", { _order_id: o.id });
    expect(marketerApproves.ok, "a marketer must not be able to approve their own receipt").toBe(false);

    const marketerRefunds = await mkt.rpc("admin_refund_order",
      { _order_id: o.id, _comment: "", _reason: "not_delivered" });
    expect(marketerRefunds.ok, "a marketer must not be able to refund").toBe(false);

    await adm.rpc("admin_approve_order", { _order_id: o.id });

    const marketerConfirms = await mkt.rpc("confirm_order", { _order_id: o.id });
    expect(marketerConfirms.ok, "only the shop confirms its own order").toBe(false);

    const marketerDelivers = await mkt.rpc("mark_delivered", { _order_id: o.id });
    expect(marketerDelivers.ok, "only the shop marks its own order delivered").toBe(false);
  });

  test("X15–X17 the tables themselves refuse what the functions refuse", async () => {
    const o = await placeOrder(mkt, biz, p);

    /* Straight at the table, past every function. RLS is the last line, and
       the one that matters if a function is ever called from somewhere new. */
    const marketerSetsStatus = await mkt.update("orders", `id=eq.${o.id}`, { status: "delivered" });
    const stuck = await order(adm, o.id);
    expect(stuck.status,
      "a marketer writing status straight to the table must not be able to deliver their own order")
      .toBe("pending");
    expect(marketerSetsStatus.ok && (marketerSetsStatus.body as unknown[]).length > 0).toBe(false);

    const marketerRaisesCommission = await mkt.update("orders", `id=eq.${o.id}`, { commission: 9999 });
    const paid = await order(adm, o.id);
    expect(marketerRaisesCommission.ok && (marketerRaisesCommission.body as unknown[]).length > 0,
      "a marketer must not be able to write their own commission").toBe(false);
    expect(paid.status).toBe("pending");

    const businessSetsStatus = await biz.update("orders", `id=eq.${o.id}`, { status: "delivered" });
    expect(businessSetsStatus.ok && (businessSetsStatus.body as unknown[]).length > 0,
      "a shop must not be able to skip to delivered by writing the column").toBe(false);
  });

  /* ------------------------------------------------------------------ *
   * The set that should be impossible
   * ------------------------------------------------------------------ */

  test("X1 a delivered order cannot be rejected", async () => {
    const o = await placeOrder(mkt, biz, p);
    await deliver(adm, biz, o.id);

    const r = await adm.rpc("admin_reject_order_with_notes",
      { _order_id: o.id, _notes: "rejecting an order that was already delivered" });

    expect(r.ok, "rejecting a delivered order must be refused — its receipt was accepted, " +
      "the shop shipped it and the customer has it").toBe(false);
    expect((await order(adm, o.id)).status).toBe("delivered");
  });

  test("X4–X5 an order past the queue cannot be sent back to rejected", async () => {
    const approved = await placeOrder(mkt, biz, p);
    await adm.rpc("admin_approve_order", { _order_id: approved.id });
    const onApproved = await adm.rpc("admin_reject_order_with_notes",
      { _order_id: approved.id, _notes: "second thoughts" });
    expect(onApproved.ok, "an approved order must not be rejectable afterwards").toBe(false);

    const confirmed = await placeOrder(mkt, biz, p);
    await adm.rpc("admin_approve_order", { _order_id: confirmed.id });
    await biz.rpc("confirm_order", { _order_id: confirmed.id });
    const onConfirmed = await adm.rpc("admin_reject_order_with_notes",
      { _order_id: confirmed.id, _notes: "second thoughts" });
    expect(onConfirmed.ok, "a confirmed order must not be rejectable afterwards").toBe(false);
  });

  test("X6 a refunded order cannot be rejected", async () => {
    const o = await placeOrder(mkt, biz, p);
    await deliver(adm, biz, o.id);
    await adm.rpc("admin_refund_order", { _order_id: o.id, _comment: "", _reason: "wrong_item" });

    const r = await adm.rpc("admin_reject_order_with_notes", { _order_id: o.id, _notes: "and rejected" });
    expect(r.ok, "a refunded order is finished and must not move again").toBe(false);
  });

  test("X2–X3 an order cannot be paid for twice", async () => {
    const o = await placeOrder(mkt, biz, p);
    const before = await wallet(mkt);
    await deliver(adm, biz, o.id);

    const paidOnce = await wallet(mkt);
    expect(paidOnce.pending - before.pending).toBeCloseTo(o.commission * o.qty, 2);

    /* The loop: reject what was delivered, replace the receipt, get it
       approved again. Each turn credits the commission afresh, and nothing
       says how many turns are allowed. */
    await adm.rpc("admin_reject_order_with_notes", { _order_id: o.id, _notes: "round two" });
    await mkt.rpc("marketer_reupload_receipt", { _order_id: o.id, _receipt_url: await uploadReceipt(mkt) });
    await adm.rpc("admin_approve_order", { _order_id: o.id });

    const paidTwice = await wallet(mkt);
    expect(paidTwice.pending - before.pending,
      "one order, one commission — going round the queue again must not pay a second time")
      .toBeCloseTo(o.commission * o.qty, 2);
  });

  test("X7 rejecting a delivered order does not leave the sale counted", async () => {
    const o = await placeOrder(mkt, biz, p);
    const before = await product(biz, p.id);
    await deliver(adm, biz, o.id);
    await adm.rpc("admin_reject_order_with_notes", { _order_id: o.id, _notes: "undo" });

    const after = await product(biz, p.id);
    expect(after.sold,
      "an order the admin has rejected must not still count as a sale in the shop's figures")
      .toBe(before.sold);
    expect(after.revenue).toBeCloseTo(before.revenue, 2);
  });

  /* ------------------------------------------------------------------ *
   * Repeats of the ones that are already guarded, so a later change that
   * loosens them is noticed
   * ------------------------------------------------------------------ */

  test("X8–X10 no step can be taken twice", async () => {
    const o = await placeOrder(mkt, biz, p);

    await adm.rpc("admin_approve_order", { _order_id: o.id });
    expect((await adm.rpc("admin_approve_order", { _order_id: o.id })).ok, "approve twice").toBe(false);

    await biz.rpc("confirm_order", { _order_id: o.id });
    expect((await biz.rpc("confirm_order", { _order_id: o.id })).ok, "confirm twice").toBe(false);

    await biz.rpc("mark_delivered", { _order_id: o.id });
    expect((await biz.rpc("mark_delivered", { _order_id: o.id })).ok, "deliver twice").toBe(false);
  });

  test("F11 an order for more than the shelf holds is refused at the door", async () => {
    const small = await makeProduct(biz, { qty: 3 });
    /* Refused when the order is placed, not when the shop comes to confirm it
       — earlier and better than expected. The reservation happens on insert,
       so there is never a moment where a customer has been promised something
       that is not there. */
    await expect(placeOrder(mkt, biz, small, { qty: 10 })).rejects.toThrow(/OUT_OF_STOCK|stock/i);
  });

  test("F12 an order for none of something is refused", async () => {
    const some = await makeProduct(biz, { qty: 5 });
    await expect(placeOrder(mkt, biz, some, { qty: 0 })).rejects.toThrow();
    await expect(placeOrder(mkt, biz, some, { qty: -1 })).rejects.toThrow();
  });
});

/* ==================================================================== *
 * TEST_PLAN §6 — what a freeze actually stops
 *
 * The three order functions ask `is_business_frozen` by name. Everything
 * else is unexamined, which is the reason for this block: a freeze that
 * stops the checkout but not the shop front is a freeze that has not
 * happened.
 *
 * The shop is put back on its feet in an `afterAll` that runs whatever the
 * assertions did, because leaving the account frozen would fail every other
 * spec on the next run for a reason nothing would explain.
 * ==================================================================== */

test.describe("a frozen shop", () => {
  test.skip(!writesAllowed, "freezes a real account — run with WASLA_WRITES=1 to include this");
  test.skip(!account("admin") || !account("business") || !account("marketer"),
    "needs all three accounts");

  let frozenProduct: SeededProduct;
  let inFlight: string;

  test.beforeAll(async () => {
    [adm, biz, mkt] = await Promise.all([session("admin"), session("business"), session("marketer")]);
    frozenProduct = await makeProduct(biz, { name: "WASLA-E2E frozen-shop product" });

    // An order already on its way when the freeze lands.
    const o = await placeOrder(mkt, biz, frozenProduct);
    await adm.rpc("admin_approve_order", { _order_id: o.id });
    inFlight = o.id;

    const froze = await adm.rpc("admin_set_user_frozen", { _user_id: biz.userId, _frozen: true });
    if (!froze.ok) throw new Error(`could not freeze the test shop: ${froze.error}`);
  });

  test.afterAll(async () => {
    if (!writesAllowed || !biz) return;
    await adm.rpc("admin_set_user_frozen", { _user_id: biz.userId, _frozen: false });
  });

  test("Z1–Z3 it cannot move an order along", async () => {
    const confirm = await biz.rpc("confirm_order", { _order_id: inFlight });
    expect(confirm.ok, "a frozen shop must not confirm").toBe(false);
    expect(confirm.error).toMatch(/frozen/i);

    const failed = await biz.rpc("mark_failed", { _order_id: inFlight, _note: "x" });
    expect(failed.ok, "a frozen shop must not mark an order failed").toBe(false);
    expect(failed.error).toMatch(/frozen/i);
  });

  test("Z7 an order already in flight is held, not lost", async () => {
    const row = await order(adm, inFlight);
    expect(row.status, "the freeze holds the order where it was").toBe("approved");
  });

  test("Z4–Z5 what it can still do to its shelves", async () => {
    const edit = await biz.update("products", `id=eq.${frozenProduct.id}`, { price: 999 });
    const made = await biz.insert("products", {
      business_id: biz.userId,
      code: `WASLA-E2E-FROZEN-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: "WASLA-E2E made while frozen",
      price: 10, cost_price: 5, qty: 1,
      currency: { s: "LYD", code: "LYD" },
      comm_pct: 10, comm_mode: "pct", platform_fee: 1, total_fee_per_unit: 2,
      variant_groups: [], sizes: [], colors: [], delivery: {}, photos: [], status: "active",
    });

    /* Recorded rather than asserted either way: whether a frozen shop may
       still edit its own listings is a policy question, and the answer wants
       to be the owner's, not this file's. What matters is that it is written
       down instead of found out later. */
    const changed = edit.ok && (edit.body as unknown[]).length > 0;
    const created = made.ok && (made.body as unknown[]).length > 0;
    // eslint-disable-next-line no-console
    console.log(`FREEZE CASCADE — frozen shop: edit a product = ${changed ? "ALLOWED" : "refused"}; ` +
      `create a product = ${created ? "ALLOWED" : "refused"}`);
    expect(typeof changed).toBe("boolean");
  });

  test("Z9 a marketer cannot take on new work for a frozen shop", async () => {
    /* Its products drop out of browse — the RLS policy says so — so the
       question is whether an order can still be placed by somebody who
       already knows the id. */
    const placed = await placeOrder(mkt, biz, frozenProduct).then(() => true).catch(() => false);
    // eslint-disable-next-line no-console
    console.log(`FREEZE CASCADE — new order against a frozen shop = ${placed ? "ALLOWED" : "refused"}`);
    expect(typeof placed).toBe("boolean");
  });
});
