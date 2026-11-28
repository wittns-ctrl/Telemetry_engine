package fixes

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"lectio/agent/internal/api"
	"lectio/agent/internal/config"
	"lectio/agent/internal/models"
	"lectio/agent/internal/retry"
)

// FixError is a fix that couldn't be carried out; the message is shown to the user.
type FixError struct{ Msg string }

func (e *FixError) Error() string { return e.Msg }

func fail(format string, args ...any) error { return &FixError{fmt.Sprintf(format, args...)} }

// Runner does the actual work of each fix on this PC (runners_windows.go).
type Runner interface {
	Run(fixID string, params map[string]any) (message string, undo map[string]any, err error)
	Undo(fixID string, undo map[string]any) (message string, err error)
}

// Asker asks the person at the PC to allow a fix; true only for a clear yes.
type Asker func(title, text string) bool

// Client is the part of the API client the worker uses.
type Client interface {
	NextFix(ctx context.Context) (models.AgentNext, error)
	ReportFix(ctx context.Context, id string, r models.FixResult) error
	ReportReverted(ctx context.Context, id string) error
}

// State is kept in state.json: how to undo each fix, and timed fixes to end.
// Undos use only this local record, never data from the server.
type State struct {
	UndoRecords  map[string]UndoRecord `json:"undo_records"`
	TimedReverts []TimedRevert         `json:"timed_reverts"`
}

type UndoRecord struct {
	FixID string         `json:"fix_id"`
	Data  map[string]any `json:"data"`
}

type TimedRevert struct {
	RequestID string  `json:"request_id"`
	At        float64 `json:"at"` // unix seconds
}

const (
	stateFile   = "state.json"
	revertRetry = 5 * time.Minute
	defaultPoll = 10 * time.Second
	errorPoll   = 30 * time.Second
)

type Worker struct {
	Client Client
	Runner Runner
	Ask    Asker
	Dir    string
	Log    *slog.Logger
	Now    func() time.Time

	mu    sync.Mutex
	state State
}

func (w *Worker) now() time.Time {
	if w.Now != nil {
		return w.Now()
	}
	return time.Now()
}

func (w *Worker) load() {
	w.state = State{UndoRecords: map[string]UndoRecord{}}
	data, err := os.ReadFile(filepath.Join(w.Dir, stateFile))
	if err == nil {
		if json.Unmarshal(data, &w.state) != nil {
			w.Log.Warn("fix state file is unreadable; starting with no undo records")
		}
	}
	if w.state.UndoRecords == nil {
		w.state.UndoRecords = map[string]UndoRecord{}
	}
}

func (w *Worker) save() {
	data, _ := json.MarshalIndent(w.state, "", "  ")
	if err := config.WriteFileAtomic(filepath.Join(w.Dir, stateFile), data); err != nil {
		w.Log.Error("couldn't save fix undo records", "error", err)
	}
}

// Run checks in for fixes until ctx is cancelled. A rejected device key just
// slows checking down; the uploader reports that problem.
func (w *Worker) Run(ctx context.Context) {
	w.mu.Lock()
	w.load()
	w.mu.Unlock()
	for {
		w.revertDue(ctx)
		wait := w.checkOnce(ctx)
		if !retry.Sleep(ctx, wait) {
			return
		}
	}
}

// checkOnce takes and handles at most one fix, returning how long to wait.
func (w *Worker) checkOnce(ctx context.Context) time.Duration {
	next, err := w.Client.NextFix(ctx)
	if err != nil {
		if !errors.Is(err, context.Canceled) {
			w.Log.Debug("fix check-in failed", "error", err)
		}
		if errors.Is(err, api.ErrUnauthorized) {
			return 5 * time.Minute
		}
		return errorPoll
	}
	if next.Fix != nil {
		w.Handle(ctx, *next.Fix)
		return 0 // there may be another one waiting
	}
	poll := time.Duration(next.PollSeconds) * time.Second
	if poll < 5*time.Second || poll > 2*time.Minute {
		poll = defaultPoll
	}
	return poll
}

// Handle runs (or undoes) one fix and reports the result.
func (w *Worker) Handle(ctx context.Context, fix models.AgentFix) {
	if !api.ValidFixID(fix.ID) {
		w.Log.Warn("ignoring a fix with a malformed id")
		return
	}
	log := w.Log.With("request", fix.ID, "fix", fix.FixID, "undo", fix.Undo)
	log.Info("fix requested")

	// What the fix is, how big it is and how it's described on the PC come
	// from this agent's own catalogue, never from the server.
	known, ok := Catalogue[fix.FixID]
	if !ok {
		w.report(ctx, fix.ID, "failed", "This PC's Lectio doesn't know that fix.", nil)
		return
	}
	var params map[string]any
	if !fix.Undo {
		var err error
		if params, err = known.CleanParams(fix.Params); err != nil {
			w.report(ctx, fix.ID, "failed", "This PC refused the fix: "+err.Error(), nil)
			return
		}
	}

	if fix.FixID == AIScript && !fix.Undo && !scriptMatches(params) {
		w.report(ctx, fix.ID, "failed", "This PC refused the script: it isn't the one that was shown.", nil)
		return
	}
	if fix.NeedsPCApproval || known.Size == Big {
		title := known.Title
		if fix.Undo {
			title = "Undo: " + title
		}
		text := known.Summary + describe(params) +
			"\n\nLectio was asked to do this from your account on the website.\nAllow it now?"
		if fix.FixID == AIScript {
			text = aiScriptQuestion(params)
		}
		if !w.Ask(title, text) {
			log.Info("fix declined at the PC")
			w.report(ctx, fix.ID, "declined", "Someone at the PC chose not to allow this.", nil)
			return
		}
	}

	if fix.Undo {
		msg, err := w.undo(fix)
		w.finish(ctx, log, fix.ID, msg, nil, err)
		return
	}
	msg, undo, err := safeRun(func() (string, map[string]any, error) { return w.Runner.Run(fix.FixID, params) })
	if err == nil && len(undo) > 0 {
		w.remember(fix.ID, fix.FixID, undo)
	}
	var serverUndo map[string]any
	if len(undo) > 0 {
		serverUndo = map[string]any{"recorded": true} // the server learns only that an undo exists
	}
	w.finish(ctx, log, fix.ID, msg, serverUndo, err)
}

func (w *Worker) finish(ctx context.Context, log *slog.Logger, id, msg string, undo map[string]any, err error) {
	if err != nil {
		var fe *FixError
		if !errors.As(err, &fe) {
			log.Error("fix crashed", "error", err)
			err = fail("Something went wrong on the PC while doing this.")
		}
		log.Warn("fix failed", "reason", err.Error())
		w.report(ctx, id, "failed", err.Error(), nil)
		return
	}
	log.Info("fix done", "result", msg)
	w.report(ctx, id, "succeeded", msg, undo)
}

func safeRun(f func() (string, map[string]any, error)) (msg string, undo map[string]any, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("fix panicked: %v", r)
		}
	}()
	return f()
}

func describe(params map[string]any) string {
	if len(params) == 0 {
		return ""
	}
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	b.WriteString("\n")
	for _, k := range keys {
		fmt.Fprintf(&b, "\n%s: %v", k, params[k])
	}
	return b.String()
}

func (w *Worker) undo(fix models.AgentFix) (string, error) {
	if fix.UndoOf == nil {
		return "", fail("This PC has no record of that fix, so it can't undo it.")
	}
	w.mu.Lock()
	record, ok := w.state.UndoRecords[*fix.UndoOf]
	w.mu.Unlock()
	if !ok || record.FixID != fix.FixID {
		return "", fail("This PC has no record of that fix, so it can't undo it.")
	}
	msg, _, err := safeRun(func() (string, map[string]any, error) {
		m, e := w.Runner.Undo(record.FixID, record.Data)
		return m, nil, e
	})
	if err == nil {
		w.forget(*fix.UndoOf)
	}
	return msg, err
}

func (w *Worker) remember(requestID, fixID string, undo map[string]any) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.state.UndoRecords[requestID] = UndoRecord{FixID: fixID, Data: undo}
	if at, ok := undo["revert_at"].(float64); ok {
		w.state.TimedReverts = append(w.state.TimedReverts, TimedRevert{RequestID: requestID, At: at})
	}
	w.save()
}

func (w *Worker) forget(requestID string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	delete(w.state.UndoRecords, requestID)
	kept := w.state.TimedReverts[:0]
	for _, r := range w.state.TimedReverts {
		if r.RequestID != requestID {
			kept = append(kept, r)
		}
	}
	w.state.TimedReverts = kept
	w.save()
}

// revertDue ends timed fixes (Cool it down) whose time is up, and tells the API.
func (w *Worker) revertDue(ctx context.Context) {
	now := float64(w.now().Unix())
	w.mu.Lock()
	var due []TimedRevert
	for _, r := range w.state.TimedReverts {
		if r.At <= now {
			due = append(due, r)
		}
	}
	w.mu.Unlock()
	for _, r := range due {
		w.mu.Lock()
		record, ok := w.state.UndoRecords[r.RequestID]
		w.mu.Unlock()
		if ok {
			if _, err := w.Runner.Undo(record.FixID, record.Data); err != nil {
				// Not restored: keep the record and try later; the website can still undo it.
				w.Log.Warn("couldn't end a timed fix; will retry", "request", r.RequestID, "error", err)
				w.mu.Lock()
				for i := range w.state.TimedReverts {
					if w.state.TimedReverts[i].RequestID == r.RequestID {
						w.state.TimedReverts[i].At = now + revertRetry.Seconds()
					}
				}
				w.save()
				w.mu.Unlock()
				continue
			}
			w.Log.Info("timed fix ended; settings restored", "request", r.RequestID, "fix", record.FixID)
		}
		w.forget(r.RequestID)
		if err := w.Client.ReportReverted(ctx, r.RequestID); err != nil {
			w.Log.Debug("couldn't report a timed fix ending", "error", err)
		}
	}
}

// report sends a fix's result, retrying a few times on server errors.
func (w *Worker) report(ctx context.Context, id, status, msg string, undo map[string]any) {
	result := models.FixResult{Status: status, Message: msg, UndoData: undo}
	b := retry.New(2*time.Second, 20*time.Second)
	for attempt := 0; attempt < 4; attempt++ {
		err := w.Client.ReportFix(ctx, id, result)
		var se *api.StatusError
		if err == nil || (errors.As(err, &se) && !se.Retryable()) || errors.Is(err, api.ErrUnauthorized) {
			return
		}
		if !retry.Sleep(ctx, b.Next()) {
			return
		}
	}
	w.Log.Warn("couldn't report a fix result", "request", id)
}
