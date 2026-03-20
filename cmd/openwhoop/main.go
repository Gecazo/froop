package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/gecazo/froop/internal/app"
	"github.com/gecazo/froop/internal/config"
	"github.com/gecazo/froop/internal/device"
	"github.com/gecazo/froop/internal/store"
)

func main() {
	cfg, err := config.Parse(os.Args[1:])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		fmt.Fprintln(os.Stderr, config.Usage())
		os.Exit(2)
	}

	log.SetFlags(log.LstdFlags)

	var st *store.Store
	if cfg.Command.Name != config.CmdCompletions && cfg.Command.Name != config.CmdDownloadFirmware {
		st, err = store.Open(cfg.DatabaseURL)
		if err != nil {
			log.Fatalf("open database: %v", err)
		}
		defer st.Close()
	}

	adapter := device.NewAdapter()
	application := app.NewApplication(cfg, st, adapter)
	if err := application.Run(context.Background()); err != nil {
		log.Fatalf("%v", err)
	}
}
