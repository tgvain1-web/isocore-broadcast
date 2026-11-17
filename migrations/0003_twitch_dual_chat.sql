-- Signed EventSub chat, opt-in ghost/echo responses, encrypted OAuth credentials.
CREATE TABLE IF NOT EXISTS chat_bot_state (
 id INTEGER PRIMARY KEY CHECK(id=1),
 enabled INTEGER NOT NULL DEFAULT 0,
 broadcaster_id TEXT NOT NULL DEFAULT '',
 login TEXT NOT NULL DEFAULT '',
 access_cipher TEXT NOT NULL DEFAULT '',
 refresh_cipher TEXT NOT NULL DEFAULT '',
 expires_at INTEGER NOT NULL DEFAULT 0,
 subscribed INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO chat_bot_state(id) VALUES (1);
CREATE TABLE IF NOT EXISTS chat_oauth_nonce(nonce TEXT PRIMARY KEY,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS chat_bot_inbox (
 id TEXT PRIMARY KEY,who TEXT NOT NULL,chatter_id TEXT NOT NULL,
 chatter_name TEXT NOT NULL,question TEXT NOT NULL,at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',reply TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_chat_bot_inbox_at ON chat_bot_inbox(at DESC);
