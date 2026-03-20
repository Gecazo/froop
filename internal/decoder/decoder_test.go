package decoder

import (
	"encoding/binary"
	"testing"

	"github.com/gecazo/froop/internal/model"
	"github.com/gecazo/froop/internal/protocol"
)

func TestParseHistoricalGeneric(t *testing.T) {
	data := make([]byte, 0, 4+4+6+1+1+8)
	data = append(data, 0, 0, 0, 0) // sequence
	timeSec := uint32(1735689600)
	ts := make([]byte, 4)
	binary.LittleEndian.PutUint32(ts, timeSec)
	data = append(data, ts...)
	data = append(data, 0, 0, 0, 0, 0, 0) // flags/sensors
	data = append(data, 72)               // bpm
	data = append(data, 1)                // rr_count
	rr := make([]byte, 8)
	binary.LittleEndian.PutUint16(rr[0:2], 833)
	data = append(data, rr...)

	d, err := FromPacket(protocol.Packet{PacketType: protocol.PacketTypeHistoricalData, Seq: 7, Data: data})
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	hr, ok := d.(HistoryReadingData)
	if !ok {
		t.Fatalf("unexpected type: %T", d)
	}
	if hr.Reading.UnixMS != uint64(timeSec)*1000 || hr.Reading.BPM != 72 {
		t.Fatalf("bad reading: %+v", hr.Reading)
	}
	if len(hr.Reading.RR) != 1 || hr.Reading.RR[0] != 833 {
		t.Fatalf("bad rr: %+v", hr.Reading.RR)
	}
}

func TestParseHistoricalV12(t *testing.T) {
	data := make([]byte, 77)
	binary.LittleEndian.PutUint32(data[4:8], 1735689600)
	data[14] = 65
	data[15] = 2
	binary.LittleEndian.PutUint16(data[16:18], 900)
	binary.LittleEndian.PutUint16(data[18:20], 880)
	binary.LittleEndian.PutUint16(data[26:28], 111)
	binary.LittleEndian.PutUint16(data[28:30], 222)
	binary.LittleEndian.PutUint16(data[61:63], 3000)
	binary.LittleEndian.PutUint16(data[63:65], 4000)
	binary.LittleEndian.PutUint16(data[65:67], 850)
	data[48] = 1

	d, err := FromPacket(protocol.Packet{PacketType: protocol.PacketTypeHistoricalData, Seq: 12, Data: data})
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	hr := d.(HistoryReadingData)
	if hr.Reading.SensorData == nil {
		t.Fatal("expected sensor data")
	}
	if hr.Reading.SensorData.SPO2Red != 3000 || hr.Reading.SensorData.SPO2IR != 4000 {
		t.Fatalf("bad sensor data: %+v", hr.Reading.SensorData)
	}
}

func TestParseMetadata(t *testing.T) {
	data := make([]byte, 14)
	binary.LittleEndian.PutUint32(data[0:4], 10)
	binary.LittleEndian.PutUint32(data[10:14], 42)

	d, err := FromPacket(protocol.Packet{PacketType: protocol.PacketTypeMetadata, Cmd: byte(protocol.MetadataHistoryEnd), Data: data})
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	md, ok := d.(HistoryMetadataData)
	if !ok {
		t.Fatalf("unexpected type: %T", d)
	}
	if md.Unix != 10 || md.Data != 42 || md.Cmd != protocol.MetadataHistoryEnd {
		t.Fatalf("bad metadata: %+v", md)
	}
}

func TestParseVersion(t *testing.T) {
	data := make([]byte, 35)
	o := 3
	vals := []uint32{41, 16, 5, 0, 17, 2, 2, 0}
	for _, v := range vals {
		binary.LittleEndian.PutUint32(data[o:o+4], v)
		o += 4
	}

	d, err := FromPacket(protocol.Packet{PacketType: protocol.PacketTypeCommandResponse, Cmd: byte(protocol.CommandReportVersionInfo), Data: data})
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	vi := d.(VersionInfoData)
	if vi.Harvard != "41.16.5.0" || vi.Boylston != "17.2.2.0" {
		t.Fatalf("bad version: %+v", vi)
	}
}

func TestParseConsoleLog(t *testing.T) {
	data := append([]byte{0x01}, make([]byte, 4)...)
	binary.LittleEndian.PutUint32(data[1:5], 7)
	data = append(data, 0x00, 0x00)
	data = append(data, []byte("hello")...)
	d, err := FromPacket(protocol.Packet{PacketType: protocol.PacketTypeConsoleLogs, Data: data})
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	log := d.(ConsoleLogData)
	if log.Unix != 7 || log.Log != "hello" {
		t.Fatalf("bad log: %+v", log)
	}
}

func TestHistoryReadingValidity(t *testing.T) {
	hr := model.HistoryReading{BPM: 70}
	if !hr.IsValid() {
		t.Fatal("expected valid")
	}
	if (model.HistoryReading{}).IsValid() {
		t.Fatal("expected invalid")
	}
}
