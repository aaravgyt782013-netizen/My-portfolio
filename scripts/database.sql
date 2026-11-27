-- Portfolio database setup (Postgres / Neon)
-- ------------------------------------------------------------------
-- You normally DON'T need to run this: the app creates these tables
-- by itself the first time it starts with DATABASE_URL set.
-- Running it by hand in the Neon SQL Editor is safe too (IF NOT EXISTS).

-- Site content, contact messages and settings (one JSON value per key)
CREATE TABLE IF NOT EXISTS pf_kv (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Uploaded photos and files (/uploads/...)
CREATE TABLE IF NOT EXISTS pf_files (
  name       text PRIMARY KEY,
  mime       text NOT NULL,
  size       integer NOT NULL,
  data       bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------
-- Handy checks (run any of these in the SQL Editor):

-- What has been saved, and when?
-- SELECT key, updated_at FROM pf_kv ORDER BY updated_at DESC;

-- Your /photos memories
-- SELECT jsonb_array_length(value->'photos'->'items') AS memories FROM pf_kv WHERE key = 'content';

-- Uploaded files
-- SELECT name, mime, pg_size_pretty(size::bigint) AS size, created_at FROM pf_files ORDER BY created_at DESC;

-- ⚠️ Reset the whole website back to the default content (cannot be undone):
-- DELETE FROM pf_kv WHERE key = 'content';
