/**
 * Portfolio + Admin CMS server
 * - Public site:   GET /
 * - Admin panel:   GET /admin   (login at /admin/login)
 * - Content API:   GET /api/content  |  PUT /api/admin/content (auth)
 *
 * Admin credentials come from environment variables (see .env.example):
 *   ADMIN_EMAIL, ADMIN_PASSWORD, SESSION_SECRET
 */
require('dotenv').config();

const express = require('express');
const compression = require('compression');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_HOURS = Number(process.env.SESSION_HOURS) || 12;
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 8;

const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(ROOT, 'uploads');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DEFAULT_CONTENT = path.join(ROOT, 'data', 'default-content.json');
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  console.warn('\n⚠️  ADMIN_EMAIL / ADMIN_PASSWORD not set — using insecure defaults (admin@example.com / changeme123).');
  console.warn('   Copy .env.example to .env and set your own credentials.\n');
}
if (!process.env.SESSION_SECRET) {
  console.warn('⚠️  SESSION_SECRET not set — a random one is used, so admins are logged out on every restart.\n');
}

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ----------------------------- storage helpers ----------------------------- */
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJSON(file, data) {
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file); // atomic replace
}
function defaults() { return readJSON(DEFAULT_CONTENT, {}); }
function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
/** Fill keys missing from saved content with defaults (so new fields appear after upgrades). */
function mergeDefaults(def, cur) {
  if (!isObj(def) || !isObj(cur)) return cur === undefined ? def : cur;
  const out = { ...cur };
  for (const k of Object.keys(def)) out[k] = k in cur ? mergeDefaults(def[k], cur[k]) : def[k];
  return out;
}
function getContent() {
  const def = defaults();
  let cur = readJSON(CONTENT_FILE, null);
  if (!cur) return def;
  // one-time migration: content saved by an older version (single-page layout) is backed up
  // and replaced by the new multi-page defaults — only the social links are carried over.
  if (!(Number(cur.version) >= Number(def.version || 0))) {
    try { fs.writeFileSync(CONTENT_FILE.replace(/\.json$/, '') + '.v' + (cur.version || 2) + '-backup.json', JSON.stringify(cur, null, 2)); } catch (e) { /* ignore */ }
    cur = { ...def, socials: Array.isArray(cur.socials) && cur.socials.length ? cur.socials : def.socials };
    try { writeJSON(CONTENT_FILE, cur); } catch (e) { /* ignore */ }
    console.log('ℹ️  Migrated saved content to version ' + def.version + ' (old copy kept as a backup file).');
  }
  const merged = mergeDefaults(def, cur);
  // make sure every known page exists in the page list (new pages appear switched off)
  if (!Array.isArray(merged.pages)) merged.pages = def.pages;
  else if (Array.isArray(def.pages)) {
    const ON_BY_DEFAULT = ['photos']; // pages the owner asked for — switched on right away after an upgrade
    for (const p of def.pages) {
      if (merged.pages.find((x) => x.id === p.id)) continue;
      const at = def.pages.findIndex((d) => d.id === p.id), prev = def.pages[at - 1];
      const i = prev ? merged.pages.findIndex((x) => x.id === prev.id) : -1;
      const page = { ...p, enabled: ON_BY_DEFAULT.includes(p.id) ? p.enabled : false };
      if (i >= 0) merged.pages.splice(i + 1, 0, page); else merged.pages.push(page);
    }
    merged.pages = merged.pages.map((p) => ({ ...(def.pages.find((d) => d.id === p.id) || {}), ...p }));
  }
  return merged;
}
function getMessages() { return readJSON(MESSAGES_FILE, []); }

/* --------------------------------- auth ---------------------------------- */
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const b64url = (s) => Buffer.from(s).toString('base64url');

function signToken(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}
function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!p.exp || Date.now() > p.exp) return null;
    if (p.email !== ADMIN_EMAIL) return null; // invalidates sessions if the admin email changes
    return p;
  } catch { return null; }
}
function requireAuth(req, res, next) {
  const h = req.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  const user = verifyToken(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  next();
}

// tiny in-memory rate limiter for login + contact
const buckets = new Map();
function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) { buckets.set(key, { count: 1, reset: now + windowMs }); return true; }
  b.count += 1;
  return b.count <= limit;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k); }, 60_000).unref();

/* --------------------------------- app ----------------------------------- */
const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(compression()); // gzip everything — makes HTML/JS/CSS ~4x smaller over the wire
app.use(express.json({ limit: '5mb' }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ---- public API
app.get('/api/content', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(getContent());
});

app.post('/api/contact', (req, res) => {
  const content = getContent();
  if (!content.contact?.formEnabled) return res.status(403).json({ error: 'Contact form is disabled.' });
  if (!rateLimit('contact:' + req.ip, 5, 10 * 60_000)) return res.status(429).json({ error: 'Too many messages. Please try again later.' });
  const { name, email, subject, message, website } = req.body || {};
  if (website) return res.json({ ok: true }); // honeypot field — bots fill it, humans don't see it
  const clean = (v, max) => String(v || '').trim().slice(0, max);
  const msg = {
    id: crypto.randomUUID(),
    name: clean(name, 100),
    email: clean(email, 200),
    subject: clean(subject, 200),
    message: clean(message, 5000),
    createdAt: new Date().toISOString(),
    read: false,
  };
  if (!msg.name || !msg.message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msg.email)) {
    return res.status(400).json({ error: 'Please enter your name, a valid email and a message.' });
  }
  const all = getMessages();
  all.unshift(msg);
  writeJSON(MESSAGES_FILE, all.slice(0, 2000));
  res.json({ ok: true, message: content.contact.successMessage });
});

// ---- auth API
app.post('/api/auth/login', (req, res) => {
  const key = 'login:' + req.ip;
  const b = buckets.get(key);
  if (b && Date.now() < b.reset && b.count >= 10) {
    return res.status(429).json({ error: 'Too many failed login attempts. Try again in 15 minutes.' });
  }
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const ok = safeEqual(email, ADMIN_EMAIL) & safeEqual(password, ADMIN_PASSWORD); // no short-circuit
  if (!ok) {
    rateLimit(key, 10, 15 * 60_000); // only failed attempts count towards the lockout
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  buckets.delete(key);
  const token = signToken({ email: ADMIN_EMAIL, exp: Date.now() + SESSION_HOURS * 3600_000 });
  res.json({ token, email: ADMIN_EMAIL, expiresInHours: SESSION_HOURS });
});
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ email: req.user.email, exp: req.user.exp }));

// ---- admin API
const admin = express.Router();
admin.use(requireAuth);

admin.put('/content', (req, res) => {
  const body = req.body;
  if (!isObj(body) || !isObj(body.site) || !isObj(body.theme) || !Array.isArray(body.pages)) {
    return res.status(400).json({ error: 'Invalid content structure.' });
  }
  writeJSON(CONTENT_FILE, body);
  res.json({ ok: true, savedAt: new Date().toISOString() });
});

admin.post('/reset', (req, res) => {
  try { fs.unlinkSync(CONTENT_FILE); } catch {}
  res.json({ ok: true, content: getContent() });
});

admin.get('/defaults', (req, res) => res.json(defaults()));

// uploads
const ALLOWED = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg', 'image/x-icon': '.ico', 'image/vnd.microsoft.icon': '.ico', 'application/pdf': '.pdf' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const base = path.parse(file.originalname).name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'file';
      cb(null, `${base}-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}${ALLOWED[file.mimetype]}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => (ALLOWED[file.mimetype] ? cb(null, true) : cb(new Error('Only images (jpg, png, webp, gif, svg, ico) and PDF files are allowed.'))),
});
admin.post('/upload', (req, res) => {
  upload.array('files', 20)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ files: (req.files || []).map((f) => ({ name: f.filename, url: '/uploads/' + f.filename, size: f.size })) });
  });
});
admin.get('/uploads', (req, res) => {
  const files = fs.readdirSync(UPLOAD_DIR)
    .filter((f) => !f.startsWith('.'))
    .map((f) => { const st = fs.statSync(path.join(UPLOAD_DIR, f)); return { name: f, url: '/uploads/' + f, size: st.size, mtime: st.mtimeMs }; })
    .sort((a, b) => b.mtime - a.mtime);
  const assets = fs.existsSync(path.join(PUBLIC_DIR, 'assets'))
    ? fs.readdirSync(path.join(PUBLIC_DIR, 'assets')).filter((f) => !f.startsWith('.')).map((f) => ({ name: f, url: '/assets/' + f, builtin: true }))
    : [];
  res.json({ files, assets });
});
admin.delete('/uploads/:name', (req, res) => {
  const name = path.basename(req.params.name);
  const p = path.join(UPLOAD_DIR, name);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(p);
  res.json({ ok: true });
});

// messages
admin.get('/messages', (req, res) => res.json(getMessages()));
admin.patch('/messages/:id', (req, res) => {
  const all = getMessages();
  const m = all.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Not found' });
  if (typeof req.body?.read === 'boolean') m.read = req.body.read;
  writeJSON(MESSAGES_FILE, all);
  res.json(m);
});
admin.delete('/messages/:id', (req, res) => {
  writeJSON(MESSAGES_FILE, getMessages().filter((x) => x.id !== req.params.id));
  res.json({ ok: true });
});

app.use('/api/admin', admin);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

/* ------------------------------ pages / static ----------------------------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Cache-busting version for CSS/JS: changes whenever the files change, so browsers can cache them for a year.
function fileHash(rel) {
  try { return crypto.createHash('md5').update(fs.readFileSync(path.join(PUBLIC_DIR, rel))).digest('hex').slice(0, 8); } catch { return '0'; }
}
const ASSET_VERSION = fileHash('css/style.css') + fileHash('js/main.js').slice(0, 4) + fileHash('js/icons.js').slice(0, 4);
const ADMIN_VERSION = fileHash('admin/admin.js') + fileHash('admin/admin.css').slice(0, 4) + fileHash('js/icons.js').slice(0, 4);
const SHELL = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
const ADMIN_SHELL = fs.readFileSync(path.join(PUBLIC_DIR, 'admin', 'index.html'), 'utf8');

/** Find which page a URL path belongs to, using the slugs set in the admin panel. */
function pageForPath(c, urlPath) {
  const slug = decodeURIComponent(urlPath).replace(/^\/+|\/+$/g, '').toLowerCase();
  const pages = (c.pages || []).filter((p) => p.enabled);
  if (!slug || slug === 'index.html') return pages.find((p) => p.id === 'home') || null;
  return pages.find((p) => p.id !== 'home' && String(p.slug || p.id).toLowerCase() === slug) || null;
}

function renderShell(c, page, origin) {
  const site = c.site || {};
  let title = site.title || '';
  if (!page) title = (c.notFound?.slipTitle || '404') + ' — ' + (site.title || '');
  else if (page.seoTitle) title = page.seoTitle;
  else if (page.id !== 'home') title = page.label + ' — ' + (site.title || '');
  const preload = [];
  if (page && page.id === 'home' && c.hero?.avatar) preload.push(`<link rel="preload" as="image" href="${esc(c.hero.avatar)}" fetchpriority="high" />`);
  if (page && origin) preload.push(`<link rel="canonical" href="${esc(origin + '/' + (page.id === 'home' ? '' : page.slug || page.id))}" />`);
  const description = page && page.id !== 'home' && page.blurb ? page.blurb + ' — ' + (site.description || '') : site.description;
  return SHELL
    .replaceAll('{{TITLE}}', esc(title))
    .replaceAll('{{DESCRIPTION}}', esc(description))
    .replaceAll('{{KEYWORDS}}', esc(site.keywords))
    .replaceAll('{{FAVICON}}', esc(site.favicon || '/favicon.svg'))
    .replaceAll('{{OG_IMAGE}}', esc(site.ogImage || ''))
    .replaceAll('{{THEME_MODE}}', c.theme?.mode === 'light' ? 'light' : 'dark')
    .replaceAll('{{V}}', ASSET_VERSION)
    .replace('{{PRELOAD}}', preload.join(''))
    .replace('{{CUSTOM_HEAD}}', typeof site.customHead === 'string' ? site.customHead : '')
    .replace('/*{{CONTENT}}*/', () => 'window.__CONTENT__ = ' + JSON.stringify(c).replace(/</g, '\\u003c') + ';');
}

app.get(['/admin', '/admin/'], (req, res) => res.set('Cache-Control', 'no-store').type('html').send(ADMIN_SHELL.replaceAll('{{V}}', ADMIN_VERSION)));
const LOGIN_SHELL = fs.readFileSync(path.join(PUBLIC_DIR, 'admin', 'login.html'), 'utf8');
app.get('/admin/login', (req, res) => res.set('Cache-Control', 'no-store').type('html').send(LOGIN_SHELL.replaceAll('{{V}}', ADMIN_VERSION)));

// versioned files (?v=...) are cached for a year; everything else for an hour
const cacheHeaders = (res) => { if (res.req.query.v) res.set('Cache-Control', 'public, max-age=31536000, immutable'); };
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', setHeaders: (res, p) => { if (p.endsWith('.svg')) res.set('Content-Security-Policy', "script-src 'none'"); } }));
app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets'), { maxAge: '30d' }));
app.use(express.static(PUBLIC_DIR, { index: false, maxAge: '1h', setHeaders: cacheHeaders }));

// SEO helpers
const originOf = (req) => req.protocol + '://' + req.get('host');
app.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /api\nSitemap: ${originOf(req)}/sitemap.xml\n`));
app.get('/sitemap.xml', (req, res) => {
  const c = getContent();
  const urls = (c.pages || []).filter((p) => p.enabled).map((p) => `<url><loc>${esc(originOf(req) + '/' + (p.id === 'home' ? '' : p.slug || p.id))}</loc></url>`);
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
});

// Every page (/, /about, /projects, …) is served from the same fast shell; the browser
// then switches pages instantly without reloading. Unknown URLs get the 404 "detention slip".
app.get(/.*/, (req, res) => {
  const c = getContent();
  const page = pageForPath(c, req.path);
  res.status(page ? 200 : 404).set('Cache-Control', 'no-cache').type('html').send(renderShell(c, page, originOf(req)));
});

app.listen(PORT, HOST, () => {
  console.log(`✅ Portfolio running at http://localhost:${PORT}`);
  console.log(`🔐 Admin panel at   http://localhost:${PORT}/admin  (login: ${ADMIN_EMAIL})`);
});
