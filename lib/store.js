/**
 * Storage for everything the admin saves: site content, contact messages and uploaded files.
 *
 *  - DATABASE_URL set  → Postgres (Antideploy, Render, Railway, Neon, Supabase…).
 *                        Content + messages are rows in `pf_kv`, uploaded photos/files are rows in `pf_files`.
 *                        Survives redeploys, restarts and sleeping containers.
 *  - no DATABASE_URL   → plain files in DATA_DIR / UPLOAD_DIR (handy for local development).
 *
 * Reads are served from memory (the app runs as a single instance), writes go straight to storage,
 * so every visitor sees what the admin saved the moment the save succeeds.
 */
const fs = require('fs');
const path = require('path');

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.pdf': 'application/pdf' };
const mimeOf = (name) => MIME[path.extname(name).toLowerCase()] || 'application/octet-stream';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function createStore({ dataDir, uploadDir, databaseUrl }) {
  const cache = new Map(); // key -> value (content, messages, secret…)
  const fileFor = (key) => path.join(dataDir, key + '.json');

  /* ------------------------------ files mode ------------------------------ */
  if (!databaseUrl) {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(uploadDir, { recursive: true });
    const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return undefined; } };
    const writeJSON = (f, data) => { const tmp = f + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(data, null, 2)); fs.renameSync(tmp, f); };
    return {
      kind: 'files',
      label: 'files in ' + dataDir,
      async init() {},
      get(key) { if (!cache.has(key)) cache.set(key, readJSON(fileFor(key))); return cache.get(key); },
      async set(key, value) { writeJSON(fileFor(key), value); cache.set(key, value); },
      async del(key) { try { fs.unlinkSync(fileFor(key)); } catch {} cache.delete(key); },
      async putFile(name, mime, data) { fs.writeFileSync(path.join(uploadDir, name), data); },
      async getFile(name) {
        const p = path.join(uploadDir, path.basename(name));
        try { const st = fs.statSync(p); if (!st.isFile()) return null; return { mime: mimeOf(name), data: fs.readFileSync(p), size: st.size, mtime: st.mtimeMs }; } catch { return null; }
      },
      async listFiles() {
        return fs.readdirSync(uploadDir).filter((f) => !f.startsWith('.'))
          .map((f) => { const st = fs.statSync(path.join(uploadDir, f)); return { name: f, size: st.size, mtime: st.mtimeMs }; });
      },
      async deleteFile(name) { const p = path.join(uploadDir, path.basename(name)); if (!fs.existsSync(p)) return false; fs.unlinkSync(p); return true; },
    };
  }

  /* ----------------------------- Postgres mode ----------------------------- */
  const { Pool } = require('pg');
  const ssl = /^(1|true|require)$/i.test(process.env.DATABASE_SSL || '') ? { rejectUnauthorized: false } : undefined;
  const pool = new Pool({ connectionString: databaseUrl, ssl, max: 5, connectionTimeoutMillis: 20000, idleTimeoutMillis: 30000 });
  pool.on('error', (e) => console.error('Postgres pool error:', e.message)); // a dropped idle connection must not crash the app
  const q = (text, params) => pool.query(text, params);

  // serialise writes per key so an older save can never land after a newer one
  const queues = new Map();
  function enqueue(key, job) {
    const next = (queues.get(key) || Promise.resolve()).catch(() => {}).then(job);
    queues.set(key, next);
    return next;
  }

  // small in-memory cache for uploaded files so popular photos don't hit the database every time
  const fileCache = new Map(); let fileCacheBytes = 0; const FILE_CACHE_MAX = 48 * 1024 * 1024;
  function cacheFile(name, f) {
    if (!f || f.size > 8 * 1024 * 1024) return;
    if (fileCache.has(name)) { fileCacheBytes -= fileCache.get(name).size; fileCache.delete(name); }
    fileCache.set(name, f); fileCacheBytes += f.size;
    for (const [k, v] of fileCache) { if (fileCacheBytes <= FILE_CACHE_MAX) break; fileCache.delete(k); fileCacheBytes -= v.size; }
  }

  return {
    kind: 'postgres',
    label: 'Postgres database',
    async init({ importFrom } = {}) {
      for (let attempt = 1; ; attempt++) {
        try { await q('SELECT 1'); break; } catch (e) {
          if (attempt >= 6) throw new Error('Could not connect to the database (DATABASE_URL): ' + e.message);
          console.warn(`… database not reachable yet (${e.message}) — retrying (${attempt}/5)`);
          await wait(attempt * 2000);
        }
      }
      await q(`CREATE TABLE IF NOT EXISTS pf_kv (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
      await q(`CREATE TABLE IF NOT EXISTS pf_files (name text PRIMARY KEY, mime text NOT NULL, size integer NOT NULL, data bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
      const { rows } = await q('SELECT key, value FROM pf_kv');
      for (const r of rows) cache.set(r.key, r.value);

      // first start on a database: bring over anything saved locally before (content, messages, uploads)
      if (importFrom) {
        for (const key of ['content', 'messages']) {
          if (cache.has(key)) continue;
          try { const v = JSON.parse(fs.readFileSync(path.join(importFrom.dataDir, key + '.json'), 'utf8')); await this.set(key, v); console.log(`ℹ️  Imported ${key}.json into the database.`); } catch {}
        }
        try {
          const { rows: [{ n }] } = await q('SELECT count(*)::int AS n FROM pf_files');
          if (n === 0 && fs.existsSync(importFrom.uploadDir)) {
            const files = fs.readdirSync(importFrom.uploadDir).filter((f) => !f.startsWith('.') && MIME[path.extname(f).toLowerCase()]);
            for (const f of files) await this.putFile(f, mimeOf(f), fs.readFileSync(path.join(importFrom.uploadDir, f)));
            if (files.length) console.log(`ℹ️  Imported ${files.length} uploaded file(s) into the database.`);
          }
        } catch (e) { console.warn('Upload import skipped:', e.message); }
      }
    },
    get(key) { return cache.get(key); },
    set(key, value) {
      cache.set(key, value);
      return enqueue(key, () => q(
        `INSERT INTO pf_kv (key, value, updated_at) VALUES ($1, $2::jsonb, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, JSON.stringify(cache.get(key))], // always write the newest value
      ));
    },
    del(key) { cache.delete(key); return enqueue(key, () => q('DELETE FROM pf_kv WHERE key = $1', [key])); },
    async putFile(name, mime, data) {
      await q(`INSERT INTO pf_files (name, mime, size, data) VALUES ($1, $2, $3, $4)
               ON CONFLICT (name) DO UPDATE SET mime = EXCLUDED.mime, size = EXCLUDED.size, data = EXCLUDED.data, created_at = now()`, [name, mime, data.length, data]);
      fileCache.delete(name);
    },
    async getFile(name) {
      if (fileCache.has(name)) { const f = fileCache.get(name); fileCache.delete(name); fileCache.set(name, f); return f; }
      const { rows } = await q('SELECT mime, size, data, created_at FROM pf_files WHERE name = $1', [name]);
      if (!rows.length) return null;
      const f = { mime: rows[0].mime, size: rows[0].size, data: rows[0].data, mtime: new Date(rows[0].created_at).getTime() };
      cacheFile(name, f);
      return f;
    },
    async listFiles() {
      const { rows } = await q('SELECT name, size, created_at FROM pf_files');
      return rows.map((r) => ({ name: r.name, size: r.size, mtime: new Date(r.created_at).getTime() }));
    },
    async deleteFile(name) {
      const { rowCount } = await q('DELETE FROM pf_files WHERE name = $1', [name]);
      if (fileCache.has(name)) { fileCacheBytes -= fileCache.get(name).size; fileCache.delete(name); }
      return rowCount > 0;
    },
  };
}

module.exports = { createStore, mimeOf };
