// lectio-agent: the Lectio background telemetry agent.
//
// Double-click it (or run "lectio-agent setup") to link the PC to your Lectio
// account and install it as a Windows Service that starts with Windows.
// Run "lectio-agent help" for every command.
package main

import (
	"bufio"
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"golang.org/x/term"

	"lectio/agent/internal/api"
	"lectio/agent/internal/auth"
	"lectio/agent/internal/collectors"
	"lectio/agent/internal/config"
	"lectio/agent/internal/daily"
	"lectio/agent/internal/fixes"
	"lectio/agent/internal/incident"
	"lectio/agent/internal/locate"
	"lectio/agent/internal/logging"
	"lectio/agent/internal/notify"
	"lectio/agent/internal/service"
	"lectio/agent/internal/services"
)

// version is set at build time: -ldflags "-X main.version=1.0.0"
var version = "dev"

// out is where messages go: the window, and during an administrator setup
// also logs\setup.log, so a failed setup can be looked into afterwards.
// Passwords are read without echo and never written to it.
var out io.Writer = os.Stdout

func startTranscript(cmd string) {
	if !service.IsAdmin() {
		return
	}
	dir := config.LogDir(config.Dir())
	if config.EnsureDir(config.Dir()) != nil || config.EnsureLogDir(dir) != nil {
		return
	}
	f, err := os.OpenFile(filepath.Join(dir, "setup.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return
	}
	out = io.MultiWriter(os.Stdout, f)
	fmt.Fprintf(f, "\n==== %s: lectio-agent %s %s\n", time.Now().Format(time.RFC3339), version, cmd)
}

const usage = `Lectio agent %s: sends this PC's health readings to your Lectio dashboard.

Usage: lectio-agent <command> [options]

  setup       link this PC to your account, install the service and start it
              (what double-clicking the program does; asks for administrator rights)
  link        sign in and link this PC (again) to a Lectio account
              options: -name "Office PC"  -country "Rwanda"
  install     install (or update) the Windows Service, starting with Windows
  uninstall   stop and remove the service (keeps settings and logs; -purge removes them)
  start       start the service
  stop        stop the service
  status      show whether it's running and how uploads are going
  run         run in this window instead of as a service (Ctrl+C to stop)
  version     show the version

Settings: %s
`

func main() {
	if service.IsService() {
		os.Exit(runService())
	}
	args := os.Args[1:]
	if len(args) == 0 {
		args = []string{"setup"}
	}
	cmd, rest := args[0], args[1:]
	switch cmd {
	case "setup", "link", "install", "uninstall":
		startTranscript(cmd)
	}
	var err error
	switch cmd {
	case "setup":
		err = setup(rest)
	case "link":
		// The data folder is admin-only; a custom one (LECTIO_DATA_DIR) isn't.
		if os.Getenv("LECTIO_DATA_DIR") != "" {
			err = link(rest)
		} else {
			err = adminOnly(cmd, rest, func() error { return link(rest) })
		}
	case "install":
		err = adminOnly(cmd, rest, install)
	case "uninstall":
		err = adminOnly(cmd, rest, func() error { return uninstall(rest) })
	case "start":
		err = adminOnly(cmd, rest, service.Start)
	case "stop":
		err = adminOnly(cmd, rest, service.Stop)
	case "status":
		err = status()
	case "run":
		err = runConsole()
	case "locate":
		// Started by the service, as the signed-in person, to read the PC's
		// position from Windows Location (see package locate).
		ctx, cancel := context.WithTimeout(context.Background(), 50*time.Second)
		err = locate.WriteFix(ctx)
		cancel()
	case "notify":
		// Started by the service, as the signed-in person, to show one
		// alert notification (see package notify). Not for typing by hand.
		err = showNote(rest)
	case "version", "-v", "--version":
		fmt.Fprintln(out, "lectio-agent", version)
	case "help", "-h", "--help", "/?":
		fmt.Fprintf(out, usage, version, config.Path(config.Dir()))
	default:
		fmt.Fprintf(out, "Unknown command %q.\n\n", cmd)
		fmt.Fprintf(out, usage, version, config.Path(config.Dir()))
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(out, "\nError:", err)
		pauseIfDoubleClicked()
		os.Exit(1)
	}
}

// adminOnly runs f, first asking Windows for administrator rights if needed.
func adminOnly(cmd string, rest []string, f func() error) error {
	if service.IsAdmin() {
		return f()
	}
	fmt.Fprintln(out, "This needs administrator rights; Windows will ask for permission.")
	return service.RelaunchElevated(append([]string{cmd}, rest...))
}

// ------------------------------------------------------------------ setup

func setup(rest []string) error {
	if !service.IsAdmin() {
		fmt.Fprintln(out, "Setting up Lectio needs administrator rights; Windows will ask for permission.")
		return service.RelaunchElevated(append([]string{"setup"}, rest...))
	}
	fmt.Fprintln(out, "Welcome to Lectio. This app reads your PC's temperatures, usage and hardware")
	fmt.Fprint(out, "health and sends them to your Lectio dashboard.\n\n")
	dir := config.Dir()
	cfg, err := config.Load(dir)
	if err != nil {
		return err
	}
	// Running setup from a downloaded agent means "use the server this agent
	// was built for", also on a PC an older build had linked elsewhere (such
	// as a test server). LECTIO_API still wins when it is set.
	if old := cfg.APIURL; os.Getenv("LECTIO_API") == "" && cfg.UseServer(config.DefaultAPI) {
		fmt.Fprintf(out, "This PC was set up for %s; switching it to %s.\n", old, cfg.APIURL)
		if err := cfg.Save(dir); err != nil {
			return err
		}
	}
	if !cfg.Linked() {
		if err := link(rest); err != nil {
			return err
		}
	} else {
		fmt.Fprintf(out, "This PC is already linked as '%s'. (To link it again: lectio-agent link)\n", cfg.DeviceName)
	}
	if err := install(); err != nil {
		return err
	}
	fmt.Fprintln(out, "\nDone. Lectio now runs in the background and starts with Windows.")
	fmt.Fprintln(out, "Your PC will appear on the dashboard within a few seconds. You can close this window.")
	pauseIfDoubleClicked()
	return nil
}

func link(rest []string) error {
	fs := flag.NewFlagSet("link", flag.ContinueOnError)
	host, _ := os.Hostname()
	name := fs.String("name", host, "name shown on the dashboard")
	country := fs.String("country", "", "country the PC is in, for the dashboard map")
	if err := fs.Parse(rest); err != nil {
		return err
	}
	dir := config.Dir()
	cfg, err := config.Load(dir)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()
	// Linking is a one-off with someone waiting; allow for a slow connection.
	client := api.New(cfg.APIURL, version, 3*time.Minute)
	opt := auth.Options{
		DeviceName: strings.TrimSpace(*name), OSInfo: collectors.Describe(ctx), MachineID: collectors.MachineID(ctx),
		Country: *country, AskCountry: *country == "",
	}
	if opt.DeviceName == "" {
		opt.DeviceName = "My computer"
	}
	if err := auth.Link(ctx, client, &cfg, consolePrompter{bufio.NewReader(os.Stdin)}, opt); err != nil {
		return err
	}
	if err := cfg.Save(dir); err != nil {
		return err
	}
	// A running service picks up the new key when restarted.
	if state, err := service.State(); err == nil && state == "running" {
		_ = service.Stop()
		_ = service.Start()
	}
	return nil
}

func install() error {
	if err := service.Install(); err != nil {
		return err
	}
	fmt.Fprintln(out, "Installed the Lectio Agent service (starts with Windows, restarts itself if it stops).")
	if state, _ := service.State(); state == "running" {
		if err := service.Stop(); err != nil {
			return err
		}
	}
	if err := service.Start(); err != nil {
		return err
	}
	fmt.Fprintln(out, "Started the service.")
	return nil
}

func uninstall(rest []string) error {
	fs := flag.NewFlagSet("uninstall", flag.ContinueOnError)
	purge := fs.Bool("purge", false, "also delete settings, buffered readings and logs")
	if err := fs.Parse(rest); err != nil {
		return err
	}
	if err := service.Uninstall(); err != nil {
		return err
	}
	fmt.Fprintln(out, "Removed the Lectio Agent service.")
	if *purge {
		if err := os.RemoveAll(config.Dir()); err != nil {
			return err
		}
		fmt.Fprintln(out, "Deleted", config.Dir())
	} else {
		fmt.Fprintln(out, "Settings and logs are kept in", config.Dir(), "(use -purge to delete them).")
	}
	return nil
}

// ------------------------------------------------------------------ status

func status() error {
	state, err := service.State()
	if err != nil {
		state = err.Error()
	}
	fmt.Fprintln(out, "Service:", state)
	st, err := services.ReadStatus(config.Dir())
	if err != nil {
		fmt.Fprintln(out, "No status yet (the agent writes it every 15 seconds while running).")
		return nil
	}
	fmt.Fprintf(out, "Version: %s, sending to %s every %ds\n", st.Version, st.API, st.IntervalSeconds)
	fmt.Fprintf(out, "Linked: %v %s\n", st.Linked, st.DeviceName)
	fmt.Fprintf(out, "Readings: %d taken, %d uploaded, %d waiting in the buffer (%.1f MB)\n",
		st.Collected, st.Uploaded, st.Buffer.Batches, float64(st.Buffer.Bytes)/(1<<20))
	if st.LastUpload != nil {
		fmt.Fprintln(out, "Last upload:", st.LastUpload.Local().Format(time.DateTime))
	}
	if st.LastError != "" {
		fmt.Fprintln(out, "Last problem:", st.LastError)
	}
	if time.Since(st.UpdatedAt) > time.Minute {
		fmt.Fprintln(out, "(This status is from", st.UpdatedAt.Local().Format(time.DateTime)+"; the agent may not be running.)")
	}
	return nil
}

// ------------------------------------------------------------------ running

// agentRun loads the settings and runs the agent until ctx ends.
func agentRun(ctx context.Context, console bool) error {
	dir := config.Dir()
	if err := config.EnsureDir(dir); err != nil {
		return err
	}
	cfg, err := config.Load(dir)
	if err != nil {
		return err
	}
	log, closer, err := logging.Setup(dir, cfg.LogLevel, console)
	if err != nil {
		return err
	}
	defer closer.Close()
	if !cfg.Linked() {
		log.Error("this PC isn't linked to a Lectio account; run: lectio-agent link")
		return errors.New("not linked (run: lectio-agent link)")
	}
	agent := &services.Agent{
		Config: cfg, Log: log, Version: version,
		Fixes: func(c *api.Client) services.FixRunner {
			return &fixes.Worker{Client: c, Runner: fixes.NewRunner(), Ask: fixes.AskOnPC, Dir: dir, Log: log.With("component", "fixes")}
		},
		Daily: func(c *api.Client) services.FixRunner {
			show := notify.ShowOnPC
			if !cfg.NotificationsEnabled {
				show = func(notify.Note) error { return nil }
			}
			return &daily.Checker{Client: c, Show: show, Dashboard: cfg.DashboardURL, PCName: cfg.DeviceName,
				Dir: dir, Log: log.With("component", "daily")}
		},
		Incidents: func(c *api.Client) services.FixRunner {
			r := &incident.Reporter{Client: c, Read: incident.ReadWindows, Dir: dir, Log: log.With("component", "incidents")}
			service.SetPowerHook(r.Goodbye)
			return r
		},
		Location: func(c *api.Client) services.FixRunner {
			return &locate.Locator{Client: c, Find: locate.FindOnPC, Log: log.With("component", "location")}
		},
		Notifications: func(c *api.Client) services.FixRunner {
			return &notify.Notifier{Client: c, Show: notify.ShowOnPC, Dashboard: cfg.DashboardURL,
				PCName: cfg.DeviceName, Log: log.With("component", "notifications")}
		},
	}
	return agent.Run(ctx)
}

func showNote(rest []string) error {
	if len(rest) != 1 {
		return errors.New("notify takes one argument")
	}
	note, err := notify.DecodeNote(rest[0])
	if err != nil {
		return err
	}
	return notify.Toast(note)
}

func runService() int {
	err := service.Run(func(ctx context.Context) error { return agentRun(ctx, false) })
	if err != nil {
		return 1
	}
	return 0
}

func runConsole() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	fmt.Fprintln(out, "Running in this window. Press Ctrl+C to stop.")
	return agentRun(ctx, true)
}

// ------------------------------------------------------------------ prompts

type consolePrompter struct{ in *bufio.Reader }

func (p consolePrompter) line(prompt string) (string, error) {
	fmt.Fprint(out, prompt)
	s, err := p.in.ReadString('\n')
	if err != nil && s == "" {
		return "", errors.New("signing in needs a keyboard: run lectio-agent in a terminal window")
	}
	return strings.TrimRight(s, "\r\n"), nil
}

func (p consolePrompter) Email() (string, error) { return p.line("Account email: ") }

func (p consolePrompter) Password() (string, error) {
	fd := int(os.Stdin.Fd())
	if !term.IsTerminal(fd) {
		return p.line("Password: ")
	}
	fmt.Fprint(out, "Password (hidden as you type): ")
	b, err := term.ReadPassword(fd)
	fmt.Fprintln(out)
	return string(b), err
}

func (p consolePrompter) Country() (string, error) {
	return p.line("Country this PC is in, for the dashboard map (optional, press Enter to skip): ")
}

func (consolePrompter) Say(format string, args ...any) { fmt.Fprintf(out, format+"\n", args...) }
