ALTER TABLE extensions ADD COLUMN filename TEXT NOT NULL DEFAULT '';
ALTER TABLE extensions ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';
CREATE TABLE chapter_pages (
  chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  page_index INTEGER NOT NULL,
  url TEXT NOT NULL,
  image_url TEXT NOT NULL,
  headers_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY(chapter_id, page_index)
);
CREATE TABLE reader_preferences (
  manga_id INTEGER PRIMARY KEY REFERENCES mangas(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'pager',
  direction TEXT NOT NULL DEFAULT 'ltr',
  preload INTEGER NOT NULL DEFAULT 3,
  zoom REAL NOT NULL DEFAULT 1
);
CREATE TABLE reader_defaults (
  id INTEGER PRIMARY KEY CHECK(id=1),
  mode TEXT NOT NULL DEFAULT 'pager',
  direction TEXT NOT NULL DEFAULT 'ltr',
  preload INTEGER NOT NULL DEFAULT 3,
  zoom REAL NOT NULL DEFAULT 1
);
INSERT INTO reader_defaults(id) VALUES(1);
