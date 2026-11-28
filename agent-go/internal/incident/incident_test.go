package incident

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"time"

	"lectio/agent/internal/api"
	"lectio/agent/internal/models"
)

var quiet = slog.New(slog.NewTextHandler(io.Discard, nil))

func TestClassify(t *testing.T) {
	at := time.Date(2026, 11, 28, 14, 41, 0, 0, time.UTC)
	alive := at.Add(-9 * time.Minute)
	cases := []struct {
		e     Event
		cause string
		code  string
	}{
		{Event{At: at, Bugcheck: "159", PowerButton: "0"}, "bluescreen", "0x9f"},
		{Event{At: at, Bugcheck: "0", PowerButton: "133456789"}, "forced_off", ""},
		{Event{At: at, Bugcheck: "0", PowerButton: "0"}, "power_lost", ""},
		{Event{At: at}, "power_lost", ""},
	}
	for _, c := range cases {
		got := Classify(c.e, alive)
		if got.Cause != c.cause || got.BugcheckCode != c.code {
			t.Errorf("%+v: got %s %s", c.e, got.Cause, got.BugcheckCode)
		}
		if got.LastAlive == nil || !got.LastAlive.Equal(alive) {
			t.Errorf("last alive not kept: %v", got.LastAlive)
		}
	}
	if Classify(Event{At: at}, at.Add(time.Minute)).LastAlive != nil {
		t.Error("a last sign of life after the event must be ignored")
	}
}

func TestParse(t *testing.T) {
	for _, empty := range []string{"", "null", "[]", "  \r\n"} {
		if ev, err := parse([]byte(empty)); err != nil || len(ev) != 0 {
			t.Errorf("%q: %v %v", empty, ev, err)
		}
	}
	ev, err := parse([]byte(`[{"at":"2026-11-28T14:41:03.123Z","bugcheck":"0","power_button":"0"}]`))
	if err != nil || len(ev) != 1 || ev[0].At.Minute() != 41 {
		t.Fatalf("%v %v", ev, err)
	}
}

type fakeServer struct {
	fail    int
	reports []models.CrashReport
	byes    []string
	refuse  bool
}

func (f *fakeServer) Goodbye(_ context.Context, reason string) error {
	f.byes = append(f.byes, reason)
	return nil
}

func (f *fakeServer) ReportCrash(_ context.Context, r models.CrashReport) (models.CrashReply, error) {
	if f.refuse {
		return models.CrashReply{}, &api.StatusError{Code: 422}
	}
	if f.fail > 0 {
		f.fail--
		return models.CrashReply{}, context.DeadlineExceeded
	}
	f.reports = append(f.reports, r)
	return models.CrashReply{IncidentID: "x"}, nil
}

func runOnce(t *testing.T, r *Reporter) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Run does one round, then stops
	r.Run(ctx)
}

func TestReportsAreKeptUntilTheServerHasThem(t *testing.T) {
	dir := t.TempDir()
	srv := &fakeServer{fail: 1}
	at := time.Now().Add(-time.Hour)
	reads := 0
	r := &Reporter{Client: srv, Dir: dir, Log: quiet, Read: func(_ context.Context, since time.Time) ([]Event, error) {
		reads++
		if reads == 1 {
			return []Event{{At: at, Bugcheck: "0", PowerButton: "0"}}, nil
		}
		return nil, nil
	}}
	runOnce(t, r) // the server is unreachable: kept
	if len(srv.reports) != 0 || len(r.load().Pending) != 1 {
		t.Fatalf("should be waiting: %+v", r.load())
	}
	runOnce(t, r) // sent now, and not read again
	if len(srv.reports) != 1 || srv.reports[0].Cause != "power_lost" || len(r.load().Pending) != 0 {
		t.Fatalf("not delivered once: %+v %+v", srv.reports, r.load())
	}
}

func TestOnlyNewRecordsAreRead(t *testing.T) {
	dir := t.TempDir()
	var asked []time.Time
	r := &Reporter{Client: &fakeServer{}, Dir: dir, Log: quiet, Read: func(_ context.Context, since time.Time) ([]Event, error) {
		asked = append(asked, since)
		return nil, nil
	}}
	runOnce(t, r)
	runOnce(t, r)
	if len(asked) != 2 || time.Since(asked[0]) < 23*time.Hour || time.Since(asked[1]) > time.Minute {
		t.Fatalf("first look should be 24 h back, the next from the last check: %v", asked)
	}
}

func TestRefusedReportsAreDropped(t *testing.T) {
	dir := t.TempDir()
	r := &Reporter{Client: &fakeServer{refuse: true}, Dir: dir, Log: quiet,
		Read: func(context.Context, time.Time) ([]Event, error) { return []Event{{At: time.Now()}}, nil }}
	runOnce(t, r)
	if len(r.load().Pending) != 0 {
		t.Fatal("a report the server can never accept must not be retried forever")
	}
}

func TestGoodbye(t *testing.T) {
	srv := &fakeServer{}
	(&Reporter{Client: srv, Dir: t.TempDir(), Log: quiet}).Goodbye("shutdown")
	if len(srv.byes) != 1 || srv.byes[0] != "shutdown" {
		t.Fatal(srv.byes)
	}
}
