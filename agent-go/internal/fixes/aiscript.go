package fixes

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"regexp"
	"strings"

	"lectio/agent/internal/scriptcheck"
)

// AIScript is the "Solve with AI" fix: a short PowerShell script Lectio AI
// wrote for one alert. Unlike every other fix its code comes from the server,
// so it is checked here with the same strict rules the server uses
// (internal/scriptcheck), its hash must match, and it ALWAYS asks on the PC,
// showing the exact script, with "No" as the default button.
const AIScript = "ai_script"

var hexHash = regexp.MustCompile(`^[0-9a-f]{64}$`)

func checkScript(v any) (any, error) {
	s, ok := v.(string)
	if !ok {
		return nil, fmt.Errorf("script must be text")
	}
	if r := scriptcheck.Check(s); !r.OK {
		return nil, fmt.Errorf("this PC refused the script: %s", r.Reason)
	}
	return strings.TrimSpace(strings.ReplaceAll(s, "\r\n", "\n")), nil
}

func checkHash(v any) (any, error) {
	s, ok := v.(string)
	if !ok || !hexHash.MatchString(s) {
		return nil, fmt.Errorf("sha256 must be 64 hex characters")
	}
	return s, nil
}

func checkSummary(v any) (any, error) {
	s, ok := v.(string)
	if !ok || strings.TrimSpace(s) == "" {
		return nil, fmt.Errorf("summary must be text")
	}
	s = strings.TrimSpace(s)
	if len(s) > 200 {
		s = s[:200]
	}
	return s, nil
}

// scriptMatches reports whether the script is exactly the one the owner was shown.
func scriptMatches(p map[string]any) bool {
	sum := sha256.Sum256([]byte(p["script"].(string)))
	return hex.EncodeToString(sum[:]) == p["sha256"]
}

// aiScriptQuestion is what the person at the PC reads before allowing it.
func aiScriptQuestion(p map[string]any) string {
	return fmt.Sprintf("%s\n\nLectio AI wrote this script and the owner of this PC asked to run it here, "+
		"with full administrator rights:\n\n%s\n\nOnly click Yes if you trust what it does. Allow it now?",
		p["summary"], p["script"])
}
