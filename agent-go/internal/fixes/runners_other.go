//go:build !windows

package fixes

import (
	"os"
	"time"
)

// On other systems only clearing temporary files works so far; the rest
// fail with a clear message.
type otherRunner struct{}

func NewRunner() Runner { return otherRunner{} }

func (otherRunner) Run(fixID string, p map[string]any) (string, map[string]any, error) {
	if fixID == "clear_temp_files" {
		msg, err := ClearTempFiles(os.TempDir(), time.Now().Add(-24*time.Hour))
		return msg, nil, err
	}
	return "", nil, fail("This fix only works on Windows.")
}

func (otherRunner) Undo(string, map[string]any) (string, error) {
	return "", fail("This fix only works on Windows.")
}

// AskOnPC can't show a prompt here yet, so it always declines.
func AskOnPC(title, text string) bool { return false }
