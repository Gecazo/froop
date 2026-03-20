package protocol

import "fmt"

var (
	ErrPacketTooShort    = fmt.Errorf("packet too short")
	ErrInvalidSOF        = fmt.Errorf("invalid sof")
	ErrInvalidHeaderCRC8 = fmt.Errorf("invalid header crc8")
	ErrInvalidPacketLen  = fmt.Errorf("invalid packet length")
	ErrInvalidDataCRC32  = fmt.Errorf("invalid data crc32")
	ErrInvalidData       = fmt.Errorf("invalid data")
	ErrInvalidRRCount    = fmt.Errorf("invalid rr count")
	ErrUnimplemented     = fmt.Errorf("unimplemented packet")
)
