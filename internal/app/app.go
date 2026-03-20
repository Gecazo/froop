package app

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gecazo/froop/internal/algorithms"
	"github.com/gecazo/froop/internal/config"
	"github.com/gecazo/froop/internal/device"
	"github.com/gecazo/froop/internal/model"
	"github.com/gecazo/froop/internal/protocol"
	"github.com/gecazo/froop/internal/store"
)

type Application struct {
	Config  config.Config
	Store   *store.Store
	Adapter device.Adapter
}

func NewApplication(cfg config.Config, st *store.Store, adapter device.Adapter) *Application {
	return &Application{Config: cfg, Store: st, Adapter: adapter}
}

func (a *Application) Run(ctx context.Context) error {
	cmd := a.Config.Command
	switch cmd.Name {
	case config.CmdDownloadFirmware:
		return a.runDownloadFirmware(cmd.Firmware)
	case config.CmdCompletions:
		return WriteCompletions(cmd.Shell, os.Stdout)
	}

	if a.Store == nil {
		return fmt.Errorf("database is not initialized")
	}
	whoop := NewOpenWhoop(a.Store)

	switch cmd.Name {
	case config.CmdScan:
		return a.runScan(ctx)
	case config.CmdDownloadHistory:
		return a.runDownloadHistory(ctx, whoop, cmd.Whoop)
	case config.CmdRerun:
		return a.runRerun(ctx, whoop)
	case config.CmdDetectEvents:
		if err := whoop.DetectSleeps(); err != nil {
			return err
		}
		return whoop.DetectEvents()
	case config.CmdSleepStats:
		return a.runSleepStats()
	case config.CmdExerciseStats:
		return a.runExerciseStats()
	case config.CmdCalculateStress:
		return whoop.CalculateStress()
	case config.CmdCalculateSpO2:
		return whoop.CalculateSpO2()
	case config.CmdCalculateSkinTmp:
		return whoop.CalculateSkinTemp()
	case config.CmdSetAlarm:
		return a.runSetAlarm(ctx, whoop, cmd.Whoop, cmd.AlarmTime)
	case config.CmdMerge:
		return a.runMerge(cmd.From)
	case config.CmdRestart:
		return a.runSendSimpleCommand(ctx, whoop, cmd.Whoop, protocol.Restart())
	case config.CmdErase:
		if err := a.runSendSimpleCommand(ctx, whoop, cmd.Whoop, protocol.Erase()); err != nil {
			return err
		}
		log.Printf("Erase command sent - device will trim all stored history data")
		return nil
	case config.CmdVersion:
		return a.runVersion(ctx, whoop, cmd.Whoop)
	case config.CmdEnableIMU:
		return a.runSendSimpleCommand(ctx, whoop, cmd.Whoop, protocol.ToggleR7DataCollection())
	case config.CmdSync:
		return a.runSync(cmd.Remote)
	default:
		return fmt.Errorf("unknown command %s", cmd.Name)
	}
}

func (a *Application) runScan(ctx context.Context) error {
	peripherals, err := a.Adapter.Scan(ctx, protocol.WhoopServiceUUID)
	if err != nil {
		return err
	}
	for _, p := range peripherals {
		fmt.Printf("Address: %s\n", p.ID)
		fmt.Printf("Name: %s\n", p.Name)
		fmt.Printf("RSSI: %d\n\n", p.RSSI)
	}
	return nil
}

func (a *Application) runDownloadHistory(ctx context.Context, whoop *OpenWhoop, deviceID string) error {
	wd, err := a.connectWhoopDevice(ctx, whoop, deviceID)
	if err != nil {
		return err
	}
	if err := wd.Initialize(ctx); err != nil {
		return err
	}

	shouldExit := make(chan struct{}, 1)
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(sigCh)
	go func() {
		<-sigCh
		fmt.Println("Received CTRL+C!")
		close(shouldExit)
	}()

	err = wd.SyncHistory(ctx, shouldExit)
	log.Printf("Exiting...")
	if err != nil {
		log.Printf("sync history error: %v", err)
	}

	for {
		connected, cErr := wd.IsConnected(ctx)
		if cErr == nil && connected {
			_ = wd.SendCommand(ctx, protocol.ExitHighFreqSync())
			break
		}
		if cErr != nil {
			return cErr
		}
		if cErr := wd.Connect(ctx); cErr != nil {
			log.Printf("reconnect failed: %v", cErr)
		}
		time.Sleep(time.Second)
	}

	return nil
}

func (a *Application) runRerun(ctx context.Context, whoop *OpenWhoop) error {
	_ = ctx
	var id int32
	for {
		packets, err := a.Store.GetPackets(id)
		if err != nil {
			return err
		}
		if len(packets) == 0 {
			break
		}
		for _, packet := range packets {
			id = packet.ID
			if _, err := whoop.HandleStoredPacket(packet); err != nil {
				return err
			}
		}
		fmt.Println(id)
	}
	return nil
}

func (a *Application) runSleepStats() error {
	sleeps, err := a.Store.GetSleepCycles(nil)
	if err != nil {
		return err
	}
	if len(sleeps) == 0 {
		fmt.Println("No sleep records found, exiting now")
		return nil
	}

	week := takeLastSleeps(sleeps, 7)
	allAnalyzer := algorithms.NewSleepConsistencyAnalyzer(sleeps)
	weekAnalyzer := algorithms.NewSleepConsistencyAnalyzer(week)
	fmt.Printf("All time: \n%s\n", allAnalyzer.CalculateConsistencyMetrics().String())
	fmt.Printf("\nWeek: \n%s\n", weekAnalyzer.CalculateConsistencyMetrics().String())
	return nil
}

func takeLastSleeps(sleeps []model.SleepCycle, max int) []model.SleepCycle {
	if len(sleeps) <= max {
		return sleeps
	}
	return sleeps[len(sleeps)-max:]
}

func (a *Application) runExerciseStats() error {
	activity := model.ActivityTypeActivity
	exercises, err := a.Store.SearchActivities(store.SearchActivityPeriods{Activity: &activity})
	if err != nil {
		return err
	}
	if len(exercises) == 0 {
		fmt.Println("No activities found, exiting now")
		return nil
	}
	week := takeLastActivities(exercises, 7)
	allMetrics := algorithms.NewExerciseMetrics(exercises)
	weekMetrics := algorithms.NewExerciseMetrics(week)
	fmt.Printf("All time: \n%s\n", allMetrics.String())
	fmt.Printf("Last week: \n%s\n", weekMetrics.String())
	return nil
}

func takeLastActivities(values []model.ActivityPeriod, max int) []model.ActivityPeriod {
	if len(values) <= max {
		return values
	}
	return values[len(values)-max:]
}

func (a *Application) runSetAlarm(ctx context.Context, whoop *OpenWhoop, deviceID string, alarm config.AlarmTime) error {
	wd, err := a.connectWhoopDevice(ctx, whoop, deviceID)
	if err != nil {
		return err
	}
	timeUTC := alarm.Unix(time.Now())
	nowUTC := time.Now().UTC()
	if timeUTC.Before(nowUTC) {
		log.Printf("Time %s is in past, current time: %s", timeUTC.Format("2006-01-02 15:04:05"), nowUTC.Format("2006-01-02 15:04:05"))
		return nil
	}
	pkt := protocol.AlarmTime(uint32(timeUTC.Unix()))
	if err := wd.SendCommand(ctx, pkt); err != nil {
		return err
	}
	fmt.Printf("Alarm time set for: %s\n", timeUTC.In(time.Local).Format("2006-01-02 15:04:05"))
	return nil
}

func (a *Application) runMerge(from string) error {
	fromDB, err := store.Open(from)
	if err != nil {
		return err
	}
	defer fromDB.Close()

	var id int32
	for {
		packets, err := fromDB.GetPackets(id)
		if err != nil {
			return err
		}
		if len(packets) == 0 {
			break
		}
		for _, packet := range packets {
			id = packet.ID
			if _, err := a.Store.CreatePacket(packet.UUID, packet.Bytes); err != nil {
				return err
			}
		}
		fmt.Println(id)
	}
	return nil
}

func (a *Application) runSendSimpleCommand(ctx context.Context, whoop *OpenWhoop, deviceID string, packet protocol.Packet) error {
	wd, err := a.connectWhoopDevice(ctx, whoop, deviceID)
	if err != nil {
		return err
	}
	return wd.SendCommand(ctx, packet)
}

func (a *Application) runVersion(ctx context.Context, whoop *OpenWhoop, deviceID string) error {
	wd, err := a.connectWhoopDevice(ctx, whoop, deviceID)
	if err != nil {
		return err
	}
	return wd.GetVersion(ctx)
}

func (a *Application) runSync(remoteURL string) error {
	remote, err := store.Open(remoteURL)
	if err != nil {
		return err
	}
	defer remote.Close()
	report, err := a.Store.SyncWith(remote)
	if err != nil {
		return err
	}
	fmt.Println(report.String())
	return nil
}

func (a *Application) connectWhoopDevice(ctx context.Context, whoop *OpenWhoop, deviceID string) (*WhoopDevice, error) {
	for {
		peripherals, err := a.Adapter.Scan(ctx, protocol.WhoopServiceUUID)
		if err != nil {
			return nil, err
		}
		for _, peripheral := range peripherals {
			if matchesWhoopID(peripheral, deviceID) {
				wd := NewWhoopDevice(a.Adapter, whoop, a.Config.DebugPackets, peripheral.ID)
				if err := wd.Connect(ctx); err != nil {
					return nil, err
				}
				return wd, nil
			}
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(time.Second):
		}
	}
}

func matchesWhoopID(peripheral device.PeripheralInfo, wanted string) bool {
	if wanted == "" {
		return true
	}
	if strings.EqualFold(peripheral.ID, wanted) {
		return true
	}
	name := sanitizeName(peripheral.Name)
	return strings.HasPrefix(name, wanted)
}

func sanitizeName(name string) string {
	name = strings.Map(func(r rune) rune {
		if r < 32 {
			return -1
		}
		return r
	}, name)
	return strings.TrimSpace(name)
}

func (a *Application) runDownloadFirmware(options config.FirmwareOptions) error {
	log.Printf("authenticating...")
	client, err := signInWhoop(options.Email, options.Password)
	if err != nil {
		return err
	}

	var chipNames []string
	switch options.DeviceName {
	case "HARVARD":
		chipNames = []string{"MAXIM", "NORDIC"}
	case "PUFFIN":
		chipNames = []string{"MAXIM", "NORDIC", "RUGGLES", "PEARL"}
	default:
		return fmt.Errorf("unknown device family: %s", options.DeviceName)
	}
	target := map[string]string{"MAXIM": options.Maxim, "NORDIC": options.Nordic}
	current := make([]chipFirmware, 0, len(chipNames))
	upgrade := make([]chipFirmware, 0, len(chipNames))
	for _, c := range chipNames {
		current = append(current, chipFirmware{ChipName: c, Version: "1.0.0.0"})
		v := target[c]
		if v == "" {
			v = "1.0.0.0"
		}
		upgrade = append(upgrade, chipFirmware{ChipName: c, Version: v})
	}

	log.Printf("device: %s", options.DeviceName)
	for _, u := range upgrade {
		log.Printf("  target %s: %s", u.ChipName, u.Version)
	}

	log.Printf("downloading firmware...")
	fwB64, err := client.downloadFirmware(options.DeviceName, current, upgrade)
	if err != nil {
		return err
	}
	return decodeAndExtractFirmware(fwB64, options.OutputDir)
}
