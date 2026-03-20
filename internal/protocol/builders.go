package protocol

import (
	"encoding/binary"
	"time"
)

func EnterHighFreqSync() Packet {
	return NewPacket(PacketTypeCommand, 0, uint8(CommandEnterHighFreqSync), nil)
}

func ExitHighFreqSync() Packet {
	return NewPacket(PacketTypeCommand, 0, uint8(CommandExitHighFreqSync), nil)
}

func HistoryStart() Packet {
	return NewPacket(PacketTypeCommand, 0, uint8(CommandSendHistoricalData), []byte{0x00})
}

func HelloHarvard() Packet {
	return NewPacket(PacketTypeCommand, 0, uint8(CommandGetHelloHarvard), []byte{0x00})
}

func GetName() Packet {
	return NewPacket(PacketTypeCommand, 0, uint8(CommandGetAdvertisingNameHarvard), []byte{0x00})
}

func SetTime(now time.Time) Packet {
	payload := make([]byte, 9)
	binary.LittleEndian.PutUint32(payload[:4], uint32(now.UTC().Unix()))
	return NewPacket(PacketTypeCommand, 0, uint8(CommandSetClock), payload)
}

func HistoryEnd(data uint32) Packet {
	payload := make([]byte, 9)
	payload[0] = 0x01
	binary.LittleEndian.PutUint32(payload[1:5], data)
	return NewPacket(PacketTypeCommand, 0, uint8(CommandHistoricalDataResult), payload)
}

func AlarmTime(unix uint32) Packet {
	payload := make([]byte, 9)
	payload[0] = 0x01
	binary.LittleEndian.PutUint32(payload[1:5], unix)
	return NewPacket(PacketTypeCommand, 0, uint8(CommandSetAlarmTime), payload)
}

func ToggleIMUMode(enable bool) Packet {
	value := byte(0)
	if enable {
		value = 1
	}
	return NewPacket(PacketTypeCommand, 0, uint8(CommandToggleIMUMode), []byte{value})
}

func ToggleIMUModeHistorical(enable bool) Packet {
	value := byte(0)
	if enable {
		value = 1
	}
	return NewPacket(PacketTypeCommand, 0, uint8(CommandToggleIMUModeHistorical), []byte{value})
}

func ToggleR7DataCollection() Packet {
	return NewPacket(PacketTypeCommand, 0, uint8(CommandToggleR7DataCollection), []byte{0x01})
}

func Restart() Packet {
	return NewPacket(PacketTypeCommand, 0, uint8(CommandRebootStrap), []byte{0x00})
}

func Erase() Packet {
	return NewPacket(PacketTypeCommand, 0, uint8(CommandForceTrim), []byte{0xfe, 0xfe, 0xfe, 0xfe, 0xfe, 0xfe, 0xfe, 0xfe, 0x00})
}

func Version() Packet {
	return NewPacket(PacketTypeCommand, 0, uint8(CommandReportVersionInfo), []byte{0x00})
}

func EnableOpticalData(enable bool) Packet {
	v := byte(0)
	if enable {
		v = 1
	}
	return NewPacket(PacketTypeCommand, 0, uint8(CommandEnableOpticalData), []byte{0x01, v})
}

func ToggleOpticalMode(enable bool) Packet {
	v := byte(0)
	if enable {
		v = 1
	}
	return NewPacket(PacketTypeCommand, 0, uint8(CommandToggleOpticalMode), []byte{0x01, v})
}
