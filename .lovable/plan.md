# Fix: Libyan Dinar symbol visual order

## Goal
Make the LYD currency symbol always **visually appear as `د.ل`** on screen, in both Arabic and English pages, everywhere money is displayed (wallet, stat cards, favorites, product picker, orders).

## Approach
Stop fighting bidi at the data layer. Wrap only the symbol in a `<bdo dir="ltr">` element, which tells the browser: "render these characters strictly left-to-right, in the order I wrote them." This is the lightest possible fix — no global CSS, no Unicode override characters, no heavy rules on wallet containers.

## Changes

1. **`src/components/dashboard/lateen/marketer.script.js`** and **`src/components/dashboard/lateen/business.script.js`**
   - In the `__money` / symbol formatting helper, when the currency code is `LYD`, output the symbol as:
     `<bdo dir="ltr">د.ل</bdo>`
   - Keep the rest of the formatting logic exactly as it is now (Arabic: `symbol + amount`, English: `amount + CODE`).
   - Remove any leftover Unicode override characters (`\u202D`, LRI, etc.) from the LYD path so we don't double-fix it.

2. **No CSS changes.** The previous heavy `direction: ltr; unicode-bidi: bidi-override` rules stay removed.

3. **Scope:** Only LYD for now, as you asked. Other currencies untouched.

## Why this works
`<bdo dir="ltr">` is a one-element, one-attribute browser primitive specifically designed to lock visual order of its contents. It applies only to the 3 characters inside it, so it has zero performance impact and won't affect surrounding numbers or layout.

## Verification
After the change, I'll check the marketer wallet, business wallet, favorites list, and product picker on both Arabic and English pages to confirm the symbol shows as `د.ل` in all of them.