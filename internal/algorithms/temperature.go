package algorithms

import (
	"time"

	"github.com/gecazo/froop/internal/model"
)

const (
	skinTempConversionFactor = 0.04
	skinTempMinRaw           = 100
)

func ConvertSkinTemp(t time.Time, skinTempRaw uint16) (model.SkinTempScore, bool) {
	if skinTempRaw < skinTempMinRaw {
		return model.SkinTempScore{}, false
	}
	return model.SkinTempScore{Time: t, TempCelsius: float64(skinTempRaw) * skinTempConversionFactor}, true
}
