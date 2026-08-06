/**
 * Clears up after a WASLA_WRITES run.
 *
 * The lifecycle specs make products and orders on purpose, and leave them
 * behind on purpose too — a failure is worth looking at afterwards. This
 * removes them when the looking is done.
 *
 * Products are soft-deleted and paused, the same way the business dashboard's
 * own delete works, so orders that point at them keep resolving. Orders are
 * left alone: they carry money movements and notifications, and deleting them
 * would leave a wallet describing a history that no longer exists.
 *
 * It also lifts a freeze the freeze specs may have left on the shop if a run
 * was interrupted between freezing and its afterAll — which would otherwise
 * make every later run fail for a reason nothing on screen explains.
 *
 * Run from e2e/:  npm run tidy
 */

import { session } from "../lib/api.ts";
import { MARK } from "../lib/seed.ts";

const biz = await session("business");
const adm = await session("admin");

const thaw = await adm.rpc("admin_set_user_frozen", { _user_id: biz.userId, _frozen: false });
console.log(thaw.ok ? "shop is not frozen" : `could not thaw the shop: ${thaw.error}`);

const mine = await biz.select<Array<{ id: string; name: string; deleted_at: string | null }>>(
  "products", `business_id=eq.${biz.userId}&code=like.${MARK}*&select=id,name,deleted_at`);
if (!mine.ok) {
  console.error(`could not list the test products: ${mine.error}`);
  process.exit(1);
}

const live = mine.body.filter((p) => p.deleted_at === null);
console.log(`${mine.body.length} test products, ${live.length} still listed`);

let locked = 0;
for (const p of live) {
  const r = await biz.update("products", `id=eq.${p.id}`,
    { deleted_at: new Date().toISOString(), status: "paused" });
  if (r.ok) {
    console.log(`  retired ${p.name} (${p.id.slice(0, 8)})`);
  } else if (/PRODUCT_LOCKED/.test(r.error)) {
    /* Not a failure. A product somebody has a live order against cannot be
       taken away underneath them, which is the rule working. It unlocks by
       itself when the last of those orders finishes. */
    locked++;
    console.log(`  left alone, still has live orders: ${p.name} (${p.id.slice(0, 8)})`);
  } else {
    console.log(`  could not retire ${p.name} (${p.id.slice(0, 8)}): ${r.error}`);
  }
}
if (locked) {
  console.log(`\n${locked} product(s) still have orders in flight and cannot be withdrawn yet —`);
  console.log("that is the shop's own rule, not a problem. Run this again once those finish.");
}

console.log("\nOrders are left as they are: they carry wallet movements and notifications,");
console.log("and removing them would leave the marketer's wallet describing a history");
console.log("that no longer exists.");
