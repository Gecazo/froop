package algorithms

import (
	"time"

	"github.com/gecazo/froop/internal/model"
)

const (
	activityChangeThreshold = 15 * time.Minute
	minSleepDuration        = 60 * time.Minute
	MaxSleepPause           = 60 * time.Minute
	gravityStillThreshold   = 0.01
	gravityWindowMinutes    = int64(15)
	gravityStillFraction    = 0.70
	gravityMaxGap           = 20 * time.Minute
)

type ActivityPeriod struct {
	Activity model.ActivityKind
	Start    time.Time
	End      time.Time
	Duration time.Duration
}

type tempActivity struct {
	activity model.ActivityKind
	start    time.Time
	end      time.Time
}

func (a ActivityPeriod) IsActive() bool {
	return a.Activity == model.ActivityActive
}

func FindSleep(events []ActivityPeriod) (ActivityPeriod, bool) {
	for _, e := range events {
		if e.Activity == model.ActivitySleep && e.Duration > minSleepDuration {
			return e, true
		}
	}
	return ActivityPeriod{}, false
}

func DetectFromGravity(history []model.ParsedHistoryReading) []ActivityPeriod {
	if len(history) < 2 {
		return nil
	}

	deltas := make([]float64, 0, len(history))
	deltas = append(deltas, 0)
	for i := 1; i < len(history); i++ {
		g1 := history[i-1].Gravity
		g2 := history[i].Gravity
		if g1 == nil || g2 == nil {
			deltas = append(deltas, 1e9)
			continue
		}
		dx := float64((*g1)[0] - (*g2)[0])
		dy := float64((*g1)[1] - (*g2)[1])
		dz := float64((*g1)[2] - (*g2)[2])
		deltas = append(deltas, mathSqrt(dx*dx+dy*dy+dz*dz))
	}

	diffs := make([]int64, 0, len(history))
	for i := 1; i < len(history); i++ {
		d := history[i].Time.Sub(history[i-1].Time).Seconds()
		if d > 0 && d < 300 {
			diffs = append(diffs, int64(d))
		}
	}
	avgIntervalSeconds := medianPositive(diffs, 60)
	if avgIntervalSeconds < 1 {
		avgIntervalSeconds = 1
	}

	windowSize := int((gravityWindowMinutes * 60) / avgIntervalSeconds)
	if windowSize < 3 {
		windowSize = 3
	}

	stillFrac := make([]float64, len(deltas))
	for i := range deltas {
		half := windowSize / 2
		start := i - half
		if start < 0 {
			start = 0
		}
		end := i + half + 1
		if end > len(deltas) {
			end = len(deltas)
		}
		window := deltas[start:end]
		still := 0
		for _, d := range window {
			if d < gravityStillThreshold {
				still++
			}
		}
		stillFrac[i] = float64(still) / float64(len(window))
	}

	isSleep := make([]bool, len(stillFrac))
	for i, f := range stillFrac {
		isSleep[i] = f >= gravityStillFraction
	}

	periods := make([]tempActivity, 0)
	runStart := 0
	for i := 1; i <= len(isSleep); i++ {
		endOfData := i == len(isSleep)
		classChange := !endOfData && isSleep[i] != isSleep[runStart]
		gapBreak := !endOfData && history[i].Time.Sub(history[i-1].Time) > gravityMaxGap
		if endOfData || classChange || gapBreak {
			kind := model.ActivityActive
			if isSleep[runStart] {
				kind = model.ActivitySleep
			}
			periods = append(periods, tempActivity{
				activity: kind,
				start:    history[runStart].Time,
				end:      history[i-1].Time,
			})
			if !endOfData {
				runStart = i
			}
		}
	}

	merged := filterMerge(periods)
	out := make([]ActivityPeriod, 0, len(merged))
	for _, a := range merged {
		out = append(out, ActivityPeriod{
			Activity: a.activity,
			Start:    a.start,
			End:      a.end,
			Duration: a.end.Sub(a.start),
		})
	}
	return out
}

func filterMerge(activities []tempActivity) []tempActivity {
	if len(activities) == 0 {
		return nil
	}

	merged := make([]tempActivity, 0, len(activities))
	for i := 0; i < len(activities); i++ {
		current := activities[i]
		duration := current.end.Sub(current.start)
		if duration < activityChangeThreshold {
			if i > 0 && i+1 < len(activities) && activities[i-1].activity == activities[i+1].activity && len(merged) > 0 {
				prev := merged[len(merged)-1]
				merged = merged[:len(merged)-1]
				merged = append(merged, tempActivity{activity: prev.activity, start: prev.start, end: activities[i+1].end})
				i++
				continue
			}
			if i+1 < len(activities) {
				activities[i+1] = tempActivity{activity: activities[i+1].activity, start: current.start, end: activities[i+1].end}
				continue
			}
			if len(merged) > 0 {
				prev := merged[len(merged)-1]
				merged[len(merged)-1] = tempActivity{activity: prev.activity, start: prev.start, end: current.end}
				continue
			}
		}
		merged = append(merged, current)
	}

	return merged
}

func mathSqrt(x float64) float64 {
	z := x
	if z == 0 {
		return 0
	}
	for i := 0; i < 16; i++ {
		z -= (z*z - x) / (2 * z)
	}
	return z
}
