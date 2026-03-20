package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/gecazo/froop/internal/algorithms"
	"github.com/gecazo/froop/internal/model"
)

func (s *Store) CreatePacket(charUUID string, data []byte) (model.Packet, error) {
	ctx := context.Background()
	if s.dialect == DialectPostgres {
		query := `INSERT INTO packets(uuid, bytes) VALUES (?, ?) RETURNING id`
		var id int32
		if err := s.db.QueryRowContext(ctx, rebind(query, s.dialect), charUUID, data).Scan(&id); err != nil {
			return model.Packet{}, err
		}
		return model.Packet{ID: id, UUID: charUUID, Bytes: append([]byte(nil), data...)}, nil
	}

	res, err := s.db.ExecContext(ctx, `INSERT INTO packets(uuid, bytes) VALUES (?, ?)`, charUUID, data)
	if err != nil {
		return model.Packet{}, err
	}
	last, _ := res.LastInsertId()
	return model.Packet{ID: int32(last), UUID: charUUID, Bytes: append([]byte(nil), data...)}, nil
}

func (s *Store) GetPackets(afterID int32) ([]model.Packet, error) {
	ctx := context.Background()
	query := rebind(`SELECT id, uuid, bytes FROM packets WHERE id > ? ORDER BY id ASC LIMIT 10000`, s.dialect)
	rows, err := s.db.QueryContext(ctx, query, afterID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]model.Packet, 0)
	for rows.Next() {
		var p model.Packet
		if err := rows.Scan(&p.ID, &p.UUID, &p.Bytes); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) CreateReading(reading model.HistoryReading) error {
	return s.CreateReadings([]model.HistoryReading{reading})
}

func (s *Store) CreateReadings(readings []model.HistoryReading) error {
	if len(readings) == 0 {
		return nil
	}
	ctx := context.Background()
	query := rebind(`INSERT INTO heart_rate
		(bpm, time, rr_intervals, activity, stress, spo2, skin_temp, imu_data, sensor_data, synced)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(time) DO UPDATE SET
			bpm = excluded.bpm,
			rr_intervals = excluded.rr_intervals,
			sensor_data = excluded.sensor_data`, s.dialect)

	for _, r := range readings {
		imuJSON, err := json.Marshal(r.ImuData)
		if err != nil {
			return err
		}
		var sensorJSON any
		if r.SensorData != nil {
			b, err := json.Marshal(r.SensorData)
			if err != nil {
				return err
			}
			sensorJSON = string(b)
		}
		if _, err := s.db.ExecContext(ctx, query,
			int16(r.BPM),
			unixMillisToLocal(r.UnixMS),
			rrToString(r.RR),
			nil,
			nil,
			nil,
			nil,
			string(imuJSON),
			sensorJSON,
			false,
		); err != nil {
			return err
		}
	}

	return nil
}

func (s *Store) SearchHistory(options SearchHistory) ([]model.ParsedHistoryReading, error) {
	ctx := context.Background()
	query := `SELECT time, bpm, rr_intervals, imu_data, sensor_data FROM heart_rate WHERE 1=1`
	args := make([]any, 0)
	if options.From != nil {
		query += ` AND time > ?`
		args = append(args, *options.From)
	}
	if options.To != nil {
		query += ` AND time < ?`
		args = append(args, *options.To)
	}
	query += ` ORDER BY time ASC`
	if options.Limit != nil {
		query += ` LIMIT ?`
		args = append(args, *options.Limit)
	}
	rows, err := s.db.QueryContext(ctx, rebind(query, s.dialect), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]model.ParsedHistoryReading, 0)
	for rows.Next() {
		var timeRaw any
		var bpm int16
		var rrStr string
		var imuRaw any
		var sensorRaw any
		if err := rows.Scan(&timeRaw, &bpm, &rrStr, &imuRaw, &sensorRaw); err != nil {
			return nil, err
		}
		tm, err := parseDBTime(timeRaw)
		if err != nil {
			return nil, err
		}

		reading := model.ParsedHistoryReading{
			Time: tm,
			BPM:  uint8(bpm),
			RR:   rrFromString(rrStr),
		}
		if imuBytes := jsonBytes(imuRaw); len(imuBytes) > 0 {
			_ = json.Unmarshal(imuBytes, &reading.ImuData)
		}
		if sensorBytes := jsonBytes(sensorRaw); len(sensorBytes) > 0 {
			var sensor model.SensorData
			if err := json.Unmarshal(sensorBytes, &sensor); err == nil {
				gravity := sensor.AccelGravity
				reading.Gravity = &gravity
			}
		}
		out = append(out, reading)
	}

	return out, rows.Err()
}

func (s *Store) LastStressTime() (*time.Time, error) {
	ctx := context.Background()
	query := rebind(`SELECT time FROM heart_rate WHERE stress IS NOT NULL ORDER BY time DESC LIMIT 1`, s.dialect)
	var raw any
	err := s.db.QueryRowContext(ctx, query).Scan(&raw)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	tm, err := parseDBTime(raw)
	if err != nil {
		return nil, err
	}
	return &tm, nil
}

func (s *Store) UpdateStressOnReading(stress model.StressScore) error {
	ctx := context.Background()
	query := rebind(`UPDATE heart_rate SET stress = ? WHERE time = ?`, s.dialect)
	_, err := s.db.ExecContext(ctx, query, stress.Score, stress.Time)
	return err
}

func (s *Store) LastSpO2Time() (*time.Time, error) {
	ctx := context.Background()
	query := rebind(`SELECT time FROM heart_rate WHERE spo2 IS NOT NULL ORDER BY time DESC LIMIT 1`, s.dialect)
	var raw any
	err := s.db.QueryRowContext(ctx, query).Scan(&raw)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	tm, err := parseDBTime(raw)
	if err != nil {
		return nil, err
	}
	return &tm, nil
}

func (s *Store) SearchSensorReadings(options SearchHistory) ([]model.SpO2Reading, error) {
	ctx := context.Background()
	query := `SELECT time, sensor_data FROM heart_rate WHERE sensor_data IS NOT NULL`
	args := make([]any, 0)
	if options.From != nil {
		query += ` AND time > ?`
		args = append(args, *options.From)
	}
	if options.To != nil {
		query += ` AND time < ?`
		args = append(args, *options.To)
	}
	query += ` ORDER BY time ASC`
	if options.Limit != nil {
		query += ` LIMIT ?`
		args = append(args, *options.Limit)
	}
	rows, err := s.db.QueryContext(ctx, rebind(query, s.dialect), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]model.SpO2Reading, 0)
	for rows.Next() {
		var timeRaw any
		var sensorRaw any
		if err := rows.Scan(&timeRaw, &sensorRaw); err != nil {
			return nil, err
		}
		tm, err := parseDBTime(timeRaw)
		if err != nil {
			return nil, err
		}
		var sensor model.SensorData
		if err := json.Unmarshal(jsonBytes(sensorRaw), &sensor); err != nil {
			continue
		}
		out = append(out, model.SpO2Reading{Time: tm, SPO2Red: sensor.SPO2Red, SPO2IR: sensor.SPO2IR})
	}
	return out, rows.Err()
}

func (s *Store) UpdateSpO2OnReading(score model.SpO2Score) error {
	ctx := context.Background()
	query := rebind(`UPDATE heart_rate SET spo2 = ? WHERE time = ?`, s.dialect)
	_, err := s.db.ExecContext(ctx, query, score.SPO2Percentage, score.Time)
	return err
}

func (s *Store) LastSkinTempTime() (*time.Time, error) {
	ctx := context.Background()
	query := rebind(`SELECT time FROM heart_rate WHERE skin_temp IS NOT NULL ORDER BY time DESC LIMIT 1`, s.dialect)
	var raw any
	err := s.db.QueryRowContext(ctx, query).Scan(&raw)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	tm, err := parseDBTime(raw)
	if err != nil {
		return nil, err
	}
	return &tm, nil
}

func (s *Store) SearchTempReadings(options SearchHistory) ([]model.TempReading, error) {
	ctx := context.Background()
	query := `SELECT time, sensor_data FROM heart_rate WHERE sensor_data IS NOT NULL AND skin_temp IS NULL`
	args := make([]any, 0)
	if options.From != nil {
		query += ` AND time > ?`
		args = append(args, *options.From)
	}
	if options.To != nil {
		query += ` AND time < ?`
		args = append(args, *options.To)
	}
	query += ` ORDER BY time ASC`
	if options.Limit != nil {
		query += ` LIMIT ?`
		args = append(args, *options.Limit)
	}
	rows, err := s.db.QueryContext(ctx, rebind(query, s.dialect), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]model.TempReading, 0)
	for rows.Next() {
		var timeRaw any
		var sensorRaw any
		if err := rows.Scan(&timeRaw, &sensorRaw); err != nil {
			return nil, err
		}
		tm, err := parseDBTime(timeRaw)
		if err != nil {
			return nil, err
		}
		var sensor model.SensorData
		if err := json.Unmarshal(jsonBytes(sensorRaw), &sensor); err != nil {
			continue
		}
		out = append(out, model.TempReading{Time: tm, SkinTempRaw: sensor.SkinTempRaw})
	}
	return out, rows.Err()
}

func (s *Store) UpdateSkinTempOnReading(score model.SkinTempScore) error {
	ctx := context.Background()
	query := rebind(`UPDATE heart_rate SET skin_temp = ? WHERE time = ?`, s.dialect)
	_, err := s.db.ExecContext(ctx, query, score.TempCelsius, score.Time)
	return err
}

func (s *Store) GetLatestSleep() (*model.SleepCycle, error) {
	ctx := context.Background()
	query := rebind(`SELECT sleep_id, start, "end", min_bpm, max_bpm, avg_bpm, min_hrv, max_hrv, avg_hrv, score
		FROM sleep_cycles ORDER BY "end" DESC LIMIT 1`, s.dialect)
	var sleepID string
	var startRaw, endRaw any
	var minBPM, maxBPM, avgBPM int16
	var minHRV, maxHRV, avgHRV int32
	var scoreRaw any
	err := s.db.QueryRowContext(ctx, query).Scan(&sleepID, &startRaw, &endRaw, &minBPM, &maxBPM, &avgBPM, &minHRV, &maxHRV, &avgHRV, &scoreRaw)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	cycle, err := sleepCycleFromRow(sleepID, startRaw, endRaw, minBPM, maxBPM, avgBPM, minHRV, maxHRV, avgHRV, toFloat64Ptr(scoreRaw))
	if err != nil {
		return nil, err
	}
	return &cycle, nil
}

func (s *Store) CreateSleep(sleep model.SleepCycle) error {
	ctx := context.Background()
	query := rebind(`INSERT INTO sleep_cycles
		(id, sleep_id, start, "end", min_bpm, max_bpm, avg_bpm, min_hrv, max_hrv, avg_hrv, score, synced)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(sleep_id) DO UPDATE SET
			start = excluded.start,
			"end" = excluded."end",
			min_bpm = excluded.min_bpm,
			max_bpm = excluded.max_bpm,
			avg_bpm = excluded.avg_bpm,
			min_hrv = excluded.min_hrv,
			max_hrv = excluded.max_hrv,
			avg_hrv = excluded.avg_hrv`, s.dialect)
	_, err := s.db.ExecContext(ctx, query,
		newUUIDString(),
		dateOnly(sleep.ID),
		sleep.Start,
		sleep.End,
		int16(sleep.MinBPM),
		int16(sleep.MaxBPM),
		int16(sleep.AvgBPM),
		int32(sleep.MinHRV),
		int32(sleep.MaxHRV),
		int32(sleep.AvgHRV),
		sleep.Score,
		false,
	)
	return err
}

func (s *Store) GetSleepCycles(start *time.Time) ([]model.SleepCycle, error) {
	ctx := context.Background()
	query := `SELECT sleep_id, start, "end", min_bpm, max_bpm, avg_bpm, min_hrv, max_hrv, avg_hrv, score
		FROM sleep_cycles WHERE 1=1`
	args := make([]any, 0)
	if start != nil {
		query += ` AND start >= ?`
		args = append(args, *start)
	}
	query += ` ORDER BY start ASC`
	rows, err := s.db.QueryContext(ctx, rebind(query, s.dialect), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]model.SleepCycle, 0)
	for rows.Next() {
		var sleepID string
		var startRaw, endRaw any
		var minBPM, maxBPM, avgBPM int16
		var minHRV, maxHRV, avgHRV int32
		var scoreRaw any
		if err := rows.Scan(&sleepID, &startRaw, &endRaw, &minBPM, &maxBPM, &avgBPM, &minHRV, &maxHRV, &avgHRV, &scoreRaw); err != nil {
			return nil, err
		}
		cycle, err := sleepCycleFromRow(sleepID, startRaw, endRaw, minBPM, maxBPM, avgBPM, minHRV, maxHRV, avgHRV, toFloat64Ptr(scoreRaw))
		if err != nil {
			return nil, err
		}
		out = append(out, cycle)
	}
	return out, rows.Err()
}

func (s *Store) CreateActivity(activity model.ActivityPeriod) error {
	ctx := context.Background()
	query := rebind(`INSERT INTO activities(period_id, start, "end", activity, synced)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(start) DO UPDATE SET
			"end" = excluded."end",
			activity = excluded.activity`, s.dialect)
	_, err := s.db.ExecContext(ctx, query,
		dateOnly(activity.PeriodID),
		activity.From,
		activity.To,
		string(activity.Activity),
		false,
	)
	return err
}

func (s *Store) SearchActivities(options SearchActivityPeriods) ([]model.ActivityPeriod, error) {
	ctx := context.Background()
	query := `SELECT period_id, start, "end", activity FROM activities WHERE 1=1`
	args := make([]any, 0)
	if options.From != nil {
		query += ` AND start > ?`
		args = append(args, *options.From)
	}
	if options.To != nil {
		query += ` AND "end" < ?`
		args = append(args, *options.To)
	}
	if options.Activity != nil {
		query += ` AND activity = ?`
		args = append(args, string(*options.Activity))
	}
	rows, err := s.db.QueryContext(ctx, rebind(query, s.dialect), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]model.ActivityPeriod, 0)
	for rows.Next() {
		var periodIDRaw any
		var fromRaw, toRaw any
		var activity string
		if err := rows.Scan(&periodIDRaw, &fromRaw, &toRaw, &activity); err != nil {
			return nil, err
		}
		periodID, err := parseDBTime(periodIDRaw)
		if err != nil {
			return nil, err
		}
		from, err := parseDBTime(fromRaw)
		if err != nil {
			return nil, err
		}
		to, err := parseDBTime(toRaw)
		if err != nil {
			return nil, err
		}
		out = append(out, model.ActivityPeriod{
			PeriodID: dateOnlyTime(periodID),
			From:     from,
			To:       to,
			Activity: parseActivityType(activity),
		})
	}
	return out, rows.Err()
}

func (s *Store) GetLatestActivity() (*model.ActivityPeriod, error) {
	ctx := context.Background()
	query := rebind(`SELECT period_id, start, "end", activity FROM activities ORDER BY "end" DESC LIMIT 1`, s.dialect)
	var periodIDRaw any
	var fromRaw, toRaw any
	var activity string
	err := s.db.QueryRowContext(ctx, query).Scan(&periodIDRaw, &fromRaw, &toRaw, &activity)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	periodID, err := parseDBTime(periodIDRaw)
	if err != nil {
		return nil, err
	}
	from, err := parseDBTime(fromRaw)
	if err != nil {
		return nil, err
	}
	to, err := parseDBTime(toRaw)
	if err != nil {
		return nil, err
	}
	result := model.ActivityPeriod{
		PeriodID: dateOnlyTime(periodID),
		From:     from,
		To:       to,
		Activity: parseActivityType(activity),
	}
	return &result, nil
}

func (s *Store) calculateDerivedDataWindow(base *time.Time, size int) SearchHistory {
	if base == nil {
		return SearchHistory{Limit: uint64Ptr(86400)}
	}
	from := base.Add(-time.Duration(size) * time.Second)
	return SearchHistory{From: &from, Limit: uint64Ptr(86400)}
}

func uint64Ptr(v uint64) *uint64 {
	return &v
}

func (s *Store) CalculateStress() error {
	for {
		last, err := s.LastStressTime()
		if err != nil {
			return err
		}
		opts := s.calculateDerivedDataWindow(last, algorithms.MinReadingPeriod)
		history, err := s.SearchHistory(opts)
		if err != nil {
			return err
		}
		if len(history) == 0 || len(history) <= algorithms.MinReadingPeriod {
			break
		}
		for i := 0; i+algorithms.MinReadingPeriod <= len(history); i++ {
			if score, ok := algorithms.CalculateStress(history[i : i+algorithms.MinReadingPeriod]); ok {
				if err := s.UpdateStressOnReading(score); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func (s *Store) CalculateSpO2() error {
	for {
		last, err := s.LastSpO2Time()
		if err != nil {
			return err
		}
		opts := s.calculateDerivedDataWindow(last, algorithms.SpO2WindowSize)
		readings, err := s.SearchSensorReadings(opts)
		if err != nil {
			return err
		}
		if len(readings) == 0 || len(readings) <= algorithms.SpO2WindowSize {
			break
		}
		for i := 0; i+algorithms.SpO2WindowSize <= len(readings); i++ {
			if score, ok := algorithms.CalculateSpO2(readings[i : i+algorithms.SpO2WindowSize]); ok {
				if err := s.UpdateSpO2OnReading(score); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func (s *Store) CalculateSkinTemp() error {
	for {
		readings, err := s.SearchTempReadings(SearchHistory{Limit: uint64Ptr(86400)})
		if err != nil {
			return err
		}
		if len(readings) == 0 {
			break
		}
		for _, r := range readings {
			if score, ok := algorithms.ConvertSkinTemp(r.Time, r.SkinTempRaw); ok {
				if err := s.UpdateSkinTempOnReading(score); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func (s *Store) MergePacketsFrom(source *Store) error {
	var id int32
	for {
		packets, err := source.GetPackets(id)
		if err != nil {
			return err
		}
		if len(packets) == 0 {
			return nil
		}
		for _, packet := range packets {
			id = packet.ID
			if _, err := s.CreatePacket(packet.UUID, packet.Bytes); err != nil {
				return err
			}
		}
	}
}

func (s *Store) UpsertHeartRateForSync(
	bpm int16,
	tm time.Time,
	rr string,
	activity any,
	stress any,
	spo2 any,
	skinTemp any,
	imu any,
	sensor any,
) error {
	ctx := context.Background()
	query := rebind(`INSERT INTO heart_rate
		(bpm, time, rr_intervals, activity, stress, spo2, skin_temp, imu_data, sensor_data, synced)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(time) DO UPDATE SET
			bpm = excluded.bpm,
			rr_intervals = excluded.rr_intervals,
			activity = COALESCE(excluded.activity, heart_rate.activity),
			stress = COALESCE(excluded.stress, heart_rate.stress),
			spo2 = COALESCE(excluded.spo2, heart_rate.spo2),
			skin_temp = COALESCE(excluded.skin_temp, heart_rate.skin_temp),
			imu_data = COALESCE(excluded.imu_data, heart_rate.imu_data),
			sensor_data = COALESCE(excluded.sensor_data, heart_rate.sensor_data),
			synced = excluded.synced`, s.dialect)
	_, err := s.db.ExecContext(ctx, query, bpm, tm, rr, activity, stress, spo2, skinTemp, imu, sensor, true)
	return err
}

func (s *Store) UpsertSleepForSync(cycle model.SleepCycle) error {
	ctx := context.Background()
	query := rebind(`INSERT INTO sleep_cycles
		(id, sleep_id, start, "end", min_bpm, max_bpm, avg_bpm, min_hrv, max_hrv, avg_hrv, score, synced)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(sleep_id) DO UPDATE SET
			start = excluded.start,
			"end" = excluded."end",
			min_bpm = excluded.min_bpm,
			max_bpm = excluded.max_bpm,
			avg_bpm = excluded.avg_bpm,
			min_hrv = excluded.min_hrv,
			max_hrv = excluded.max_hrv,
			avg_hrv = excluded.avg_hrv,
			score = COALESCE(excluded.score, sleep_cycles.score),
			synced = excluded.synced`, s.dialect)
	_, err := s.db.ExecContext(ctx, query,
		newUUIDString(),
		dateOnly(cycle.ID),
		cycle.Start,
		cycle.End,
		int16(cycle.MinBPM),
		int16(cycle.MaxBPM),
		int16(cycle.AvgBPM),
		int32(cycle.MinHRV),
		int32(cycle.MaxHRV),
		int32(cycle.AvgHRV),
		cycle.Score,
		true,
	)
	return err
}

func (s *Store) UpsertActivityForSync(activity model.ActivityPeriod) error {
	ctx := context.Background()
	query := rebind(`INSERT INTO activities(period_id, start, "end", activity, synced)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(start) DO UPDATE SET
			period_id = excluded.period_id,
			"end" = excluded."end",
			activity = excluded.activity,
			synced = excluded.synced`, s.dialect)
	_, err := s.db.ExecContext(ctx, query,
		dateOnly(activity.PeriodID),
		activity.From,
		activity.To,
		string(activity.Activity),
		true,
	)
	return err
}

func (s *Store) markSyncedByIDs(table string, ids []int32) error {
	if len(ids) == 0 {
		return nil
	}
	ctx := context.Background()
	placeholders := strings.Repeat("?,", len(ids))
	placeholders = strings.TrimSuffix(placeholders, ",")
	query := fmt.Sprintf(`UPDATE %s SET synced = ? WHERE id IN (%s)`, table, placeholders)
	args := make([]any, 0, len(ids)+1)
	args = append(args, true)
	for _, id := range ids {
		args = append(args, id)
	}
	_, err := s.db.ExecContext(ctx, rebind(query, s.dialect), args...)
	return err
}

func (s *Store) markSyncedByStringKey(table string, keyColumn string, values []string) error {
	if len(values) == 0 {
		return nil
	}
	ctx := context.Background()
	placeholders := strings.Repeat("?,", len(values))
	placeholders = strings.TrimSuffix(placeholders, ",")
	query := fmt.Sprintf(`UPDATE %s SET synced = ? WHERE %s IN (%s)`, table, keyColumn, placeholders)
	args := make([]any, 0, len(values)+1)
	args = append(args, true)
	for _, v := range values {
		args = append(args, v)
	}
	_, err := s.db.ExecContext(ctx, rebind(query, s.dialect), args...)
	return err
}
