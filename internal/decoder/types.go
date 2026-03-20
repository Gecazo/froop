package decoder

import (
	"fmt"

	"github.com/gecazo/froop/internal/model"
	"github.com/gecazo/froop/internal/protocol"
)

type Data interface {
	dataName() string
}

type HistoryReadingData struct {
	Reading model.HistoryReading
}

func (HistoryReadingData) dataName() string { return "HistoryReading" }

type HistoryMetadataData struct {
	Unix uint32
	Data uint32
	Cmd  protocol.MetadataType
}

func (HistoryMetadataData) dataName() string { return "HistoryMetadata" }

type ConsoleLogData struct {
	Unix uint32
	Log  string
}

func (ConsoleLogData) dataName() string { return "ConsoleLog" }

type RunAlarmData struct {
	Unix uint32
}

func (RunAlarmData) dataName() string { return "RunAlarm" }

type EventData struct {
	Unix  uint32
	Event protocol.CommandNumber
}

func (EventData) dataName() string { return "Event" }

type UnknownEventData struct {
	Unix  uint32
	Event uint8
}

func (UnknownEventData) dataName() string { return "UnknownEvent" }

type VersionInfoData struct {
	Harvard  string
	Boylston string
}

func (VersionInfoData) dataName() string { return "VersionInfo" }

func DataString(v Data) string {
	if v == nil {
		return "<nil>"
	}
	return fmt.Sprintf("%s", v.dataName())
}
