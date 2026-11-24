package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"

	"lectio/agent/internal/api"
	"lectio/agent/internal/collectors"
	"lectio/agent/internal/config"
	"lectio/agent/internal/models"
	"lectio/agent/internal/storage"
)

// FixRunner checks for and carries out fixes (package fixes); optional.
type FixRunner interface {
	Run(ctx context.Context)
}

// Agent wires the components together and runs them until ctx is cancelled.
type Agent struct {
	Config    config.Config
	Log       *slog.Logger
	Version   string
	Collector Snapshotter                 // nil: the default collectors
	Client    *api.Client                 // nil: a client for Config.APIURL
	Fixes     func(*api.Client) FixRunner // nil: fixes off

	started time.Time
}

// Status is what status.json holds (lectio-agent status prints it).
type Status struct {
	Version         string        `json:"version"`
	PID             int           `json:"pid"`
	StartedAt       time.Time     `json:"started_at"`
	UpdatedAt       time.Time     `json:"updated_at"`
	API             string        `json:"api"`
	Linked          bool          `json:"linked"`
	DeviceName      string        `json:"device_name,omitempty"`
	IntervalSeconds int           `json:"interval_seconds"`
	Collected       int64         `json:"readings_taken"`
	Uploaded        int64         `json:"readings_uploaded"`
	Duplicates      int64         `json:"readings_already_on_server"`
	Rejected        int64         `json:"readings_refused_by_server"`
	UploadFailures  int64         `json:"upload_failures"`
	LastCollect     *time.Time    `json:"last_reading_at,omitempty"`
	LastUpload      *time.Time    `json:"last_upload_at,omitempty"`
	LastError       string        `json:"last_error,omitempty"`
	Buffer          storage.Stats `json:"buffer"`
}

const StatusFile = "status.json"

func (a *Agent) Run(ctx context.Context) error {
	cfg := a.Config
	a.started = time.Now()
	key, err := cfg.DeviceKey()
	if err != nil {
		return err
	}
	buffer, err := storage.Open(filepath.Join(cfg.Dir(), "buffer"), cfg.BufferMaxBytes(), cfg.BufferMaxAge())
	if err != nil {
		return err
	}
	client := a.Client
	if client == nil {
		client = api.New(cfg.APIURL, a.Version, 30*time.Second)
	}
	client.SetDeviceKey(key)

	collector := a.Collector
	if collector == nil {
		sensorID := "agent-" + shortID(cfg.SystemUUID)
		collector = collectors.New(sensorID, a.Log, collectors.DefaultSources(cfg.TopProcesses)...)
	}

	stats := &Stats{}
	stats.Linked.Store(true)
	readings := make(chan models.Snapshot, 1)
	wake := make(chan struct{}, 1)

	var wg sync.WaitGroup
	start := func(name string, run func(context.Context), c context.Context) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			defer func() {
				if r := recover(); r != nil {
					a.Log.Error("component crashed", "component", name, "panic", fmt.Sprint(r))
				}
			}()
			run(c)
		}()
	}

	// The processor outlives the scheduler briefly so the last reading is stored.
	collectCtx, stopCollecting := context.WithCancel(ctx)
	defer stopCollecting()
	procCtx, stopProcessing := context.WithCancel(context.Background())

	sched := &Scheduler{Interval: cfg.Interval(), Collector: collector, Out: readings, Log: a.Log, Stats: stats}
	proc := &Processor{In: readings, Buffer: buffer, Wake: wake, Log: a.Log, Stats: stats}
	up := &Uploader{Client: client, Buffer: buffer, BatchSize: cfg.BatchSize, Wake: wake, Log: a.Log, Stats: stats}

	var schedDone sync.WaitGroup
	schedDone.Add(1)
	go func() { defer schedDone.Done(); sched.Run(collectCtx) }()
	start("processor", proc.Run, procCtx)
	start("uploader", up.Run, ctx)
	start("health", func(c context.Context) { a.health(c, stats, buffer) }, ctx)
	if a.Fixes != nil && cfg.FixesEnabled {
		start("fixes", a.Fixes(client).Run, ctx)
	} else {
		a.Log.Info("fixes from the website are turned off on this PC")
	}

	a.Log.Info("agent started", "api", cfg.APIURL, "interval", cfg.Interval().String(), "version", a.Version)
	<-ctx.Done()
	a.Log.Info("agent stopping")
	stopCollecting()
	schedDone.Wait()
	stopProcessing()
	wg.Wait()
	a.writeStatus(stats, buffer)
	a.Log.Info("agent stopped", "buffered_batches", buffer.Stats().Batches)
	return nil
}

// health writes status.json every 15 seconds.
func (a *Agent) health(ctx context.Context, stats *Stats, buffer *storage.Buffer) {
	t := time.NewTicker(15 * time.Second)
	defer t.Stop()
	for {
		a.writeStatus(stats, buffer)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

func (a *Agent) writeStatus(stats *Stats, buffer *storage.Buffer) {
	st := Status{
		Version: a.Version, PID: os.Getpid(), StartedAt: a.started, UpdatedAt: time.Now(),
		API: a.Config.APIURL, Linked: stats.Linked.Load(), DeviceName: a.Config.DeviceName,
		IntervalSeconds: a.Config.IntervalSeconds,
		Collected:       stats.Collected.Load(), Uploaded: stats.Uploaded.Load(), Duplicates: stats.Duplicates.Load(),
		Rejected: stats.Rejected.Load(), UploadFailures: stats.UploadFailures.Load(),
		LastCollect: unixPtr(stats.LastCollect.Load()), LastUpload: unixPtr(stats.LastUpload.Load()),
		LastError: stats.LastError(), Buffer: buffer.Stats(),
	}
	data, _ := json.MarshalIndent(st, "", "  ")
	if err := config.WriteFileAtomic(filepath.Join(a.Config.Dir(), StatusFile), data); err != nil {
		a.Log.Debug("couldn't write status file", "error", err)
	}
}

func unixPtr(sec int64) *time.Time {
	if sec == 0 {
		return nil
	}
	t := time.Unix(sec, 0)
	return &t
}

func shortID(id string) string {
	if len(id) >= 8 {
		return id[:8]
	}
	if id == "" {
		return "unknown"
	}
	return id
}

// ReadStatus loads status.json from dir.
func ReadStatus(dir string) (Status, error) {
	var st Status
	data, err := os.ReadFile(filepath.Join(dir, StatusFile))
	if err != nil {
		return st, err
	}
	return st, json.Unmarshal(data, &st)
}
