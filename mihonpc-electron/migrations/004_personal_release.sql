-- Tracking was removed by user request. Earlier migrations remain immutable.
DROP TABLE manga_tracks;
DROP TABLE tracker_tokens;
DELETE FROM settings WHERE key='autoTracking';
CREATE TABLE download_jobs (
 chapter_id INTEGER PRIMARY KEY REFERENCES chapters(id) ON DELETE CASCADE,
 state TEXT NOT NULL CHECK(state IN ('queued','downloading','paused','completed','cancelled','error')),
 done INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
 storage TEXT NOT NULL, error TEXT NOT NULL DEFAULT '', updated INTEGER NOT NULL
);
CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
