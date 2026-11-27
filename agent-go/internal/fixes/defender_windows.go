//go:build windows

package fixes

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"time"

	"golang.org/x/sys/windows"
)

// Microsoft Defender's command-line tool, always at this fixed place.
func mpCmdRun() string {
	return filepath.Join(os.Getenv("ProgramFiles"), "Windows Defender", "MpCmdRun.exe")
}

// runAt runs a fixed program at a fixed path with fixed arguments and
// returns its output and exit code (-1 if it couldn't run or was stopped).
func runAt(timeout time.Duration, path string, args ...string) (string, int, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, path, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW}
	out, err := cmd.CombinedOutput()
	text := decodeOutput(out)
	if ctx.Err() != nil {
		return text, -1, fail("It took too long and was stopped.")
	}
	var exit *exec.ExitError
	if errors.As(err, &exit) {
		return text, exit.ExitCode(), nil
	}
	if err != nil {
		return text, -1, fail("Windows couldn't start Microsoft Defender: %v", err)
	}
	return text, 0, nil
}

func defenderQuickScan() (string, error) {
	_, code, err := runAt(time.Hour, mpCmdRun(), "-Scan", "-ScanType", "1")
	if err != nil {
		return "", err
	}
	switch code {
	case 0:
		return "Quick scan finished. Microsoft Defender found no threats.", nil
	case 2:
		return "Quick scan finished and found threats. Microsoft Defender is dealing with them; see the Security tab.", nil
	}
	return "", fail("The quick scan didn't finish. Try again later.")
}

// defenderFullScan starts the scan and leaves it running: it can take hours,
// and the Security tab shows the result when Defender finishes.
func defenderFullScan() (string, error) {
	cmd := exec.Command(mpCmdRun(), "-Scan", "-ScanType", "2")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW}
	if err := cmd.Start(); err != nil {
		return "", fail("Windows couldn't start Microsoft Defender's full scan.")
	}
	_ = cmd.Process.Release()
	return "Full scan started. It runs in the background and can take an hour or more; the result shows on the Security tab.", nil
}

func defenderUpdate() (string, error) {
	_, code, err := runAt(15*time.Minute, mpCmdRun(), "-SignatureUpdate")
	if err != nil {
		return "", err
	}
	if code != 0 {
		return "", fail("Couldn't update the virus definitions. Check the PC's internet connection and try again.")
	}
	return "Virus definitions are up to date.", nil
}

// defenderRemoveThreats asks Defender to act on every threat it has found
// and not yet dealt with (Remove-MpThreat). Defender quarantines first, so
// a wrong call can be undone from Windows Security.
func defenderRemoveThreats() (string, error) {
	ps := filepath.Join(os.Getenv("SystemRoot"), "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
	_, code, err := runAt(30*time.Minute, ps, "-NoProfile", "-NonInteractive", "-Command", "Remove-MpThreat")
	if err != nil {
		return "", err
	}
	if code != 0 {
		return "", fail("Microsoft Defender couldn't remove the threats. Run a full scan, or open Windows Security on the PC.")
	}
	return "Microsoft Defender dealt with the threats it found. Run a quick scan to make sure the PC is clean.", nil
}
