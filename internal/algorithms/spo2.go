package algorithms

import (
	"math"

	"github.com/gecazo/froop/internal/model"
)

const SpO2WindowSize = 30

func CalculateSpO2(readings []model.SpO2Reading) (model.SpO2Score, bool) {
	if len(readings) < SpO2WindowSize {
		return model.SpO2Score{}, false
	}
	valid := make([]model.SpO2Reading, 0, len(readings))
	for _, r := range readings {
		if r.SPO2Red > 0 && r.SPO2IR > 0 {
			valid = append(valid, r)
		}
	}
	if len(valid) < SpO2WindowSize {
		return model.SpO2Score{}, false
	}

	n := float64(len(valid))
	meanRed := 0.0
	meanIR := 0.0
	for _, r := range valid {
		meanRed += float64(r.SPO2Red)
		meanIR += float64(r.SPO2IR)
	}
	meanRed /= n
	meanIR /= n
	if meanRed < 1 || meanIR < 1 {
		return model.SpO2Score{}, false
	}

	acRed := 0.0
	acIR := 0.0
	for _, r := range valid {
		dr := float64(r.SPO2Red) - meanRed
		di := float64(r.SPO2IR) - meanIR
		acRed += dr * dr
		acIR += di * di
	}
	acRed = math.Sqrt(acRed / n)
	acIR = math.Sqrt(acIR / n)
	if acRed < 0.001 || acIR < 0.001 {
		return model.SpO2Score{}, false
	}

	ratio := (acRed / meanRed) / (acIR / meanIR)
	spo2 := 110.0 - 25.0*ratio
	if spo2 < 70 {
		spo2 = 70
	}
	if spo2 > 100 {
		spo2 = 100
	}

	return model.SpO2Score{Time: valid[len(valid)-1].Time, SPO2Percentage: spo2}, true
}
