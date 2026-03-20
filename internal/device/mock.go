package device

import (
	"context"
	"sync"
)

type MockAdapter struct {
	Devices map[string]*MockConnection
}

func NewMockAdapter() *MockAdapter {
	return &MockAdapter{Devices: map[string]*MockConnection{}}
}

func (m *MockAdapter) AddDevice(id, name string, rssi int) *MockConnection {
	conn := &MockConnection{
		Name:          name,
		RSSI:          rssi,
		notifications: make(chan Notification, 128),
		connected:     false,
	}
	m.Devices[id] = conn
	return conn
}

func (m *MockAdapter) Scan(context.Context, string) ([]PeripheralInfo, error) {
	out := make([]PeripheralInfo, 0, len(m.Devices))
	for id, conn := range m.Devices {
		out = append(out, PeripheralInfo{ID: id, Name: conn.Name, RSSI: conn.RSSI})
	}
	return out, nil
}

func (m *MockAdapter) Connect(_ context.Context, deviceID string) (Connection, error) {
	if conn, ok := m.Devices[deviceID]; ok {
		conn.connected = true
		return conn, nil
	}
	conn := &MockConnection{Name: deviceID, RSSI: -40, notifications: make(chan Notification, 128), connected: true}
	m.Devices[deviceID] = conn
	return conn, nil
}

func (m *MockAdapter) StopScan(context.Context) error { return nil }

type MockConnection struct {
	Name string
	RSSI int

	mu            sync.Mutex
	connected     bool
	notifications chan Notification
	writes        []Notification
}

func (m *MockConnection) DiscoverServices(context.Context) error  { return nil }
func (m *MockConnection) Subscribe(context.Context, string) error { return nil }
func (m *MockConnection) Notifications(context.Context) (<-chan Notification, error) {
	return m.notifications, nil
}
func (m *MockConnection) Write(_ context.Context, characteristicUUID string, data []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.writes = append(m.writes, Notification{UUID: characteristicUUID, Value: append([]byte(nil), data...)})
	return nil
}
func (m *MockConnection) IsConnected(context.Context) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.connected, nil
}
func (m *MockConnection) Disconnect(context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.connected = false
	return nil
}

func (m *MockConnection) PushNotification(n Notification) {
	m.notifications <- n
}

func (m *MockConnection) Writes() []Notification {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]Notification, len(m.writes))
	copy(out, m.writes)
	return out
}
