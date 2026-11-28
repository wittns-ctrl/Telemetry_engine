//go:build windows

package fixes

import (
	"strings"
	"testing"
)

func TestRunAIScriptForReal(t *testing.T) {
	out, err := runAIScript("$n = (Get-Process | Measure-Object).Count\nWrite-Output 'Processes running:'\nWrite-Output $n")
	if err != nil || !strings.Contains(out, "Processes running:") {
		t.Fatalf("a harmless script should run: %q %v", out, err)
	}
	if _, err := runAIScript("Get-Item -Path 'C:/no/such/place/xyz-test'"); err == nil || strings.Contains(err.Error(), "refused") {
		t.Fatal("a failing script must report an error")
	}
	if _, err := runAIScript("Start-Process notepad"); err == nil || !strings.Contains(err.Error(), "refused") {
		t.Fatalf("a refused script must never run: %v", err)
	}
}
