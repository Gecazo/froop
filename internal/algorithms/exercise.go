package algorithms

import (
	"fmt"
	"time"

	"github.com/gecazo/froop/internal/model"
)

type ExerciseMetrics struct {
	TotalDuration time.Duration
	Count         uint64
	MeanDuration  time.Duration
	DurationStd   time.Duration
}

func NewExerciseMetrics(exercises []model.ActivityPeriod) ExerciseMetrics {
	if len(exercises) == 0 {
		return ExerciseMetrics{}
	}
	durations := make([]time.Duration, 0, len(exercises))
	for _, e := range exercises {
		durations = append(durations, e.To.Sub(e.From))
	}
	mean := meanDuration(durations)
	std := stdDuration(durations, mean)
	var total time.Duration
	for _, d := range durations {
		total += d
	}
	return ExerciseMetrics{
		TotalDuration: total,
		Count:         uint64(len(exercises)),
		MeanDuration:  mean,
		DurationStd:   std,
	}
}

func (m ExerciseMetrics) String() string {
	return fmt.Sprintf("Duration: %dh\nCount: %d\nMean duration: %s\nDuration std: %s",
		int(m.TotalDuration.Hours()),
		m.Count,
		FormatDurationHM(m.MeanDuration),
		FormatDurationHM(m.DurationStd),
	)
}
