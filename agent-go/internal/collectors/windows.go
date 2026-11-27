//go:build windows

package collectors

import (
	"context"
	"encoding/csv"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"

	"github.com/yusufpapurcu/wmi"
	"golang.org/x/sys/windows"

	"lectio/agent/internal/models"
)

func platformSources() []Source {
	return []Source{&GPUSource{}, &ThermalSource{}, &WHEASource{}}
}

// ------------------------------------------------------------------ WMI

// wmiQuery runs a WMI query with a deadline (WMI can hang on a busy PC).
func wmiQuery(ctx context.Context, query string, dst any, namespace string) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	done := make(chan error, 1)
	go func() {
		if namespace == "" {
			done <- wmi.Query(query, dst)
		} else {
			done <- wmi.QueryNamespace(query, dst, namespace)
		}
	}()
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

// cached keeps a slow reading for a while.
type cached[T any] struct {
	mu    sync.Mutex
	value T
	at    time.Time
	ttl   time.Duration
}

func (c *cached[T]) get(read func() (T, bool)) T {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.at.IsZero() && time.Since(c.at) < c.ttl {
		return c.value
	}
	if v, ok := read(); ok {
		c.value = v
	}
	c.at = time.Now() // failures are also remembered, so a broken class isn't asked every time
	return c.value
}

// ------------------------------------------------------------------ CPU clock

type win32Processor struct{ CurrentClockSpeed uint32 }

var clock = cached[float64]{ttl: 15 * time.Second}

func currentMHz(ctx context.Context) float64 {
	return clock.get(func() (float64, bool) {
		var rows []win32Processor
		if err := wmiQuery(ctx, "SELECT CurrentClockSpeed FROM Win32_Processor", &rows, ""); err != nil || len(rows) == 0 {
			return 0, false
		}
		return float64(rows[0].CurrentClockSpeed), true
	})
}

// ------------------------------------------------------------------ system counts

// PERFORMANCE_INFORMATION from psapi.h.
type performanceInfo struct {
	cb                uint32
	CommitTotal       uintptr
	CommitLimit       uintptr
	CommitPeak        uintptr
	PhysicalTotal     uintptr
	PhysicalAvailable uintptr
	SystemCache       uintptr
	KernelTotal       uintptr
	KernelPaged       uintptr
	KernelNonpaged    uintptr
	PageSize          uintptr
	HandleCount       uint32
	ProcessCount      uint32
	ThreadCount       uint32
}

var procGetPerformanceInfo = windows.NewLazySystemDLL("psapi.dll").NewProc("GetPerformanceInfo")

// systemCounts fills Task Manager's committed memory and process/thread/handle counts.
func systemCounts(s *models.Snapshot) {
	var pi performanceInfo
	pi.cb = uint32(unsafe.Sizeof(pi))
	if r, _, _ := procGetPerformanceInfo.Call(uintptr(unsafe.Pointer(&pi)), uintptr(pi.cb)); r == 0 {
		return
	}
	page := float64(pi.PageSize)
	s.RAM.CommittedGB = f64(round(float64(pi.CommitTotal)*page/gib, 2))
	s.RAM.CommitLimitGB = f64(round(float64(pi.CommitLimit)*page/gib, 2))
	s.CPU.ProcessCount = iptr(int(pi.ProcessCount))
	s.CPU.ThreadCount = iptr(int(pi.ThreadCount))
	s.CPU.HandleCount = iptr(int(pi.HandleCount))
}

// ------------------------------------------------------------------ link speed

type win32NetAdapter struct {
	NetConnectionID string
	Speed           uint64
}

var linkSpeeds = cached[map[string]float64]{ttl: time.Minute}

func linkSpeedMbps(ctx context.Context, adapter string) float64 {
	speeds := linkSpeeds.get(func() (map[string]float64, bool) {
		var rows []win32NetAdapter
		q := "SELECT NetConnectionID, Speed FROM Win32_NetworkAdapter WHERE NetEnabled = TRUE"
		if err := wmiQuery(ctx, q, &rows, ""); err != nil {
			return nil, false
		}
		out := map[string]float64{}
		for _, r := range rows {
			if r.Speed > 0 && r.Speed < 1<<50 {
				out[r.NetConnectionID] = round(float64(r.Speed)/1e6, 1)
			}
		}
		return out, true
	})
	return speeds[adapter]
}

// ------------------------------------------------------------------ GPU

// GPUSource reads NVIDIA cards through nvidia-smi (installed with the
// driver) and falls back to the card's name from Windows for other makes.
// nvidia-smi is a fixed local program with fixed arguments: nothing from the
// server ever reaches it.
type GPUSource struct {
	smi     string
	checked bool
	name    string
}

func (GPUSource) Name() string { return "gpu" }

func (g *GPUSource) Collect(ctx context.Context, s *models.Snapshot) error {
	if !g.checked {
		g.checked = true
		g.smi = findNvidiaSMI()
		if g.smi == "" {
			var rows []struct{ Name string }
			if err := wmiQuery(ctx, "SELECT Name FROM Win32_VideoController", &rows, ""); err == nil && len(rows) > 0 {
				g.name = rows[0].Name
			}
		}
	}
	if g.smi == "" {
		if g.name != "" {
			s.GPU.GPUName = str(truncate(g.name, 128))
		}
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, g.smi,
		"--query-gpu=name,temperature.gpu,utilization.gpu,fan.speed,memory.used,memory.total,power.draw",
		"--format=csv,noheader,nounits")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW}
	out, err := cmd.Output()
	if err != nil {
		return err
	}
	return parseNvidiaSMI(string(out), &s.GPU)
}

func findNvidiaSMI() string {
	if p, err := exec.LookPath("nvidia-smi.exe"); err == nil {
		return p
	}
	p := filepath.Join(os.Getenv("SystemRoot"), "System32", "nvidia-smi.exe")
	if _, err := os.Stat(p); err == nil {
		return p
	}
	return ""
}

// parseNvidiaSMI reads the first GPU's line. "[N/A]" or "[Not Supported]" leave a reading null.
func parseNvidiaSMI(out string, g *models.GPU) error {
	rows, err := csv.NewReader(strings.NewReader(strings.TrimSpace(out))).ReadAll()
	if err != nil || len(rows) == 0 || len(rows[0]) < 7 {
		return errors.New("unexpected nvidia-smi output")
	}
	r := rows[0]
	num := func(i int) *float64 {
		v, err := strconv.ParseFloat(strings.TrimSpace(r[i]), 64)
		if err != nil {
			return nil
		}
		return &v
	}
	name := strings.TrimSpace(r[0])
	g.GPUName = str(truncate(name, 128))
	g.CoreTemperatureC = num(1)
	g.UtilizationPercent = num(2)
	g.FanSpeedPercent = num(3)
	if used := num(4); used != nil {
		g.VRAMUsedGB = f64(round(*used/1024, 2))
	}
	if total := num(5); total != nil {
		g.VRAMTotalGB = f64(round(*total/1024, 2))
	}
	g.BoardPowerW = num(6)
	return nil
}

// ------------------------------------------------------------------ temperature

// ThermalSource reads the ACPI thermal zone, which many PCs expose as the CPU
// temperature. It needs administrator rights (the service has them). PCs
// without it report null rather than a guess.
type ThermalSource struct{}

func (ThermalSource) Name() string { return "temperature" }

type thermalZone struct{ CurrentTemperature uint32 }

var zone = cached[float64]{ttl: 10 * time.Second}

func (ThermalSource) Collect(ctx context.Context, s *models.Snapshot) error {
	c := zone.get(func() (float64, bool) {
		var rows []thermalZone
		if err := wmiQuery(ctx, "SELECT CurrentTemperature FROM MSAcpi_ThermalZoneTemperature", &rows, `root\wmi`); err != nil {
			return 0, false
		}
		best := 0.0
		for _, r := range rows {
			// Tenths of a kelvin; ignore zones reporting nonsense.
			if c := float64(r.CurrentTemperature)/10 - 273.15; c > 5 && c < 125 && c > best {
				best = c
			}
		}
		return round(best, 1), best > 0
	})
	if c > 0 {
		s.CPU.CoreTemperatureC = f64(c)
	}
	return nil
}

// ------------------------------------------------------------------ WHEA

// WHEASource counts Windows hardware error (WHEA-Logger) events in the System
// log over the last 24 hours. Reading the log is slow, so it runs at most every 10 minutes, in the
// background, and the last count is reported in between.
type WHEASource struct {
	mu      sync.Mutex
	count   int
	at      time.Time
	running bool
}

func (*WHEASource) Name() string { return "whea" }

func (w *WHEASource) Collect(ctx context.Context, s *models.Snapshot) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if !w.running && (w.at.IsZero() || time.Since(w.at) > 10*time.Minute) {
		w.running = true
		go w.refresh()
	}
	s.RAM.WHEAErrorCount = w.count
	return nil
}

func (w *WHEASource) refresh() {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	var rows []struct{ RecordNumber uint32 }
	// The last 24 hours only: the alert rules count recent errors, and an old
	// one fixed long ago mustn't keep an alert open for ever.
	since := time.Now().UTC().Add(-24 * time.Hour).Format("20060102150405.000000+000")
	q := "SELECT RecordNumber FROM Win32_NTLogEvent WHERE Logfile = 'System' AND SourceName = 'Microsoft-Windows-WHEA-Logger' AND TimeGenerated >= '" + since + "'"
	err := wmiQuery2(ctx, q, &rows)
	w.mu.Lock()
	defer w.mu.Unlock()
	w.running, w.at = false, time.Now()
	if err == nil {
		w.count = len(rows)
	}
}

// wmiQuery2 is wmiQuery with the caller's (longer) deadline.
func wmiQuery2(ctx context.Context, query string, dst any) error {
	done := make(chan error, 1)
	go func() { done <- wmi.Query(query, dst) }()
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}
