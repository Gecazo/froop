package algorithms

import (
	"testing"
	"time"

	"github.com/gecazo/froop/internal/model"
)

func TestSleepScore(t *testing.T) {
	start := time.Date(2025, 1, 1, 22, 0, 0, 0, time.UTC)
	if got := SleepScore(start, start.Add(8*time.Hour)); got != 100 {
		t.Fatalf("expected 100 got %.2f", got)
	}
	if got := SleepScore(start, start.Add(4*time.Hour)); got != 0 {
		t.Fatalf("expected 0 got %.2f", got)
	}
}

func TestConvertSkinTemp(t *testing.T) {
	now := time.Now()
	if _, ok := ConvertSkinTemp(now, 50); ok {
		t.Fatal("expected invalid raw")
	}
	s, ok := ConvertSkinTemp(now, 850)
	if !ok || s.TempCelsius != 34.0 {
		t.Fatalf("unexpected score: %+v ok=%v", s, ok)
	}
}

func TestCalculateSpO2(t *testing.T) {
	base := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	readings := make([]model.SpO2Reading, 0, SpO2WindowSize)
	for i := 0; i < SpO2WindowSize; i++ {
		readings = append(readings, model.SpO2Reading{
			Time:    base.Add(time.Duration(i) * time.Second),
			SPO2Red: uint16(1000 + (i%5)*5),
			SPO2IR:  uint16(2000 + (i%5)*20),
		})
	}
	score, ok := CalculateSpO2(readings)
	if !ok {
		t.Fatal("expected score")
	}
	if score.SPO2Percentage < 94 || score.SPO2Percentage > 100 {
		t.Fatalf("unexpected spo2: %.2f", score.SPO2Percentage)
	}
}

func TestCalculateStress(t *testing.T) {
	base := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	readings := make([]model.ParsedHistoryReading, 0, MinReadingPeriod)
	for i := 0; i < MinReadingPeriod; i++ {
		readings = append(readings, model.ParsedHistoryReading{
			Time: base.Add(time.Duration(i) * time.Second),
			BPM:  uint8(70 + (i % 10)),
		})
	}
	stress, ok := CalculateStress(readings)
	if !ok {
		t.Fatal("expected stress")
	}
	if stress.Score < 0 || stress.Score > 10 {
		t.Fatalf("unexpected stress score: %.2f", stress.Score)
	}
}

func TestFindSleep(t *testing.T) {
	base := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	events := []ActivityPeriod{
		{Activity: model.ActivityActive, Start: base, End: base.Add(30 * time.Minute), Duration: 30 * time.Minute},
		{Activity: model.ActivitySleep, Start: base.Add(30 * time.Minute), End: base.Add(3 * time.Hour), Duration: 150 * time.Minute},
	}
	_, ok := FindSleep(events)
	if !ok {
		t.Fatal("expected sleep event")
	}
}

func TestNewExerciseMetrics(t *testing.T) {
	base := time.Date(2025, 1, 1, 8, 0, 0, 0, time.UTC)
	events := []model.ActivityPeriod{
		{From: base, To: base.Add(time.Hour)},
		{From: base.Add(3 * time.Hour), To: base.Add(4 * time.Hour)},
	}
	m := NewExerciseMetrics(events)
	if m.Count != 2 || m.TotalDuration != 2*time.Hour {
		t.Fatalf("bad metrics: %+v", m)
	}
}
