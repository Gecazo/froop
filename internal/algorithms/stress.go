package algorithms

import (
	"math"
	"sort"

	"github.com/gecazo/froop/internal/model"
)

const MinReadingPeriod = 120

func CalculateStress(readings []model.ParsedHistoryReading) (model.StressScore, bool) {
	if len(readings) < MinReadingPeriod {
		return model.StressScore{}, false
	}
	timeMark := readings[len(readings)-1].Time

	realRR := make([]uint16, 0)
	for _, r := range readings {
		realRR = append(realRR, r.RR...)
	}

	rr := make([]uint16, 0, len(readings))
	if len(realRR) >= MinReadingPeriod {
		rr = realRR
	} else {
		for _, r := range readings {
			v := uint16(math.Round(60.0 / float64(r.BPM) * 1000.0))
			rr = append(rr, v)
		}
	}

	score, ok := stressScore(rr)
	if !ok {
		return model.StressScore{}, false
	}
	return model.StressScore{Time: timeMark, Score: score}, true
}

func stressScore(rr []uint16) (float64, bool) {
	if len(rr) == 0 {
		return 0, false
	}
	count := float64(len(rr))
	minV, maxV := rr[0], rr[0]
	bins := map[uint16]uint16{}
	for _, v := range rr {
		if v < minV {
			minV = v
		}
		if v > maxV {
			maxV = v
		}
		bins[v/50]++
	}
	vr := float64(maxV-minV) / 1000.0
	if vr < 0.0001 {
		return 10.0, true
	}
	// pick most frequent bin
	type kv struct{ bin, freq uint16 }
	arr := make([]kv, 0, len(bins))
	for b, f := range bins {
		arr = append(arr, kv{b, f})
	}
	sort.Slice(arr, func(i, j int) bool { return arr[i].freq > arr[j].freq })
	modeBin, modeFreq := arr[0].bin, arr[0].freq
	mode := float64(modeBin*50 + 25)
	aMode := float64(modeFreq) / count * 100.0
	score := math.Round(aMode/(2.0*vr*mode/1000.0)*100) / 100
	if score > 10.0 {
		score = 10.0
	}
	return score, true
}
