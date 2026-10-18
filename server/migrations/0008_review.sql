-- 랭킹 검토: each run keeps what the game said about it (판 내역 — version,
-- kills by kind, 뼈다귀, weapon, skills, 패시브) for the admin to read, and a
-- run the admin takes off the board is marked rather than deleted, so the
-- account's next best that day can stand in and the record is still there.
ALTER TABLE entries ADD COLUMN detail TEXT NOT NULL DEFAULT '';
ALTER TABLE entries ADD COLUMN removed_at INTEGER;

-- The review compares a run with every run of a like length lately.
CREATE INDEX entries_recent ON entries (at_ms);
