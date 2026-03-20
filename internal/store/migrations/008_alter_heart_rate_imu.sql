-- +postgres
ALTER TABLE heart_rate ADD COLUMN IF NOT EXISTS imu_data JSONB NULL;

-- +sqlite
ALTER TABLE heart_rate ADD COLUMN imu_data TEXT NULL;
