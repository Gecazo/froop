package algorithms

import (
	"math"

	"github.com/gecazo/froop/internal/model"
)

const (
	StrainMinReadings = 600
	maxStrain         = 21.0
	ln7201            = 8.882643961783384
)

type StrainCalculator struct {
	MaxHR     uint8
	RestingHR uint8
}

func NewStrainCalculator(maxHR, restingHR uint8) StrainCalculator {
	return StrainCalculator{MaxHR: maxHR, RestingHR: restingHR}
}

func (s StrainCalculator) Calculate(hr []model.ParsedHistoryReading) (float64, bool) {
	if len(hr) < StrainMinReadings || s.MaxHR <= s.RestingHR {
		return 0, false
	}

	sampleDurationMin := sampleDurationMinutes(hr)
	hrReserve := float64(s.MaxHR) - float64(s.RestingHR)
	trimp := 0.0
	for _, r := range hr {
		trimp += sampleDurationMin * float64(zoneWeight(r.BPM, s.RestingHR, hrReserve))
	}

	if trimp <= 0 {
		return 0, true
	}
	raw := maxStrain * math.Log(trimp+1.0) / ln7201
	return math.Round(raw*100) / 100, true
}

func sampleDurationMinutes(hr []model.ParsedHistoryReading) float64 {
	if len(hr) < 2 {
		return 1.0 / 60.0
	}
	dt := hr[1].Time.Sub(hr[0].Time)
	if dt <= 0 {
		return 1.0 / 60.0
	}
	return dt.Minutes()
}

func zoneWeight(bpm uint8, resting uint8, reserve float64) uint8 {
	pct := (float64(bpm) - float64(resting)) / reserve * 100.0
	switch {
	case pct >= 90:
		return 5
	case pct >= 80:
		return 4
	case pct >= 70:
		return 3
	case pct >= 60:
		return 2
	case pct >= 50:
		return 1
	default:
		return 0
	}
}
