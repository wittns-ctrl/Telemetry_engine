package collectors

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"runtime"
	"testing"
	"time"

	"lectio/agent/internal/models"
)

var quiet = slog.New(slog.NewTextHandler(io.Discard, nil))

// These read this PC for real: every machine has a CPU, memory, a disk, a
// network adapter and processes, so those readings must come back.

func collectTwice(t *testing.T, sources ...Source) models.Snapshot {
	t.Helper()
	c := New("agent-test", quiet, sources...)
	c.Collect(context.Background()) // rates need two readings
	time.Sleep(1100 * time.Millisecond)
	return c.Collect(context.Background())
}

func TestCPU(t *testing.T) {
	s := collectTwice(t, &CPUSource{})
	if s.CPU.UtilizationPercent == nil || *s.CPU.UtilizationPercent < 0 || *s.CPU.UtilizationPercent > 100 {
		t.Fatalf("utilization %v", s.CPU.UtilizationPercent)
	}
	if s.CPU.UptimeSeconds == nil || *s.CPU.UptimeSeconds <= 0 {
		t.Fatal("no uptime")
	}
	if runtime.GOOS == "windows" && (s.CPU.ClockSpeedGHz == nil || *s.CPU.ClockSpeedGHz <= 0) {
		t.Fatal("no clock speed")
	}
}

func TestMemory(t *testing.T) {
	s := collectTwice(t, MemorySource{})
	r := s.RAM
	if r.TotalGB == nil || *r.TotalGB <= 0 || r.UsedGB == nil || *r.UsedGB > *r.TotalGB {
		t.Fatalf("ram %+v", r)
	}
	if runtime.GOOS == "windows" {
		if s.CPU.ProcessCount == nil || *s.CPU.ProcessCount < 10 || s.CPU.ThreadCount == nil || r.CommitLimitGB == nil {
			t.Fatalf("system counts missing: %+v %+v", s.CPU, r)
		}
	}
}

func TestDisk(t *testing.T) {
	s := collectTwice(t, &DiskSource{})
	if len(s.Storage) == 0 {
		t.Fatal("no drives")
	}
	d := s.Storage[0]
	if d.TotalCapacityGB == nil || d.AvailableCapacityGB == nil || *d.AvailableCapacityGB > *d.TotalCapacityGB {
		t.Fatalf("drive %+v", d)
	}
	if s.Disk.ReadBytesPerS == nil || s.Disk.WriteBytesPerS == nil {
		t.Fatal("no disk speeds on the second reading")
	}
}

func TestNetwork(t *testing.T) {
	s := collectTwice(t, &NetworkSource{})
	if s.Network.AdapterName == nil {
		t.Skip("no network adapter on this machine")
	}
	if s.Network.ReceiveBytesPerS == nil || *s.Network.ReceiveBytesPerS < 0 {
		t.Fatal("no download speed on the second reading")
	}
}

func TestProcesses(t *testing.T) {
	done := make(chan struct{})
	go func() { // keep one core busy so something shows up
		for {
			select {
			case <-done:
				return
			default:
			}
		}
	}()
	defer close(done)
	s := collectTwice(t, &ProcessSource{Top: 5})
	if len(s.Processes) == 0 || len(s.Processes) > 5 {
		t.Fatalf("%d processes", len(s.Processes))
	}
	for _, p := range s.Processes {
		if p.Name == "" || p.CPUPercent < 0 || p.CPUPercent > 100 {
			t.Fatalf("bad process %+v", p)
		}
	}
}

func TestEverythingTogetherMatchesTheAPIShape(t *testing.T) {
	s := collectTwice(t, DefaultSources(10)...)
	data, err := json.Marshal(s)
	if err != nil {
		t.Fatal(err)
	}
	var back map[string]any
	_ = json.Unmarshal(data, &back)
	for _, key := range []string{"timestamp", "sensor_id", "cpu", "gpu", "storage", "ram", "power_vrm", "disk", "network", "processes"} {
		if _, ok := back[key]; !ok {
			t.Errorf("missing %q", key)
		}
	}
	if s.CollectionDurationMS == nil || *s.CollectionDurationMS > 5000 {
		t.Fatalf("collection took %v ms", s.CollectionDurationMS)
	}
}

type broken struct{}

func (broken) Name() string                                    { return "broken" }
func (broken) Collect(context.Context, *models.Snapshot) error { return errors.New("sensor gone") }

func TestOneBrokenSourceDoesntCostTheOthers(t *testing.T) {
	s := collectTwice(t, broken{}, MemorySource{})
	if s.RAM.TotalGB == nil {
		t.Fatal("memory lost because another source failed")
	}
}

func TestRates(t *testing.T) {
	var r rate
	t0 := time.Now()
	if r.next(100, t0) != nil {
		t.Fatal("first reading has no rate")
	}
	if v := r.next(300, t0.Add(2*time.Second)); v == nil || *v != 100 {
		t.Fatalf("rate %v", v)
	}
	if r.next(50, t0.Add(3*time.Second)) != nil {
		t.Fatal("counter reset should give no rate")
	}
}
