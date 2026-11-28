// Package incident tells the server about outages:
//
//   - Goodbye: the PC is shutting down, going to sleep or stopping the
//     agent, so the silence that follows is expected (no alert, no email);
//   - at start, Windows' own record of an unexpected shutdown (Kernel-Power
//     event 41: a blue screen, the power button held, or power lost / frozen)
//     since the last check, sent until the server has it.
//
// The agent's last sign of life is kept on disk every minute, so the server
// learns roughly when a short outage began even if it never noticed it.
package incident

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"lectio/agent/internal/api"
	"lectio/agent/internal/config"
	"lectio/agent/internal/models"
	"lectio/agent/internal/retry"
)

const (
	stateFile    = "incident.json"
	aliveEvery   = time.Minute
	goodbyeLimit = 3 * time.Second // Windows gives a stopping service only a few seconds
	firstLook    = 24 * time.Hour  // how far back to look the first time
)

type Server interface {
	Goodbye(ctx context.Context, reason string) error
	ReportCrash(ctx context.Context, r models.CrashReport) (models.CrashReply, error)
}

// Event is one Kernel-Power 41 record, as Windows wrote it.
type Event struct {
	At          time.Time `json:"at"`
	Bugcheck    string    `json:"bugcheck"`     // decimal stop code; "0" or "" when it wasn't a blue screen
	PowerButton string    `json:"power_button"` // non-zero when the power button was held
}

type Reporter struct {
	Client Server
	Read   func(ctx context.Context, since time.Time) ([]Event, error) // Windows' records since a time
	Dir    string
	Log    *slog.Logger
	Now    func() time.Time
}

type state struct {
	LastChecked time.Time            `json:"last_checked"`
	LastAlive   time.Time            `json:"last_alive"`
	Pending     []models.CrashReport `json:"pending"`
}

func (r *Reporter) now() time.Time {
	if r.Now != nil {
		return r.Now()
	}
	return time.Now()
}

// Classify turns a Kernel-Power 41 record into a crash report.
func Classify(e Event, lastAlive time.Time) models.CrashReport {
	rep := models.CrashReport{Cause: "power_lost", At: e.At.UTC()}
	if code, err := strconv.ParseUint(strings.TrimSpace(e.Bugcheck), 10, 64); err == nil && code != 0 {
		rep.Cause, rep.BugcheckCode = "bluescreen", fmt.Sprintf("0x%x", code)
	} else if b := strings.TrimSpace(e.PowerButton); b != "" && b != "0" {
		rep.Cause = "forced_off"
	}
	if !lastAlive.IsZero() && lastAlive.Before(e.At) {
		alive := lastAlive.UTC()
		rep.LastAlive = &alive
	}
	return rep
}

func (r *Reporter) Run(ctx context.Context) {
	st := r.load()
	now := r.now()
	since := st.LastChecked
	if since.IsZero() || now.Sub(since) > 7*24*time.Hour {
		since = now.Add(-firstLook)
	}
	if r.Read != nil {
		events, err := r.Read(ctx, since)
		if err != nil {
			r.Log.Warn("couldn't read Windows' shutdown records", "err", err)
		} else {
			for _, e := range events {
				st.Pending = append(st.Pending, Classify(e, st.LastAlive))
			}
			st.LastChecked = now
		}
	}
	st.LastAlive = now
	r.save(st)

	for {
		st = r.send(ctx, st)
		st.LastAlive = r.now()
		r.save(st)
		if !retry.Sleep(ctx, aliveEvery) {
			return
		}
	}
}

// send delivers waiting reports; ones the server can never accept are dropped.
func (r *Reporter) send(ctx context.Context, st state) state {
	var keep []models.CrashReport
	for _, rep := range st.Pending {
		_, err := r.Client.ReportCrash(ctx, rep)
		var se *api.StatusError
		switch {
		case err == nil:
			r.Log.Info("reported an unexpected shutdown", "cause", rep.Cause, "at", rep.At)
		case errors.As(err, &se) && se.RefusesData():
			r.Log.Warn("the server refused a shutdown report", "err", err)
		default:
			keep = append(keep, rep)
		}
	}
	st.Pending = keep
	return st
}

// Goodbye tells the server the PC is going away normally (the service's power hook).
func (r *Reporter) Goodbye(reason string) {
	ctx, cancel := context.WithTimeout(context.Background(), goodbyeLimit)
	defer cancel()
	if err := r.Client.Goodbye(ctx, reason); err != nil {
		r.Log.Warn("couldn't say goodbye to the server", "reason", reason, "err", err)
	}
}

func (r *Reporter) load() state {
	var st state
	if raw, err := os.ReadFile(filepath.Join(r.Dir, stateFile)); err == nil {
		_ = json.Unmarshal(raw, &st)
	}
	return st
}

func (r *Reporter) save(st state) {
	raw, err := json.Marshal(st)
	if err == nil {
		err = config.WriteFileAtomic(filepath.Join(r.Dir, stateFile), raw)
	}
	if err != nil {
		r.Log.Warn("couldn't save the shutdown state", "err", err)
	}
}
