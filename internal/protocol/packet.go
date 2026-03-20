package protocol

import (
	"encoding/binary"
	"fmt"
	"strings"
)

type Packet struct {
	PacketType PacketType
	Seq        uint8
	Cmd        uint8
	Data       []byte
	Partial    bool
	Size       int
}

const sof = 0xAA

func NewPacket(packetType PacketType, seq uint8, cmd uint8, data []byte) Packet {
	payload := append([]byte(nil), data...)
	return Packet{
		PacketType: packetType,
		Seq:        seq,
		Cmd:        cmd,
		Data:       payload,
		Size:       len(payload),
	}
}

func (p Packet) WithSeq(seq uint8) Packet {
	p.Seq = seq
	return p
}

func ParsePacket(data []byte) (Packet, error) {
	if len(data) < 8 {
		return Packet{}, ErrPacketTooShort
	}

	buf := append([]byte(nil), data...)
	if buf[0] != sof {
		return Packet{}, ErrInvalidSOF
	}
	buf = buf[1:]

	if len(buf) < 3 {
		return Packet{}, ErrPacketTooShort
	}
	lengthBuf := buf[:2]
	expectedCRC8 := buf[2]
	buf = buf[3:]

	if crc8(lengthBuf) != expectedCRC8 {
		return Packet{}, ErrInvalidHeaderCRC8
	}

	length := int(binary.LittleEndian.Uint16(lengthBuf))
	if length < 8 {
		return Packet{}, ErrInvalidPacketLen
	}
	partial := len(buf) < length

	if !partial {
		if len(buf) < 4 {
			return Packet{}, ErrInvalidData
		}
		expectedCRC32 := binary.LittleEndian.Uint32(buf[len(buf)-4:])
		if crc32(buf[:len(buf)-4]) != expectedCRC32 {
			return Packet{}, ErrInvalidDataCRC32
		}
		buf = buf[:len(buf)-4]
	}

	if len(buf) < 3 {
		return Packet{}, ErrInvalidData
	}
	pt, ok := PacketTypeFromByte(buf[0])
	if !ok {
		return Packet{}, fmt.Errorf("invalid packet type: %d", buf[0])
	}
	pkt := Packet{
		PacketType: pt,
		Seq:        buf[1],
		Cmd:        buf[2],
		Data:       append([]byte(nil), buf[3:]...),
		Partial:    partial,
		Size:       length,
	}
	return pkt, nil
}

func (p Packet) payload() []byte {
	out := make([]byte, 0, 3+len(p.Data))
	out = append(out, byte(p.PacketType), p.Seq, p.Cmd)
	out = append(out, p.Data...)
	return out
}

func (p Packet) Framed() ([]byte, error) {
	payload := p.payload()
	if len(payload) > 0xFFFF-4 {
		return nil, fmt.Errorf("payload too large")
	}
	length := uint16(len(payload) + 4)
	lengthBuf := []byte{byte(length), byte(length >> 8)}
	crc8v := crc8(lengthBuf)
	crc32v := crc32(payload)

	out := make([]byte, 0, 1+2+1+len(payload)+4)
	out = append(out, sof)
	out = append(out, lengthBuf...)
	out = append(out, crc8v)
	out = append(out, payload...)
	crc32Buf := make([]byte, 4)
	binary.LittleEndian.PutUint32(crc32Buf, crc32v)
	out = append(out, crc32Buf...)
	return out, nil
}

func crc8(data []byte) uint8 {
	var crc uint8
	for _, b := range data {
		crc ^= b
		for i := 0; i < 8; i++ {
			if crc&0x80 != 0 {
				crc = (crc << 1) ^ 0x07
			} else {
				crc <<= 1
			}
		}
	}
	return crc
}

func crc32(data []byte) uint32 {
	crc := uint32(0xFFFFFFFF)
	for _, b := range data {
		crc ^= uint32(b)
		for i := 0; i < 8; i++ {
			if crc&1 != 0 {
				crc = (crc >> 1) ^ 0xEDB88320
			} else {
				crc >>= 1
			}
		}
	}
	return ^crc
}

func (p Packet) String() string {
	var sb strings.Builder
	sb.WriteString("Packet{Type:")
	sb.WriteString(fmt.Sprintf("%d", p.PacketType))
	sb.WriteString(", Seq:")
	sb.WriteString(fmt.Sprintf("%d", p.Seq))
	sb.WriteString(", Cmd:")
	sb.WriteString(fmt.Sprintf("%d", p.Cmd))
	sb.WriteString(", Payload:")
	for _, b := range p.Data {
		sb.WriteString(fmt.Sprintf("%02x", b))
	}
	sb.WriteString("}")
	return sb.String()
}
