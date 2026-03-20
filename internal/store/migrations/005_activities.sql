-- +postgres
CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY,
  period_id DATE NOT NULL,
  start TIMESTAMP NOT NULL UNIQUE,
  "end" TIMESTAMP NOT NULL,
  activity VARCHAR(64) NOT NULL,
  CONSTRAINT fk_activities_sleep_cycles
    FOREIGN KEY(period_id)
    REFERENCES sleep_cycles(sleep_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

-- +sqlite
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_id DATE NOT NULL,
  start DATETIME NOT NULL UNIQUE,
  "end" DATETIME NOT NULL,
  activity TEXT NOT NULL,
  CONSTRAINT fk_activities_sleep_cycles
    FOREIGN KEY(period_id)
    REFERENCES sleep_cycles(sleep_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);
