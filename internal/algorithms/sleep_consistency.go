package algorithms

import (
	"fmt"
	"time"

	"github.com/gecazo/froop/internal/model"
)

type SleepConsistencyAnalyzer struct {
	durations  []time.Duration
	startTimes []time.Time
	endTimes   []time.Time
	midpoints  []time.Time
}

type DurationMetric struct {
	Std  time.Duration
	Mean time.Duration
	CV   float64
}

type SleepMetrics struct {
	Duration  DurationMetric
	StartTime DurationMetric
	EndTime   DurationMetric
	Midpoint  DurationMetric
	Score     ConsistencyScore
}

type ConsistencyScore struct {
	TotalScore    float64
	DurationScore float64
	TimingScore   float64
}

func NewSleepConsistencyAnalyzer(cycles []model.SleepCycle) SleepConsistencyAnalyzer {
	a := SleepConsistencyAnalyzer{}
	for _, c := range cycles {
		a.durations = append(a.durations, c.End.Sub(c.Start))
		a.startTimes = append(a.startTimes, c.Start)
		a.endTimes = append(a.endTimes, c.End)
		a.midpoints = append(a.midpoints, c.Start.Add(c.End.Sub(c.Start)/2))
	}
	return a
}

func (a SleepConsistencyAnalyzer) CalculateConsistencyMetrics() SleepMetrics {
	if len(a.durations) == 0 {
		return SleepMetrics{}
	}

	duration := a.durationMetric()
	start := a.clockMetric(a.startTimes)
	end := a.clockMetric(a.endTimes)
	mid := a.clockMetric(a.midpoints)

	durationScore := round2(maxf(0, 100-duration.CV))
	startScore := maxf(0, 100-start.CV)
	endScore := maxf(0, 100-end.CV)
	midScore := maxf(0, 100-mid.CV)
	timingScore := round2(meanFloat([]float64{startScore, endScore, midScore}))
	overall := round2(meanFloat([]float64{durationScore, startScore, endScore, midScore}))

	return SleepMetrics{
		Duration:  duration,
		StartTime: start,
		EndTime:   end,
		Midpoint:  mid,
		Score: ConsistencyScore{
			TotalScore:    overall,
			DurationScore: durationScore,
			TimingScore:   timingScore,
		},
	}
}

func (a SleepConsistencyAnalyzer) durationMetric() DurationMetric {
	mean := meanDuration(a.durations)
	std := stdDuration(a.durations, mean)
	cv := 0.0
	if mean > 0 {
		cv = round2(float64(std) / float64(mean) * 100)
	}
	return DurationMetric{Std: std, Mean: mean, CV: cv}
}

func (a SleepConsistencyAnalyzer) clockMetric(times []time.Time) DurationMetric {
	meanClock := meanClockTime(times)
	std := stdClockTime(times, meanClock)
	meanSec := float64(meanClock.Hour()*3600 + meanClock.Minute()*60 + meanClock.Second())
	cv := 0.0
	if meanSec > 0 {
		cv = round2(std.Seconds() / meanSec * 100)
	}
	return DurationMetric{Std: std, Mean: time.Duration(meanSec) * time.Second, CV: cv}
}

func (m DurationMetric) String() string {
	return fmt.Sprintf("STD: %s, Mean: %s, CV: %.2f", FormatDurationHM(m.Std), FormatDurationHM(m.Mean), m.CV)
}

func (m SleepMetrics) String() string {
	return fmt.Sprintf("Duration: %s\nStart time: %s\nEnd time: %s\nMidpoint: %s\nScores:\n\tDuration score: %.2f\n\tTiming score: %.2f\n\tOverall score: %.2f",
		m.Duration.String(),
		m.StartTime.String(),
		m.EndTime.String(),
		m.Midpoint.String(),
		m.Score.DurationScore,
		m.Score.TimingScore,
		m.Score.TotalScore,
	)
}

func maxf(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}
