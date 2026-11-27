package locate

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"time"

	"lectio/agent/internal/models"
)

type fakeServer struct {
	wanted  bool
	reports []models.LocationReport
}

func (f *fakeServer) LocationWanted(context.Context) (models.LocationWanted, error) {
	return models.LocationWanted{Wanted: f.wanted, PollSeconds: 120}, nil
}
func (f *fakeServer) ReportLocation(_ context.Context, r models.LocationReport) error {
	f.reports = append(f.reports, r)
	return nil
}

// Kigali-ish test points; 0.001° of latitude is about 111 m.
const lat, lon = -1.95, 30.06

func locator(srv *fakeServer, fix *Fix, now *time.Time) *Locator {
	return &Locator{
		Client: srv, Log: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Find: func(context.Context) (Fix, error) { f := *fix; f.At = *now; return f, nil },
		Now:  func() time.Time { return *now },
	}
}

func TestNothingIsReadOrSentWhileSwitchedOff(t *testing.T) {
	srv := &fakeServer{wanted: false}
	read := false
	l := &Locator{Client: srv, Log: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Find: func(context.Context) (Fix, error) { read = true; return Fix{}, nil }}
	l.checkOnce(context.Background())
	if read || len(srv.reports) != 0 {
		t.Fatal("the position was read or sent while the owner had it off")
	}
}

func TestSendsOnMovesAndHalfHourly(t *testing.T) {
	srv := &fakeServer{wanted: true}
	now := time.Date(2026, 11, 28, 10, 0, 0, 0, time.UTC)
	fix := Fix{Status: "ok", Latitude: lat, Longitude: lon, AccuracyM: 50}
	l := locator(srv, &fix, &now)
	ctx := context.Background()

	l.checkOnce(ctx) // first position: sent
	now = now.Add(2 * time.Minute)
	fix.Latitude = lat + 0.0005 // about 55 m: not a move
	l.checkOnce(ctx)
	if len(srv.reports) != 1 {
		t.Fatalf("a 55 m wobble was sent: %d reports", len(srv.reports))
	}
	now = now.Add(2 * time.Minute)
	fix.Latitude = lat + 0.002 // about 220 m from the last report: a move
	l.checkOnce(ctx)
	if len(srv.reports) != 2 || *srv.reports[1].Latitude != lat+0.002 {
		t.Fatalf("the move wasn't sent: %+v", srv.reports)
	}
	now = now.Add(31 * time.Minute) // still there
	l.checkOnce(ctx)
	if len(srv.reports) != 3 {
		t.Fatal("no half-hourly report")
	}
}

func TestWithoutAPositionItReportsHalfHourly(t *testing.T) {
	// The server estimates from the internet address each time, so the
	// estimate follows the PC from network to network.
	srv := &fakeServer{wanted: true}
	now := time.Now()
	fix := Fix{Status: "off"}
	l := locator(srv, &fix, &now)
	l.checkOnce(context.Background())
	now = now.Add(2 * time.Minute)
	l.checkOnce(context.Background())
	if len(srv.reports) != 1 || srv.reports[0].Status != "off" || srv.reports[0].Latitude != nil {
		t.Fatalf("got %+v", srv.reports)
	}
	now = now.Add(30 * time.Minute)
	l.checkOnce(context.Background())
	if len(srv.reports) != 2 {
		t.Fatalf("no half-hourly report without a position: %d", len(srv.reports))
	}
}

func TestSwitchingOffAndOnReportsStraightAway(t *testing.T) {
	srv := &fakeServer{wanted: true}
	now := time.Now()
	fix := Fix{Status: "ok", Latitude: lat, Longitude: lon}
	l := locator(srv, &fix, &now)
	l.checkOnce(context.Background())
	srv.wanted = false
	l.checkOnce(context.Background())
	srv.wanted = true
	l.checkOnce(context.Background())
	if len(srv.reports) != 2 {
		t.Fatalf("expected a fresh report after switching back on, got %d", len(srv.reports))
	}
}

func TestDistance(t *testing.T) {
	if d := Distance(lat, lon, lat+0.001, lon); d < 105 || d > 116 {
		t.Fatalf("0.001° of latitude = %.0f m", d)
	}
}

func TestBadPositionsAreNotValid(t *testing.T) {
	for _, f := range []Fix{{Status: "ok"}, {Status: "ok", Latitude: 95, Longitude: 10}, {Status: "off", Latitude: lat, Longitude: lon}} {
		if f.Valid() {
			t.Fatalf("%+v counted as a real position", f)
		}
	}
}
