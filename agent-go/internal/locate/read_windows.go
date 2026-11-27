//go:build windows

package locate

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"golang.org/x/sys/windows"

	"lectio/agent/internal/config"
	"lectio/agent/internal/usersession"
)

// Windows Location through .NET's GeoCoordinateWatcher (built into Windows),
// asking for the best accuracy and waiting up to 25 s for a first answer.
const script = `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Device
$w = New-Object System.Device.Location.GeoCoordinateWatcher([System.Device.Location.GeoPositionAccuracy]::High)
$null = $w.TryStart($false, [TimeSpan]::FromSeconds(5))
$deadline = (Get-Date).AddSeconds(25)
while ($w.Status -ne 'Ready' -and $w.Permission -ne 'Denied' -and $w.Status -ne 'Disabled' -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 250 }
$l = $w.Position.Location
$o = [ordered]@{ status = "$($w.Status)"; permission = "$($w.Permission)"; known = (-not $l.IsUnknown); lat = $l.Latitude; lon = $l.Longitude; acc = $l.HorizontalAccuracy }
$w.Stop()
$o | ConvertTo-Json -Compress`

type psAnswer struct {
	Status     string  `json:"status"`
	Permission string  `json:"permission"`
	Known      bool    `json:"known"`
	Lat        float64 `json:"lat"`
	Lon        float64 `json:"lon"`
	Acc        float64 `json:"acc"`
}

// Read asks Windows Location for the position, as the current user.
func Read(ctx context.Context) (Fix, error) {
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	ps := filepath.Join(os.Getenv("SystemRoot"), "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
	encoded := base64.StdEncoding.EncodeToString(utf16le(script))
	cmd := exec.CommandContext(ctx, ps, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
		"-WindowStyle", "Hidden", "-EncodedCommand", encoded)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW}
	out, err := cmd.Output()
	if err != nil {
		return Fix{}, fmt.Errorf("asking Windows Location: %w", err)
	}
	var a psAnswer
	if err := json.Unmarshal([]byte(strings.TrimSpace(string(out))), &a); err != nil {
		return Fix{}, fmt.Errorf("reading Windows Location's answer: %w", err)
	}
	return fromAnswer(a, time.Now()), nil
}

func fromAnswer(a psAnswer, at time.Time) Fix {
	switch {
	case strings.EqualFold(a.Permission, "Denied") || strings.EqualFold(a.Status, "Disabled"):
		return Fix{Status: "off", At: at}
	case a.Known && !math.IsNaN(a.Lat) && !math.IsNaN(a.Lon):
		f := Fix{Status: "ok", Latitude: a.Lat, Longitude: a.Lon, AccuracyM: a.Acc, At: at}
		if f.Valid() {
			return f
		}
	}
	return Fix{Status: "unavailable", At: at}
}

// The helper ("lectio-agent locate", run as the signed-in person) leaves its
// answer here for the service to read.
func fixFile() (string, error) {
	dir, err := usersession.LocalAppData()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "Lectio", "location.json"), nil
}

// WriteFix is the helper's half: read and leave the answer for the service.
func WriteFix(ctx context.Context) error {
	fix, err := Read(ctx)
	if err != nil {
		fix = Fix{Status: "unavailable", At: time.Now()}
	}
	path, err := fixFile()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, _ := json.Marshal(fix)
	return config.WriteFileAtomic(path, data)
}

// FindOnPC is the position as the signed-in person sees it: read directly
// when run in a window, else through the helper.
func FindOnPC(ctx context.Context) (Fix, error) {
	if !usersession.InService() {
		return Read(ctx)
	}
	started := time.Now()
	if _, err := usersession.Start([]string{"locate"}, 60*time.Second); err != nil {
		if errors.Is(err, usersession.ErrNobodySignedIn) {
			return Fix{Status: "no_user", At: started}, nil
		}
		return Fix{}, err
	}
	path, err := fixFile()
	if err != nil {
		return Fix{}, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return Fix{}, err
	}
	var fix Fix
	if err := json.Unmarshal(data, &fix); err != nil {
		return Fix{}, err
	}
	if fix.At.Before(started.Add(-time.Second)) {
		return Fix{}, errors.New("the location helper left no new answer")
	}
	if fix.Status == "ok" && !fix.Valid() {
		fix = Fix{Status: "unavailable", At: fix.At}
	}
	return fix, nil
}

func utf16le(s string) []byte {
	u := windows.StringToUTF16(s)
	u = u[:len(u)-1]
	b := make([]byte, len(u)*2)
	for i, c := range u {
		b[2*i], b[2*i+1] = byte(c), byte(c>>8)
	}
	return b
}
