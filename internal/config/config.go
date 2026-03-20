package config

import (
	"errors"
	"flag"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	CmdScan             = "scan"
	CmdDownloadHistory  = "download-history"
	CmdRerun            = "rerun"
	CmdDetectEvents     = "detect-events"
	CmdSleepStats       = "sleep-stats"
	CmdExerciseStats    = "exercise-stats"
	CmdCalculateStress  = "calculate-stress"
	CmdCalculateSpO2    = "calculate-spo2"
	CmdCalculateSkinTmp = "calculate-skin-temp"
	CmdSetAlarm         = "set-alarm"
	CmdMerge            = "merge"
	CmdRestart          = "restart"
	CmdErase            = "erase"
	CmdVersion          = "version"
	CmdEnableIMU        = "enable-imu"
	CmdSync             = "sync"
	CmdDownloadFirmware = "download-firmware"
	CmdCompletions      = "completions"
)

type Config struct {
	DebugPackets bool
	DatabaseURL  string
	BLEInterface string
	Command      Command
}

type Command struct {
	Name string

	Whoop     string
	AlarmTime AlarmTime
	From      string
	Remote    string
	Shell     string
	Firmware  FirmwareOptions
}

type FirmwareOptions struct {
	Email      string
	Password   string
	DeviceName string
	Maxim      string
	Nordic     string
	OutputDir  string
}

type AlarmTimeKind int

const (
	AlarmDateTime AlarmTimeKind = iota
	AlarmClockTime
	AlarmOffset
)

type AlarmTime struct {
	Kind     AlarmTimeKind
	DateTime time.Time
	Clock    time.Time
	Offset   time.Duration
}

func Parse(args []string) (Config, error) {
	return parseWithEnv(args, os.Getenv)
}

func parseWithEnv(args []string, getenv func(string) string) (Config, error) {
	cfg := Config{}

	globals := flag.NewFlagSet("openwhoop", flag.ContinueOnError)
	globals.SetOutput(os.Stderr)
	dbDefault := getenv("DATABASE_URL")
	debugDefault := parseBool(getenv("DEBUG_PACKETS"))
	globals.BoolVar(&cfg.DebugPackets, "debug-packets", debugDefault, "enable packet persistence/debug")
	globals.StringVar(&cfg.DatabaseURL, "database-url", dbDefault, "database connection url")
	globals.StringVar(&cfg.BLEInterface, "ble-interface", getenv("BLE_INTERFACE"), "linux BLE interface")
	if err := globals.Parse(args); err != nil {
		return Config{}, err
	}

	rest := globals.Args()
	if len(rest) == 0 {
		return Config{}, usageError("missing subcommand")
	}

	cfg.Command.Name = rest[0]
	if cfg.Command.Name == "re-run" {
		cfg.Command.Name = CmdRerun
	}
	cmdArgs := rest[1:]

	if cfg.Command.Name != CmdCompletions && cfg.Command.Name != CmdDownloadFirmware {
		if strings.TrimSpace(cfg.DatabaseURL) == "" {
			return Config{}, usageError("--database-url or DATABASE_URL is required")
		}
	}

	switch cfg.Command.Name {
	case CmdScan, CmdRerun, CmdDetectEvents, CmdSleepStats, CmdExerciseStats,
		CmdCalculateStress, CmdCalculateSpO2, CmdCalculateSkinTmp:
		if len(cmdArgs) != 0 {
			return Config{}, usageError("unexpected args for " + cfg.Command.Name)
		}
	case CmdDownloadHistory, CmdRestart, CmdErase, CmdVersion, CmdEnableIMU:
		whoop, err := parseWhoopArg(cfg.Command.Name, cmdArgs, getenv)
		if err != nil {
			return Config{}, err
		}
		cfg.Command.Whoop = whoop
	case CmdSetAlarm:
		whoop, alarm, err := parseSetAlarm(cmdArgs, getenv)
		if err != nil {
			return Config{}, err
		}
		cfg.Command.Whoop = whoop
		cfg.Command.AlarmTime = alarm
	case CmdMerge:
		from, err := parseMerge(cmdArgs)
		if err != nil {
			return Config{}, err
		}
		cfg.Command.From = from
	case CmdSync:
		remote, err := parseSync(cmdArgs, getenv)
		if err != nil {
			return Config{}, err
		}
		cfg.Command.Remote = remote
	case CmdDownloadFirmware:
		fw, err := parseFirmware(cmdArgs, getenv)
		if err != nil {
			return Config{}, err
		}
		cfg.Command.Firmware = fw
	case CmdCompletions:
		shell, err := parseCompletions(cmdArgs)
		if err != nil {
			return Config{}, err
		}
		cfg.Command.Shell = shell
	default:
		return Config{}, usageError("unknown subcommand: " + cfg.Command.Name)
	}

	return cfg, nil
}

func parseWhoopArg(name string, args []string, getenv func(string) string) (string, error) {
	fs := flag.NewFlagSet(name, flag.ContinueOnError)
	whoopDefault := getenv("WHOOP")
	whoop := whoopDefault
	fs.StringVar(&whoop, "whoop", whoopDefault, "whoop device identifier")
	if err := fs.Parse(args); err != nil {
		return "", err
	}
	if strings.TrimSpace(whoop) == "" {
		return "", usageError("--whoop or WHOOP is required")
	}
	if len(fs.Args()) != 0 {
		return "", usageError("unexpected trailing args")
	}
	return whoop, nil
}

func parseSetAlarm(args []string, getenv func(string) string) (string, AlarmTime, error) {
	fs := flag.NewFlagSet(CmdSetAlarm, flag.ContinueOnError)
	whoopDefault := getenv("WHOOP")
	whoop := whoopDefault
	fs.StringVar(&whoop, "whoop", whoopDefault, "whoop device identifier")
	if err := fs.Parse(args); err != nil {
		return "", AlarmTime{}, err
	}
	if strings.TrimSpace(whoop) == "" {
		return "", AlarmTime{}, usageError("--whoop or WHOOP is required")
	}
	left := fs.Args()
	if len(left) != 1 {
		return "", AlarmTime{}, usageError("set-alarm requires alarm_time argument")
	}
	alarm, err := ParseAlarmTime(left[0], time.Now())
	if err != nil {
		return "", AlarmTime{}, err
	}
	return whoop, alarm, nil
}

func parseMerge(args []string) (string, error) {
	fs := flag.NewFlagSet(CmdMerge, flag.ContinueOnError)
	var fromFlag string
	fs.StringVar(&fromFlag, "from", "", "source database URL")
	if err := fs.Parse(args); err != nil {
		return "", err
	}
	left := fs.Args()
	from := strings.TrimSpace(fromFlag)
	if from == "" && len(left) > 0 {
		from = left[0]
		left = left[1:]
	}
	if from == "" {
		return "", usageError("merge requires source database url/path")
	}
	if len(left) != 0 {
		return "", usageError("unexpected trailing args")
	}
	return from, nil
}

func parseSync(args []string, getenv func(string) string) (string, error) {
	fs := flag.NewFlagSet(CmdSync, flag.ContinueOnError)
	remoteDefault := getenv("REMOTE")
	remote := remoteDefault
	fs.StringVar(&remote, "remote", remoteDefault, "remote database url")
	if err := fs.Parse(args); err != nil {
		return "", err
	}
	if strings.TrimSpace(remote) == "" {
		return "", usageError("--remote or REMOTE is required")
	}
	if len(fs.Args()) != 0 {
		return "", usageError("unexpected trailing args")
	}
	return remote, nil
}

func parseFirmware(args []string, getenv func(string) string) (FirmwareOptions, error) {
	fs := flag.NewFlagSet(CmdDownloadFirmware, flag.ContinueOnError)
	fw := FirmwareOptions{
		Email:      getenv("WHOOP_EMAIL"),
		Password:   getenv("WHOOP_PASSWORD"),
		DeviceName: "HARVARD",
		Maxim:      "41.16.5.0",
		Nordic:     "17.2.2.0",
		OutputDir:  "./firmware",
	}
	fs.StringVar(&fw.Email, "email", fw.Email, "whoop account email")
	fs.StringVar(&fw.Password, "password", fw.Password, "whoop account password")
	fs.StringVar(&fw.DeviceName, "device-name", fw.DeviceName, "device family")
	fs.StringVar(&fw.Maxim, "maxim", fw.Maxim, "MAXIM target firmware version")
	fs.StringVar(&fw.Nordic, "nordic", fw.Nordic, "NORDIC target firmware version")
	fs.StringVar(&fw.OutputDir, "output-dir", fw.OutputDir, "firmware output path")
	if err := fs.Parse(args); err != nil {
		return FirmwareOptions{}, err
	}
	if strings.TrimSpace(fw.Email) == "" {
		return FirmwareOptions{}, usageError("--email or WHOOP_EMAIL is required")
	}
	if strings.TrimSpace(fw.Password) == "" {
		return FirmwareOptions{}, usageError("--password or WHOOP_PASSWORD is required")
	}
	if len(fs.Args()) != 0 {
		return FirmwareOptions{}, usageError("unexpected trailing args")
	}
	return fw, nil
}

func parseCompletions(args []string) (string, error) {
	if len(args) != 1 {
		return "", usageError("completions requires shell argument")
	}
	shell := strings.ToLower(strings.TrimSpace(args[0]))
	switch shell {
	case "bash", "zsh", "fish", "powershell", "elvish":
		return shell, nil
	default:
		return "", usageError("unsupported shell: " + shell)
	}
}

func ParseAlarmTime(value string, now time.Time) (AlarmTime, error) {
	s := strings.TrimSpace(strings.ToLower(value))
	if s == "" {
		return AlarmTime{}, usageError("empty alarm_time")
	}

	loc := time.Now().Location()
	for _, layout := range []string{"2006-01-02 15:04:05", "2006-01-02T15:04:05", time.RFC3339} {
		if t, err := time.ParseInLocation(layout, value, loc); err == nil {
			return AlarmTime{Kind: AlarmDateTime, DateTime: t}, nil
		}
	}

	if t, err := time.ParseInLocation("15:04:05", value, loc); err == nil {
		return AlarmTime{Kind: AlarmClockTime, Clock: t}, nil
	}

	switch s {
	case "minute", "1min", "min":
		return AlarmTime{Kind: AlarmOffset, Offset: time.Minute}, nil
	case "5minute", "5min":
		return AlarmTime{Kind: AlarmOffset, Offset: 5 * time.Minute}, nil
	case "10minute", "10min":
		return AlarmTime{Kind: AlarmOffset, Offset: 10 * time.Minute}, nil
	case "15minute", "15min":
		return AlarmTime{Kind: AlarmOffset, Offset: 15 * time.Minute}, nil
	case "30minute", "30min":
		return AlarmTime{Kind: AlarmOffset, Offset: 30 * time.Minute}, nil
	case "hour", "h":
		return AlarmTime{Kind: AlarmOffset, Offset: time.Hour}, nil
	}

	if n, err := strconv.Atoi(s); err == nil && n > 0 {
		return AlarmTime{Kind: AlarmOffset, Offset: time.Duration(n) * time.Minute}, nil
	}

	return AlarmTime{}, usageError("invalid alarm time")
}

func (a AlarmTime) Unix(now time.Time) time.Time {
	now = now.UTC()
	loc := time.Now().Location()
	switch a.Kind {
	case AlarmDateTime:
		return a.DateTime.In(loc).UTC()
	case AlarmClockTime:
		n := now.In(loc)
		target := time.Date(n.Year(), n.Month(), n.Day(), a.Clock.Hour(), a.Clock.Minute(), a.Clock.Second(), 0, loc)
		if target.Before(n) {
			target = target.Add(24 * time.Hour)
		}
		return target.UTC()
	default:
		return now.Add(a.Offset)
	}
}

func parseBool(s string) bool {
	if strings.TrimSpace(s) == "" {
		return false
	}
	b, err := strconv.ParseBool(s)
	if err != nil {
		return false
	}
	return b
}

func usageError(msg string) error {
	return errors.New(msg)
}

func Usage() string {
	return fmt.Sprintf(`openwhoop [--debug-packets] --database-url <url> <command> [args]

Commands:
  %s
  %s --whoop <id>
  %s
  %s
  %s
  %s
  %s
  %s
  %s
  %s --whoop <id> <alarm_time>
  %s <from_db>
  %s --whoop <id>
  %s --whoop <id>
  %s --whoop <id>
  %s --whoop <id>
  %s --remote <database_url>
  %s [--email --password --device-name --maxim --nordic --output-dir]
  %s <bash|zsh|fish|powershell|elvish>
`,
		CmdScan, CmdDownloadHistory, CmdRerun, CmdDetectEvents, CmdSleepStats, CmdExerciseStats,
		CmdCalculateStress, CmdCalculateSpO2, CmdCalculateSkinTmp, CmdSetAlarm, CmdMerge,
		CmdRestart, CmdErase, CmdVersion, CmdEnableIMU, CmdSync, CmdDownloadFirmware,
		CmdCompletions,
	)
}
