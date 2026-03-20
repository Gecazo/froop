package algorithms

import (
	"fmt"
	"math"
	"sort"
	"time"
)

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

func formatHMFromMinutes(minutes float64) string {
	m := math.Mod(minutes, 1440)
	if m < 0 {
		m += 1440
	}
	h := int(m / 60)
	mm := int(m) % 60
	return fmt.Sprintf("%02d:%02d", h, mm)
}

func FormatDurationHM(d time.Duration) string {
	return formatHMFromMinutes(d.Minutes())
}

func meanFloat(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sum := 0.0
	for _, v := range values {
		sum += v
	}
	return sum / float64(len(values))
}

func meanDuration(values []time.Duration) time.Duration {
	if len(values) == 0 {
		return 0
	}
	var sum time.Duration
	for _, d := range values {
		sum += d
	}
	return time.Duration(int64(sum) / int64(len(values)))
}

func stdDuration(values []time.Duration, mean time.Duration) time.Duration {
	if len(values) == 0 {
		return 0
	}
	m := float64(mean)
	variance := 0.0
	for _, d := range values {
		delta := float64(d) - m
		variance += delta * delta
	}
	variance /= float64(len(values))
	return time.Duration(math.Sqrt(variance))
}

// mapClockSeconds maps clock time to signed seconds with wrap-around around noon.
func mapClockSeconds(t time.Time) int {
	h := t.Hour()
	if h > 12 {
		h -= 24
	}
	return h*3600 + t.Minute()*60 + t.Second()
}

func meanClockTime(times []time.Time) time.Time {
	if len(times) == 0 {
		return time.Time{}
	}
	sum := 0
	for _, t := range times {
		sum += mapClockSeconds(t)
	}
	mean := sum / len(times)
	if mean < 0 {
		mean += 86400
	}
	h := mean / 3600
	m := (mean % 3600) / 60
	s := mean % 60
	base := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)
	return time.Date(base.Year(), base.Month(), base.Day(), h, m, s, 0, base.Location())
}

func stdClockTime(times []time.Time, mean time.Time) time.Duration {
	if len(times) == 0 {
		return 0
	}
	m := mapClockSeconds(mean)
	variance := 0.0
	for _, t := range times {
		d := float64(mapClockSeconds(t) - m)
		variance += d * d
	}
	variance /= float64(len(times))
	return time.Duration(math.Sqrt(variance) * float64(time.Second))
}

func medianPositive(values []int64, fallback int64) int64 {
	if len(values) == 0 {
		return fallback
	}
	sort.Slice(values, func(i, j int) bool { return values[i] < values[j] })
	return values[len(values)/2]
}
