//go:build darwin || windows

package device

import "tinygo.org/x/bluetooth"

func platformBluetoothAdapter(_ string) *bluetooth.Adapter {
	return bluetooth.DefaultAdapter
}
