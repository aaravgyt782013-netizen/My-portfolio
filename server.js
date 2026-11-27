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
  const cur = readJSON(CONTENT_FILE, null);
  if (!cur) return def;
  const merged = mergeDefaults(def, cur);
  // make sure every known section exists in the section list
  if (Array.isArray(merged.sections) && Array.isArray(def.sections)) {
    for (const s of def.sections) if (!merged.sections.find((x) => x.id === s.id)) merged.sections.push({ ...s, enabled: false });
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
  if (!isObj(body) || !isObj(body.site) || !isObj(body.theme) || !Array.isArray(body.sections)) {
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

// Public page: inject SEO tags + content so the page renders instantly with no flash.
app.get(['/', '/index.html'], (req, res) => {
  const c = getContent();
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8')
    .replaceAll('{{TITLE}}', esc(c.site?.title))
    .replaceAll('{{DESCRIPTION}}', esc(c.site?.description))
    .replaceAll('{{KEYWORDS}}', esc(c.site?.keywords))
    .replaceAll('{{FAVICON}}', esc(c.site?.favicon || '/favicon.png'))
    .replaceAll('{{OG_IMAGE}}', esc(c.site?.ogImage || ''))
    .replaceAll('{{THEME_MODE}}', c.theme?.mode === 'light' ? 'light' : 'dark')
    .replace('/*{{CONTENT}}*/', 'window.__CONTENT__ = ' + JSON.stringify(c).replace(/</g, '\\u003c') + ';');
  res.set('Cache-Control', 'no-store').type('html').send(html);
});

app.get(['/admin', '/admin/'], (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin', 'index.html')));
app.get('/admin/login', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin', 'login.html')));

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', setHeaders: (res, p) => { if (p.endsWith('.svg')) res.set('Content-Security-Policy', "script-src 'none'"); } }));
app.use(express.static(PUBLIC_DIR, { index: false, maxAge: '1h' }));

app.use((req, res) => res.status(404).type('html').send('<h1 style="font-family:sans-serif">404 — Page not found</h1><a href="/">Go home</a>'));

app.listen(PORT, HOST, () => {
  console.log(`✅ Portfolio running at http://localhost:${PORT}`);
  console.log(`🔐 Admin panel at   http://localhost:${PORT}/admin  (login: ${ADMIN_EMAIL})`);
});
