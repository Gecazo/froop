package algorithms

import (
	"errors"
	"math"
	"time"

	"github.com/gecazo/froop/internal/model"
)

func SleepCycleFromEvent(event ActivityPeriod, history []model.ParsedHistoryReading) (model.SleepCycle, error) {
	heartRate := make([]uint64, 0)
	rrRaw := make([][]uint16, 0)

	for _, h := range history {
		if !h.Time.Before(event.Start) && !h.Time.After(event.End) {
			heartRate = append(heartRate, uint64(h.BPM))
			rrRaw = append(rrRaw, append([]uint16(nil), h.RR...))
		}
	}

	rr := cleanRR(rrRaw)
	rolling := rollingHRV(rr)

	minHRV := uint16(0)
	maxHRV := uint16(0)
	avgHRV := uint16(0)
	if len(rolling) > 0 {
		minV, maxV := rolling[0], rolling[0]
		sum := uint64(0)
		for _, v := range rolling {
			if v < minV {
				minV = v
			}
			if v > maxV {
				maxV = v
			}
			sum += v
		}
		minHRV = uint16(minV)
		maxHRV = uint16(maxV)
		avgHRV = uint16(sum / uint64(len(rolling)))
	}

	if len(heartRate) == 0 {
		return model.SleepCycle{}, errors.New("empty heart rate sample")
	}
	minBPM64, maxBPM64 := heartRate[0], heartRate[0]
	sumBPM := uint64(0)
	for _, v := range heartRate {
		if v < minBPM64 {
			minBPM64 = v
		}
		if v > maxBPM64 {
			maxBPM64 = v
		}
		sumBPM += v
	}

	return model.SleepCycle{
		ID:     dateOnly(event.End),
		Start:  event.Start,
		End:    event.End,
		MinBPM: uint8(minBPM64),
		MaxBPM: uint8(maxBPM64),
		AvgBPM: uint8(sumBPM / uint64(len(heartRate))),
		MinHRV: minHRV,
		MaxHRV: maxHRV,
		AvgHRV: avgHRV,
		Score:  SleepScore(event.Start, event.End),
	}, nil
}

func SleepScore(start, end time.Time) float64 {
	duration := end.Sub(start)
	ideal := 8 * time.Hour
	if ideal <= 0 {
		return 0
	}
	score := float64(duration/ideal) * 100
	if score < 0 {
		return 0
	}
	if score > 100 {
		return 100
	}
	return score
}

func cleanRR(rr [][]uint16) []uint64 {
	out := make([]uint64, 0)
	for _, batch := range rr {
		for _, v := range batch {
			if v > 0 {
				out = append(out, uint64(v))
			}
		}
	}
	return out
}

func rollingHRV(rr []uint64) []uint64 {
	if len(rr) < 300 {
		return nil
	}
	out := make([]uint64, 0, len(rr)-299)
	for i := 0; i+300 <= len(rr); i++ {
		if v, ok := calculateRMSSD(rr[i : i+300]); ok {
			out = append(out, v)
		}
	}
	return out
}

func calculateRMSSD(window []uint64) (uint64, bool) {
	if len(window) < 2 {
		return 0, false
	}
	sum := 0.0
	for i := 1; i < len(window); i++ {
		diff := float64(window[i]) - float64(window[i-1])
		sum += diff * diff
	}
	mean := sum / float64(len(window)-1)
	return uint64(math.Sqrt(mean)), true
}

func dateOnly(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, t.Location())
}
