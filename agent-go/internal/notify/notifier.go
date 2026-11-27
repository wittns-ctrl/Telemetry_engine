// Package notify shows a Windows notification on the PC for each new
// critical alert about it, with a button that opens the alert on the website.
//
// The server says which alerts and in what words; the agent builds the link
// itself from its own dashboard_url, so the server can't send a PC anywhere
// else. Text is cleaned and shortened before it reaches the screen.
package notify

import (
	"context"
	"encoding/xml"
	"errors"
	"log/slog"
	"regexp"
	"strings"
	"time"
	"unicode"

	"lectio/agent/internal/api"
	"lectio/agent/internal/models"
	"lectio/agent/internal/retry"
)

const (
	defaultPoll = 15 * time.Second
	errorPoll   = time.Minute
	keyRejected = 5 * time.Minute
	maxTitle    = 120
	maxBody     = 240
	// AppID names Lectio to Windows' notification system.
	AppID = "Lectio.Agent"
)

var alertID = regexp.MustCompile(`^[a-f0-9]{24}$`)

// Note is one notification as shown.
type Note struct {
	AlertID string `json:"alert_id"`
	Title   string `json:"title"`
	Body    string `json:"body"`
	PCName  string `json:"pc_name"`
	URL     string `json:"url"`
}

type Source interface {
	PendingNotifications(ctx context.Context) (models.PendingNotifications, error)
}

// Notifier checks in for new critical alerts and shows each one once.
type Notifier struct {
	Client    Source
	Show      func(Note) error
	Dashboard string // e.g. https://getlectio.vercel.app
	PCName    string
	Log       *slog.Logger

	seen map[string]bool
}

func (n *Notifier) Run(ctx context.Context) {
	for {
		if !retry.Sleep(ctx, n.checkOnce(ctx)) {
			return
		}
	}
}

func (n *Notifier) checkOnce(ctx context.Context) time.Duration {
	pending, err := n.Client.PendingNotifications(ctx)
	if err != nil {
		if errors.Is(err, api.ErrUnauthorized) {
			return keyRejected
		}
		if !errors.Is(err, context.Canceled) {
			n.Log.Debug("notification check-in failed", "error", err)
		}
		return errorPoll
	}
	for _, p := range pending.Notifications {
		note, ok := n.note(p)
		if !ok {
			n.Log.Warn("ignoring a notification with a malformed alert id")
			continue
		}
		if err := n.Show(note); err != nil {
			n.Log.Warn("couldn't show the alert notification", "alert", note.AlertID, "error", err)
			continue
		}
		n.Log.Info("showed an alert notification", "alert", note.AlertID)
	}
	poll := time.Duration(pending.PollSeconds) * time.Second
	if poll < 5*time.Second || poll > 2*time.Minute {
		poll = defaultPoll
	}
	return poll
}

// note checks and cleans what the server sent, once per alert.
func (n *Notifier) note(p models.PCNotification) (Note, bool) {
	if !alertID.MatchString(p.AlertID) {
		return Note{}, false
	}
	if n.seen == nil {
		n.seen = map[string]bool{}
	}
	if n.seen[p.AlertID] {
		return Note{}, false
	}
	n.seen[p.AlertID] = true
	title := clean(p.Title, maxTitle)
	if title == "" {
		title = "Critical problem detected"
	}
	return Note{
		AlertID: p.AlertID,
		Title:   title,
		Body:    clean(p.Body, maxBody),
		PCName:  clean(n.PCName, 60),
		URL:     strings.TrimRight(n.Dashboard, "/") + "/?alert=" + p.AlertID,
	}, true
}

// clean drops control characters and shortens text to at most max runes.
func clean(s string, max int) string {
	s = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return ' '
		}
		return r
	}, s)
	s = strings.Join(strings.Fields(s), " ")
	if r := []rune(s); len(r) > max {
		s = string(r[:max-1]) + "…"
	}
	return s
}

func esc(s string) string {
	var b strings.Builder
	_ = xml.EscapeText(&b, []byte(s))
	return strings.ReplaceAll(b.String(), `"`, "&quot;")
}

// ToastXML is the notification: the title in bold, the detail, the PC's name
// small underneath, and "Open dashboard" / "Dismiss" buttons. Clicking the
// notification itself also opens the alert. "reminder" keeps it on screen
// until someone answers, as a critical alert should.
func ToastXML(n Note, iconPath string) string {
	var b strings.Builder
	b.WriteString(`<toast scenario="reminder" activationType="protocol" launch="` + esc(n.URL) + `">`)
	b.WriteString(`<visual><binding template="ToastGeneric">`)
	b.WriteString(`<text>` + esc(n.Title) + `</text>`)
	if n.Body != "" {
		b.WriteString(`<text>` + esc(n.Body) + `</text>`)
	}
	if n.PCName != "" {
		b.WriteString(`<text placement="attribution">` + esc(n.PCName) + `</text>`)
	}
	if iconPath != "" {
		b.WriteString(`<image placement="appLogoOverride" src="` + esc(iconPath) + `"/>`)
	}
	b.WriteString(`</binding></visual>`)
	b.WriteString(`<actions>`)
	b.WriteString(`<action content="Open dashboard" activationType="protocol" arguments="` + esc(n.URL) + `"/>`)
	b.WriteString(`<action content="Dismiss" activationType="system" arguments="dismiss"/>`)
	b.WriteString(`</actions>`)
	b.WriteString(`</toast>`)
	return b.String()
}
