-- +postgres
ALTER TABLE sleep_cycles ADD COLUMN IF NOT EXISTS score DOUBLE PRECISION NULL;

-- +sqlite
ALTER TABLE sleep_cycles ADD COLUMN score DOUBLE NULL;
