-- The shared ranking: every run handed in, kept, and read best first.
CREATE TABLE entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '',
  flag TEXT NOT NULL DEFAULT '',
  damage INTEGER NOT NULL,
  level INTEGER NOT NULL,
  survived_ms INTEGER NOT NULL,
  -- When, as the ISO string the board shows and as milliseconds for the
  -- rate limit to count with.
  at TEXT NOT NULL,
  at_ms INTEGER NOT NULL,
  -- A salted one-way hash of the address it came from; never the address.
  ip_hash TEXT NOT NULL
);

CREATE INDEX entries_board ON entries (damage DESC, at ASC);
CREATE INDEX entries_address ON entries (ip_hash, at_ms);
