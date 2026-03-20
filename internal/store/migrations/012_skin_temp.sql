-- +postgres
ALTER TABLE heart_rate ADD COLUMN IF NOT EXISTS skin_temp DOUBLE PRECISION NULL;

-- +sqlite
ALTER TABLE heart_rate ADD COLUMN skin_temp DOUBLE NULL;
