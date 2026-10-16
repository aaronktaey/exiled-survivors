-- 밸런스 다이얼: the values the admin made everyone's, laid over balance.ts.
-- One row, as a JSON object of { "PATH": number } (src/config/tuning.ts).
CREATE TABLE tuning (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  overrides TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);
