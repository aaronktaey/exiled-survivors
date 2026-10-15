-- The shared board starts over every day at 05:00 Korean time
-- (RANKING.dailyReset): each account has one best run per day, and the board
-- reads only the day it is in. `day` is when that day began, in milliseconds
-- since the epoch — 20:00 UTC the evening before.
CREATE TABLE daily_best (
  day INTEGER NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  entry_id INTEGER NOT NULL,
  damage INTEGER NOT NULL,
  level INTEGER NOT NULL,
  survived_ms INTEGER NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (day, user_id)
);
CREATE INDEX daily_best_board ON daily_best (day, damage DESC, at ASC);

-- From the history: each account's top run of each day, a tie to the earliest.
-- 14400000 is the four hours between 05:00 KST and the next UTC midnight.
INSERT INTO daily_best (day, user_id, entry_id, damage, level, survived_ms, at)
SELECT day, user_id, id, damage, level, survived_ms, at FROM (
  SELECT e.*,
         ((e.at_ms + 14400000) / 86400000) * 86400000 - 14400000 AS day,
         ROW_NUMBER() OVER (
           PARTITION BY e.user_id, (e.at_ms + 14400000) / 86400000
           ORDER BY e.damage DESC, e.at ASC
         ) AS n
    FROM entries e WHERE e.user_id IS NOT NULL
) WHERE n = 1;

DROP TABLE best;
