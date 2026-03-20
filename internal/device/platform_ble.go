//go:build darwin || linux || windows

package device

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"tinygo.org/x/bluetooth"
)

const defaultScanWindow = 6 * time.Second

type bluetoothAdapter struct {
	adapter *bluetooth.Adapter

	enableOnce sync.Once
	enableErr  error

	mu        sync.Mutex
	byAddress map[string]*bluetoothConnection
}

func newPlatformAdapter(bleInterface string) Adapter {
	b := &bluetoothAdapter{
		adapter:   platformBluetoothAdapter(bleInterface),
		byAddress: map[string]*bluetoothConnection{},
	}
	b.adapter.SetConnectHandler(func(device bluetooth.Device, connected bool) {
		b.markConnection(device.Address.String(), connected)
	})
	return b
}

func (b *bluetoothAdapter) ensureEnabled() error {
	b.enableOnce.Do(func() {
		b.enableErr = b.adapter.Enable()
	})
	if b.enableErr != nil {
		return fmt.Errorf("enable BLE adapter: %w", b.enableErr)
	}
	return nil
}

func (b *bluetoothAdapter) markConnection(address string, connected bool) {
	key := normalizeUUID(address)
	b.mu.Lock()
	conn := b.byAddress[key]
	b.mu.Unlock()
	if conn != nil {
		conn.setConnected(connected)
	}
}

func (b *bluetoothAdapter) addConnection(keys []string, conn *bluetoothConnection) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, key := range keys {
		norm := normalizeUUID(key)
		if norm != "" {
			b.byAddress[norm] = conn
		}
	}
}

func (b *bluetoothAdapter) Scan(ctx context.Context, serviceUUID string) ([]PeripheralInfo, error) {
	if err := b.ensureEnabled(); err != nil {
		return nil, err
	}

	var serviceFilter bluetooth.UUID
	hasServiceFilter := false
	if strings.TrimSpace(serviceUUID) != "" {
		u, err := bluetooth.ParseUUID(serviceUUID)
		if err != nil {
			return nil, fmt.Errorf("invalid service uuid %q: %w", serviceUUID, err)
		}
		serviceFilter = u
		hasServiceFilter = true
	}

	type seenDevice struct {
		info PeripheralInfo
	}
	seen := map[string]seenDevice{}
	var seenMu sync.Mutex

	errCh := make(chan error, 1)
	go func() {
		errCh <- b.adapter.Scan(func(_ *bluetooth.Adapter, result bluetooth.ScanResult) {
			if hasServiceFilter && !result.HasServiceUUID(serviceFilter) {
				return
			}
			id := strings.TrimSpace(result.Address.String())
			if id == "" {
				return
			}
			info := PeripheralInfo{
				ID:   id,
				Name: strings.TrimSpace(result.LocalName()),
				RSSI: int(result.RSSI),
			}
			seenMu.Lock()
			existing, ok := seen[normalizeUUID(id)]
			if !ok || info.RSSI > existing.info.RSSI {
				seen[normalizeUUID(id)] = seenDevice{info: info}
			}
			seenMu.Unlock()
		})
	}()

	timer := time.NewTimer(defaultScanWindow)
	defer timer.Stop()

	select {
	case <-ctx.Done():
	case <-timer.C:
	}
	_ = b.StopScan(ctx)

	scanErr := <-errCh
	if scanErr != nil && !isStopScanError(scanErr) {
		return nil, scanErr
	}

	seenMu.Lock()
	out := make([]PeripheralInfo, 0, len(seen))
	for _, device := range seen {
		out = append(out, device.info)
	}
	seenMu.Unlock()
	sort.Slice(out, func(i, j int) bool {
		return out[i].RSSI > out[j].RSSI
	})
	return out, nil
}

func (b *bluetoothAdapter) Connect(_ context.Context, deviceID string) (Connection, error) {
	if err := b.ensureEnabled(); err != nil {
		return nil, err
	}
	var addr bluetooth.Address
	addr.Set(deviceID)
	dev, err := b.adapter.Connect(addr, bluetooth.ConnectionParams{})
	if err != nil {
		return nil, err
	}

	conn := &bluetoothConnection{
		device:        dev,
		connected:     true,
		chars:         map[string]*bluetooth.DeviceCharacteristic{},
		notifications: make(chan Notification, 256),
	}
	b.addConnection([]string{deviceID, dev.Address.String()}, conn)
	return conn, nil
}

func (b *bluetoothAdapter) StopScan(_ context.Context) error {
	err := b.adapter.StopScan()
	if err != nil && !isStopScanError(err) {
		return err
	}
	return nil
}

type bluetoothConnection struct {
	device bluetooth.Device

	mu sync.Mutex

	connected bool
	chars     map[string]*bluetooth.DeviceCharacteristic

	notifications chan Notification
	closeOnce     sync.Once
}

func (c *bluetoothConnection) setConnected(connected bool) {
	c.mu.Lock()
	c.connected = connected
	c.mu.Unlock()
	if !connected {
		c.closeOnce.Do(func() {
			close(c.notifications)
		})
	}
}

func (c *bluetoothConnection) DiscoverServices(_ context.Context) error {
	_, err := c.ensureCharacteristics()
	return err
}

func (c *bluetoothConnection) ensureCharacteristics() (map[string]*bluetooth.DeviceCharacteristic, error) {
	c.mu.Lock()
	if len(c.chars) > 0 {
		defer c.mu.Unlock()
		return c.chars, nil
	}
	c.mu.Unlock()

	services, err := c.device.DiscoverServices(nil)
	if err != nil {
		return nil, err
	}
	discovered := map[string]*bluetooth.DeviceCharacteristic{}
	for _, service := range services {
		chars, err := service.DiscoverCharacteristics(nil)
		if err != nil {
			continue
		}
		for i := range chars {
			charCopy := chars[i]
			discovered[normalizeUUID(charCopy.UUID().String())] = &charCopy
		}
	}
	if len(discovered) == 0 {
		return nil, fmt.Errorf("no GATT characteristics discovered")
	}

	c.mu.Lock()
	if len(c.chars) == 0 {
		c.chars = discovered
	}
	out := c.chars
	c.mu.Unlock()
	return out, nil
}

func (c *bluetoothConnection) getCharacteristic(uuid string) (*bluetooth.DeviceCharacteristic, error) {
	chars, err := c.ensureCharacteristics()
	if err != nil {
		return nil, err
	}
	ch, ok := chars[normalizeUUID(uuid)]
	if !ok {
		return nil, fmt.Errorf("characteristic %s not found", uuid)
	}
	return ch, nil
}

func (c *bluetoothConnection) Subscribe(_ context.Context, characteristicUUID string) error {
	ch, err := c.getCharacteristic(characteristicUUID)
	if err != nil {
		return err
	}
	return ch.EnableNotifications(func(buf []byte) {
		value := append([]byte(nil), buf...)
		select {
		case c.notifications <- Notification{UUID: characteristicUUID, Value: value}:
		default:
		}
	})
}

func (c *bluetoothConnection) Notifications(_ context.Context) (<-chan Notification, error) {
	return c.notifications, nil
}

func (c *bluetoothConnection) Write(_ context.Context, characteristicUUID string, data []byte) error {
	ch, err := c.getCharacteristic(characteristicUUID)
	if err != nil {
		return err
	}
	_, err = ch.WriteWithoutResponse(append([]byte(nil), data...))
	return err
}

func (c *bluetoothConnection) IsConnected(_ context.Context) (bool, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.connected, nil
}

func (c *bluetoothConnection) Disconnect(_ context.Context) error {
	c.setConnected(false)
	return c.device.Disconnect()
}

func normalizeUUID(v string) string {
	return strings.ToLower(strings.TrimSpace(v))
}

func isStopScanError(err error) bool {
	if err == nil {
		return false
	}
	s := strings.ToLower(err.Error())
	return strings.Contains(s, "not calling scan function") || strings.Contains(s, "there is no scan in progress")
}
