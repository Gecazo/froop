package protocol

import (
	"encoding/binary"
	"testing"
	"time"
)

func TestPacketRoundTrip(t *testing.T) {
	cases := []PacketType{
		PacketTypeCommand,
		PacketTypeCommandResponse,
		PacketTypeHistoricalData,
		PacketTypeEvent,
		PacketTypeMetadata,
		PacketTypeConsoleLogs,
	}

	for _, pt := range cases {
		t.Run(string(rune(pt)), func(t *testing.T) {
			p := NewPacket(pt, 7, 3, []byte{0x01, 0x02, 0x03})
			framed, err := p.Framed()
			if err != nil {
				t.Fatalf("framed: %v", err)
			}
			parsed, err := ParsePacket(framed)
			if err != nil {
				t.Fatalf("parse: %v", err)
			}
			if parsed.PacketType != p.PacketType || parsed.Seq != p.Seq || parsed.Cmd != p.Cmd {
				t.Fatalf("parsed mismatch: %+v vs %+v", parsed, p)
			}
		})
	}
}

func TestPacketValidation(t *testing.T) {
	if _, err := ParsePacket([]byte{0xAA, 0x01}); err == nil {
		t.Fatal("expected packet too short")
	}
	if _, err := ParsePacket([]byte{0x00, 0, 0, 0, 0, 0, 0, 0}); err == nil {
		t.Fatal("expected invalid sof")
	}
}

func TestBuilderSetTime(t *testing.T) {
	now := time.Unix(1700000000, 0).UTC()
	p := SetTime(now)
	if p.Cmd != uint8(CommandSetClock) {
		t.Fatalf("unexpected cmd: %d", p.Cmd)
	}
	if len(p.Data) != 9 {
		t.Fatalf("unexpected data len: %d", len(p.Data))
	}
	timestamp := binary.LittleEndian.Uint32(p.Data[:4])
	if timestamp != uint32(now.Unix()) {
		t.Fatalf("timestamp mismatch: got %d want %d", timestamp, now.Unix())
	}
}

func TestBuilderPackets(t *testing.T) {
	cases := []struct {
		name      string
		pkt       Packet
		cmd       CommandNumber
		roundTrip bool
	}{
		{name: "enter", pkt: EnterHighFreqSync(), cmd: CommandEnterHighFreqSync, roundTrip: false},
		{name: "exit", pkt: ExitHighFreqSync(), cmd: CommandExitHighFreqSync, roundTrip: false},
		{name: "history", pkt: HistoryStart(), cmd: CommandSendHistoricalData, roundTrip: true},
		{name: "hello", pkt: HelloHarvard(), cmd: CommandGetHelloHarvard, roundTrip: true},
		{name: "name", pkt: GetName(), cmd: CommandGetAdvertisingNameHarvard, roundTrip: true},
		{name: "restart", pkt: Restart(), cmd: CommandRebootStrap, roundTrip: true},
		{name: "erase", pkt: Erase(), cmd: CommandForceTrim, roundTrip: true},
		{name: "version", pkt: Version(), cmd: CommandReportVersionInfo, roundTrip: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if tc.pkt.Cmd != uint8(tc.cmd) {
				t.Fatalf("unexpected cmd: %d want %d", tc.pkt.Cmd, tc.cmd)
			}
			if tc.roundTrip {
				framed, err := tc.pkt.Framed()
				if err != nil {
					t.Fatalf("framed: %v", err)
				}
				if _, err := ParsePacket(framed); err != nil {
					t.Fatalf("roundtrip parse: %v", err)
				}
			}
		})
	}
}
