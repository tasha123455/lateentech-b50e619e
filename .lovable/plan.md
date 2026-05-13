# Adopt Lateen as the App Foundation

Goal: rebuild `lateen_combined_2.html` as a real, modular TanStack Start app — same dark "Bento" aesthetic, but with components, routes, live role state, and Lovable Cloud wired up so future features (international, inventory) are easy to bolt on.

## 1. Brand & design tokens

- Replace `src/styles.css` palette with the Lateen tokens (`#141414` bg, `#1e1e1e`, `#2a2a2a`, text `#f0eeeb / #9e9b97 / #5e5c58`, borders `#333330 / #272725`, accents marketer `#6c64d4` / business `#2dbd8f`) as oklch CSS variables.
- Register `--font-sans` (system stack) and `--font-serif` (Georgia) used by the brand wordmark.
- Keep semantic Tailwind tokens (`bg-background`, `text-foreground`, etc.) mapped to these.
- Default theme = dark (no light mode toggle for now).

## 2. Routes (TanStack file-based)

```
src/routes/
  __root.tsx                 (shell, QueryClientProvider, AuthProvider)
  index.tsx                  (Landing — role picker)
  marketer.signin.tsx        (/marketer/signin)
  marketer.register.tsx      (/marketer/register)
  business.signin.tsx        (/business/signin)
  business.register.tsx      (/business/register)
  _authenticated.tsx         (gate: redirect to / if no session)
  _authenticated.dashboard.tsx (role-aware dashboard host)
```

The `dashboard` route reads the user's role from session/profile and renders either `<MarketerDashboard />` or `<BusinessDashboard />`. No iframe, no `srcdoc`, no giant string blobs.

## 3. Component breakdown (replaces `DASH_HTML`)

```
src/components/
  brand/
    LateenLogo.tsx           (the SVG mark, sized prop)
    Wordmark.tsx
  landing/
    RolePickerCard.tsx
  auth/
    AuthCard.tsx             (shared card chrome)
    SignInForm.tsx           (variant: marketer | business)
    RegisterForm.tsx         (variant: marketer | business)
    GoogleButton.tsx
    SuccessScreen.tsx
  dashboard/
    DashboardShell.tsx       (topbar + bottom nav + page slot)
    Topbar.tsx
    BottomNav.tsx
    MenuDrawer.tsx
    business/
      BalanceCard.tsx
      StatsRow.tsx
      RevenueChart.tsx
      AnalyticsRing.tsx
      ProductList.tsx / ProductCard.tsx
      NotificationsPage.tsx
      PayoutSheet.tsx
    marketer/
      EarningsCard.tsx
      CampaignStats.tsx
      ProductBrowser.tsx
      ...mirroring marketer DASH_HTML sections
  ui/                         (existing shadcn primitives reused where useful)
```

Each component owns its own JSX + Tailwind classes. Icons stay as inline SVGs (matching the prototype) inside small `Icon*.tsx` files so they're swappable later.

## 4. State management

- `AuthContext` (React context) backed by Supabase session: `{ user, role: 'marketer' | 'business' | null, loading, signOut }`.
- Role is sourced from a `profiles` row, not from client storage.
- Route guards: `_authenticated.tsx` `beforeLoad` checks Supabase session; landing/auth routes redirect to `/dashboard` if already signed in.
- Dashboard tabs (Home / Products / Notifications / Menu) use local component state (no URL changes for now — matches prototype).

## 5. Lovable Cloud foundation

Enable Lovable Cloud and create the minimum schema so chat-driven edits work later:

- `profiles` (id uuid PK = auth.uid, full_name, phone, role enum `marketer|business`, business_name nullable, created_at)
- `user_roles` table + `app_role` enum + `has_role()` security-definer fn (per platform rules — roles never live on profile alone)
- RLS: users select/update their own profile; role read via `has_role`.
- Auth: email/password + Google OAuth provider (UI buttons already match).
- On register, server function inserts `profiles` + `user_roles` row with chosen role.

No business/marketer data tables yet — those come with the international/inventory features. Just the auth + role plumbing.

## 6. What's intentionally deferred

- Live charts (Chart.js in prototype) → render as static SVG/placeholder components with the same dimensions; easy to swap to recharts later.
- Real product/notification data → components accept props with mock data from `src/lib/mock-data.ts` so layouts render identically; replaced with Supabase queries when those features land.
- International + inventory features → next phase, after you confirm the foundation matches.

## 7. Verification

- Visual parity: landing, both auth flows, both dashboards match prototype screenshots at 420px width.
- Role flow: pick Marketer → register → land on marketer dashboard; sign out → pick Business → register → land on business dashboard.
- Build passes; no placeholder index remains.

## Technical notes

- TanStack Start v1, file-based routing, no `src/pages/`.
- Supabase clients: browser client for auth UI, `requireSupabaseAuth` middleware for any server fn that reads/writes profile data.
- All colors via CSS variables in `src/styles.css`; no hex literals in components.
- Fonts loaded via system stack + Georgia (no external font fetch needed).
