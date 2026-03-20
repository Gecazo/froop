package app

import (
	"fmt"
	"io"
	"strings"
)

var commandList = []string{
	"scan",
	"download-history",
	"rerun",
	"detect-events",
	"sleep-stats",
	"exercise-stats",
	"calculate-stress",
	"calculate-spo2",
	"calculate-skin-temp",
	"set-alarm",
	"merge",
	"restart",
	"erase",
	"version",
	"enable-imu",
	"sync",
	"download-firmware",
	"completions",
}

func WriteCompletions(shell string, w io.Writer) error {
	cmds := strings.Join(commandList, " ")
	switch shell {
	case "bash":
		_, err := fmt.Fprintf(w, "complete -W \"%s\" openwhoop\n", cmds)
		return err
	case "zsh":
		_, err := fmt.Fprintf(w, "#compdef openwhoop\n_arguments '1: :(%s)'\n", cmds)
		return err
	case "fish":
		_, err := fmt.Fprintf(w, "complete -c openwhoop -f -a \"%s\"\n", cmds)
		return err
	case "powershell":
		_, err := fmt.Fprintf(w, "Register-ArgumentCompleter -CommandName openwhoop -ScriptBlock { param($wordToComplete) '%s'.Split(' ') | Where-Object { $_ -like \"$wordToComplete*\" } }\n", cmds)
		return err
	case "elvish":
		_, err := fmt.Fprintf(w, "set edit:completion:arg-completer[openwhoop] = [@words]{ put %s }\n", strings.ReplaceAll(cmds, " ", " "))
		return err
	default:
		return fmt.Errorf("unsupported shell %q", shell)
	}
}
