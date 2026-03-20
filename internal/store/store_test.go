package store

import (
	"testing"
	"time"

	"github.com/gecazo/froop/internal/model"
)

func TestMigrationsAndPacketCRUD(t *testing.T) {
	db, err := Open("sqlite::memory:")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer db.Close()

	pkt, err := db.CreatePacket("61080005-8d6d-82b8-614a-1c8cb0f8dcc6", []byte{0xAA})
	if err != nil {
		t.Fatalf("create packet: %v", err)
	}
	if pkt.ID == 0 {
		t.Fatal("expected id")
	}
	packets, err := db.GetPackets(0)
	if err != nil {
		t.Fatalf("get packets: %v", err)
	}
	if len(packets) != 1 {
		t.Fatalf("expected 1 packet got %d", len(packets))
	}
}

func TestCreateReadingAndSearchHistory(t *testing.T) {
	db, err := Open("sqlite::memory:")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer db.Close()

	r := model.HistoryReading{
		UnixMS: 1735689600000,
		BPM:    72,
		RR:     []uint16{833, 850},
	}
	if err := db.CreateReading(r); err != nil {
		t.Fatalf("create reading: %v", err)
	}
	rows, err := db.SearchHistory(SearchHistory{})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(rows) != 1 || rows[0].BPM != 72 {
		t.Fatalf("unexpected rows: %+v", rows)
	}

	// upsert by same timestamp
	r.BPM = 80
	r.RR = []uint16{750}
	if err := db.CreateReading(r); err != nil {
		t.Fatalf("upsert reading: %v", err)
	}
	rows, err = db.SearchHistory(SearchHistory{})
	if err != nil {
		t.Fatalf("search 2: %v", err)
	}
	if len(rows) != 1 || rows[0].BPM != 80 {
		t.Fatalf("unexpected rows after upsert: %+v", rows)
	}
}

func TestSleepAndActivityCRUD(t *testing.T) {
	db, err := Open("sqlite::memory:")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer db.Close()

	start := time.Date(2025, 1, 1, 22, 0, 0, 0, time.Local)
	end := time.Date(2025, 1, 2, 6, 0, 0, 0, time.Local)
	sleep := model.SleepCycle{
		ID:     time.Date(2025, 1, 2, 0, 0, 0, 0, time.Local),
		Start:  start,
		End:    end,
		MinBPM: 50,
		MaxBPM: 70,
		AvgBPM: 60,
		MinHRV: 30,
		MaxHRV: 80,
		AvgHRV: 55,
		Score:  100,
	}
	if err := db.CreateSleep(sleep); err != nil {
		t.Fatalf("create sleep: %v", err)
	}
	latest, err := db.GetLatestSleep()
	if err != nil {
		t.Fatalf("latest sleep: %v", err)
	}
	if latest == nil || latest.MinBPM != 50 {
		t.Fatalf("unexpected sleep: %+v", latest)
	}

	activity := model.ActivityPeriod{
		PeriodID: sleep.ID,
		From:     start.Add(9 * time.Hour),
		To:       start.Add(10 * time.Hour),
		Activity: model.ActivityTypeActivity,
	}
	if err := db.CreateActivity(activity); err != nil {
		t.Fatalf("create activity: %v", err)
	}
	acts, err := db.SearchActivities(SearchActivityPeriods{})
	if err != nil {
		t.Fatalf("search activities: %v", err)
	}
	if len(acts) != 1 {
		t.Fatalf("expected 1 activity got %d", len(acts))
	}
}

func TestSyncBidirectional(t *testing.T) {
	local, err := Open("sqlite::memory:")
	if err != nil {
		t.Fatalf("open local: %v", err)
	}
	defer local.Close()
	remote, err := Open("sqlite::memory:")
	if err != nil {
		t.Fatalf("open remote: %v", err)
	}
	defer remote.Close()

	r := model.HistoryReading{UnixMS: 1735689600000, BPM: 70, RR: []uint16{850}}
	if err := local.CreateReading(r); err != nil {
		t.Fatalf("create local reading: %v", err)
	}

	report, err := local.SyncWith(remote)
	if err != nil {
		t.Fatalf("sync: %v", err)
	}
	if report.HeartRateSynced == 0 {
		t.Fatalf("expected synced heart rate rows")
	}

	rows, err := remote.SearchHistory(SearchHistory{})
	if err != nil {
		t.Fatalf("remote history: %v", err)
	}
	if len(rows) == 0 {
		t.Fatalf("expected remote rows")
	}
}
