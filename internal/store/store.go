package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	_ "modernc.org/sqlite"

	"github.com/gecazo/froop/internal/algorithms"
	"github.com/gecazo/froop/internal/model"
	"github.com/google/uuid"
)

type Dialect string

const (
	DialectSQLite   Dialect = "sqlite"
	DialectPostgres Dialect = "postgres"
)

type Store struct {
	db      *sql.DB
	dialect Dialect
}

type SearchHistory struct {
	From  *time.Time
	To    *time.Time
	Limit *uint64
}

type SearchActivityPeriods struct {
	From     *time.Time
	To       *time.Time
	Activity *model.ActivityType
}

type SyncReport struct {
	SleepCyclesSynced int
	ActivitiesSynced  int
	HeartRateSynced   int
}

func (r SyncReport) String() string {
	return fmt.Sprintf("Sync complete:\n  sleep_cycles: %d\n  activities:   %d\n  heart_rate:   %d", r.SleepCyclesSynced, r.ActivitiesSynced, r.HeartRateSynced)
}

func Open(databaseURL string) (*Store, error) {
	dialect, driver, dsn, err := detectDB(databaseURL)
	if err != nil {
		return nil, err
	}

	db, err := sql.Open(driver, dsn)
	if err != nil {
		return nil, err
	}
	db.SetConnMaxLifetime(30 * time.Minute)
	db.SetMaxIdleConns(4)
	db.SetMaxOpenConns(20)
	if err := db.Ping(); err != nil {
		return nil, err
	}

	s := &Store{db: db, dialect: dialect}
	if dialect == DialectSQLite {
		if _, err := db.Exec(`PRAGMA foreign_keys = ON;`); err != nil {
			return nil, err
		}
	}
	if err := s.runMigrations(context.Background()); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *Store) SQLDB() *sql.DB {
	return s.db
}

func (s *Store) Dialect() Dialect {
	return s.dialect
}

func detectDB(databaseURL string) (Dialect, string, string, error) {
	lower := strings.ToLower(databaseURL)
	switch {
	case strings.HasPrefix(lower, "postgres://"), strings.HasPrefix(lower, "postgresql://"):
		return DialectPostgres, "pgx", databaseURL, nil
	case strings.HasPrefix(lower, "sqlite::memory:"), lower == ":memory:":
		return DialectSQLite, "sqlite", ":memory:", nil
	case strings.HasPrefix(lower, "sqlite://"):
		return DialectSQLite, "sqlite", strings.TrimPrefix(databaseURL, "sqlite://"), nil
	case strings.HasPrefix(lower, "sqlite:"):
		return DialectSQLite, "sqlite", strings.TrimPrefix(databaseURL, "sqlite:"), nil
	default:
		// Treat as sqlite path for compatibility with rust examples.
		if strings.Contains(lower, "://") {
			return "", "", "", fmt.Errorf("unsupported database url: %s", databaseURL)
		}
		return DialectSQLite, "sqlite", databaseURL, nil
	}
}

func rebind(query string, dialect Dialect) string {
	if dialect != DialectPostgres {
		return query
	}
	var b strings.Builder
	idx := 1
	for i := 0; i < len(query); i++ {
		if query[i] == '?' {
			b.WriteString("$")
			b.WriteString(strconv.Itoa(idx))
			idx++
		} else {
			b.WriteByte(query[i])
		}
	}
	return b.String()
}

func unixMillisToLocal(unixMS uint64) time.Time {
	return time.UnixMilli(int64(unixMS)).In(time.Local)
}

func rrToString(rr []uint16) string {
	parts := make([]string, 0, len(rr))
	for _, v := range rr {
		parts = append(parts, strconv.Itoa(int(v)))
	}
	return strings.Join(parts, ",")
}

func rrFromString(s string) []uint16 {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	chunks := strings.Split(s, ",")
	out := make([]uint16, 0, len(chunks))
	for _, c := range chunks {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		v, err := strconv.Atoi(c)
		if err == nil && v >= 0 && v <= 65535 {
			out = append(out, uint16(v))
		}
	}
	return out
}

func parseDBTime(v any) (time.Time, error) {
	switch t := v.(type) {
	case time.Time:
		return t, nil
	case string:
		return parseTimeString(t)
	case []byte:
		return parseTimeString(string(t))
	default:
		return time.Time{}, fmt.Errorf("unsupported time type %T", v)
	}
}

func parseTimeString(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, errors.New("empty time")
	}
	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05.999999999-07:00",
		"2006-01-02 15:04:05.999999999",
		"2006-01-02 15:04:05",
		"2006-01-02",
	}
	for _, layout := range layouts {
		if t, err := time.ParseInLocation(layout, s, time.Local); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("failed to parse time: %q", s)
}

func dateOnly(t time.Time) string {
	return t.Format("2006-01-02")
}

func boolFromDB(v any) bool {
	switch b := v.(type) {
	case bool:
		return b
	case int64:
		return b != 0
	case int:
		return b != 0
	case float64:
		return b != 0
	case []byte:
		s := strings.ToLower(string(b))
		return s == "1" || s == "t" || s == "true"
	case string:
		s := strings.ToLower(b)
		return s == "1" || s == "t" || s == "true"
	default:
		return false
	}
}

func nullJSON[T any](value *T) (any, error) {
	if value == nil {
		return nil, nil
	}
	b, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	return string(b), nil
}

func jsonBytes(v any) []byte {
	switch j := v.(type) {
	case nil:
		return nil
	case string:
		return []byte(j)
	case []byte:
		return j
	default:
		b, _ := json.Marshal(j)
		return b
	}
}

func sleepCycleFromRow(
	sleepID string,
	startAny any,
	endAny any,
	minBPM int16,
	maxBPM int16,
	avgBPM int16,
	minHRV int32,
	maxHRV int32,
	avgHRV int32,
	score *float64,
) (model.SleepCycle, error) {
	start, err := parseDBTime(startAny)
	if err != nil {
		return model.SleepCycle{}, err
	}
	end, err := parseDBTime(endAny)
	if err != nil {
		return model.SleepCycle{}, err
	}
	idTime, err := parseTimeString(sleepID)
	if err != nil {
		idTime = dateOnlyTime(end)
	}
	cycle := model.SleepCycle{
		ID:     dateOnlyTime(idTime),
		Start:  start,
		End:    end,
		MinBPM: uint8(minBPM),
		MaxBPM: uint8(maxBPM),
		AvgBPM: uint8(avgBPM),
		MinHRV: uint16(minHRV),
		MaxHRV: uint16(maxHRV),
		AvgHRV: uint16(avgHRV),
	}
	if score != nil {
		cycle.Score = *score
	} else {
		cycle.Score = algorithms.SleepScore(cycle.Start, cycle.End)
	}
	return cycle, nil
}

func dateOnlyTime(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, t.Location())
}

func toFloat64Ptr(v any) *float64 {
	switch x := v.(type) {
	case nil:
		return nil
	case float64:
		return &x
	case []byte:
		if f, err := strconv.ParseFloat(string(x), 64); err == nil {
			return &f
		}
	case string:
		if f, err := strconv.ParseFloat(x, 64); err == nil {
			return &f
		}
	}
	return nil
}

func toString(v any) string {
	switch s := v.(type) {
	case string:
		return s
	case []byte:
		return string(s)
	default:
		return fmt.Sprint(v)
	}
}

func parseActivityType(s string) model.ActivityType {
	s = strings.TrimSpace(s)
	if s == "" {
		return model.ActivityTypeActivity
	}
	return model.ActivityType(s)
}

func parseJSON[T any](raw any) (*T, error) {
	b := jsonBytes(raw)
	if len(b) == 0 {
		return nil, nil
	}
	var value T
	if err := json.Unmarshal(b, &value); err != nil {
		return nil, err
	}
	return &value, nil
}

func newUUIDString() string {
	return uuid.NewString()
}
