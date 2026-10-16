-- 공유 랭킹: each account's count of days it finished first, and the skill
-- each run on the board was played on (the run's first, main skill).
ALTER TABLE users ADD COLUMN daily_wins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE entries ADD COLUMN skill TEXT NOT NULL DEFAULT '';
ALTER TABLE daily_best ADD COLUMN skill TEXT NOT NULL DEFAULT '';

-- How far the wins have been counted: every day up to and including
-- `through_day` has had its winner credited. -1 is "none yet", so the first
-- look counts every finished day there already is.
CREATE TABLE tally (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  through_day INTEGER NOT NULL
);
INSERT INTO tally (id, through_day) VALUES (1, -1);
