// Package locate reports where the PC is, when the account owner has
// switched that on for it on the website.
//
// The position comes from Windows Location (Wi-Fi networks nearby, or GPS if
// the PC has one), read as the signed-in person: Windows keeps location per
// user, and the service's own account has none. A new position is sent when
// the PC has moved more than about 100 m, or every 30 minutes as a sign it's
// still there; nothing is sent while the owner has it switched off.
package locate

import (
	"context"
	"errors"
	"log/slog"
	"math"
	"time"

	"lectio/agent/internal/api"
	"lectio/agent/internal/models"
	"lectio/agent/internal/retry"
)

const (
	defaultPoll = 2 * time.Minute
	errorPoll   = 5 * time.Minute
	moveMetres  = 100
	stillThere  = 30 * time.Minute
)

// Fix is one answer from Windows Location.
type Fix struct {
	Status    string    `json:"status"` // ok, off, unavailable, no_user
	Latitude  float64   `json:"latitude"`
	Longitude float64   `json:"longitude"`
	AccuracyM float64   `json:"accuracy_m"`
	At        time.Time `json:"at"`
}

type Server interface {
	LocationWanted(ctx context.Context) (models.LocationWanted, error)
	ReportLocation(ctx context.Context, r models.LocationReport) error
}

type Locator struct {
	Client Server
	Find   func(ctx context.Context) (Fix, error)
	Log    *slog.Logger
	Now    func() time.Time

	sent   *Fix // the last report that reached the server
	sentAt time.Time
}

func (l *Locator) now() time.Time {
	if l.Now != nil {
		return l.Now()
	}
	return time.Now()
}

func (l *Locator) Run(ctx context.Context) {
	for {
		if !retry.Sleep(ctx, l.checkOnce(ctx)) {
			return
		}
	}
}

func (l *Locator) checkOnce(ctx context.Context) time.Duration {
	wanted, err := l.Client.LocationWanted(ctx)
	if err != nil {
		if errors.Is(err, api.ErrUnauthorized) || !errors.Is(err, context.Canceled) {
			l.Log.Debug("location check-in failed", "error", err)
		}
		return errorPoll
	}
	poll := time.Duration(wanted.PollSeconds) * time.Second
	if poll < 30*time.Second || poll > 30*time.Minute {
		poll = defaultPoll
	}
	if !wanted.Wanted {
		l.sent = nil // switched off: the next switch-on reports straight away
		return poll
	}

	fix, err := l.Find(ctx)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return poll
		}
		l.Log.Debug("couldn't read the PC's location", "error", err)
		fix = Fix{Status: "unavailable", At: l.now()}
	}
	if !l.worthSending(fix) {
		return poll
	}
	if err := l.Client.ReportLocation(ctx, toReport(fix)); err != nil {
		l.Log.Debug("location report failed", "error", err)
		return poll
	}
	l.sent, l.sentAt = &fix, l.now()
	return poll
}

// worthSending: a change of status, a move of more than about 100 m, or the
// half-hourly "still here". Without a Windows position the half-hourly report
// still goes: the server then estimates from the PC's internet address, which
// changes when the PC moves to another network.
func (l *Locator) worthSending(f Fix) bool {
	if l.sent == nil || l.sent.Status != f.Status {
		return true
	}
	if l.now().Sub(l.sentAt) >= stillThere {
		return true
	}
	return f.Status == "ok" && Distance(l.sent.Latitude, l.sent.Longitude, f.Latitude, f.Longitude) > moveMetres
}

func toReport(f Fix) models.LocationReport {
	r := models.LocationReport{Status: f.Status, Source: "windows", MeasuredAt: f.At.UTC()}
	if f.Status == "ok" {
		lat, lon, acc := f.Latitude, f.Longitude, f.AccuracyM
		r.Latitude, r.Longitude, r.AccuracyM = &lat, &lon, &acc
	}
	return r
}

// Distance in metres between two points (haversine).
func Distance(lat1, lon1, lat2, lon2 float64) float64 {
	const earth = 6371000.0
	rad := math.Pi / 180
	dLat, dLon := (lat2-lat1)*rad, (lon2-lon1)*rad
	a := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(lat1*rad)*math.Cos(lat2*rad)*math.Sin(dLon/2)*math.Sin(dLon/2)
	return 2 * earth * math.Asin(math.Min(1, math.Sqrt(a)))
}

// Valid: a real position on Earth.
func (f Fix) Valid() bool {
	return f.Status == "ok" && f.Latitude >= -90 && f.Latitude <= 90 && f.Longitude >= -180 && f.Longitude <= 180 &&
		!(f.Latitude == 0 && f.Longitude == 0) && !math.IsNaN(f.Latitude) && !math.IsNaN(f.Longitude)
}
