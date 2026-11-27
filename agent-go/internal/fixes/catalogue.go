// Package fixes carries out fixes chosen on the Lectio website.
//
// The website (and its AI) can only pick a fix by id from this catalogue,
// which mirrors app/core/fix_catalogue.py. Each fix is code written into
// this agent; the server never sends commands, only a fix id and parameters,
// and the parameters are checked here again before anything runs. Anything
// unknown is refused. Big fixes are shown to the person at the PC first and
// run only if they click Yes.
package fixes

import (
	"fmt"
	"math"
	"regexp"
	"strings"
)

type Size int

const (
	Small Size = iota // runs once chosen on the website
	Big               // also needs "Yes" on the PC
)

type Fix struct {
	ID       string
	Title    string
	Summary  string
	Size     Size
	Undoable bool
	Params   map[string]Param
}

type Param struct {
	Required bool
	Default  any
	Check    func(any) (any, error)
}

// Windows services the agent may restart (RESTARTABLE_SERVICES on the server).
var RestartableServices = map[string]string{
	"Spooler":  "Print queue",
	"AudioSrv": "Windows Audio",
	"wuauserv": "Windows Update",
	"WSearch":  "Windows Search",
}

// Processes the agent never closes, whatever is asked.
var ProtectedProcesses = map[string]bool{
	"system": true, "smss.exe": true, "csrss.exe": true, "wininit.exe": true, "winlogon.exe": true,
	"services.exe": true, "lsass.exe": true, "svchost.exe": true, "explorer.exe": true, "dwm.exe": true,
	"fontdrvhost.exe": true, "msmpeng.exe": true, "securityhealthservice.exe": true, "registry": true,
	"memory compression": true, "lectio-agent.exe": true,
}

var (
	processName = regexp.MustCompile(`(?i)^[A-Za-z0-9 ._()+-]{1,64}\.exe$`)
	startupName = regexp.MustCompile(`^[^\\/\x00-\x1f]{1,128}$`)
)

// wholeNumber accepts a JSON number that is a whole number within [lo, hi].
func wholeNumber(name string, lo, hi int) func(any) (any, error) {
	return func(v any) (any, error) {
		f, ok := v.(float64)
		if !ok {
			if i, isInt := v.(int); isInt {
				f, ok = float64(i), true
			}
		}
		if !ok || f != math.Trunc(f) || f < float64(lo) || f > float64(hi) {
			return nil, fmt.Errorf("%s must be a whole number from %d to %d", name, lo, hi)
		}
		return int(f), nil
	}
}

func checkProcess(v any) (any, error) {
	s, ok := v.(string)
	if !ok || !processName.MatchString(s) {
		return nil, fmt.Errorf("process must be a program name such as chrome.exe")
	}
	if ProtectedProcesses[strings.ToLower(s)] {
		return nil, fmt.Errorf("%s is part of Windows and can't be closed", s)
	}
	return s, nil
}

func checkStartup(v any) (any, error) {
	s, ok := v.(string)
	if !ok || !startupName.MatchString(strings.TrimSpace(s)) {
		return nil, fmt.Errorf("name must be the name of a startup entry")
	}
	return strings.TrimSpace(s), nil
}

func checkService(v any) (any, error) {
	s, ok := v.(string)
	if _, known := RestartableServices[s]; !ok || !known {
		return nil, fmt.Errorf("service must be one of: Spooler, AudioSrv, wuauserv, WSearch")
	}
	return s, nil
}

// Catalogue lists every fix this agent can run. Advice-only fixes on the
// server (clean the fans, back up, check the power supply) are not here: the
// agent never runs those.
var Catalogue = map[string]Fix{
	"cool_down": {
		ID: "cool_down", Title: "Cool it down now", Size: Small, Undoable: true,
		Summary: "Lower the processor's top speed for a while. Your PC may feel a bit slower, but much cooler.",
		Params: map[string]Param{
			"minutes":     {Default: 60, Check: wholeNumber("minutes", 15, 240)},
			"max_percent": {Default: 80, Check: wholeNumber("max_percent", 50, 95)},
		},
	},
	"balanced_power": {
		ID: "balanced_power", Title: "Switch to the Balanced power plan", Size: Small, Undoable: true,
		Summary: "Stop the PC running at full power all the time. Saves heat and electricity.",
	},
	"clear_temp_files": {
		ID: "clear_temp_files", Title: "Clear temporary files", Size: Small,
		Summary: "Delete leftover temporary files more than a day old to free up disk space.",
	},
	"close_app": {
		ID: "close_app", Title: "Close the app using the most power", Size: Big,
		Summary: "Close a program that's working the PC hard. Save your work in it first.",
		Params:  map[string]Param{"process": {Required: true, Check: checkProcess}},
	},
	"disable_startup_app": {
		ID: "disable_startup_app", Title: "Stop an app starting with Windows", Size: Big, Undoable: true,
		Summary: "Keep a program from opening by itself every time the PC starts. You can turn it back on.",
		Params:  map[string]Param{"name": {Required: true, Check: checkStartup}},
	},
	"restart_service": {
		ID: "restart_service", Title: "Restart a stuck Windows service", Size: Big,
		Summary: "Turn a Windows background service off and on again.",
		Params:  map[string]Param{"service": {Required: true, Check: checkService}},
	},
	"repair_system_files": {
		ID: "repair_system_files", Title: "Repair Windows system files", Size: Big,
		Summary: "Run Windows' own check that finds and repairs damaged system files. Takes 10 to 20 minutes.",
	},
	"check_disk": {
		ID: "check_disk", Title: "Check the drive for errors", Size: Big,
		Summary: "Run Windows' own drive check. It only looks, it doesn't change anything.",
	},
	// Microsoft Defender. The agent only asks Defender to act; it never
	// deletes or moves files itself.
	"defender_quick_scan": {
		ID: "defender_quick_scan", Title: "Run a quick virus scan", Size: Small,
		Summary: "Microsoft Defender checks the places malware usually hides. Takes 5 to 15 minutes.",
	},
	"defender_full_scan": {
		ID: "defender_full_scan", Title: "Run a full virus scan", Size: Big,
		Summary: "Microsoft Defender checks every file on the PC. Can take an hour or more and slows the PC meanwhile.",
	},
	"defender_update": {
		ID: "defender_update", Title: "Update virus definitions", Size: Small,
		Summary: "Get Microsoft Defender's latest list of threats.",
	},
	"defender_remove_threats": {
		ID: "defender_remove_threats", Title: "Remove the threats Defender found", Size: Big,
		Summary: "Ask Microsoft Defender to quarantine or remove the threats it found and couldn't deal with on its own.",
	},
}

// CleanParams validates parameters against the fix's rules (unknown names are refused).
func (f Fix) CleanParams(raw map[string]any) (map[string]any, error) {
	out := map[string]any{}
	for name := range raw {
		if _, ok := f.Params[name]; !ok {
			return nil, fmt.Errorf("unknown parameter: %s", name)
		}
	}
	for name, spec := range f.Params {
		v, given := raw[name]
		switch {
		case given:
			clean, err := spec.Check(v)
			if err != nil {
				return nil, err
			}
			out[name] = clean
		case spec.Required:
			return nil, fmt.Errorf("%s is required", name)
		case spec.Default != nil:
			out[name] = spec.Default
		}
	}
	return out, nil
}
