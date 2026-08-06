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

By default it points at `https://www.lateen.online`. Point it somewhere else
with `WASLA_URL=http://127.0.0.1:5199 npm test`.

## Signing in

The public tests — landing page, sign-in and registration forms, the offline
page, the manifest and every icon it promises — need no account and run for
anybody.

The rest need credentials, and skip themselves cleanly without them. **Use
throwaway accounts you can delete, not accounts you rely on.** Put them in
`e2e/.env.local`, which git is told to ignore:

```
WASLA_MARKETER_EMAIL=...
WASLA_MARKETER_PASSWORD=...
WASLA_BUSINESS_EMAIL=...
WASLA_BUSINESS_PASSWORD=...
WASLA_ADMIN_EMAIL=...
WASLA_ADMIN_PASSWORD=...
```

Then `set -a; . ./.env.local; set +a; npm test`.

Do not put them in the repository's own `.env` — that file is tracked by git,
so anything in it is published.

## What it will and will not touch

Everything here reads. It signs in, opens pages, expands cards, and checks what
is drawn. It does not place orders, upload receipts, approve payouts or delete
anything, because it runs against the live database and a robot that orders
something every time it runs fills a real shop with rubbish.

`WASLA_WRITES=1` is reserved for tests that create and clean up after
themselves. Nothing uses it yet; it exists so that adding such a test later is
a deliberate act rather than an accident.

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

## Running it without a computer

`.github/workflows/e2e.yml` runs all of this on GitHub's machines, so no
laptop and no local setup is needed — the Actions tab has a **Run workflow**
button, and it works from a phone browser.

It runs the no-account tests on every push to `main`. To run the signed-in
ones, add these under *Settings → Secrets and variables → Actions*:

| Secret | What it is |
| --- | --- |
| `WASLA_MARKETER_EMAIL` / `WASLA_MARKETER_PASSWORD` | a throwaway marketer account |
| `WASLA_BUSINESS_EMAIL` / `WASLA_BUSINESS_PASSWORD` | a throwaway business account |
| `WASLA_ADMIN_EMAIL` / `WASLA_ADMIN_PASSWORD` | a throwaway admin, invited from the Admins page |

Secrets are write-only: GitHub will not show them again, and they are masked
in the logs. They are not in the repository and not in anyone's chat history.

Every run keeps its report and screenshots as a downloadable artifact for two
weeks, whether it passed or failed — a failed run is exactly the one whose
screenshots you want.
