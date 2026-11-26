//go:build windows

// Package service installs and runs the agent as a Windows Service: it starts
// when Windows boots (before anyone signs in), runs without a window, and the
// Service Control Manager restarts it if it ever stops unexpectedly.
package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"
)

const (
	Name        = "LectioAgent"
	DisplayName = "Lectio Agent"
	Description = "Sends this PC's health readings to your Lectio dashboard and carries out fixes you allow."
	exeName     = "lectio-agent.exe"
	stopTimeout = 20 * time.Second
)

// InstallDir is where the installed copy of the agent lives.
func InstallDir() string {
	base := os.Getenv("ProgramFiles")
	if base == "" {
		base = `C:\Program Files`
	}
	return filepath.Join(base, "Lectio")
}

func InstalledExe() string { return filepath.Join(InstallDir(), exeName) }

// IsService reports whether this process was started by the Service Control Manager.
func IsService() bool {
	ok, err := svc.IsWindowsService()
	return err == nil && ok
}

// IsAdmin reports whether this process runs with administrator rights.
func IsAdmin() bool {
	token := windows.GetCurrentProcessToken()
	return token.IsElevated()
}

// RelaunchElevated starts this program again as administrator (Windows shows
// its permission prompt) with the given arguments, and waits for it.
func RelaunchElevated(args []string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	verb, _ := windows.UTF16PtrFromString("runas")
	file, _ := windows.UTF16PtrFromString(exe)
	params, _ := windows.UTF16PtrFromString(quoteArgs(args))
	dir, _ := windows.UTF16PtrFromString(filepath.Dir(exe))
	err = windows.ShellExecute(0, verb, file, params, dir, windows.SW_NORMAL)
	if errors.Is(err, windows.ERROR_CANCELLED) {
		return errors.New("Windows asked for permission and it wasn't given")
	}
	return err
}

func quoteArgs(args []string) string {
	quoted := make([]string, len(args))
	for i, a := range args {
		if strings.ContainsAny(a, " \t\"") {
			a = `"` + strings.ReplaceAll(a, `"`, `\"`) + `"`
		}
		quoted[i] = a
	}
	return strings.Join(quoted, " ")
}

// Install copies this program to Program Files and registers the service:
// automatic start (delayed, so it doesn't slow booting), running as
// LocalSystem (needed to read hardware sensors and carry out repairs), and
// restarted by Windows after 10 s, 30 s and 60 s if it crashes.
func Install() error {
	src, err := os.Executable()
	if err != nil {
		return err
	}
	dst := InstalledExe()
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("opening the service manager (run as administrator): %w", err)
	}
	defer m.Disconnect()

	if !strings.EqualFold(filepath.Clean(src), filepath.Clean(dst)) {
		// A running service holds its program file open, and Windows refuses
		// to replace it ("Access is denied"); stop it first. The caller starts
		// it again once the service points at the new copy.
		if s, err := m.OpenService(Name); err == nil {
			err = stopService(s)
			s.Close()
			if err != nil {
				return err
			}
		}
		if err := copyFile(src, dst); err != nil {
			return fmt.Errorf("copying the agent to %s: %w", InstallDir(), err)
		}
	}

	if s, err := m.OpenService(Name); err == nil {
		// Already installed (an update): point it at the new copy.
		defer s.Close()
		cfg, err := s.Config()
		if err != nil {
			return err
		}
		cfg.BinaryPathName = fmt.Sprintf(`"%s" service`, dst)
		cfg.StartType = mgr.StartAutomatic
		cfg.DelayedAutoStart = true
		cfg.Description = Description
		if err := s.UpdateConfig(cfg); err != nil {
			return err
		}
		return setRecovery(s)
	}
	s, err := m.CreateService(Name, dst, mgr.Config{
		DisplayName:      DisplayName,
		Description:      Description,
		StartType:        mgr.StartAutomatic,
		DelayedAutoStart: true,
		ErrorControl:     mgr.ErrorNormal,
	}, "service")
	if err != nil {
		return fmt.Errorf("registering the service: %w", err)
	}
	defer s.Close()
	return setRecovery(s)
}

func setRecovery(s *mgr.Service) error {
	actions := []mgr.RecoveryAction{
		{Type: mgr.ServiceRestart, Delay: 10 * time.Second},
		{Type: mgr.ServiceRestart, Delay: 30 * time.Second},
		{Type: mgr.ServiceRestart, Delay: 60 * time.Second},
	}
	if err := s.SetRecoveryActions(actions, uint32((24 * time.Hour).Seconds())); err != nil {
		return fmt.Errorf("setting automatic restart: %w", err)
	}
	// Also restart after it stops with an error code, not only on a crash.
	return s.SetRecoveryActionsOnNonCrashFailures(true)
}

func copyFile(src, dst string) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	tmp := dst + ".new"
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	if err := out.Close(); err != nil {
		return err
	}
	return os.Rename(tmp, dst)
}

// Uninstall stops and removes the service and its program copy. Data
// (config, buffer, logs) is kept unless removeData is set.
func Uninstall() error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("opening the service manager (run as administrator): %w", err)
	}
	defer m.Disconnect()
	s, err := m.OpenService(Name)
	if err != nil {
		return errors.New("the Lectio service isn't installed")
	}
	_ = stopService(s)
	if err := s.Delete(); err != nil {
		s.Close()
		return fmt.Errorf("removing the service: %w", err)
	}
	s.Close()
	// The running copy can't delete itself; it goes when it isn't in use.
	self, _ := os.Executable()
	if !strings.EqualFold(filepath.Clean(self), filepath.Clean(InstalledExe())) {
		_ = os.Remove(InstalledExe())
		_ = os.Remove(InstallDir())
	}
	return nil
}

func Start() error {
	return withService(func(s *mgr.Service) error {
		if st, err := s.Query(); err == nil && st.State == svc.Running {
			return nil
		}
		if err := s.Start(); err != nil {
			return fmt.Errorf("starting the service: %w", err)
		}
		return waitFor(s, svc.Running)
	})
}

func Stop() error { return withService(stopService) }

// State returns the service's state in words ("running", "stopped", ...).
// It asks Windows only for the right to read the status, which any user has
// ("not installed" when there is no service).
func State() (string, error) {
	scm, err := windows.OpenSCManager(nil, nil, windows.SC_MANAGER_CONNECT)
	if err != nil {
		return "", fmt.Errorf("opening the service manager: %w", err)
	}
	defer windows.CloseServiceHandle(scm)
	name, _ := windows.UTF16PtrFromString(Name)
	h, err := windows.OpenService(scm, name, windows.SERVICE_QUERY_STATUS)
	if errors.Is(err, windows.ERROR_SERVICE_DOES_NOT_EXIST) {
		return "not installed", nil
	}
	if err != nil {
		return "", err
	}
	defer windows.CloseServiceHandle(h)
	var st windows.SERVICE_STATUS
	if err := windows.QueryServiceStatus(h, &st); err != nil {
		return "", err
	}
	return stateName(svc.State(st.CurrentState)), nil
}

func withService(f func(*mgr.Service) error) error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("opening the service manager (run as administrator): %w", err)
	}
	defer m.Disconnect()
	s, err := m.OpenService(Name)
	if err != nil {
		return errors.New("the Lectio service isn't installed (run: lectio-agent install)")
	}
	defer s.Close()
	return f(s)
}

func stopService(s *mgr.Service) error {
	st, err := s.Query()
	if err != nil || st.State == svc.Stopped {
		return err
	}
	if _, err := s.Control(svc.Stop); err != nil {
		return fmt.Errorf("stopping the service: %w", err)
	}
	return waitFor(s, svc.Stopped)
}

func waitFor(s *mgr.Service, want svc.State) error {
	deadline := time.Now().Add(stopTimeout + 10*time.Second)
	for time.Now().Before(deadline) {
		st, err := s.Query()
		if err != nil {
			return err
		}
		if st.State == want {
			return nil
		}
		time.Sleep(300 * time.Millisecond)
	}
	return fmt.Errorf("the service didn't become %s in time", stateName(want))
}

func stateName(s svc.State) string {
	switch s {
	case svc.Stopped:
		return "stopped"
	case svc.StartPending:
		return "starting"
	case svc.StopPending:
		return "stopping"
	case svc.Running:
		return "running"
	case svc.Paused:
		return "paused"
	}
	return "changing"
}

// Run hands control to the Service Control Manager. run is called with a
// context that is cancelled when Windows asks the service to stop (or the PC
// shuts down); the service reports "stopped" once run returns, or after
// stopTimeout at the latest.
func Run(run func(ctx context.Context) error) error {
	return svc.Run(Name, &handler{run: run})
}

type handler struct {
	run func(ctx context.Context) error
}

func (h *handler) Execute(_ []string, requests <-chan svc.ChangeRequest, status chan<- svc.Status) (bool, uint32) {
	const accepts = svc.AcceptStop | svc.AcceptShutdown
	status <- svc.Status{State: svc.StartPending}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- h.run(ctx) }()
	status <- svc.Status{State: svc.Running, Accepts: accepts}

	for {
		select {
		case err := <-done:
			// The agent stopped by itself (e.g. not linked): exit with an
			// error code so the recovery actions restart it later.
			status <- svc.Status{State: svc.StopPending}
			if err != nil {
				return true, 1
			}
			return false, 0
		case req := <-requests:
			switch req.Cmd {
			case svc.Interrogate:
				status <- req.CurrentStatus
			case svc.Stop, svc.Shutdown:
				status <- svc.Status{State: svc.StopPending, WaitHint: uint32(stopTimeout.Milliseconds())}
				cancel()
				select {
				case <-done:
				case <-time.After(stopTimeout):
				}
				return false, 0
			}
		}
	}
}
