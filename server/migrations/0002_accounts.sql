-- Accounts: optional sign-in through Google, Facebook, X or Kakao, so a
-- player's records follow them between devices and the ranking knows who
-- set each run.

-- One person. Their ranking name lives here, so one account is one name.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  -- What the provider calls them, for the account screen only.
  display_name TEXT NOT NULL DEFAULT '',
  rank_name TEXT NOT NULL DEFAULT '',
  rank_emoji TEXT NOT NULL DEFAULT '',
  rank_flag TEXT NOT NULL DEFAULT ''
);

-- How they sign in. Kept apart from users so that one account can later
-- hold more than one way in.
CREATE TABLE identities (
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  PRIMARY KEY (provider, subject)
);
CREATE INDEX identities_user ON identities (user_id);

-- Signed-in browsers. Only a hash of the cookie's value is kept.
CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

-- The account's copy of everything the game keeps in localStorage.
CREATE TABLE saves (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Runs on the ranking now belong to an account.
ALTER TABLE entries ADD COLUMN user_id TEXT;
CREATE INDEX entries_user ON entries (user_id, damage DESC);
