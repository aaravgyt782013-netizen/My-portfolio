# aarav.exe — Portfolio ✨

> Silent moves. Loud dreams.

A **backbencher-themed** multi-page developer portfolio (chalkboard dark mode, notebook light mode) with a built-in **admin panel (CMS)**. You can change every word, link, color, font, photo and page from the browser. You don't need to touch any code.

![stack](https://img.shields.io/badge/Node.js-Express-ffd60a) ![no-db](https://img.shields.io/badge/database-none%20(JSON%20file)-5ec8ff)

## Features

**Website: a separate page for everything**

| Page | URL | What's on it |
| --- | --- | --- |
| Home | `/` | Marker-pen intro, polaroid photo, tape-strip tech marquee, sticky-note page index, the **class computer** terminal, featured project, "pass me a note" CTA |
| About | `/about` | Flippable **student ID card**, notebook bio, classroom clock, "currently", **draggable sticky notes**, stats |
| Services | `/services` | Index-card services |
| Skills | `/skills` | Skills shown as a **report card** with marks, auto-grades (A+, A, B+…), teacher's remarks and a "PROMOTED" stamp |
| Projects | `/projects` | "Assignments" with grade stamps, tag filters, search and detail pop-ups |
| Store | `/store` | "The canteen": products with price tags and ribbons |
| Journey | `/journey` | "My timetable": a timeline that fills as you scroll |
| Gallery | `/gallery` | Polaroid wall with lightbox and an Instagram follow button |
| Photos | `/photos` | **My memory box.** Every photo has a handwritten **memory note** pinned beside it, with date, place and a year filter. The 👓 specs button in the top bar opens it in a new tab |
| Playground | `/playground` | **Doodle on my desk** (save as PNG), **paper-toss game** with wind and best score, **homework excuse generator** |
| Contact | `/contact` | Email (copy button), **Instagram card**, socials and a paper-plane **note form** |
| Reviews | `/reviews` | Off by default. Turn it on in the admin |
| 404 | anything else | A detention slip |

Fun extras:
- **Teacher mode:** press `T` (or use `Ctrl/⌘ + K` or the ☰ menu) and the site instantly turns into boring physics notes (the boss key)
- `Ctrl/⌘ + K` command menu, a chalk-dust trail, a pencil cursor, page-flip transitions and an "attendance" boot screen
- Terminal commands: `help`, `whoami`, `cd projects`, `open instagram`, `excuse`, `teacher`, plus your own commands

**Works on every screen**
- Tested from small 320px phones to 1920px monitors, including tablets and landscape phones. Nothing scrolls sideways or gets cut off.
- Touch controls: the doodle board, paper toss, ID-card flip and swipe-through photo lightbox all work by finger. Hover effects never "stick" after a tap.
- iPhone notch and home-bar safe areas are respected. Inputs don't trigger auto-zoom.
- On every screen the top bar keeps search, the 👓 specs button (→ Photos) and the light/dark switch. Teacher mode is also in the ☰ menu.
- The admin panel works on a phone too: slide-out sidebar and full-screen live preview.

**Fast loading**
- Each page is served as one ~11 KB gzipped HTML file with all content inlined. There are no extra API calls before first paint.
- Images are WebP and the hero photo is preloaded. Fonts load without blocking the page.
- CSS and JS get content-hash versions and are cached for a year. Gzip compression is on.
- Every page has its own title, description and canonical URL. `/sitemap.xml` and `/robots.txt` are generated automatically for SEO.

**Admin panel** (`/admin`)
- Login page. Email and password come from **environment variables**
- **Pages & Menu:** turn pages on/off, show them in the top menu or not, rename them, change their URL, emoji, blurb and browser-tab title, and reorder them
- A tab for every page, covering every field: hero, polaroid, ID card, report card and grading scale, projects, store, timeline, gallery, playground games, contact and Instagram card, 404 slip, teacher mode and terminal
- **All Small Texts:** every button label, hint, placeholder and menu word on the site
- **Colors & Theme:** chalkboard and notebook colors, paper and four sticky-note colors, 7 presets, Google Fonts (heading, body, handwriting, mono), text size, roundness, width, background pattern, and every effect on/off
- **Custom code:** extra CSS and `<head>` HTML (analytics, verification tags)
- **Photos (Memory Box):** "Pin & publish" a photo with its memory note, date, place and note colour in one step. Every memory is shown as a card with **Edit, Hide/Show, Move up/down, Duplicate and Delete** buttons, and you can tick several to hide, show or delete them together. Every action is saved and goes live for everyone instantly. Deleting a memory also removes its photo file once nothing else uses it. You can also bulk-add photos, sort by date, switch between journal and wall layouts, and choose what the 👓 specs button does
- **Edit right on /photos:** while you're logged in to the admin, `/photos` shows an *Edit mode* bar with **Add memory**, and every memory gets Edit / Hide / Move / Delete buttons. The edit popup lets you change the photo, note, date, place and colour. Visitors never see any of this
- **Media:** upload (drag and drop), media library, bulk-add gallery photos
- **Live preview** that follows the page you're editing (desktop and mobile views)
- Inbox for contact-form messages, backup export/import, reset to defaults, `Ctrl/Cmd + S` to save

## Quick start

```bash
npm install
cp .env.example .env     # then edit ADMIN_EMAIL / ADMIN_PASSWORD / SESSION_SECRET
npm start
```

- Website: http://localhost:3000
- Admin: http://localhost:3000/admin

## Configuration (`.env`)

| Variable | Description |
| --- | --- |
| `ADMIN_EMAIL` | Admin login email |
| `ADMIN_PASSWORD` | Admin login password |
| `SESSION_SECRET` | Long random string used to sign login sessions. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `SESSION_HOURS` | How long a login lasts (default `12`) |
| `PORT` / `HOST` | Server port/host (default `3000` / `0.0.0.0`) |
| `MAX_UPLOAD_MB` | Maximum upload size (default `8`) |
| `DATABASE_URL` | Postgres connection string. **When set, all admin saves, contact messages and uploaded photos are stored in the database.** Antideploy, Render, Railway and Neon set it for you. The tables (`pf_kv`, `pf_files`) are created automatically |
| `DATABASE_SSL` | Set to `true` to force SSL if your provider needs it and the URL has no `sslmode` |
| `DATA_DIR` / `UPLOAD_DIR` | Where content and uploads are stored **when there is no `DATABASE_URL`** (local development or a persistent disk) |

> ⚠️ If `ADMIN_EMAIL` / `ADMIN_PASSWORD` are not set, the server falls back to `admin@example.com` / `changeme123` and prints a warning. Always set your own.

## How it works

```
server.js                 Express server + REST API (auth, content, uploads, messages)
data/default-content.json Default/demo content (copied on first edit)
data/content.json         Your live content (created by the admin panel, git-ignored)
data/messages.json        Contact form messages (git-ignored)
uploads/                  Images you upload (git-ignored)
public/index.html         Website shell (the server fills in per-page title/SEO and inlines the content)
public/js/main.js         Multi-page router + renders every page from the content JSON
public/css/style.css      Styles (driven by CSS variables from the theme settings)
public/admin/             Admin panel (login.html, index.html, admin.js, admin.css)
scripts/build-icons.js    Regenerates public/js/icons.js (Simple Icons + Lucide)
```

## Upgrading from the old single-page version

If a `content.json` saved by the old version exists, it is backed up automatically (as `content.v2-backup.json`) on first start. The site then switches to the new multi-page content. Your social links are kept.

## Deploying

**Storage:** if `DATABASE_URL` is set, everything the admin saves (content, photos, memory notes, uploads, contact messages, and even an auto-generated session secret) lives in **Postgres**. It's live for every visitor and survives redeploys, restarts and sleeping containers. The first time the app starts on an empty database, it imports any local `data/content.json`, `data/messages.json` and `uploads/` files once. The admin dashboard shows where saves are going.

### Antideploy (recommended, works out of the box)
1. Deploy the repo. Antideploy sees the `pg` package and gives the app a Postgres database with `DATABASE_URL` already set. There is no disk to configure.
2. In the app's **Environment variables**, set `ADMIN_EMAIL`, `ADMIN_PASSWORD` and (recommended) `SESSION_SECRET`.
3. Open `/admin`. The dashboard should say **"Saved to your database"**.

Build command: `npm install --omit=dev`. Start command: `npm start`. Port: `PORT` (default 3000).

### Neon (or any Postgres you bring yourself)
1. Copy the connection string from Neon (**Connect** → it looks like `postgresql://neondb_owner:…@ep-…neon.tech/neondb?sslmode=require&channel_binding=require`).
2. Paste it as the `DATABASE_URL` environment variable on your host, then redeploy or restart.
3. You don't have to run anything in Neon's SQL Editor, because the tables are created automatically on first start. If you want to, [`scripts/database.sql`](scripts/database.sql) has the same `CREATE TABLE` statements plus some handy check queries.

### Render / Railway / others
Add a Postgres database and set `DATABASE_URL` (Render: create a PostgreSQL instance and copy its *Internal Database URL*). Without a database you need a persistent disk with `DATA_DIR` and `UPLOAD_DIR` pointing at it. Otherwise saves and uploads are wiped on every restart or redeploy.
