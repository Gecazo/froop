package app

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/gecazo/froop/internal/decoder"
	"github.com/gecazo/froop/internal/device"
	"github.com/gecazo/froop/internal/model"
	"github.com/gecazo/froop/internal/protocol"
)

type WhoopDevice struct {
	adapter      device.Adapter
	connection   device.Connection
	whoop        *OpenWhoop
	debugPackets bool
	deviceID     string
}

func NewWhoopDevice(adapter device.Adapter, whoop *OpenWhoop, debugPackets bool, deviceID string) *WhoopDevice {
	return &WhoopDevice{
		adapter:      adapter,
		whoop:        whoop,
		debugPackets: debugPackets,
		deviceID:     deviceID,
	}
}

func (w *WhoopDevice) Connect(ctx context.Context) error {
	conn, err := w.adapter.Connect(ctx, w.deviceID)
	if err != nil {
		return err
	}
	w.connection = conn
	_ = w.adapter.StopScan(ctx)
	if err := w.connection.DiscoverServices(ctx); err != nil {
		return err
	}
	w.whoop.packet = nil
	return nil
}

func (w *WhoopDevice) IsConnected(ctx context.Context) (bool, error) {
	if w.connection == nil {
		return false, nil
	}
	return w.connection.IsConnected(ctx)
}

func (w *WhoopDevice) subscribe(ctx context.Context, characteristic string) error {
	if w.connection == nil {
		return errors.New("connection is nil")
	}
	return w.connection.Subscribe(ctx, characteristic)
}

func (w *WhoopDevice) Initialize(ctx context.Context) error {
	if err := w.subscribe(ctx, protocol.DataFromStrapUUID); err != nil {
		return err
	}
	if err := w.subscribe(ctx, protocol.CmdFromStrapUUID); err != nil {
		return err
	}
	if err := w.subscribe(ctx, protocol.EventsFromStrapUUID); err != nil {
		return err
	}
	if err := w.subscribe(ctx, protocol.MemfaultUUID); err != nil {
		return err
	}

	if err := w.SendCommand(ctx, protocol.HelloHarvard()); err != nil {
		return err
	}
	if err := w.SendCommand(ctx, protocol.SetTime(time.Now())); err != nil {
		return err
	}
	if err := w.SendCommand(ctx, protocol.GetName()); err != nil {
		return err
	}
	if err := w.SendCommand(ctx, protocol.EnterHighFreqSync()); err != nil {
		return err
	}
	return nil
}

func (w *WhoopDevice) SendCommand(ctx context.Context, packet protocol.Packet) error {
	if w.connection == nil {
		return errors.New("connection is nil")
	}
	framed, err := packet.Framed()
	if err != nil {
		return err
	}
	return w.connection.Write(ctx, protocol.CmdToStrapUUID, framed)
}

func (w *WhoopDevice) SyncHistory(ctx context.Context, shouldExit <-chan struct{}) error {
	if w.connection == nil {
		return errors.New("connection is nil")
	}
	notifications, err := w.connection.Notifications(ctx)
	if err != nil {
		return err
	}
	if err := w.SendCommand(ctx, protocol.HistoryStart()); err != nil {
		return err
	}

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-shouldExit:
			return nil
		case <-time.After(10 * time.Second):
			connected, err := w.IsConnected(ctx)
			if err != nil {
				return err
			}
			if !connected {
				log.Printf("Whoop disconnected")
				if err := w.retryReconnect(ctx); err != nil {
					return err
				}
				if err := w.SendCommand(ctx, protocol.HistoryStart()); err != nil {
					return err
				}
			}
		case n, ok := <-notifications:
			if !ok {
				return nil
			}
			packet := model.Packet{ID: 0, UUID: n.UUID, Bytes: n.Value}
			if w.debugPackets {
				stored, err := w.whoop.Database.CreatePacket(n.UUID, n.Value)
				if err != nil {
					return err
				}
				packet = stored
			}
			response, err := w.whoop.HandleStoredPacket(packet)
			if err != nil {
				return err
			}
			if response != nil {
				if err := w.SendCommand(ctx, *response); err != nil {
					return err
				}
			}
		}
	}
}

func (w *WhoopDevice) retryReconnect(ctx context.Context) error {
	for i := 0; i < 5; i++ {
		if err := w.Connect(ctx); err == nil {
			if err := w.Initialize(ctx); err != nil {
				return err
			}
			return nil
		}
		time.Sleep(10 * time.Second)
	}
	return errors.New("failed to reconnect")
}

func (w *WhoopDevice) GetVersion(ctx context.Context) error {
	if err := w.subscribe(ctx, protocol.CmdFromStrapUUID); err != nil {
		return err
	}
	notifications, err := w.connection.Notifications(ctx)
	if err != nil {
		return err
	}
	if err := w.SendCommand(ctx, protocol.Version()); err != nil {
		return err
	}

	timer := time.NewTimer(5 * time.Second)
	defer timer.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-timer.C:
			return errors.New("timed out waiting for version notification")
		case n, ok := <-notifications:
			if !ok {
				return errors.New("stream ended unexpectedly")
			}
			packet, err := protocol.ParsePacket(n.Value)
			if err != nil {
				continue
			}
			data, err := decoder.FromPacket(packet)
			if err != nil {
				continue
			}
			if version, ok := data.(decoder.VersionInfoData); ok {
				log.Printf("version harvard %s boylston %s", version.Harvard, version.Boylston)
				return nil
			}
		}
	}
}
