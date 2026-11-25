package services

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"lectio/agent/internal/api"
	"lectio/agent/internal/config"
	"lectio/agent/internal/models"
	"lectio/agent/internal/retry"
	"lectio/agent/internal/storage"
)

var quiet = slog.New(slog.NewTextHandler(io.Discard, nil))

// fakeServer stores readings by event id, like the real batch endpoint.
type fakeServer struct {
	mu      sync.Mutex
	stored  map[string]bool
	down    atomic.Bool
	status  atomic.Int32 // non-zero: answer with this status
	batches atomic.Int32
}

func newFake(t *testing.T) (*fakeServer, *api.Client) {
	f := &fakeServer{stored: map[string]bool{}}
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if f.down.Load() {
			hj, _ := w.(http.Hijacker)
			conn, _, _ := hj.Hijack()
			conn.Close() // like a dropped connection
			return
		}
		if code := f.status.Load(); code != 0 {
			w.WriteHeader(int(code))
			return
		}
		var b models.Batch
		_ = json.NewDecoder(r.Body).Decode(&b)
		f.mu.Lock()
		resp := models.BatchResponse{Status: "accepted", Received: len(b.Readings)}
		for _, rd := range b.Readings {
			if f.stored[rd.EventID] {
				resp.Duplicates++
			} else {
				f.stored[rd.EventID] = true
				resp.Stored++
			}
		}
		f.mu.Unlock()
		f.batches.Add(1)
		w.WriteHeader(http.StatusAccepted)
		_ = json.NewEncoder(w).Encode(resp)
	}))
	t.Cleanup(s.Close)
	c := api.New(s.URL, "test", 3*time.Second)
	c.SetDeviceKey("device-key-1234567890")
	return f, c
}

func (f *fakeServer) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.stored)
}

func uploader(t *testing.T, c *api.Client) (*Uploader, *storage.Buffer) {
	buf, err := storage.Open(t.TempDir(), 1<<20, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	u := &Uploader{Client: c, Buffer: buf, BatchSize: 5, Wake: make(chan struct{}, 1), Log: quiet, Stats: &Stats{},
		backoff: retry.New(10*time.Millisecond, 50*time.Millisecond)}
	return u, buf
}

func put(buf *storage.Buffer, n int) {
	for i := 0; i < n; i++ {
		_ = buf.Put(models.Batch{Readings: []models.Reading{{EventID: NewEventID(), Snapshot: models.Snapshot{SensorID: "agent-test"}}}})
	}
}

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestOfflineReadingsAreKeptThenSentInBatches(t *testing.T) {
	f, c := newFake(t)
	u, buf := uploader(t, c)
	f.down.Store(true)
	put(buf, 12)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go u.Run(ctx)
	waitFor(t, "a failed upload", func() bool { return u.Stats.UploadFailures.Load() >= 2 })
	if buf.Stats().Batches != 12 {
		t.Fatal("readings were lost while offline")
	}

	f.down.Store(false) // back online
	waitFor(t, "everything uploaded", func() bool { return f.count() == 12 && buf.Stats().Batches == 0 })
	if got := f.batches.Load(); got != 3 { // 12 readings, at most 5 per request
		t.Fatalf("sent in %d requests, want 3", got)
	}
}

func TestResentReadingsAreNotStoredTwice(t *testing.T) {
	f, c := newFake(t)
	u, buf := uploader(t, c)
	reading := models.Reading{EventID: "evt-same-001", Snapshot: models.Snapshot{SensorID: "agent-test"}}
	_ = buf.Put(models.Batch{Readings: []models.Reading{reading}})
	_ = buf.Put(models.Batch{Readings: []models.Reading{reading}}) // e.g. resent after a timeout
	sent, err := u.sendOnce(context.Background())
	if !sent || err != nil {
		t.Fatal(sent, err)
	}
	if f.count() != 1 || u.Stats.Duplicates.Load() != 1 || buf.Stats().Batches != 0 {
		t.Fatalf("stored=%d dup=%d left=%d", f.count(), u.Stats.Duplicates.Load(), buf.Stats().Batches)
	}
}

func TestRefusedReadingsDontBlockTheQueue(t *testing.T) {
	f, c := newFake(t)
	u, buf := uploader(t, c)
	put(buf, 2)
	f.status.Store(422)
	if sent, err := u.sendOnce(context.Background()); !sent || err != nil {
		t.Fatal(sent, err)
	}
	if buf.Stats().Batches != 0 || u.Stats.Rejected.Load() != 2 {
		t.Fatal("refused readings not dropped")
	}
}

func TestWrongServerKeepsReadingsAndRetries(t *testing.T) {
	// A wrong API address or an outdated server answers 404/405/410: that says
	// nothing about the readings, so none may be thrown away. (An old server
	// without /ingest/batch once cost a real PC 100 minutes of readings.)
	for _, code := range []int32{404, 405, 410, 403} {
		f, c := newFake(t)
		u, buf := uploader(t, c)
		put(buf, 3)
		f.status.Store(code)
		if sent, err := u.sendOnce(context.Background()); sent || err == nil {
			t.Fatalf("%d: expected an error to retry, got sent=%v err=%v", code, sent, err)
		}
		if buf.Stats().Batches != 3 || u.Stats.Rejected.Load() != 0 {
			t.Fatalf("%d: readings dropped", code)
		}
	}
}

func TestReadingsHeldOnAWrongServerArriveOnceItIsRight(t *testing.T) {
	f, c := newFake(t)
	u, buf := uploader(t, c)
	put(buf, 4)
	f.status.Store(404)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go u.Run(ctx)
	waitFor(t, "a failed attempt", func() bool { return u.Stats.UploadFailures.Load() >= 2 })
	if err := u.Stats.LastError(); err == "" || !strings.Contains(err, "no upload endpoint") || !strings.Contains(err, "HTTP 404") {
		t.Fatalf("expected a clear wrong-address error, got %q", err)
	}
	f.status.Store(0) // the right server answers again
	waitFor(t, "the held readings", func() bool { return f.count() == 4 })
	if buf.Stats().Batches != 0 || u.Stats.Rejected.Load() != 0 {
		t.Fatal("expected every held reading sent, none dropped")
	}
}

func TestOnlyInvalidDataIsDropped(t *testing.T) {
	for _, code := range []int32{400, 413, 422} {
		f, c := newFake(t)
		u, buf := uploader(t, c)
		put(buf, 2)
		f.status.Store(code)
		if sent, err := u.sendOnce(context.Background()); !sent || err != nil {
			t.Fatalf("%d: %v %v", code, sent, err)
		}
		if buf.Stats().Batches != 0 || u.Stats.Rejected.Load() != 2 {
			t.Fatalf("%d: invalid readings not dropped", code)
		}
	}
}

func TestServerErrorsKeepReadingsForLater(t *testing.T) {
	f, c := newFake(t)
	u, buf := uploader(t, c)
	put(buf, 3)
	f.status.Store(503)
	if _, err := u.sendOnce(context.Background()); err == nil {
		t.Fatal("expected an error")
	}
	if buf.Stats().Batches != 3 {
		t.Fatal("readings dropped on a server error")
	}
}

func TestRejectedKeyStopsUploadingButKeepsReadings(t *testing.T) {
	f, c := newFake(t)
	u, buf := uploader(t, c)
	put(buf, 2)
	f.status.Store(401)
	called := make(chan struct{}, 1)
	u.OnUnauthorized = func() { called <- struct{}{} }
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go u.Run(ctx)
	select {
	case <-called:
	case <-time.After(3 * time.Second):
		t.Fatal("rejected key not noticed")
	}
	if u.Stats.Linked.Load() || buf.Stats().Batches != 2 {
		t.Fatal("expected unlinked with readings kept")
	}
}

func TestEventIDsAreUniqueAndValid(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 10000; i++ {
		id := NewEventID()
		if seen[id] || len(id) < 8 || len(id) > 64 {
			t.Fatalf("bad id %q", id)
		}
		for _, r := range id {
			if !(r == '-' || r == '_' || r >= '0' && r <= '9' || r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z') {
				t.Fatalf("id %q has %q, which the server refuses", id, r)
			}
		}
		seen[id] = true
	}
}

// ------------------------------------------------------------ whole agent

type countingCollector struct{ n atomic.Int32 }

func (c *countingCollector) Collect(ctx context.Context) models.Snapshot {
	c.n.Add(1)
	return models.Snapshot{Timestamp: time.Now().UTC(), SensorID: "agent-test", Storage: []models.Storage{}, Processes: []models.Process{}}
}

func TestAgentCollectsUploadsAndStopsCleanly(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("LECTIO_DATA_DIR", dir)
	f, c := newFake(t)
	cfg := config.Defaults()
	cfg.IntervalSeconds = 1
	if err := cfg.SetDeviceKey("device-key-1234567890"); err != nil {
		t.Fatal(err)
	}
	if err := cfg.Save(dir); err != nil {
		t.Fatal(err)
	}
	cfg, _ = config.Load(dir)
	col := &countingCollector{}
	a := &Agent{Config: cfg, Log: quiet, Version: "test", Collector: col, Client: c}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- a.Run(ctx) }()
	waitFor(t, "two readings on the server", func() bool { return f.count() >= 2 })
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("agent didn't stop")
	}
	st, err := ReadStatus(dir)
	if err != nil || st.Collected < 2 || st.Uploaded < 2 {
		t.Fatalf("status %+v %v", st, err)
	}
}

func TestAgentRefusesToRunUnlinked(t *testing.T) {
	cfg := config.Defaults()
	a := &Agent{Config: cfg, Log: quiet}
	if err := a.Run(context.Background()); err == nil {
		t.Fatal("ran without a device key")
	}
}
