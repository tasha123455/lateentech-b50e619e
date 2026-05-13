I found why the Business Products and Orders pages still feel broken: the dashboard uses a bundled inline HTML/CSS copy, so the previous visual fix only partially affected the rendered layout. I’ll fix the actual rendered business shell and the Products/Orders sections directly.

Plan:
1. Move the Business Products and Orders content higher by reducing the app top padding and using a tighter, consistent sub-page header.
2. Replace the extra tall duplicated topbars on Products and Orders with compact headers so the lists start near the top of the screen.
3. Make the Products and Orders lists load immediately and keep their summary/list state refreshed when products or orders change.
4. Verify the dashboard script has no runtime issue that prevents those pages from rendering after navigation.

Files to update:
- `src/components/dashboard/lateen/business.body.html`
- `src/components/dashboard/lateen/business.script.js`
- `src/styles/lateen-business.css` if needed for the imported style copy