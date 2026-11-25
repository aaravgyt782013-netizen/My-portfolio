# My Portfolio ✨

A modern developer portfolio with a built-in **admin panel (CMS)**. You can change everything on the site from the browser: text, links, colors, fonts, photos, projects, products, sections and more. You don't need to touch any code.

![stack](https://img.shields.io/badge/Node.js-Express-8b5cf6) ![no-db](https://img.shields.io/badge/database-none%20(JSON%20file)-22d3ee)

## Features

**Website**
- Hero section with a typing animation, profile photo, availability badge and social icons
- About section with bio, stats and a resume/CV download
- Skills grouped by category, with animated level bars
- Projects with cover images, tags, filters and live/code links
- **Products and services** with price, badge and a buy/order button (works with Gumroad, Razorpay, Instamojo, WhatsApp and similar)
- Journey timeline, an Instagram-style gallery with a lightbox, and testimonials
- Contact section: email, phone, WhatsApp, location, plus a working contact form (with spam protection)
- Dark/light mode, responsive layout, SEO and social-share tags

**Admin panel** (`/admin`)
- Login page. Email and password come from **environment variables**
- Edit every section. Add, remove, reorder and duplicate items
- **Colors and theme:** pick any color, use 6 one-click presets, choose Google Fonts, set corner roundness and turn effects on/off
- **Sections and menu:** show/hide, rename and reorder sections
- **Photos:** upload (drag and drop), media library, bulk-add gallery photos
- **Live preview** that updates as you type (desktop and mobile views)
- Inbox for contact-form messages (mark read, reply, delete)
- Backup export/import and reset to defaults
- `Ctrl/Cmd + S` saves

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
