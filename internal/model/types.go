package model

import "time"

// Packet mirrors packets table rows.
type Packet struct {
	ID    int32
	UUID  string
	Bytes []byte
}

type ImuSample struct {
	AccXG   float32 `json:"acc_x_g"`
	AccYG   float32 `json:"acc_y_g"`
	AccZG   float32 `json:"acc_z_g"`
	GyrXDPS float32 `json:"gyr_x_dps"`
	GyrYDPS float32 `json:"gyr_y_dps"`
	GyrZDPS float32 `json:"gyr_z_dps"`
}

// SensorData contains DSP sensor fields in V12/V24 packets.
type SensorData struct {
	PPGGreen      uint16     `json:"ppg_green"`
	PPGRedIR      uint16     `json:"ppg_red_ir"`
	SPO2Red       uint16     `json:"spo2_red"`
	SPO2IR        uint16     `json:"spo2_ir"`
	SkinTempRaw   uint16     `json:"skin_temp_raw"`
	AmbientLight  uint16     `json:"ambient_light"`
	LEDDrive1     uint16     `json:"led_drive_1"`
	LEDDrive2     uint16     `json:"led_drive_2"`
	RespRateRaw   uint16     `json:"resp_rate_raw"`
	SignalQuality uint16     `json:"signal_quality"`
	SkinContact   uint8      `json:"skin_contact"`
	AccelGravity  [3]float32 `json:"accel_gravity"`
}

// HistoryReading stores decoded reading with unix timestamp in milliseconds.
type HistoryReading struct {
	UnixMS     uint64
	BPM        uint8
	RR         []uint16
	ImuData    []ImuSample
	SensorData *SensorData
}

func (h HistoryReading) IsValid() bool {
	return h.BPM > 0
}

type ParsedHistoryReading struct {
	Time    time.Time
	BPM     uint8
	RR      []uint16
	ImuData []ImuSample
	Gravity *[3]float32
}

type ActivityKind int

const (
	ActivityUnknown ActivityKind = iota
	ActivityActive
	ActivityInactive
	ActivitySleep
	ActivityAwake
)

type SleepCycle struct {
	ID     time.Time // date-only key
	Start  time.Time
	End    time.Time
	MinBPM uint8
	MaxBPM uint8
	AvgBPM uint8
	MinHRV uint16
	MaxHRV uint16
	AvgHRV uint16
	Score  float64
}

func (s SleepCycle) Duration() time.Duration {
	return s.End.Sub(s.Start)
}

type ActivityType string

const (
	ActivityTypeActivity ActivityType = "Activity"
	ActivityTypeNap      ActivityType = "Nap"
)

type ActivityPeriod struct {
	PeriodID time.Time // date-only key (sleep_id)
	From     time.Time
	To       time.Time
	Activity ActivityType
}

type StressScore struct {
	Time  time.Time
	Score float64
}

type SpO2Reading struct {
	Time    time.Time
	SPO2Red uint16
	SPO2IR  uint16
}

type SpO2Score struct {
	Time           time.Time
	SPO2Percentage float64
}

type SkinTempScore struct {
	Time        time.Time
	TempCelsius float64
}

type TempReading struct {
	Time        time.Time
	SkinTempRaw uint16
}
