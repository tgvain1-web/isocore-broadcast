-- Persistent AI-character allegiance: each Twitch user follows at most one character.
CREATE TABLE IF NOT EXISTS ai_followers (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  side TEXT NOT NULL CHECK(side IN ('ghost','echo')),
  joined_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_followers_side ON ai_followers(side);
CREATE TABLE IF NOT EXISTS ai_chat_events (event_id TEXT PRIMARY KEY, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ai_dialogue (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 who TEXT NOT NULL CHECK(who IN ('ghost','echo')),
 text TEXT NOT NULL,
 kind TEXT NOT NULL,
 at INTEGER NOT NULL,
 event_id TEXT UNIQUE,
 chatter_id TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_ai_dialogue_recent ON ai_dialogue(at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_dialogue_chatter ON ai_dialogue(chatter_id,at DESC);
CREATE TABLE IF NOT EXISTS ai_telemetry (
 id INTEGER PRIMARY KEY CHECK (id=1),
 updated_at INTEGER NOT NULL DEFAULT 0,
 payload TEXT NOT NULL DEFAULT '{}'
);
INSERT OR IGNORE INTO ai_telemetry(id,updated_at,payload) VALUES (1,0,'{}');