//go:build windows

package fixes

import (
	"context"
	"encoding/base64"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unicode/utf16"

	"golang.org/x/sys/windows"

	"lectio/agent/internal/scriptcheck"
)

const (
	aiScriptTimeout = 5 * time.Minute
	aiOutputLimit   = 900
)

// Lectio's own lines around the AI's script (not part of what's checked):
// stop at the first error, no progress bars, UTF-8 output.
const aiPrelude = "$ErrorActionPreference = 'Stop'\n$ProgressPreference = 'SilentlyContinue'\n" +
	"[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n"

// runAIScript runs an approved, already-checked script with Windows PowerShell.
func runAIScript(script string) (string, error) {
	if r := scriptcheck.Check(script); !r.OK { // checked again right before running
		return "", fail("This PC refused the script: %s.", r.Reason)
	}
	ctx, cancel := context.WithTimeout(context.Background(), aiScriptTimeout)
	defer cancel()
	ps := filepath.Join(os.Getenv("SystemRoot"), "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
	encoded := base64.StdEncoding.EncodeToString(utf16le(aiPrelude + script))
	cmd := exec.CommandContext(ctx, ps, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
		"-WindowStyle", "Hidden", "-EncodedCommand", encoded)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW}
	out, err := cmd.CombinedOutput()
	text := shorten(strings.TrimSpace(string(out)), aiOutputLimit)
	if ctx.Err() != nil {
		return text, fail("The script took longer than 5 minutes and was stopped.")
	}
	if err != nil {
		return text, fail("The script stopped with an error: %s", firstLine(text, err.Error()))
	}
	if text == "" {
		text = "The script finished."
	}
	return text, nil
}

func shorten(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func utf16le(s string) []byte {
	units := utf16.Encode([]rune(s))
	b := make([]byte, len(units)*2)
	for i, u := range units {
		b[2*i], b[2*i+1] = byte(u), byte(u>>8)
	}
	return b
}
