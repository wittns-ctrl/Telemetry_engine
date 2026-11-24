package fixes

import (
	"context"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"lectio/agent/internal/models"
)

type fakeClient struct {
	mu       sync.Mutex
	results  map[string]models.FixResult
	reverted []string
}

func (f *fakeClient) NextFix(context.Context) (models.AgentNext, error) {
	return models.AgentNext{}, nil
}
func (f *fakeClient) ReportFix(_ context.Context, id string, r models.FixResult) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.results == nil {
		f.results = map[string]models.FixResult{}
	}
	f.results[id] = r
	return nil
}
func (f *fakeClient) ReportReverted(_ context.Context, id string) error {
	f.reverted = append(f.reverted, id)
	return nil
}

type fakeRunner struct {
	ran    []string
	params map[string]any
	undone []map[string]any
	undo   map[string]any
}

func (r *fakeRunner) Run(id string, p map[string]any) (string, map[string]any, error) {
	r.ran, r.params = append(r.ran, id), p
	return "done", r.undo, nil
}
func (r *fakeRunner) Undo(id string, u map[string]any) (string, error) {
	r.undone = append(r.undone, u)
	return "undone", nil
}

func worker(t *testing.T, yes bool) (*Worker, *fakeClient, *fakeRunner, *[]string) {
	asked := &[]string{}
	c, r := &fakeClient{}, &fakeRunner{}
	w := &Worker{Client: c, Runner: r, Dir: t.TempDir(), Log: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Ask: func(title, text string) bool { *asked = append(*asked, title); return yes }}
	w.load()
	return w, c, r, asked
}

func TestUnknownFixesAreRefused(t *testing.T) {
	w, c, r, _ := worker(t, true)
	for _, id := range []string{"format_disk", "clean_fans", ""} {
		w.Handle(context.Background(), models.AgentFix{ID: "req1", FixID: id})
		if c.results["req1"].Status != "failed" || len(r.ran) != 0 {
			t.Fatalf("%q was not refused", id)
		}
	}
}

func TestParametersAreCheckedByTheAgent(t *testing.T) {
	w, c, r, _ := worker(t, true)
	bad := []map[string]any{
		{"minutes": 5.0},        // out of range
		{"minutes": 30.5},       // not whole
		{"max_percent": "80"},   // wrong type
		{"command": "del C:\\"}, // unknown parameter
	}
	for i, p := range bad {
		w.Handle(context.Background(), models.AgentFix{ID: "req" + string(rune('a'+i)), FixID: "cool_down", Params: p})
	}
	if len(r.ran) != 0 {
		t.Fatalf("ran with bad parameters: %v", r.params)
	}
	for id, res := range c.results {
		if res.Status != "failed" || !strings.Contains(res.Message, "refused") {
			t.Fatalf("%s: %+v", id, res)
		}
	}
	w.Handle(context.Background(), models.AgentFix{ID: "ok", FixID: "close_app", Params: map[string]any{"process": "lsass.exe"}})
	if len(r.ran) != 0 {
		t.Fatal("closed a protected Windows process")
	}
}

func TestDefaultsFillMissingParameters(t *testing.T) {
	w, _, r, _ := worker(t, true)
	w.Handle(context.Background(), models.AgentFix{ID: "req1", FixID: "cool_down"})
	if r.params["minutes"] != 60 || r.params["max_percent"] != 80 {
		t.Fatalf("params %v", r.params)
	}
}

func TestBigFixesAskFirstAndRespectNo(t *testing.T) {
	w, c, r, asked := worker(t, false)
	w.Handle(context.Background(), models.AgentFix{ID: "req1", FixID: "check_disk"})
	if len(*asked) != 1 || c.results["req1"].Status != "declined" || len(r.ran) != 0 {
		t.Fatalf("asked=%v result=%+v ran=%v", *asked, c.results["req1"], r.ran)
	}
	// Small fixes run without asking, unless the server says the user wants to be asked.
	w.Handle(context.Background(), models.AgentFix{ID: "req2", FixID: "clear_temp_files"})
	if len(*asked) != 1 || c.results["req2"].Status != "succeeded" {
		t.Fatal("small fix should run without asking")
	}
	w.Handle(context.Background(), models.AgentFix{ID: "req3", FixID: "clear_temp_files", NeedsPCApproval: true})
	if len(*asked) != 2 || c.results["req3"].Status != "declined" {
		t.Fatal("server-requested approval ignored")
	}
}

func TestUndoUsesOnlyTheLocalRecord(t *testing.T) {
	w, c, r, _ := worker(t, true)
	r.undo = map[string]any{"plan": "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"}
	w.Handle(context.Background(), models.AgentFix{ID: "req1", FixID: "balanced_power"})
	if c.results["req1"].UndoData["recorded"] != true || c.results["req1"].UndoData["plan"] != nil {
		t.Fatal("undo details leaked to the server")
	}
	// Survives a restart.
	w2 := &Worker{Client: c, Runner: r, Dir: w.Dir, Log: w.Log, Ask: w.Ask}
	w2.load()
	forged := "req-other"
	w2.Handle(context.Background(), models.AgentFix{ID: "u1", FixID: "balanced_power", Undo: true, UndoOf: &forged})
	if c.results["u1"].Status != "failed" || len(r.undone) != 0 {
		t.Fatal("undid without a local record")
	}
	orig := "req1"
	w2.Handle(context.Background(), models.AgentFix{ID: "u2", FixID: "balanced_power", Undo: true, UndoOf: &orig})
	if c.results["u2"].Status != "succeeded" || r.undone[0]["plan"] != r.undo["plan"] {
		t.Fatal("undo didn't use the recorded plan")
	}
	if _, still := w2.state.UndoRecords["req1"]; still {
		t.Fatal("record kept after undo")
	}
}

func TestTimedFixesEndOnTheirOwn(t *testing.T) {
	w, c, r, _ := worker(t, true)
	now := time.Now()
	w.Now = func() time.Time { return now }
	r.undo = map[string]any{"ac": 100.0, "dc": 100.0, "revert_at": float64(now.Add(time.Hour).Unix())}
	w.Handle(context.Background(), models.AgentFix{ID: "req1", FixID: "cool_down"})
	w.revertDue(context.Background())
	if len(r.undone) != 0 {
		t.Fatal("ended too early")
	}
	w.Now = func() time.Time { return now.Add(61 * time.Minute) }
	w.revertDue(context.Background())
	if len(r.undone) != 1 || len(c.reverted) != 1 || len(w.state.TimedReverts) != 0 {
		t.Fatalf("undone=%v reverted=%v", r.undone, c.reverted)
	}
}

func TestMalformedRequestIDsAreIgnored(t *testing.T) {
	w, c, r, _ := worker(t, true)
	w.Handle(context.Background(), models.AgentFix{ID: "../x", FixID: "clear_temp_files"})
	if len(c.results) != 0 || len(r.ran) != 0 {
		t.Fatal("acted on a malformed id")
	}
}

func TestClearTempFilesOnlyRemovesOldFilesInsideTheFolder(t *testing.T) {
	dir := t.TempDir()
	old := filepath.Join(dir, "sub", "old.tmp")
	fresh := filepath.Join(dir, "fresh.tmp")
	_ = os.MkdirAll(filepath.Dir(old), 0o700)
	_ = os.WriteFile(old, []byte("12345"), 0o600)
	_ = os.WriteFile(fresh, []byte("x"), 0o600)
	past := time.Now().Add(-48 * time.Hour)
	_ = os.Chtimes(old, past, past)

	msg, err := ClearTempFiles(dir, time.Now().Add(-24*time.Hour))
	if err != nil || !strings.Contains(msg, "Cleared 1") {
		t.Fatal(msg, err)
	}
	if _, err := os.Stat(old); !os.IsNotExist(err) {
		t.Fatal("old file kept")
	}
	if _, err := os.Stat(fresh); err != nil {
		t.Fatal("recent file deleted")
	}
	if _, err := os.Stat(filepath.Dir(old)); !os.IsNotExist(err) {
		t.Fatal("empty folder kept")
	}
}
