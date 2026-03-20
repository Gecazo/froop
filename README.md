# OpenWhoop Go CLI (froop)

A Go rewrite of the OpenWhoop CLI with parity for the current command set:

- `scan`
- `download-history`
- `rerun`
- `detect-events`
- `sleep-stats`
- `exercise-stats`
- `calculate-stress`
- `calculate-spo2`
- `calculate-skin-temp`
- `set-alarm`
- `merge`
- `restart`
- `erase`
- `version`
- `enable-imu`
- `sync`
- `download-firmware`
- `completions`

## Build

```bash
go build ./cmd/openwhoop
```

## Global flags/env

- `--database-url` / `DATABASE_URL`
- `--debug-packets` / `DEBUG_PACKETS`
- `--ble-interface` / `BLE_INTERFACE` (Linux compatibility only)

## Command examples

```bash
openwhoop --database-url sqlite://./openwhoop.db scan
openwhoop --database-url sqlite://./openwhoop.db download-history --whoop WHOOP_ID
openwhoop --database-url sqlite://./openwhoop.db rerun
openwhoop --database-url sqlite://./openwhoop.db detect-events
openwhoop --database-url sqlite://./openwhoop.db sleep-stats
openwhoop --database-url sqlite://./openwhoop.db exercise-stats
openwhoop --database-url sqlite://./openwhoop.db calculate-stress
openwhoop --database-url sqlite://./openwhoop.db calculate-spo2
openwhoop --database-url sqlite://./openwhoop.db calculate-skin-temp
openwhoop --database-url sqlite://./openwhoop.db set-alarm --whoop WHOOP_ID 5min
openwhoop --database-url sqlite://./openwhoop.db merge sqlite://./other.db
openwhoop --database-url sqlite://./openwhoop.db restart --whoop WHOOP_ID
openwhoop --database-url sqlite://./openwhoop.db erase --whoop WHOOP_ID
openwhoop --database-url sqlite://./openwhoop.db version --whoop WHOOP_ID
openwhoop --database-url sqlite://./openwhoop.db enable-imu --whoop WHOOP_ID
openwhoop --database-url sqlite://./openwhoop.db sync --remote postgres://user:pass@host/db
openwhoop download-firmware --email you@example.com --password secret
openwhoop completions bash
```

## Storage contract

The v1 Go rewrite keeps the same storage workflow and table names:

- `packets`
- `heart_rate`
- `sleep_cycles`
- `activities`

Migrations are SQL-based (`internal/store/migrations`) and are applied at startup via a thin migrator.
SQLite and PostgreSQL are both supported.

## Project layout

- `cmd/openwhoop`: CLI entrypoint
- `internal/config`: flags/env parsing
- `internal/protocol`: frame/CRC/UUIDs/command builders
- `internal/decoder`: packet decoding (`WhoopData` equivalents)
- `internal/store`: `database/sql`, migrations, sync/upsert logic
- `internal/algorithms`: sleep/activity/stress/SpO2/temp/strain
- `internal/device`: BLE adapter interface and mock/noop implementations
- `internal/app`: command orchestration and firmware API flow

## Tests

```bash
go test ./...
```
