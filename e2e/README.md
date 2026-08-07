# Browser tests

These drive the real app in a real browser — taps, typing, scrolling — the way
a person does. They are not unit tests and they do not read the source: they
open pages and check what appears.

Kept in its own folder with its own `package.json` on purpose. Nothing here is
in the app's dependencies, so installing or running these can never change what
gets built and deployed.

## Running them

```bash
cd e2e
npm install
npx playwright install chromium   # once, downloads the browser
npm test                          # against the live site
npm run report                    # opens the HTML report with screenshots
```

By default it points at `https://wassla.online`. Point it somewhere else
with `WASLA_URL=http://127.0.0.1:5199 npm test`.

## Signing in

The public tests — landing page, sign-in and registration forms, the offline
page, the manifest and every icon it promises — need no account and run for
anybody.

The rest need an account, and skip themselves cleanly without one.

There is a wrinkle worth knowing first. This site has no password box: the only
way in through the interface is Google, and a robot cannot drive Google's
sign-in — nor should it try, since that is exactly the behaviour Google blocks
accounts for. So the tests ask Supabase for a session directly, with an email
and a password, and hand it to the app the same way the app's own code would.
Nothing is added to the site to allow it and nothing is left behind. But it
needs an account that has a password, and an account made through Google has
none.

### The short way: one secret

Give the suite a Supabase **service_role** key and it makes its own accounts —
one marketer, one business, one admin — on `example.com`, which is reserved by
the RFCs and can never receive mail. It reuses them on every later run, so the
products and orders they build up survive.

*Supabase dashboard → Project settings → API → service_role → copy.* Then either
`WASLA_SUPABASE_SERVICE_KEY=… npm test`, or put it in `e2e/.env.local`, or add
it as a repository secret of that name to run it from the Actions tab.

**That key reads and changes everything in the database and obeys none of the
rules that protect a row.** It is the right tool before launch and the wrong one
after. When the site goes live: `npm run accounts:remove`, then delete the
secret. Both steps are the whole of the clearing up.

### The long way: accounts you make yourself

No service key needed, and nothing powerful is stored anywhere.

1. *Supabase dashboard → Authentication → Users → Add user.* Give an email and
   a password and tick auto-confirm. Do it three times.
2. The marketer and business accounts need their role. Sign in to the site once
   as each — the roles are granted the way any sign-up grants them.
3. Invite the third from the app's own Admins page, using the same email.
4. Put the six values in `e2e/.env.local`, which git is told to ignore:

```
WASLA_MARKETER_EMAIL=...
WASLA_MARKETER_PASSWORD=...
WASLA_BUSINESS_EMAIL=...
WASLA_BUSINESS_PASSWORD=...
WASLA_ADMIN_EMAIL=...
WASLA_ADMIN_PASSWORD=...
```

Then `set -a; . ./.env.local; set +a; npm test`. Accounts named this way are
used in preference to any the suite would make for itself.

Do not put credentials in the repository's own `.env` — that file is tracked by
git, and this repository is public.

The address of the backend and its publishable key are read from that tracked
`.env` when they are not in the environment, so there is nothing to configure:
both are public values that ship inside every copy of the site.
`WASLA_SUPABASE_URL` and `WASLA_SUPABASE_ANON_KEY` override them when the tests
are pointed at a different project.

## What it will and will not touch

By default everything here only reads. It signs in, opens pages, expands cards,
and checks what is drawn. It does not place orders, upload receipts, approve
payouts or delete anything, because a robot that orders something every time it
runs is a robot filling a real shop with rubbish.

`WASLA_WRITES=1` turns that off, and it is off unless asked for, every time —
the Actions tab has a tick box for it. Turn it on before launch, while the
database holds nothing that matters, to cover the parts of `TEST_PLAN.md` that
cannot be reached by looking: the order lifecycle, uploads, refunds, and what
freezing an account does and does not stop. Turn it off before the site has
customers.

## What it has found

**The Arabic registration page failed to hydrate.** Confirmed against the live
site, and fixed. The city control read the language off the browser, which the
server does not have, so the server wrote "Select city" into the Arabic page and
the browser wrote "اختر المدينة" over it. React called that a hydration failure,
threw the whole form away and rebuilt it — which is what erased a name typed in
the page's first half second. It reads the route now, which the server and the
browser can both see. English was never affected, because there the server's
guess happened to be right.

A test guards it in both languages, so it cannot come back quietly.

Two things worth knowing that are *not* defects:

- **The city picker behaves differently under `vite dev`.** There, choosing a
  city — or pressing Cancel — closes the sheet and reopens it at once: the
  `<label>` around the field hands a second click to the button that opens it.
  On the deployed site it does not happen, on any of the four forms in either
  language. The test asserts the deployed behaviour and skips itself against
  the dev server, which it recognises by the `data-tsd-source` attributes that
  only the dev tooling adds.
- **Pages do not respond for their first half second.** They arrive from the
  server as finished HTML and answer nothing until React takes them over. Every
  test waits for that, which is what `settled()` in `lib/app.ts` is for.

## What it cannot cover

Anything that leaves the browser: the real camera, installing to a home screen,
the iOS share sheet, push notification delivery, WhatsApp links, and any code
sent by SMS or email. Those still need a person and a phone.

And a suite proves the paths somebody thought of still work. It is good at
catching a change that breaks yesterday's behaviour, and no substitute for
using the app.

## Why a phone viewport

Because the bugs live there. A description collapsing threw the page to the top
for weeks while three separate desktop harnesses reported it was fine — it
needed a mobile layout viewport to happen at all. Everything here runs at
412×830 with touch, and walks both `/en` and `/ar`, because right-to-left is
where most of the rest have been.

## When the browser cannot reach the internet

Some sandboxes let a program reach the internet but not a browser — curl and
git work, and every browser gets its connection cut whatever proxy it is
pointed at. `WASLA_RELAY=1` fetches the page's requests from node and hands
them to the browser, which is enough to drive the live site from inside one:

```bash
WASLA_RELAY=1 WASLA_URL=https://wassla.online npm test
```

Off unless asked for. On a laptop, or on a CI runner, the browser has its own
connection and this would only add a hop and a chance to get something wrong.

It is not a perfect mirror. Requests are re-issued by node, so connection
reuse, HTTP/2 and anything measured in milliseconds are not what a real visitor
would get. What it is good for is what the page does and what it draws.

Such a sandbox usually also ships its own browser, at whatever version it was
built with, and Playwright will refuse to start looking for the exact build its
own version pins — `Executable doesn't exist at …chromium_headless_shell-1234`,
with an invitation to download one that the sandbox has no way to accept. Point
it at the one that is already there instead:

```bash
WASLA_CHROMIUM=/opt/pw-browsers/chromium WASLA_RELAY=1 \
WASLA_URL=https://wassla.online npm test
```

## Running it without a computer

`.github/workflows/e2e.yml` runs all of this on GitHub's machines, so no
laptop and no local setup is needed — the Actions tab has a **Run workflow**
button, and it works from a phone browser.

It runs the no-account tests on every push to `main`. To run the signed-in ones,
add **one** secret under *Settings → Secrets and variables → Actions*:

| Secret | What it is |
| --- | --- |
| `WASLA_SUPABASE_SERVICE_KEY` | the Supabase service_role key — the run makes its own accounts with it |

Accounts you would rather name yourself go in as `WASLA_MARKETER_EMAIL` and
`WASLA_MARKETER_PASSWORD`, and the same pair for `BUSINESS` and `ADMIN`; those
win over anything a run would make. Either way, see *Signing in* above — and
take the service key back out before the site goes live.

The **Run workflow** button also has a tick box for letting the tests create and
change things. Leave it off once there are real orders in the database.

Secrets are write-only: GitHub will not show them again, and they are masked
in the logs. They are not in the repository and not in anyone's chat history.

Every run keeps its report and screenshots as a downloadable artifact for two
weeks, whether it passed or failed — a failed run is exactly the one whose
screenshots you want.
