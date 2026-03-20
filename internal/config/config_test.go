package config

import "testing"

func TestParseBasic(t *testing.T) {
	cfg, err := parseWithEnv([]string{"--database-url", "sqlite://test.db", "scan"}, func(string) string { return "" })
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if cfg.Command.Name != CmdScan {
		t.Fatalf("unexpected command: %s", cfg.Command.Name)
	}
}

func TestParseWhoopFromEnv(t *testing.T) {
	cfg, err := parseWithEnv([]string{"--database-url", "sqlite://test.db", "version"}, func(key string) string {
		if key == "WHOOP" {
			return "abc"
		}
		return ""
	})
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if cfg.Command.Whoop != "abc" {
		t.Fatalf("expected whoop from env")
	}
}

func TestParseAlarm(t *testing.T) {
	cfg, err := parseWithEnv([]string{"--database-url", "sqlite://test.db", "set-alarm", "--whoop", "abc", "5min"}, func(string) string { return "" })
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if cfg.Command.AlarmTime.Kind != AlarmOffset {
		t.Fatalf("expected offset kind")
	}
}
