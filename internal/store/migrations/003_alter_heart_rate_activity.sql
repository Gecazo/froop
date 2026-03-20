-- +postgres
ALTER TABLE heart_rate ADD COLUMN IF NOT EXISTS activity BIGINT NULL;

-- +sqlite
ALTER TABLE heart_rate ADD COLUMN activity BIGINT NULL;
