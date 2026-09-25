# Gold Stake Lotto — website

The public website for Gold Stake Lotto (GSL), built from the design export in
[`design/`](design/). It's a fast static site hosted on **Vercel**, with a small backend for:

- **Forms** — *Agent enquiry* and *Contact* submissions are saved and listed on the admin page,
  with optional email alerts.
- **Admin page** at `/admin/` — update each Lotto game's jackpot, next draw and results,
  the live YouTube video, contact numbers and licence status without touching code.
  Changes appear on the site within about a minute.

Data (settings and form submissions) is stored in **Upstash Redis**, added to the project from
Vercel's Storage tab.

## Project layout

```
public/                 Everything that gets published
  index.html            The home page (all sections)
  admin/index.html      Admin page: site settings and enquiries
  thanks.html, 404.html
  assets/css/           site.css (design styles), admin.css
  assets/js/            site.js (page behaviour), admin.js, age-check.js
  assets/fonts/         Public Sans + Source Serif 4 (self-hosted)
  assets/img/logo.png
api/                    Vercel Functions: settings, forms, admin/verify, admin/submissions
lib/                    settings.mjs (defaults, validation, API), forms.mjs, store.mjs (Redis)
tests/                  Unit tests
vercel.json             Output folder, headers and security policy
design/                 The original bundled design export, kept for reference
```

## Deploy to Vercel (one-time setup)

1. **Import the repo.** In Vercel: **Add New… → Project**, choose this GitHub repository
   (`GSL.2`), and click **Import**. Leave *Framework Preset* as **Other**, with no build command.
   `vercel.json` already tells Vercel to publish the `public` folder. Click **Deploy**.
   The site is now live on a `*.vercel.app` address, showing the default game details.
2. **Add storage.** In the project, open **Storage → Create Database** (or **Browse Marketplace**)
   and choose **Upstash → Redis**. Pick the free plan and a region close to Zimbabwe (for example
   Europe or South Africa if offered), then **Connect** it to this project. Vercel adds the
   connection details as environment variables automatically.
3. **Set the admin password.** Go to **Settings → Environment Variables**, add `ADMIN_PASSWORD`
   (12 or more characters) for *Production* (and *Preview* if you want).
4. **Redeploy** so the new variables take effect: **Deployments → ⋯ on the latest → Redeploy**.
5. **Check it works.** Open `/admin/`, log in, change something, save, and reload the home page.
   Submit a test enquiry and check that it appears under **Enquiries** on the admin page.
6. **Email alerts (optional).** Create a free account at resend.com, then add these environment
   variables and redeploy:
   - `RESEND_API_KEY`: your Resend API key
   - `NOTIFY_EMAIL`: where alerts go (comma-separate several addresses)
   - `NOTIFY_FROM`: a sender on a domain you've verified in Resend, e.g. `GSL Website <web@goldstakelotto.com>`.
     Until a domain is verified, Resend only delivers to your own Resend account email.
7. **Custom domain (optional).** Go to **Settings → Domains**, add e.g. `goldstakelotto.com`, and
   follow the DNS steps. HTTPS is set up automatically.

Every push to the connected branch deploys automatically. The production branch is set under
**Settings → Git**; other branches get preview URLs.

## Updating the site day to day

Go to `https://<your-site>/admin/`, log in with `ADMIN_PASSWORD`, change what you need, and click
**Save changes**.

- **Lotto games** — Mega 7 (7 of 37, Sundays), Wild 5 (5 of 49, Saturdays), Fast 5 (5 of 42, Fridays),
  Easy 6 (6 of 39, Thursdays), all drawn at 3pm. Each has its own jackpot, next draw and results; results must be
  different numbers from 1 to the game's maximum. After a draw, click **+ Add a draw result** under
  that game. Leave "Next draw" empty and the site shows the regular day (e.g. "Every Sunday, 3pm").
- **Rush games and scratch cards** are fixed text in `public/index.html` (picks, prices, multipliers
  and draw frequencies). Scratch cards are a "coming soon" placeholder until names, prices and prizes
  are final.
- **Pick 1 symbols** are line icons in the `<svg>` sprite at the top of `public/index.html`
  (one `<symbol id="sym-…">` each), shown in the symbol grid in the Rush section.
- **Live stream:** paste the YouTube live link (or video ID) before the draw so it plays on the
  page. Clear the field afterwards to go back to the "Watch live on YouTube" button.
- **Licence:** tick the box once the Lotteries & Gaming Board licence is granted.

## Still to fill in

These come from the design and are placeholders until you have the real details:

- **WhatsApp number** `+263 77 000 0000`. Change it in the admin page, then also update the
  default in `public/index.html` and `lib/settings.mjs`.
- **Facebook and X links** point to the sites' home pages. Update them in `public/index.html`
  (search for `TODO`).
- **Draw machine photo.** Add `public/assets/img/draw-machine.jpg` and follow the comment above
  the placeholder in `public/index.html`.
- **USSD code** `*123#` and the **YouTube channel**. Confirm or change both in the admin page.
- **Online play.** Not launched yet. The site says "Online coming soon"; when it launches, update those
  lines and add a link on the "Online" card (search for `TODO` and "coming soon").
- **Scratch cards.** Replace the "coming soon" banner in the Instant Win section once cards are final.

## Local development

Requires Node 22.

```sh
npm test          # unit tests (settings, forms, storage)
npm run dev       # vercel dev: needs `npx vercel login` and `npx vercel link` first
```

`vercel dev` runs the site and the API together. Run `npx vercel env pull .env.local` to use the
project's Redis database and admin password locally.
