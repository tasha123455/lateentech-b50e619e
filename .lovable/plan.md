## Goal

Product share links (WhatsApp, etc.) currently preview the old Lateen triangle logo. Swap the share image to the current Wasla mark.

## Findings

- `public/icon-512.png` = old logo (black tile, white outlined triangle). Unreferenced anywhere except the two product routes.
- `public/wasla-icon-512.png` = current logo (gradient "W" arrows on dark square), already used by `manifest.json`.
- `wasla-mark-512.png` / `wasla-notification-icon.png` are the same current mark but transparent-background — worse for social previews.

## Changes

1. `src/routes/en.p.$id.tsx` and `src/routes/ar.p.$id.tsx`: change `og:image` and `twitter:image` from `https://lateen.online/icon-512.png` to `https://www.lateen.online/wasla-icon-512.png` (also aligns the host with the canonical `www` domain).
2. Nothing else touched — no deletions of the old icon files, no other routes, no components.

## Note

WhatsApp/Facebook cache scraped previews. Existing shared links will keep showing the old image until their cache expires; a new link or a manual refresh in Facebook's Sharing Debugger forces an immediate update.
