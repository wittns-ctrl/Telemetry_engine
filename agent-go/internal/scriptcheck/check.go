// Package scriptcheck decides whether an AI-written PowerShell fix may run.
//
// The website's "Solve with AI" button gets a short script from the AI. The
// owner reads it and clicks Run, the person at the PC reads it again and
// clicks Allow, and both the server and this agent check it with the rules in
// rules.json (the server has the same file). The check is deliberately
// strict: only listed commands may run, anything that could download, hide
// or launch other code is refused, and so is anything touching security
// settings, accounts, Lectio itself or deleting files. A refused script never
// runs; the AI is asked for another.
//
// It reduces what a tricked AI could do; it isn't a sandbox. The Allow on the
// PC, showing the exact script, is the other half.
package scriptcheck

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

//go:embed rules.json
var rulesJSON []byte

type Rules struct {
	MaxChars          int      `json:"max_chars"`
	MaxLines          int      `json:"max_lines"`
	AllowedCommands   []string `json:"allowed_commands"`
	ReadOnlyPrefixes  []string `json:"read_only_prefixes"`
	Keywords          []string `json:"keywords"`
	BlockedText       []string `json:"blocked_text"`
	BlockedCharacters []string `json:"blocked_characters"`
	Examples          struct {
		Allowed []string `json:"allowed"`
		Refused []string `json:"refused"`
	} `json:"examples"`
}

var (
	rules     Rules
	allowed   = map[string]bool{}
	keywords  = map[string]bool{}
	strLit    = regexp.MustCompile(`'[^'\n]*'|"[^"\n]*"`)
	splitter  = regexp.MustCompile(`[\n;|{}()=]`)
	firstWord = regexp.MustCompile(`^[A-Za-z0-9_.\-]+`)
)

func init() {
	if err := json.Unmarshal(rulesJSON, &rules); err != nil {
		panic("scriptcheck: bad rules.json: " + err.Error())
	}
	for _, c := range rules.AllowedCommands {
		allowed[c] = true
	}
	for _, k := range rules.Keywords {
		keywords[k] = true
	}
}

// Result says whether a script may run and, if so, whether it only reads.
type Result struct {
	OK       bool
	Reason   string // why not, in plain words
	ReadOnly bool   // only looks at things; changes nothing
}

func refuse(format string, a ...any) Result {
	return Result{Reason: fmt.Sprintf(format, a...)}
}

// Check applies the rules to a script.
func Check(script string) Result {
	text := strings.TrimSpace(strings.ReplaceAll(script, "\r\n", "\n"))
	if text == "" {
		return refuse("the script is empty")
	}
	if len(text) > rules.MaxChars || strings.Count(text, "\n")+1 > rules.MaxLines {
		return refuse("the script is too long (at most %d lines)", rules.MaxLines)
	}
	low := strings.ToLower(text)
	for _, b := range rules.BlockedText {
		if strings.Contains(low, b) {
			return refuse("it contains %q, which Lectio doesn't allow", b)
		}
	}

	var kept []string
	for _, line := range strings.Split(text, "\n") {
		if !strings.HasPrefix(strings.TrimSpace(line), "#") {
			kept = append(kept, line)
		}
	}
	code := strLit.ReplaceAllStringFunc(strings.Join(kept, "\n"), func(s string) string { return s[:1] + s[:1] })
	bare := strings.NewReplacer("''", "", `""`, "").Replace(code)
	if strings.ContainsAny(bare, `'"`) {
		return refuse("a quote is never closed")
	}
	for _, c := range rules.BlockedCharacters {
		if strings.Contains(code, c) {
			return refuse("it uses %q, which Lectio doesn't allow", c)
		}
	}

	readOnly := true
	for _, seg := range splitter.Split(code, -1) {
		s := strings.TrimSpace(seg)
		if s == "" {
			continue
		}
		switch c := s[0]; {
		case strings.ContainsRune(`$'"[-!`, rune(c)) || (c >= '0' && c <= '9'):
			continue
		case c == '.':
			if len(s) > 1 && (s[1] == '_' || (s[1]|0x20 >= 'a' && s[1]|0x20 <= 'z')) {
				continue // a property of what's in brackets before it
			}
			return refuse("it runs another script, which Lectio doesn't allow")
		}
		word := firstWord.FindString(s)
		if word == "" {
			return refuse("it contains %q, which Lectio can't check", firstN(s, 20))
		}
		w := strings.TrimSuffix(strings.ToLower(word), ".exe")
		if keywords[w] {
			continue
		}
		if !allowed[w] {
			return refuse("it runs %q, which Lectio doesn't allow", word)
		}
		if !hasAnyPrefix(w, rules.ReadOnlyPrefixes) {
			readOnly = false
		}
	}
	// Setting a property ($p.PriorityClass = ...) changes something.
	parts := strings.Split(code, "=")
	for _, before := range parts[:len(parts)-1] {
		lhs := before[strings.LastIndexAny(before, "\n;|{}()")+1:]
		if strings.Contains(lhs, ".") {
			readOnly = false
		}
	}
	return Result{OK: true, ReadOnly: readOnly}
}

func hasAnyPrefix(s string, prefixes []string) bool {
	for _, p := range prefixes {
		if strings.HasPrefix(s, p) {
			return true
		}
	}
	return false
}

func firstN(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}

// Examples are the sample scripts in rules.json (used by tests on both sides).
func Examples() (allowedScripts, refusedScripts []string) {
	return rules.Examples.Allowed, rules.Examples.Refused
}
