//go:build windows

package incident

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unicode/utf16"

	"golang.org/x/sys/windows"
)

// Kernel-Power event 41 ("the system has rebooted without cleanly shutting
// down first") from the System log, with its named fields: BugcheckCode is
// non-zero after a blue screen, PowerButtonTimestamp after the power button
// was held. The field names aren't translated, so this works in any language.
const script = `$ErrorActionPreference = 'Stop'
$since = [DateTimeOffset]::Parse('%s').LocalDateTime
$found = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Power'; Id = 41; StartTime = $since } -ErrorAction SilentlyContinue)
$out = foreach ($e in $found) {
  $d = @{}
  foreach ($n in ([xml]$e.ToXml()).Event.EventData.Data) { $d[$n.Name] = $n.'#text' }
  [ordered]@{ at = $e.TimeCreated.ToUniversalTime().ToString('o'); bugcheck = "$($d['BugcheckCode'])"; power_button = "$($d['PowerButtonTimestamp'])" }
}
ConvertTo-Json -InputObject @($out) -Compress`

// ReadWindows reads Windows' unexpected-shutdown records since a time.
func ReadWindows(ctx context.Context, since time.Time) ([]Event, error) {
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	ps := filepath.Join(os.Getenv("SystemRoot"), "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
	// The only value put into the script is a time this program formatted.
	body := fmt.Sprintf(script, since.UTC().Format(time.RFC3339))
	encoded := base64.StdEncoding.EncodeToString(utf16le(body))
	cmd := exec.CommandContext(ctx, ps, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
		"-WindowStyle", "Hidden", "-EncodedCommand", encoded)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW}
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("reading the System event log: %w", err)
	}
	return parse(out)
}

func parse(out []byte) ([]Event, error) {
	text := strings.TrimSpace(string(out))
	if text == "" || text == "null" {
		return nil, nil
	}
	var events []Event
	if err := json.Unmarshal([]byte(text), &events); err != nil {
		return nil, fmt.Errorf("reading the event log's answer: %w", err)
	}
	return events, nil
}

func utf16le(s string) []byte {
	units := utf16.Encode([]rune(s))
	b := make([]byte, len(units)*2)
	for i, u := range units {
		b[2*i], b[2*i+1] = byte(u), byte(u>>8)
	}
	return b
}
