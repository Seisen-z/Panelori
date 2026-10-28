CREATE TABLE mangas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL,
  author TEXT, artist TEXT, description TEXT, genre TEXT,
  status INTEGER NOT NULL DEFAULT 0, thumbnail_url TEXT,
  favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0, 1)),
  date_added INTEGER,
  viewer_flags INTEGER NOT NULL DEFAULT 0,
  chapter_flags INTEGER NOT NULL DEFAULT 0,
  cover_last_modified INTEGER NOT NULL DEFAULT 0,
  update_strategy INTEGER NOT NULL DEFAULT 0,
  initialized INTEGER NOT NULL DEFAULT 0,
  UNIQUE(source_id, url)
);
CREATE TABLE chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manga_id INTEGER NOT NULL REFERENCES mangas(id) ON DELETE CASCADE,
  url TEXT NOT NULL, name TEXT NOT NULL, scanlator TEXT,
  read INTEGER NOT NULL DEFAULT 0 CHECK(read IN (0, 1)),
  bookmark INTEGER NOT NULL DEFAULT 0,
  last_page_read INTEGER NOT NULL DEFAULT 0,
  date_fetch INTEGER NOT NULL DEFAULT 0,
  date_upload INTEGER NOT NULL DEFAULT 0,
  chapter_number REAL NOT NULL DEFAULT -1,
  source_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(manga_id, url)
);
CREATE TABLE history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id INTEGER NOT NULL UNIQUE REFERENCES chapters(id) ON DELETE CASCADE,
  last_read INTEGER NOT NULL, time_read INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE, sort INTEGER NOT NULL DEFAULT 0, flags INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE manga_categories (
  manga_id INTEGER NOT NULL REFERENCES mangas(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY(manga_id, category_id)
);
-- Future tracker implementations store encrypted envelopes, not plaintext.
CREATE TABLE tracker_tokens (
  tracker TEXT PRIMARY KEY, access_token TEXT NOT NULL, refresh_token TEXT, expires_at INTEGER
);
CREATE TABLE manga_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manga_id INTEGER NOT NULL REFERENCES mangas(id) ON DELETE CASCADE,
  tracker TEXT NOT NULL, remote_id TEXT NOT NULL, title TEXT,
  status INTEGER NOT NULL DEFAULT 0, score REAL NOT NULL DEFAULT 0,
  last_chapter_read REAL NOT NULL DEFAULT 0,
  UNIQUE(manga_id, tracker)
);
CREATE TABLE extensions (
  id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, nsfw INTEGER NOT NULL DEFAULT 0, version TEXT
);
CREATE INDEX idx_chapters_manga ON chapters(manga_id);
CREATE INDEX idx_history_chapter ON history(chapter_id);
CREATE INDEX idx_manga_categories_manga ON manga_categories(manga_id);
