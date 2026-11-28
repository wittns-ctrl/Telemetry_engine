package fixes

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"testing"

	"lectio/agent/internal/models"
)

const goodScript = "Restart-Service -Name Spooler\nWrite-Output 'Restarted the print queue'"

func hashOf(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

func aiFix(script, hash string) models.AgentFix {
	return models.AgentFix{ID: "ai1", FixID: AIScript, NeedsPCApproval: false, // the agent asks anyway
		Params: map[string]any{"script": script, "sha256": hash, "summary": "Restart the print queue"}}
}

func TestAIScriptsAlwaysAskShowingTheExactScript(t *testing.T) {
	w, c, r, _ := worker(t, true)
	var shown string
	w.Ask = func(title, text string) bool { shown = text; return true }
	w.Handle(context.Background(), aiFix(goodScript, hashOf(goodScript)))
	if !strings.Contains(shown, goodScript) || !strings.Contains(shown, "Restart the print queue") {
		t.Fatalf("the person at the PC must see the exact script, got:\n%s", shown)
	}
	if len(r.ran) != 1 || r.ran[0] != AIScript || c.results["ai1"].Status != "succeeded" {
		t.Fatalf("an allowed script should run: %+v %+v", r.ran, c.results)
	}
}

func TestAIScriptsRespectNo(t *testing.T) {
	w, c, r, _ := worker(t, false)
	w.Handle(context.Background(), aiFix(goodScript, hashOf(goodScript)))
	if len(r.ran) != 0 || c.results["ai1"].Status != "declined" {
		t.Fatalf("No must stop it: %+v %+v", r.ran, c.results)
	}
}

func TestADifferentScriptThanShownIsRefused(t *testing.T) {
	w, c, r, asked := worker(t, true)
	w.Handle(context.Background(), aiFix(goodScript, hashOf("Get-Date")))
	if len(r.ran) != 0 || len(*asked) != 0 || c.results["ai1"].Status != "failed" {
		t.Fatalf("a script that doesn't match its hash must never be offered: %+v", c.results)
	}
}

func TestTheAgentChecksTheScriptItself(t *testing.T) {
	w, c, r, asked := worker(t, true)
	bad := "Set-MpPreference -DisableRealtimeMonitoring $true"
	w.Handle(context.Background(), aiFix(bad, hashOf(bad)))
	if len(r.ran) != 0 || len(*asked) != 0 || c.results["ai1"].Status != "failed" ||
		!strings.Contains(c.results["ai1"].Message, "refused") {
		t.Fatalf("a script breaking the rules must be refused before asking: %+v", c.results)
	}
}
