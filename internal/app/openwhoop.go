package app

import (
	"fmt"
	"log"
	"time"

	"github.com/gecazo/froop/internal/algorithms"
	"github.com/gecazo/froop/internal/decoder"
	"github.com/gecazo/froop/internal/model"
	"github.com/gecazo/froop/internal/protocol"
	"github.com/gecazo/froop/internal/store"
)

type OpenWhoop struct {
	Database          *store.Store
	packet            *protocol.Packet
	lastHistoryPacket *model.HistoryReading
	historyPackets    []model.HistoryReading
}

func NewOpenWhoop(database *store.Store) *OpenWhoop {
	return &OpenWhoop{Database: database, historyPackets: make([]model.HistoryReading, 0)}
}

func (o *OpenWhoop) HandleStoredPacket(packet model.Packet) (*protocol.Packet, error) {
	switch packet.UUID {
	case protocol.DataFromStrapUUID:
		pkt, err := o.parseDataPacket(packet.Bytes)
		if err != nil {
			return nil, err
		}
		if pkt == nil {
			return nil, nil
		}
		data, err := decoder.FromPacket(*pkt)
		if err != nil {
			return nil, nil
		}
		return o.handleDecodedData(data)
	case protocol.CmdFromStrapUUID:
		pkt, err := protocol.ParsePacket(packet.Bytes)
		if err != nil {
			return nil, err
		}
		data, err := decoder.FromPacket(pkt)
		if err != nil {
			return nil, nil
		}
		return o.handleDecodedData(data)
	default:
		return nil, nil
	}
}

func (o *OpenWhoop) parseDataPacket(raw []byte) (*protocol.Packet, error) {
	if o.packet != nil {
		p := *o.packet
		p.Data = append(p.Data, raw...)
		if len(p.Data)+3 >= p.Size {
			o.packet = nil
			return &p, nil
		}
		o.packet = &p
		return nil, nil
	}

	pkt, err := protocol.ParsePacket(raw)
	if err != nil {
		return nil, err
	}
	if pkt.Partial {
		o.packet = &pkt
		return nil, nil
	}
	return &pkt, nil
}

func (o *OpenWhoop) handleDecodedData(data decoder.Data) (*protocol.Packet, error) {
	switch v := data.(type) {
	case decoder.HistoryReadingData:
		hr := v.Reading
		if !hr.IsValid() {
			return nil, nil
		}
		if o.lastHistoryPacket != nil {
			if o.lastHistoryPacket.UnixMS == hr.UnixMS && o.lastHistoryPacket.BPM == hr.BPM {
				return nil, nil
			}
			o.lastHistoryPacket.UnixMS = hr.UnixMS
			o.lastHistoryPacket.BPM = hr.BPM
		} else {
			copyVal := hr
			o.lastHistoryPacket = &copyVal
		}
		ptime := time.UnixMilli(int64(hr.UnixMS)).In(time.Local).Format("2006-01-02 15:04:05")
		if len(hr.ImuData) == 0 {
			log.Printf("HistoryReading time: %s", ptime)
		} else {
			log.Printf("HistoryReading time: %s, (IMU)", ptime)
		}
		o.historyPackets = append(o.historyPackets, hr)
	case decoder.HistoryMetadataData:
		switch v.Cmd {
		case protocol.MetadataHistoryEnd:
			if err := o.Database.CreateReadings(o.historyPackets); err != nil {
				return nil, err
			}
			o.historyPackets = o.historyPackets[:0]
			pkt := protocol.HistoryEnd(v.Data)
			return &pkt, nil
		case protocol.MetadataHistoryStart, protocol.MetadataHistoryComplete:
			return nil, nil
		}
	case decoder.ConsoleLogData:
		log.Printf("ConsoleLog %s", v.Log)
	case decoder.VersionInfoData:
		log.Printf("version harvard %s boylston %s", v.Harvard, v.Boylston)
	case decoder.RunAlarmData:
		return nil, nil
	case decoder.EventData:
		return nil, nil
	case decoder.UnknownEventData:
		return nil, nil
	}

	return nil, nil
}

func (o *OpenWhoop) GetLatestSleep() (*model.SleepCycle, error) {
	return o.Database.GetLatestSleep()
}

func (o *OpenWhoop) DetectEvents() error {
	latestActivity, err := o.Database.GetLatestActivity()
	if err != nil {
		return err
	}
	var startFrom *time.Time
	if latestActivity != nil {
		startFrom = &latestActivity.From
	}

	sleeps, err := o.Database.GetSleepCycles(startFrom)
	if err != nil {
		return err
	}
	if len(sleeps) < 2 {
		return nil
	}

	for i := 0; i+1 < len(sleeps); i++ {
		cycleID := sleeps[i].ID
		start := sleeps[i].End
		end := sleeps[i+1].Start
		history, err := o.Database.SearchHistory(store.SearchHistory{From: &start, To: &end})
		if err != nil {
			return err
		}
		events := algorithms.DetectFromGravity(history)
		for _, event := range events {
			var activity model.ActivityType
			switch event.Activity {
			case model.ActivityActive:
				activity = model.ActivityTypeActivity
			case model.ActivitySleep:
				activity = model.ActivityTypeNap
			default:
				continue
			}
			ap := model.ActivityPeriod{PeriodID: cycleID, From: event.Start, To: event.End, Activity: activity}
			log.Printf("Detected activity period from: %s to: %s, duration: %s", ap.From, ap.To, algorithms.FormatDurationHM(ap.To.Sub(ap.From)))
			if err := o.Database.CreateActivity(ap); err != nil {
				return err
			}
		}
	}

	return nil
}

func (o *OpenWhoop) DetectSleeps() error {
	for {
		lastSleep, err := o.GetLatestSleep()
		if err != nil {
			return err
		}
		opts := store.SearchHistory{Limit: uint64Ptr(86400 * 2)}
		if lastSleep != nil {
			opts.From = &lastSleep.End
		}
		history, err := o.Database.SearchHistory(opts)
		if err != nil {
			return err
		}
		periods := algorithms.DetectFromGravity(history)
		processed := false

		for {
			sleepEvent, ok := algorithms.FindSleep(periods)
			if !ok {
				break
			}
			if lastSleep != nil {
				diff := sleepEvent.Start.Sub(lastSleep.End)
				if diff < algorithms.MaxSleepPause {
					history, err = o.Database.SearchHistory(store.SearchHistory{From: &lastSleep.Start, To: &sleepEvent.End})
					if err != nil {
						return err
					}
					sleepEvent.Start = lastSleep.Start
					sleepEvent.Duration = sleepEvent.End.Sub(sleepEvent.Start)
				} else {
					thisSleepID := dateOnlyTime(sleepEvent.End)
					lastSleepID := dateOnlyTime(lastSleep.End)
					if thisSleepID.Equal(lastSleepID) {
						if sleepEvent.Duration < lastSleep.Duration() {
							nap := model.ActivityPeriod{PeriodID: lastSleep.ID, From: sleepEvent.Start, To: sleepEvent.End, Activity: model.ActivityTypeNap}
							if err := o.Database.CreateActivity(nap); err != nil {
								return err
							}
							periods = trimFirst(periods)
							continue
						}
						nap := model.ActivityPeriod{PeriodID: lastSleep.ID.Add(-24 * time.Hour), From: lastSleep.Start, To: lastSleep.End, Activity: model.ActivityTypeNap}
						if err := o.Database.CreateActivity(nap); err != nil {
							return err
						}
					}
				}
			}

			sleepCycle, err := algorithms.SleepCycleFromEvent(sleepEvent, history)
			if err != nil {
				return err
			}
			log.Printf("Detected sleep from %s to %s, duration: %s", sleepEvent.Start, sleepEvent.End, algorithms.FormatDurationHM(sleepEvent.Duration))
			if err := o.Database.CreateSleep(sleepCycle); err != nil {
				return err
			}
			processed = true
			break
		}

		if !processed {
			break
		}
	}

	return nil
}

func (o *OpenWhoop) CalculateSpO2() error {
	return o.Database.CalculateSpO2()
}

func (o *OpenWhoop) CalculateSkinTemp() error {
	return o.Database.CalculateSkinTemp()
}

func (o *OpenWhoop) CalculateStress() error {
	return o.Database.CalculateStress()
}

func trimFirst(in []algorithms.ActivityPeriod) []algorithms.ActivityPeriod {
	if len(in) == 0 {
		return in
	}
	return in[1:]
}

func dateOnlyTime(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, t.Location())
}

func uint64Ptr(v uint64) *uint64 {
	return &v
}

func mapActivityType(activity model.ActivityType) string {
	return string(activity)
}

func ensureSleepStats(sleeps []model.SleepCycle) error {
	if len(sleeps) == 0 {
		return fmt.Errorf("no sleep records found")
	}
	return nil
}
