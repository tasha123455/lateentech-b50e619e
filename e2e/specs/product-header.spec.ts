/**
 * The product sheet's header, when the name and the code are both long.
 *
 * The code pill cannot wrap and will not shrink — half a product code is no
 * use to anybody — so it takes the width it needs. Nothing used to hold the
 * name's side of the row, which meant a long code could leave the name a
 * column a few characters wide, and `overflow-wrap: anywhere` then broke it
 * down the page one letter at a time: W / A / S / L / A.
 *
 * This measures the rendered box rather than reading the CSS, because the
 * thing that went wrong is a width, and a width is only true once it is laid
 * out. It builds the two elements itself rather than driving the app, so it
 * can be run at any width, in both directions, without needing a product that
 * happens to be named awkwardly.
 *
 * The stylesheets come off disk rather than off the site: the dashboard's CSS
 * is loaded by the dashboard route, not linked from the document, so there is
 * nothing to fetch from a page nobody has signed in to. These two files are
 * what gets built and served, so guarding them guards what ships.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "../lib/test";

const STYLES = ["marketer", "admin"].map((role) =>
  readFileSync(resolve(import.meta.dirname, `../../src/styles/${role}-dashboard.css`), "utf8"),
).join("\n");

/* The name has to be able to draw a word. Below this a 20px heading is
   breaking words apart, which is the fault being tested for. */
const READABLE = 120;

const HEADER = `
  <div class="pd-card">
    <div class="pd-hd-row">
      <div class="pd-hd-name">__NAME__</div>
      <div class="pd-hd-code">
        <span class="pd-hd-code-lbl">__LBL__</span> <span>__CODE__</span>
        <span class="pd-fulfil-badge">__BADGE__</span>
      </div>
    </div>
  </div>`;

type Case = { role: "marketer" | "admin"; dir: "ltr" | "rtl"; name: string; lbl: string; code: string; badge: string };

const cases: Case[] = [
  // The one in the screenshot.
  { role: "admin", dir: "rtl", name: "WASLA-E2E product", lbl: "كود المنتج:", code: "WASLA-E2E-Q1DPON", badge: "تسليم فوري" },
  { role: "marketer", dir: "rtl", name: "WASLA-E2E product", lbl: "كود المنتج:", code: "WASLA-E2E-Q1DPON", badge: "تسليم فوري" },
  // A long ordinary name with a normal code — the likelier real case.
  { role: "marketer", dir: "ltr", name: "Versace blue and yellow winter blanket, king size", lbl: "Product code:", code: "LT-ZPVJDQ", badge: "Instant" },
  { role: "admin", dir: "ltr", name: "Versace blue and yellow winter blanket, king size", lbl: "Product code:", code: "LT-ZPVJDQ", badge: "Reserve" },
  // Both long at once.
  { role: "marketer", dir: "ltr", name: "Extraordinarily-long-single-word-product-name-with-no-spaces", lbl: "Product code:", code: "LT-ABCDEFGHIJKLMNOP", badge: "Instant" },
];

for (const c of cases) {
  test(`the ${c.role} product header keeps the name readable (${c.dir}, "${c.name.slice(0, 24)}…")`, async ({ page }) => {
    await page.setContent(
      `<style>${STYLES}</style>` +
      `<div class="lateen-${c.role}" dir="${c.dir}" style="width:412px">` +
      HEADER.replace("__NAME__", c.name).replace("__LBL__", c.lbl)
            .replace("__CODE__", c.code).replace("__BADGE__", c.badge) +
      `</div>`,
    );

    const box = await page.locator(".pd-hd-name").boundingBox();
    expect(box, "the name did not render").not.toBeNull();

    expect(box!.width,
      `the name was squeezed to ${Math.round(box!.width)}px — narrow enough that a ` +
      `20px heading breaks mid-word and reads vertically`).toBeGreaterThanOrEqual(READABLE);

    /* And nothing may push the card sideways off a phone. */
    const overflow = await page.evaluate(() => {
      const row = document.querySelector(".pd-hd-row") as HTMLElement;
      return row.scrollWidth - row.clientWidth;
    });
    expect(overflow, "the header row scrolls sideways").toBeLessThanOrEqual(1);
  });
}
