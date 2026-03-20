-- +postgres
ALTER TABLE heart_rate ADD COLUMN IF NOT EXISTS sensor_data JSONB NULL;

-- +sqlite
ALTER TABLE heart_rate ADD COLUMN sensor_data TEXT NULL;
