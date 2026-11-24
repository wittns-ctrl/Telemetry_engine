// Package collectors reads the PC's health into a models.Snapshot.
//
// Each Source fills in its part of the snapshot. Sources run one after
// another under a shared deadline (the collection interval), and a source
// that fails or runs out of time leaves its readings null rather than
// stopping the others: a missing GPU or a broken WMI class should never cost
// the CPU and memory readings.
//
// Rates (disk and network speed, per-process CPU) are measured between two
// collections, so the first snapshot after start has them null.
package collectors

import (
	"context"
	"log/slog"
	"time"

	"lectio/agent/internal/models"
)

// Source is one group of readings (CPU, memory, disks, ...).
type Source interface {
	Name() string
	Collect(ctx context.Context, s *models.Snapshot) error
}

type Collector struct {
	sources  []Source
	sensorID string
	log      *slog.Logger
	now      func() time.Time
	failures map[string]int
}

func New(sensorID string, log *slog.Logger, sources ...Source) *Collector {
	return &Collector{sources: sources, sensorID: sensorID, log: log, now: time.Now, failures: map[string]int{}}
}

// Collect takes one snapshot. It never returns an error: what couldn't be
// read is left null and logged (once per run of failures, not every time).
func (c *Collector) Collect(ctx context.Context) models.Snapshot {
	started := c.now()
	s := models.Snapshot{
		Timestamp: started.UTC(),
		SensorID:  c.sensorID,
		Storage:   []models.Storage{},
		Processes: []models.Process{},
	}
	for _, src := range c.sources {
		if ctx.Err() != nil {
			break
		}
		if err := src.Collect(ctx, &s); err != nil {
			c.failures[src.Name()]++
			if c.failures[src.Name()] == 1 {
				c.log.Warn("couldn't read part of the PC's health", "source", src.Name(), "error", err)
			}
			continue
		}
		if n := c.failures[src.Name()]; n > 0 {
			c.log.Info("reading works again", "source", src.Name(), "failed_times", n)
			delete(c.failures, src.Name())
		}
	}
	ms := float64(c.now().Sub(started).Microseconds()) / 1000
	s.CollectionDurationMS = &ms
	return s
}

// small helpers for optional readings

func f64(v float64) *float64 { return &v }
func i64(v int64) *int64     { return &v }
func iptr(v int) *int        { return &v }
func str(v string) *string   { return &v }

func round(v float64, places int) float64 {
	p := 1.0
	for i := 0; i < places; i++ {
		p *= 10
	}
	return float64(int64(v*p+0.5)) / p
}

const gib = 1 << 30

// rate is a per-second rate between two counter readings, or nil the first
// time and when a counter went backwards (a reset or a new adapter).
type rate struct {
	last   uint64
	at     time.Time
	primed bool
}

func (r *rate) next(value uint64, at time.Time) *float64 {
	defer func() { r.last, r.at, r.primed = value, at, true }()
	if !r.primed || value < r.last {
		return nil
	}
	secs := at.Sub(r.at).Seconds()
	if secs <= 0 {
		return nil
	}
	return f64(round(float64(value-r.last)/secs, 1))
}
