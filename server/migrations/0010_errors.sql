-- 오류 수집 (0.160): what went wrong on a player's device, kept 30 days.
-- user_id is the account when the player was signed in (the user's pick), and
-- is cleared when that account is deleted. address is the salted hash the
-- ranking uses, only to cap how many one place can send in a day.
CREATE TABLE errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  user_id TEXT,
  address TEXT NOT NULL,
  platform TEXT,
  build TEXT,
  version TEXT,
  message TEXT NOT NULL,
  source TEXT,
  stack TEXT,
  scene TEXT,
  screen TEXT,
  lang TEXT,
  agent TEXT
);
CREATE INDEX errors_at ON errors (at);
CREATE INDEX errors_address_at ON errors (address, at);
