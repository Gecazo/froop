package app

import (
	"bytes"
	"context"
	"testing"
	"time"

	"github.com/gecazo/froop/internal/config"
	"github.com/gecazo/froop/internal/device"
	"github.com/gecazo/froop/internal/model"
	"github.com/gecazo/froop/internal/protocol"
	"github.com/gecazo/froop/internal/store"
)

func TestWriteCompletions(t *testing.T) {
	var b bytes.Buffer
	if err := WriteCompletions("bash", &b); err != nil {
		t.Fatalf("completions: %v", err)
	}
	if b.Len() == 0 {
		t.Fatal("expected output")
	}
}

func TestMockBLECommand(t *testing.T) {
	st, err := store.Open("sqlite::memory:")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer st.Close()

	adapter := device.NewMockAdapter()
	adapter.AddDevice("whoop1", "whoop1", -20)

	cfg := config.Config{DebugPackets: true, Command: config.Command{Name: config.CmdRestart, Whoop: "whoop1"}}
	a := NewApplication(cfg, st, adapter)
	whoop := NewOpenWhoop(st)
	if err := a.runSendSimpleCommand(context.Background(), whoop, "whoop1", protocol.Restart()); err != nil {
		t.Fatalf("send command: %v", err)
	}
	writes := adapter.Devices["whoop1"].Writes()
	if len(writes) == 0 {
		t.Fatal("expected command write")
	}
}

func TestRunCalculateStressAcceptance(t *testing.T) {
	st, err := store.Open("sqlite::memory:")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer st.Close()

	base := uint64(time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC).UnixMilli())
	for i := 0; i < 150; i++ {
		r := model.HistoryReading{UnixMS: base + uint64(i*1000), BPM: uint8(70 + (i % 5)), RR: []uint16{800, 810, 790}}
		if err := st.CreateReading(r); err != nil {
			t.Fatalf("create reading %d: %v", i, err)
		}
	}

	cfg := config.Config{DatabaseURL: "sqlite::memory:", Command: config.Command{Name: config.CmdCalculateStress}}
	a := NewApplication(cfg, st, device.NewMockAdapter())
	if err := a.Run(context.Background()); err != nil {
		t.Fatalf("run: %v", err)
	}
}
