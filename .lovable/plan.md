## Goal
In the business **Add product** form: (1) expand the country list to all ~195 countries with a searchable picker matching the currency selector pattern, (2) make variants user-defined — keep "Sizes" and "Colours" visible by default, but let the business owner rename either group and add their own custom variant groups (e.g. "Material", "Flavour").

## Changes

### 1. Country picker — full list + search
**`src/components/dashboard/lateen/business.script.js`**
- Replace `COUNTRY_NAMES` (12 entries) with a full ISO 3166-1 list (~195 entries) shaped as `COUNTRIES = [{code, name, flag}, ...]`. Keep `COUNTRY_NAMES` as a derived lookup (`Object.fromEntries(COUNTRIES.map(c=>[c.code,c.name]))`) so existing references in `renderZoneBuilderList` keep working unchanged.
- Add `countryDropdownOpen`, `filterCountries()`, `renderCountryDropdown(list)`, `toggleCountryDropdown()`, `selectCountry(code)` — mirrors the currency dropdown functions.

**`src/components/dashboard/lateen/business.body.html`** (lines 502–508)
- Replace the native `<select>` with the same searchable pattern used by currency: a tappable display row showing flag + selected country name (or "Select a country"), an inline search input, and a scrollable dropdown of options. Keep the green "+ Add" button to commit the picked country to `zones`.
- Reuse currency dropdown styles where possible; add minimal `.country-*` class aliases in the existing `<style>` block if needed.

### 2. User-defined variant groups
**`src/components/dashboard/lateen/business.script.js`**
- Replace `sizes=[], colors=[]` state with `variantGroups=[]` where each group is `{id, name, items:[{id, val}]}`.
- Seed defaults on `openAddForm` when creating new product: `[{id:0, name:'Sizes', items:[]}, {id:1, name:'Colours', items:[]}]`. When editing existing product, hydrate from `p.variantGroups` if present, else fall back to legacy `p.sizes` / `p.colors` arrays for backward compat with seeded products.
- New functions: `addVariantGroup()` (push empty group, default name "Variant"), `removeVariantGroup(gid)`, `renameVariantGroup(gid, name)`, and rewrite `addVariant/removeVariant/updateVariant/renderVariantList` to take a group id instead of `'sizes'|'colors'`.
- `submitProduct` writes `variantGroups` to the product, plus derived `sizes`/`colors` (first group named "Sizes" / "Colours" case-insensitive) so the rest of the app keeps working.

**`src/components/dashboard/lateen/business.body.html`** (lines 496–499)
- Replace the two hard-coded "Sizes" and "Colours" blocks with a single `<div id="variant-groups-container"></div>` plus an "+ Add another variant" button below it. Each rendered group has: editable name input (the section label), the existing "+ Add value" button, the value list, and a "Remove group" link. Keep look/feel identical to current variant builder cards.

## Out of scope
- No marketer-side changes, no DB or auth changes, no CSS redesign.
- Existing seeded products keep working via the back-compat fallback.

## Verification
- Open business → Products → "Add a product".
- Country picker: tap "+ Add a country" → search "uni" filters to United Kingdom, United States, UAE, Uruguay, Tanzania (United Republic of) etc.; pick one, confirm it appears as a zone card.
- Variants: confirm Sizes and Colours appear by default. Rename "Sizes" → "Length", add "+ Add another variant" → name it "Material", add values. Save, reopen for edit, confirm groups, names, and values persist.
