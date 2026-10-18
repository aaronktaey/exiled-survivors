-- 어제의 랭킹: the board's day (rankingDayStart) on which an account last
-- saw the day before's first, second and third, so it is shown once a day
-- per account rather than once per device.
ALTER TABLE users ADD COLUMN podium_seen INTEGER NOT NULL DEFAULT 0;
