//go:build linux

package device

import (
	"strings"

	"tinygo.org/x/bluetooth"
)

func platformBluetoothAdapter(bleInterface string) *bluetooth.Adapter {
	trimmed := strings.TrimSpace(bleInterface)
	if trimmed == "" {
		return bluetooth.DefaultAdapter
	}
	return bluetooth.NewAdapter(trimmed)
}
