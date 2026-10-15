-- Each account's best run, kept apart from the full history in `entries`.
-- The board and "where do I stand" read this — a row per account, indexed by
-- damage — instead of ranking every run ever handed in, which read the whole
-- history on every look and would have spent D1's free daily reads on a
-- busy day.
CREATE TABLE best (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  entry_id INTEGER NOT NULL,
  damage INTEGER NOT NULL,
  level INTEGER NOT NULL,
  survived_ms INTEGER NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX best_board ON best (damage DESC, at ASC);

-- From what is there already: each account's top run, a tie to the earliest.
INSERT INTO best (user_id, entry_id, damage, level, survived_ms, at)
SELECT user_id, id, damage, level, survived_ms, at FROM (
  SELECT e.*, ROW_NUMBER() OVER (PARTITION BY e.user_id ORDER BY e.damage DESC, e.at ASC) AS n
    FROM entries e WHERE e.user_id IS NOT NULL
) WHERE n = 1;

-- The rate limit counts one account's recent runs; this keeps that a lookup.
CREATE INDEX entries_user_time ON entries (user_id, at_ms);
