# Gold Stake Lotto — website

The public website for Gold Stake Lotto, built from the design export in
[`design/`](design/). It's a fast static site hosted on **Netlify**, with a small backend for:

- **Forms** — the *Agent enquiry* and *Contact* forms are collected by Netlify Forms
  (spam-filtered, viewable in the Netlify dashboard, and can be emailed to you).
- **Admin page** at `/admin/` — update the jackpot, next draw date, draw results,
  live YouTube video, contact numbers and licence status without touching code.
  Settings are saved in Netlify Blobs and appear on the site within about a minute.

## Project layout

```
public/                 Everything that gets published
  index.html            The home page (all sections)
  admin/index.html      Admin page for site settings
  thanks.html, 404.html
  assets/css/           site.css (design styles), admin.css
  assets/js/            site.js (page behaviour), admin.js, age-check.js
  assets/fonts/         Public Sans + Source Serif 4 (self-hosted)
  assets/img/logo.png
lib/settings.mjs        Settings defaults, validation and API logic
netlify/functions/      settings.mjs — serves /api/settings and /api/admin/verify
tests/                  Unit tests for the settings API
netlify.toml            Build, headers and security policy
design/                 The original bundled design export, kept for reference
```

## Deploy to Netlify (one-time setup)

1. In Netlify: **Add new site → Import an existing project**, and pick this GitHub repository.
   The build settings come from `netlify.toml`, so you don't need to change anything. Click **Deploy**.
2. **Set the admin password.** Go to **Site configuration → Environment variables**, add
   `ADMIN_PASSWORD`, and use a strong password of 12 or more characters. Then open **Deploys** and
   **Trigger deploy** so the password takes effect.
3. **Turn on form emails.** Go to **Forms**. The `agent` and `contact` forms appear after the
   first deploy. Under **Form notifications**, add an email notification to the inbox that should
   receive enquiries.
4. **Custom domain (optional).** Go to **Domain management → Add a domain**, for example
   `goldstakelotto.com`, and follow the DNS steps. HTTPS is set up automatically.

Every push to the connected branch redeploys the site automatically.

## Updating the site day to day

Go to `https://<your-site>/admin/`, log in with `ADMIN_PASSWORD`, change what you need, and click
**Save changes**.

- **Results:** click **+ Add a draw result** after each draw. The newest result shows as
  "Latest result", and the five before it show as "Previous draws". Up to 12 are kept.
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

## Local development

Requires Node 20+.

```sh
npm install
npm test                                   # settings API unit tests
ADMIN_PASSWORD=some-long-password npm run dev   # netlify dev on http://localhost:8888
```

`netlify dev` runs the site, the function and a local Blobs store together. Form submissions
are only captured on the deployed site.
