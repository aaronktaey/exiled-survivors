-- 공유 랭킹: alongside each account's days at first place, its days at second
-- and third. Days already counted (up to tally.through_day) are filled in from
-- daily_best here; later days are credited by tallyWins with the first.
ALTER TABLE users ADD COLUMN daily_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN daily_thirds INTEGER NOT NULL DEFAULT 0;

UPDATE users SET
  daily_seconds = (
    SELECT COUNT(*) FROM (
      SELECT user_id, ROW_NUMBER() OVER (PARTITION BY day ORDER BY damage DESC, at ASC) AS n
        FROM daily_best WHERE day <= (SELECT through_day FROM tally WHERE id = 1)
    ) placed WHERE placed.user_id = users.id AND placed.n = 2
  ),
  daily_thirds = (
    SELECT COUNT(*) FROM (
      SELECT user_id, ROW_NUMBER() OVER (PARTITION BY day ORDER BY damage DESC, at ASC) AS n
        FROM daily_best WHERE day <= (SELECT through_day FROM tally WHERE id = 1)
    ) placed WHERE placed.user_id = users.id AND placed.n = 3
  );
