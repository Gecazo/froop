package device

import (
	"context"
	"errors"
	"fmt"
)

type PeripheralInfo struct {
	ID   string
	Name string
	RSSI int
}

type Notification struct {
	UUID  string
	Value []byte
}

type Adapter interface {
	Scan(ctx context.Context, serviceUUID string) ([]PeripheralInfo, error)
	Connect(ctx context.Context, deviceID string) (Connection, error)
	StopScan(ctx context.Context) error
}

type Connection interface {
	DiscoverServices(ctx context.Context) error
	Subscribe(ctx context.Context, characteristicUUID string) error
	Notifications(ctx context.Context) (<-chan Notification, error)
	Write(ctx context.Context, characteristicUUID string, data []byte) error
	IsConnected(ctx context.Context) (bool, error)
	Disconnect(ctx context.Context) error
}

var ErrNotImplemented = errors.New("ble adapter not implemented")

type NoopAdapter struct{}

func NewAdapter() Adapter {
	return &NoopAdapter{}
}

func (n *NoopAdapter) Scan(context.Context, string) ([]PeripheralInfo, error) {
	return nil, fmt.Errorf("scan: %w", ErrNotImplemented)
}

func (n *NoopAdapter) Connect(context.Context, string) (Connection, error) {
	return nil, fmt.Errorf("connect: %w", ErrNotImplemented)
}

func (n *NoopAdapter) StopScan(context.Context) error {
	return nil
}

type NoopConnection struct{}

func (n *NoopConnection) DiscoverServices(context.Context) error  { return ErrNotImplemented }
func (n *NoopConnection) Subscribe(context.Context, string) error { return ErrNotImplemented }
func (n *NoopConnection) Notifications(context.Context) (<-chan Notification, error) {
	ch := make(chan Notification)
	close(ch)
	return ch, nil
}
func (n *NoopConnection) Write(context.Context, string, []byte) error { return ErrNotImplemented }
func (n *NoopConnection) IsConnected(context.Context) (bool, error)   { return false, nil }
func (n *NoopConnection) Disconnect(context.Context) error            { return nil }
