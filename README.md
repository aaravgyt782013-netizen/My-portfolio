# aarav.exe — Portfolio ✨

> Silent moves. Loud dreams.

A cinematic developer portfolio with a built-in **admin panel (CMS)**. You can change everything on the site from the browser: text, links, colors, fonts, photos, projects, products, sections and more. You don't need to touch any code.

![stack](https://img.shields.io/badge/Node.js-Express-8b5cf6) ![no-db](https://img.shields.io/badge/database-none%20(JSON%20file)-22d3ee)

## Features

**Website** (dark, cinematic `.exe` aesthetic)
- 🖥️ **Terminal boot screen** on first visit (lines are editable, can be skipped or turned off)
- 🕸️ Hero with an **interactive spider-web canvas** that reacts to the cursor, a glitching name, typing roles and animated stats
- 💻 **Interactive terminal**: visitors can type `help`, `whoami`, `projects`, `socials`, `open github`, plus your own custom commands
- ⌘ **Command menu** (`Ctrl/⌘ + K` or `/`) to jump to sections, copy your email, switch theme or open socials
- ♾️ Infinite **tech-logo marquee**
- 🍱 **Bento-grid About** with a live local clock, "currently" list, interests, quote and count-up stats
- Services, skills, **case-study project cards** (3D tilt, spotlight hover, filters), **store** with prices and features, an animated journey timeline, a **bento gallery** with lightbox, testimonials and a **contact** section with copy-email and a working form
- ✨ Custom cursor, magnetic buttons, film grain, scroll-progress bar, scroll reveals, dark/light mode, fully responsive, SEO and social-share tags

**Admin panel** (`/admin`)
- Login page. Email and password come from **environment variables**
- Edit **every** section, the terminal commands, the boot screen, the marquee and the services. Add, remove, reorder and duplicate items
- **Colors & theme:** pick any color, use 8 presets (Rose Noir, Spider-Verse, …), choose Google Fonts (heading/body/mono), set corner roundness, pick the hero effect and switch each effect on/off
- **Sections & menu:** show/hide, rename and reorder sections
- **Photos:** upload (drag and drop), media library, bulk-add gallery photos
- **Live preview** that updates as you type (desktop and mobile views)
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
| `DATA_DIR` / `UPLOAD_DIR` | Where content and uploads are stored. Point these at a persistent disk when you deploy |

> ⚠️ If `ADMIN_EMAIL` / `ADMIN_PASSWORD` are not set, the server falls back to `admin@example.com` / `changeme123` and prints a warning. Always set your own.

## How it works

```
server.js                 Express server + REST API (auth, content, uploads, messages)
data/default-content.json Default/demo content (copied on first edit)
data/content.json         Your live content (created by the admin panel, git-ignored)
data/messages.json        Contact form messages (git-ignored)
uploads/                  Images you upload (git-ignored)
public/index.html         Website shell
public/js/main.js         Renders the site from the content JSON
public/css/style.css      Styles (driven by CSS variables from the theme settings)
public/admin/             Admin panel (login.html, index.html, admin.js, admin.css)
scripts/build-icons.js    Regenerates public/js/icons.js (Simple Icons + Lucide)
```

## Deploying

This app needs a Node.js host with a persistent disk, for example **Render**, **Railway**, **Fly.io** or a VPS. Set the environment variables in the host's dashboard. Point `DATA_DIR` and `UPLOAD_DIR` at the persistent disk so your edits and uploads survive redeploys.
