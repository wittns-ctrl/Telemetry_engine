// Package services runs the agent: the scheduler takes readings, the
// processor gives each an id and buffers it on disk, the uploader sends
// buffered readings to the API, and the health monitor records how it's going.
//
//	scheduler --(chan, size 1)--> processor --(disk buffer)--> uploader --> API
//
// Collection never waits on the network: the uploader works from the disk
// buffer, at its own pace, with its own retries.
package services

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"sync/atomic"
	"time"

	"lectio/agent/internal/api"
	"lectio/agent/internal/models"
	"lectio/agent/internal/retry"
	"lectio/agent/internal/storage"
)

// Snapshotter takes one reading (collectors.Collector satisfies it).
type Snapshotter interface {
	Collect(ctx context.Context) models.Snapshot
}

// ------------------------------------------------------------------ scheduler

// Scheduler takes a reading every interval. If the previous reading hasn't
// been picked up yet, the new one replaces it rather than piling up.
type Scheduler struct {
	Interval  time.Duration
	Collector Snapshotter
	Out       chan models.Snapshot
	Log       *slog.Logger
	Stats     *Stats
}

func (s *Scheduler) Run(ctx context.Context) {
	ticker := time.NewTicker(s.Interval)
	defer ticker.Stop()
	for {
		// Each reading must finish within the interval.
		cctx, cancel := context.WithTimeout(ctx, s.Interval)
		snap := s.Collector.Collect(cctx)
		cancel()
		if ctx.Err() != nil {
			return
		}
		s.Stats.Collected.Add(1)
		s.Stats.LastCollect.Store(time.Now().Unix())
		select {
		case s.Out <- snap:
		default:
			// The processor is behind (disk trouble): drop the older reading.
			select {
			case <-s.Out:
				s.Stats.Skipped.Add(1)
			default:
			}
			s.Out <- snap
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// ------------------------------------------------------------------ processor

// Processor gives each reading a unique event id and stores it in the
// buffer, then nudges the uploader.
type Processor struct {
	In     chan models.Snapshot
	Buffer *storage.Buffer
	Wake   chan struct{}
	Log    *slog.Logger
	Stats  *Stats
}

func NewEventID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b) // 22 characters of A-Z a-z 0-9 - _
}

func (p *Processor) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			// Store anything already taken before stopping.
			for {
				select {
				case snap := <-p.In:
					p.store(snap)
				default:
					return
				}
			}
		case snap := <-p.In:
			p.store(snap)
		}
	}
}

func (p *Processor) store(snap models.Snapshot) {
	batch := models.Batch{Readings: []models.Reading{{EventID: NewEventID(), Snapshot: snap}}}
	if err := p.Buffer.Put(batch); err != nil {
		p.Stats.BufferErrors.Add(1)
		p.Log.Error("couldn't buffer a reading", "error", err)
		return
	}
	select {
	case p.Wake <- struct{}{}:
	default:
	}
}

// ------------------------------------------------------------------ uploader

// Uploader sends buffered readings, oldest first, up to BatchSize per
// request, and deletes them once the server has them.
type Uploader struct {
	Client    *api.Client
	Buffer    *storage.Buffer
	BatchSize int
	Wake      chan struct{}
	Log       *slog.Logger
	Stats     *Stats
	// Called when the server rejects the device key (PC deleted or re-linked).
	OnUnauthorized func()

	backoff *retry.Backoff
}

const (
	idleCheck        = 30 * time.Second
	unauthorizedWait = 5 * time.Minute
)

func (u *Uploader) Run(ctx context.Context) {
	if u.backoff == nil {
		u.backoff = retry.New(2*time.Second, 5*time.Minute)
	}
	for ctx.Err() == nil {
		sent, err := u.sendOnce(ctx)
		switch {
		case errors.Is(err, api.ErrUnauthorized):
			u.Stats.Linked.Store(false)
			u.Log.Error("the server rejected this PC's device key; readings are kept until it's linked again (lectio-agent link)")
			if u.OnUnauthorized != nil {
				u.OnUnauthorized()
			}
			if !retry.Sleep(ctx, unauthorizedWait) {
				return
			}
		case err != nil:
			wait := u.backoff.Next()
			u.Stats.UploadFailures.Add(1)
			var status *api.StatusError
			if errors.As(err, &status) && status.WrongEndpoint() {
				// Usually a wrong API address, or a server older than this agent.
				err = fmt.Errorf("the server at %s has no upload endpoint (HTTP %d): check the API address "+
					"(lectio-agent config) or update the server; readings are kept and will be sent: %w",
					u.Client.Base(), status.Code, err)
				u.Stats.SetError(err)
				u.Log.Error("upload endpoint not found; keeping readings", "error", err,
					"retry_in", wait.Round(time.Second).String(), "attempt", u.backoff.Attempts())
			} else {
				u.Stats.SetError(err)
				u.Log.Warn("upload failed; will retry", "error", err, "retry_in", wait.Round(time.Second).String(),
					"attempt", u.backoff.Attempts())
			}
			if !retry.Sleep(ctx, wait) {
				return
			}
		case sent:
			u.backoff.Reset() // more may be waiting: go again straight away
		default:
			select { // nothing buffered: wait for a new reading
			case <-ctx.Done():
				return
			case <-u.Wake:
			case <-time.After(idleCheck):
			}
		}
	}
}

// sendOnce sends one request's worth. sent=false with no error means the buffer is empty.
func (u *Uploader) sendOnce(ctx context.Context) (sent bool, err error) {
	items, err := u.Buffer.Take(u.BatchSize)
	if err != nil || len(items) == 0 {
		return false, err
	}
	var batch models.Batch
	for _, it := range items {
		batch.Readings = append(batch.Readings, it.Batch.Readings...)
	}
	resp, err := u.Client.SendBatch(ctx, batch)
	var status *api.StatusError
	if errors.As(err, &status) && status.RefusesData() {
		// The server judged these readings invalid (400/413/422), so it will
		// never accept them; keeping them would block everything behind them.
		// Any other refusal (e.g. 404 from a wrong or outdated server) says
		// nothing about the readings: they stay buffered and are retried.
		u.Stats.Rejected.Add(int64(len(batch.Readings)))
		u.Log.Error("the server refused readings; dropping them", "readings", len(batch.Readings), "error", err)
		u.remove(items)
		return true, nil
	}
	if err != nil {
		return false, err
	}
	u.remove(items)
	u.Stats.Linked.Store(true)
	u.Stats.Uploaded.Add(int64(resp.Stored))
	u.Stats.Duplicates.Add(int64(resp.Duplicates))
	u.Stats.LastUpload.Store(time.Now().Unix())
	u.Stats.SetError(nil)
	if resp.Duplicates > 0 {
		u.Log.Info("server already had some readings (resent after a timeout)", "duplicates", resp.Duplicates)
	}
	return true, nil
}

func (u *Uploader) remove(items []storage.Item) {
	for _, it := range items {
		if err := u.Buffer.Remove(it.Name); err != nil {
			u.Log.Warn("couldn't delete a sent batch", "file", it.Name, "error", err)
		}
	}
}

// ------------------------------------------------------------------ stats

// Stats are counters the health monitor writes to status.json.
type Stats struct {
	Collected      atomic.Int64
	Skipped        atomic.Int64
	Uploaded       atomic.Int64
	Duplicates     atomic.Int64
	Rejected       atomic.Int64
	UploadFailures atomic.Int64
	BufferErrors   atomic.Int64
	LastCollect    atomic.Int64 // unix seconds
	LastUpload     atomic.Int64
	Linked         atomic.Bool
	lastError      atomic.Value // string
}

func (s *Stats) SetError(err error) {
	if err == nil {
		s.lastError.Store("")
		return
	}
	s.lastError.Store(err.Error())
}

func (s *Stats) LastError() string {
	v, _ := s.lastError.Load().(string)
	return v
}
