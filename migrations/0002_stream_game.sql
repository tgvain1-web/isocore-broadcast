-- Isocore Broadcast live-game override. Empty game means automatic Twitch category.
CREATE TABLE IF NOT EXISTS stream_game_override (
  id INTEGER PRIMARY KEY CHECK(id=1),
  game TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO stream_game_override (id,game,updated_at) VALUES (1,'',0);
