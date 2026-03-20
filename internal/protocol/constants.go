package protocol

const (
	WhoopServiceUUID    = "61080001-8d6d-82b8-614a-1c8cb0f8dcc6"
	CmdToStrapUUID      = "61080002-8d6d-82b8-614a-1c8cb0f8dcc6"
	DataFromStrapUUID   = "61080005-8d6d-82b8-614a-1c8cb0f8dcc6"
	CmdFromStrapUUID    = "61080003-8d6d-82b8-614a-1c8cb0f8dcc6"
	EventsFromStrapUUID = "61080004-8d6d-82b8-614a-1c8cb0f8dcc6"
	MemfaultUUID        = "61080007-8d6d-82b8-614a-1c8cb0f8dcc6"
)

type PacketType uint8

const (
	PacketTypeCommand                 PacketType = 35
	PacketTypeCommandResponse         PacketType = 36
	PacketTypeRealtimeData            PacketType = 40
	PacketTypeHistoricalData          PacketType = 47
	PacketTypeRealtimeRawData         PacketType = 43
	PacketTypeEvent                   PacketType = 48
	PacketTypeMetadata                PacketType = 49
	PacketTypeConsoleLogs             PacketType = 50
	PacketTypeRealtimeIMUDataStream   PacketType = 51
	PacketTypeHistoricalIMUDataStream PacketType = 52
)

func PacketTypeFromByte(v byte) (PacketType, bool) {
	switch PacketType(v) {
	case PacketTypeCommand,
		PacketTypeCommandResponse,
		PacketTypeRealtimeData,
		PacketTypeHistoricalData,
		PacketTypeRealtimeRawData,
		PacketTypeEvent,
		PacketTypeMetadata,
		PacketTypeConsoleLogs,
		PacketTypeRealtimeIMUDataStream,
		PacketTypeHistoricalIMUDataStream:
		return PacketType(v), true
	default:
		return 0, false
	}
}

type MetadataType uint8

const (
	MetadataHistoryStart    MetadataType = 1
	MetadataHistoryEnd      MetadataType = 2
	MetadataHistoryComplete MetadataType = 3
)

func MetadataTypeFromByte(v byte) (MetadataType, bool) {
	switch MetadataType(v) {
	case MetadataHistoryStart, MetadataHistoryEnd, MetadataHistoryComplete:
		return MetadataType(v), true
	default:
		return 0, false
	}
}

type CommandNumber uint8

const (
	CommandLinkValid                 CommandNumber = 1
	CommandGetMaxProtocolVersion     CommandNumber = 2
	CommandToggleRealtimeHR          CommandNumber = 3
	CommandReportVersionInfo         CommandNumber = 7
	CommandSetClock                  CommandNumber = 10
	CommandGetClock                  CommandNumber = 11
	CommandToggleGenericHRProfile    CommandNumber = 14
	CommandToggleR7DataCollection    CommandNumber = 16
	CommandRunHapticPatternMaverick  CommandNumber = 19
	CommandAbortHistoricalTransmits  CommandNumber = 20
	CommandSendHistoricalData        CommandNumber = 22
	CommandHistoricalDataResult      CommandNumber = 23
	CommandForceTrim                 CommandNumber = 25
	CommandGetBatteryLevel           CommandNumber = 26
	CommandRebootStrap               CommandNumber = 29
	CommandPowerCycleStrap           CommandNumber = 32
	CommandSetReadPointer            CommandNumber = 33
	CommandGetDataRange              CommandNumber = 34
	CommandGetHelloHarvard           CommandNumber = 35
	CommandStartFirmwareLoad         CommandNumber = 36
	CommandLoadFirmwareData          CommandNumber = 37
	CommandProcessFirmwareImage      CommandNumber = 38
	CommandSetAlarmTime              CommandNumber = 66
	CommandRunAlarm                  CommandNumber = 68
	CommandGetAdvertisingNameHarvard CommandNumber = 76
	CommandReportHapticsPattern      CommandNumber = 80
	CommandStartRawData              CommandNumber = 81
	CommandStopRawData               CommandNumber = 82
	CommandEnterHighFreqSync         CommandNumber = 96
	CommandExitHighFreqSync          CommandNumber = 97
	CommandToggleIMUModeHistorical   CommandNumber = 105
	CommandToggleIMUMode             CommandNumber = 106
	CommandEnableOpticalData         CommandNumber = 107
	CommandToggleOpticalMode         CommandNumber = 108
	CommandGetAdvertisingName        CommandNumber = 141
	CommandStartFirmwareLoadNew      CommandNumber = 142
	CommandLoadFirmwareDataNew       CommandNumber = 143
	CommandProcessFirmwareImageNew   CommandNumber = 144
	CommandGetHello                  CommandNumber = 145
)

func CommandNumberFromByte(v byte) (CommandNumber, bool) {
	switch CommandNumber(v) {
	case CommandLinkValid,
		CommandGetMaxProtocolVersion,
		CommandToggleRealtimeHR,
		CommandReportVersionInfo,
		CommandSetClock,
		CommandGetClock,
		CommandToggleGenericHRProfile,
		CommandToggleR7DataCollection,
		CommandRunHapticPatternMaverick,
		CommandAbortHistoricalTransmits,
		CommandSendHistoricalData,
		CommandHistoricalDataResult,
		CommandForceTrim,
		CommandGetBatteryLevel,
		CommandRebootStrap,
		CommandPowerCycleStrap,
		CommandSetReadPointer,
		CommandGetDataRange,
		CommandGetHelloHarvard,
		CommandStartFirmwareLoad,
		CommandLoadFirmwareData,
		CommandProcessFirmwareImage,
		CommandSetAlarmTime,
		CommandRunAlarm,
		CommandGetAdvertisingNameHarvard,
		CommandReportHapticsPattern,
		CommandStartRawData,
		CommandStopRawData,
		CommandEnterHighFreqSync,
		CommandExitHighFreqSync,
		CommandToggleIMUModeHistorical,
		CommandToggleIMUMode,
		CommandEnableOpticalData,
		CommandToggleOpticalMode,
		CommandGetAdvertisingName,
		CommandStartFirmwareLoadNew,
		CommandLoadFirmwareDataNew,
		CommandProcessFirmwareImageNew,
		CommandGetHello:
		return CommandNumber(v), true
	default:
		return 0, false
	}
}
