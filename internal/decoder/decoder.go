package decoder

import (
	"encoding/binary"
	"fmt"
	"math"
	"strconv"

	"github.com/gecazo/froop/internal/model"
	"github.com/gecazo/froop/internal/protocol"
)

func FromPacket(packet protocol.Packet) (Data, error) {
	switch packet.PacketType {
	case protocol.PacketTypeHistoricalData:
		return parseHistoricalPacket(packet.Seq, packet.Data)
	case protocol.PacketTypeMetadata:
		return parseMetadata(packet)
	case protocol.PacketTypeConsoleLogs:
		return parseConsoleLog(packet.Data)
	case protocol.PacketTypeEvent:
		return parseEvent(packet)
	case protocol.PacketTypeCommandResponse:
		cmd, ok := protocol.CommandNumberFromByte(packet.Cmd)
		if !ok {
			return nil, fmt.Errorf("invalid command type: %d", packet.Cmd)
		}
		switch cmd {
		case protocol.CommandReportVersionInfo:
			return parseReportVersionInfo(packet.Data)
		default:
			return nil, protocol.ErrUnimplemented
		}
	default:
		return nil, protocol.ErrUnimplemented
	}
}

func parseEvent(packet protocol.Packet) (Data, error) {
	cmd, knownCmd := protocol.CommandNumberFromByte(packet.Cmd)
	buf := append([]byte(nil), packet.Data...)
	if len(buf) < 5 {
		return nil, protocol.ErrInvalidData
	}
	buf = buf[1:]
	unix := binary.LittleEndian.Uint32(buf[:4])

	if knownCmd {
		switch cmd {
		case protocol.CommandRunAlarm:
			return RunAlarmData{Unix: unix}, nil
		case protocol.CommandToggleRealtimeHR,
			protocol.CommandGetClock,
			protocol.CommandRebootStrap,
			protocol.CommandToggleR7DataCollection,
			protocol.CommandToggleGenericHRProfile:
			return EventData{Unix: unix, Event: cmd}, nil
		default:
			return nil, protocol.ErrUnimplemented
		}
	}

	return UnknownEventData{Unix: unix, Event: packet.Cmd}, nil
}

func parseConsoleLog(packet []byte) (Data, error) {
	buf := append([]byte(nil), packet...)
	if len(buf) < 5 {
		return nil, protocol.ErrInvalidData
	}
	buf = buf[1:]
	unix := binary.LittleEndian.Uint32(buf[:4])
	buf = buf[4:]
	if len(buf) >= 2 {
		buf = buf[2:]
	}

	result := make([]byte, 0, len(buf))
	for i := 0; i < len(buf); i++ {
		if i+2 < len(buf) && buf[i] == 0x34 && buf[i+1] == 0x00 && buf[i+2] == 0x01 {
			i += 2
			continue
		}
		result = append(result, buf[i])
	}
	log := string(result)
	return ConsoleLogData{Unix: unix, Log: log}, nil
}

func parseMetadata(packet protocol.Packet) (Data, error) {
	cmd, ok := protocol.MetadataTypeFromByte(packet.Cmd)
	if !ok {
		return nil, fmt.Errorf("invalid metadata type: %d", packet.Cmd)
	}
	buf := append([]byte(nil), packet.Data...)
	if len(buf) < 14 {
		return nil, protocol.ErrInvalidData
	}
	unix := binary.LittleEndian.Uint32(buf[:4])
	data := binary.LittleEndian.Uint32(buf[10:14])
	return HistoryMetadataData{Unix: unix, Data: data, Cmd: cmd}, nil
}

func parseHistoricalPacket(version uint8, packet []byte) (Data, error) {
	const minPacketLenForIMU = 1188
	if len(packet) >= minPacketLenForIMU {
		return parseHistoricalPacketWithIMU(packet)
	}
	if (version == 12 || version == 24) && len(packet) >= 77 {
		return parseHistoricalPacketV12(packet)
	}
	return parseHistoricalPacketGeneric(packet)
}

func parseHistoricalPacketGeneric(packet []byte) (Data, error) {
	buf := append([]byte(nil), packet...)
	if len(buf) < 20 {
		return nil, protocol.ErrInvalidData
	}
	buf = buf[4:] // sequence
	unix := uint64(binary.LittleEndian.Uint32(buf[:4])) * 1000
	buf = buf[4:]
	if len(buf) < 8 {
		return nil, protocol.ErrInvalidData
	}
	buf = buf[6:] // flags + sensors
	bpm := buf[0]
	rrCount := int(buf[1])
	buf = buf[2:]

	rr := make([]uint16, 0, 4)
	for i := 0; i < 4; i++ {
		if len(buf) < 2 {
			return nil, protocol.ErrInvalidData
		}
		v := binary.LittleEndian.Uint16(buf[:2])
		buf = buf[2:]
		if v != 0 {
			rr = append(rr, v)
		}
	}
	if len(rr) != rrCount {
		return nil, protocol.ErrInvalidRRCount
	}
	return HistoryReadingData{Reading: model.HistoryReading{UnixMS: unix, BPM: bpm, RR: rr, ImuData: []model.ImuSample{}}}, nil
}

func parseHistoricalPacketV12(data []byte) (Data, error) {
	if len(data) < 77 {
		return nil, protocol.ErrInvalidData
	}
	d := data

	unix := uint64(binary.LittleEndian.Uint32(d[4:8])) * 1000
	bpm := d[14]
	rrCount := int(d[15])
	rr := make([]uint16, 0, 4)
	for i := 0; i < rrCount && i < 4; i++ {
		off := 16 + i*2
		if off+2 > len(d) {
			break
		}
		v := binary.LittleEndian.Uint16(d[off : off+2])
		if v != 0 {
			rr = append(rr, v)
		}
	}

	gravity := [3]float32{}
	if len(d) >= 45 {
		for i := 0; i < 3; i++ {
			off := 33 + i*4
			bits := binary.LittleEndian.Uint32(d[off : off+4])
			gravity[i] = math.Float32frombits(bits)
		}
	}

	readU16 := func(off int) uint16 {
		if off+2 > len(d) {
			return 0
		}
		return binary.LittleEndian.Uint16(d[off : off+2])
	}

	sensor := &model.SensorData{
		PPGGreen:      readU16(26),
		PPGRedIR:      readU16(28),
		SPO2Red:       readU16(61),
		SPO2IR:        readU16(63),
		SkinTempRaw:   readU16(65),
		AmbientLight:  readU16(67),
		LEDDrive1:     readU16(69),
		LEDDrive2:     readU16(71),
		RespRateRaw:   readU16(73),
		SignalQuality: readU16(75),
		SkinContact:   d[48],
		AccelGravity:  gravity,
	}

	return HistoryReadingData{Reading: model.HistoryReading{
		UnixMS:     unix,
		BPM:        bpm,
		RR:         rr,
		ImuData:    []model.ImuSample{},
		SensorData: sensor,
	}}, nil
}

func parseHistoricalPacketWithIMU(packet []byte) (Data, error) {
	const (
		accXOffset  = 85
		accYOffset  = 285
		accZOffset  = 485
		gyrXOffset  = 688
		gyrYOffset  = 888
		gyrZOffset  = 1088
		nSamplesIMU = 100
		accSens     = 1875.0
		gyrSens     = 15.0
	)

	buf := append([]byte(nil), packet...)
	headerOffset := 20
	if len(buf) < 16 {
		return nil, protocol.ErrInvalidData
	}
	buf = buf[4:]
	unixSeconds := binary.LittleEndian.Uint32(buf[:4])
	buf = buf[4:]
	if len(buf) < 2 {
		return nil, protocol.ErrInvalidData
	}
	buf = buf[2:] // subsecond
	if len(buf) < 4 {
		return nil, protocol.ErrInvalidData
	}
	buf = buf[4:]
	if len(buf) < 2 {
		return nil, protocol.ErrInvalidData
	}
	bpm := buf[0]
	rrCount := int(buf[1])
	buf = buf[2:]

	rr := make([]uint16, 0, rrCount)
	for i := 0; i < rrCount; i++ {
		if len(buf) < 2 {
			return nil, protocol.ErrInvalidData
		}
		v := binary.LittleEndian.Uint16(buf[:2])
		buf = buf[2:]
		if v != 0 {
			rr = append(rr, v)
		}
	}
	if len(rr) != rrCount {
		return nil, protocol.ErrInvalidRRCount
	}
	headerOffset += len(rr) * 2

	if len(buf) < 4 {
		return nil, protocol.ErrInvalidData
	}
	buf = buf[4:]

	readAxis := func(offset int) ([]int16, error) {
		axis := make([]int16, 0, nSamplesIMU)
		for i := 0; i < nSamplesIMU; i++ {
			start := offset - headerOffset + i*2
			end := start + 2
			if start < 0 || end > len(buf) {
				return nil, protocol.ErrInvalidData
			}
			axis = append(axis, int16(binary.BigEndian.Uint16(buf[start:end])))
		}
		return axis, nil
	}

	accX, err := readAxis(accXOffset)
	if err != nil {
		return nil, err
	}
	accY, err := readAxis(accYOffset)
	if err != nil {
		return nil, err
	}
	accZ, err := readAxis(accZOffset)
	if err != nil {
		return nil, err
	}
	gyrX, err := readAxis(gyrXOffset)
	if err != nil {
		return nil, err
	}
	gyrY, err := readAxis(gyrYOffset)
	if err != nil {
		return nil, err
	}
	gyrZ, err := readAxis(gyrZOffset)
	if err != nil {
		return nil, err
	}

	imu := make([]model.ImuSample, 0, nSamplesIMU)
	for i := 0; i < nSamplesIMU; i++ {
		imu = append(imu, model.ImuSample{
			AccXG:   float32(accX[i]) / accSens,
			AccYG:   float32(accY[i]) / accSens,
			AccZG:   float32(accZ[i]) / accSens,
			GyrXDPS: float32(gyrX[i]) / gyrSens,
			GyrYDPS: float32(gyrY[i]) / gyrSens,
			GyrZDPS: float32(gyrZ[i]) / gyrSens,
		})
	}

	return HistoryReadingData{Reading: model.HistoryReading{
		UnixMS:  uint64(unixSeconds) * 1000,
		BPM:     bpm,
		RR:      rr,
		ImuData: imu,
	}}, nil
}

func parseReportVersionInfo(data []byte) (Data, error) {
	buf := append([]byte(nil), data...)
	if len(buf) < 35 {
		return nil, protocol.ErrInvalidData
	}
	buf = buf[3:]
	readU32 := func() (uint32, error) {
		if len(buf) < 4 {
			return 0, protocol.ErrInvalidData
		}
		v := binary.LittleEndian.Uint32(buf[:4])
		buf = buf[4:]
		return v, nil
	}

	hMajor, err := readU32()
	if err != nil {
		return nil, err
	}
	hMinor, err := readU32()
	if err != nil {
		return nil, err
	}
	hPatch, err := readU32()
	if err != nil {
		return nil, err
	}
	hBuild, err := readU32()
	if err != nil {
		return nil, err
	}
	bMajor, err := readU32()
	if err != nil {
		return nil, err
	}
	bMinor, err := readU32()
	if err != nil {
		return nil, err
	}
	bPatch, err := readU32()
	if err != nil {
		return nil, err
	}
	bBuild, err := readU32()
	if err != nil {
		return nil, err
	}

	return VersionInfoData{
		Harvard:  strconv.FormatUint(uint64(hMajor), 10) + "." + strconv.FormatUint(uint64(hMinor), 10) + "." + strconv.FormatUint(uint64(hPatch), 10) + "." + strconv.FormatUint(uint64(hBuild), 10),
		Boylston: strconv.FormatUint(uint64(bMajor), 10) + "." + strconv.FormatUint(uint64(bMinor), 10) + "." + strconv.FormatUint(uint64(bPatch), 10) + "." + strconv.FormatUint(uint64(bBuild), 10),
	}, nil
}
