package store

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/gecazo/froop/internal/model"
)

const (
	heartRateBatch   = 90
	sleepCyclesBatch = 80
	activitiesBatch  = 160
)

func (s *Store) SyncWith(remote *Store) (SyncReport, error) {
	sleepLR, err := syncSleepCycles(s, remote)
	if err != nil {
		return SyncReport{}, err
	}
	sleepRL, err := syncSleepCycles(remote, s)
	if err != nil {
		return SyncReport{}, err
	}

	actLR, err := syncActivities(s, remote)
	if err != nil {
		return SyncReport{}, err
	}
	actRL, err := syncActivities(remote, s)
	if err != nil {
		return SyncReport{}, err
	}

	hrLR, err := syncHeartRate(s, remote)
	if err != nil {
		return SyncReport{}, err
	}
	hrRL, err := syncHeartRate(remote, s)
	if err != nil {
		return SyncReport{}, err
	}

	return SyncReport{
		SleepCyclesSynced: sleepLR + sleepRL,
		ActivitiesSynced:  actLR + actRL,
		HeartRateSynced:   hrLR + hrRL,
	}, nil
}

func syncSleepCycles(source, target *Store) (int, error) {
	total := 0
	for {
		rows, err := source.db.QueryContext(context.Background(), rebind(`SELECT id, sleep_id, start, "end", min_bpm, max_bpm, avg_bpm, min_hrv, max_hrv, avg_hrv, score FROM sleep_cycles WHERE synced = ? ORDER BY sleep_id ASC LIMIT ?`, source.dialect), false, sleepCyclesBatch)
		if err != nil {
			return total, err
		}
		batchCount := 0
		sleepIDs := make([]string, 0)
		for rows.Next() {
			batchCount++
			var sourceID any
			var sleepID string
			var startRaw, endRaw any
			var minBPM, maxBPM, avgBPM int16
			var minHRV, maxHRV, avgHRV int32
			var scoreRaw any
			if err := rows.Scan(&sourceID, &sleepID, &startRaw, &endRaw, &minBPM, &maxBPM, &avgBPM, &minHRV, &maxHRV, &avgHRV, &scoreRaw); err != nil {
				rows.Close()
				return total, err
			}
			cycle, err := sleepCycleFromRow(sleepID, startRaw, endRaw, minBPM, maxBPM, avgBPM, minHRV, maxHRV, avgHRV, toFloat64Ptr(scoreRaw))
			if err != nil {
				rows.Close()
				return total, err
			}
			if err := target.UpsertSleepForSync(cycle); err != nil {
				rows.Close()
				return total, err
			}
			_ = sourceID
			sleepIDs = append(sleepIDs, sleepID)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return total, err
		}
		rows.Close()
		if len(sleepIDs) > 0 {
			if err := source.markSyncedByStringKey("sleep_cycles", "sleep_id", sleepIDs); err != nil {
				return total, err
			}
		}
		total += batchCount
		if batchCount < sleepCyclesBatch {
			break
		}
	}
	return total, nil
}

func syncActivities(source, target *Store) (int, error) {
	total := 0
	for {
		rows, err := source.db.QueryContext(context.Background(), rebind(`SELECT id, period_id, start, "end", activity FROM activities WHERE synced = ? ORDER BY start ASC LIMIT ?`, source.dialect), false, activitiesBatch)
		if err != nil {
			return total, err
		}
		batchCount := 0
		ids := make([]int32, 0)
		for rows.Next() {
			batchCount++
			var idRaw any
			var periodRaw, startRaw, endRaw any
			var activity string
			if err := rows.Scan(&idRaw, &periodRaw, &startRaw, &endRaw, &activity); err != nil {
				rows.Close()
				return total, err
			}
			periodID, err := parseDBTime(periodRaw)
			if err != nil {
				rows.Close()
				return total, err
			}
			start, err := parseDBTime(startRaw)
			if err != nil {
				rows.Close()
				return total, err
			}
			end, err := parseDBTime(endRaw)
			if err != nil {
				rows.Close()
				return total, err
			}
			act := model.ActivityPeriod{PeriodID: dateOnlyTime(periodID), From: start, To: end, Activity: parseActivityType(activity)}
			if err := target.UpsertActivityForSync(act); err != nil {
				rows.Close()
				return total, err
			}
			if id, ok := idRaw.(int64); ok {
				ids = append(ids, int32(id))
			}
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return total, err
		}
		rows.Close()
		if len(ids) > 0 {
			if err := source.markSyncedByIDs("activities", ids); err != nil {
				return total, err
			}
		}
		total += batchCount
		if batchCount < activitiesBatch {
			break
		}
	}
	return total, nil
}

func syncHeartRate(source, target *Store) (int, error) {
	total := 0
	for {
		rows, err := source.db.QueryContext(context.Background(), rebind(`SELECT id, bpm, time, rr_intervals, activity, stress, spo2, skin_temp, imu_data, sensor_data FROM heart_rate WHERE synced = ? ORDER BY time ASC LIMIT ?`, source.dialect), false, heartRateBatch)
		if err != nil {
			return total, err
		}
		batchCount := 0
		ids := make([]int32, 0)
		for rows.Next() {
			batchCount++
			var idRaw any
			var bpm int16
			var timeRaw any
			var rr string
			var activity any
			var stress any
			var spo2 any
			var skinTemp any
			var imu any
			var sensor any
			if err := rows.Scan(&idRaw, &bpm, &timeRaw, &rr, &activity, &stress, &spo2, &skinTemp, &imu, &sensor); err != nil {
				rows.Close()
				return total, err
			}
			tm, err := parseDBTime(timeRaw)
			if err != nil {
				rows.Close()
				return total, err
			}

			var imuJSON any
			if b := jsonBytes(imu); len(b) > 0 {
				imuJSON = string(b)
			}
			var sensorJSON any
			if b := jsonBytes(sensor); len(b) > 0 {
				sensorJSON = string(b)
			}
			if err := target.UpsertHeartRateForSync(bpm, tm, rr, nullable(activity), nullable(stress), nullable(spo2), nullable(skinTemp), imuJSON, sensorJSON); err != nil {
				rows.Close()
				return total, err
			}
			if id, ok := idRaw.(int64); ok {
				ids = append(ids, int32(id))
			}
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return total, err
		}
		rows.Close()
		if len(ids) > 0 {
			if err := source.markSyncedByIDs("heart_rate", ids); err != nil {
				return total, err
			}
		}
		total += batchCount
		if batchCount < heartRateBatch {
			break
		}
	}
	return total, nil
}

func nullable(v any) any {
	switch x := v.(type) {
	case nil:
		return nil
	case []byte:
		if len(x) == 0 {
			return nil
		}
		return string(x)
	case string:
		if x == "" {
			return nil
		}
		return x
	default:
		return x
	}
}

// ensure model package is referenced in this file for goimports ordering
var _ sql.NullString
var _ = json.RawMessage{}
