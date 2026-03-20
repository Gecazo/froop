-- +postgres
ALTER TABLE heart_rate ADD COLUMN IF NOT EXISTS stress DOUBLE PRECISION NULL;
CREATE UNIQUE INDEX IF NOT EXISTS heart_rate_time_index ON heart_rate(time);

-- +sqlite
ALTER TABLE heart_rate ADD COLUMN stress DOUBLE NULL;
CREATE UNIQUE INDEX IF NOT EXISTS heart_rate_time_index ON heart_rate(time);
