package collectors

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/mem"
	psnet "github.com/shirou/gopsutil/v4/net"
	"github.com/shirou/gopsutil/v4/process"

	"lectio/agent/internal/models"
)

// ------------------------------------------------------------------ CPU

// CPUSource: utilization, clock speed, uptime.
type CPUSource struct {
	maxMHz float64
}

func (CPUSource) Name() string { return "cpu" }

func (c *CPUSource) Collect(ctx context.Context, s *models.Snapshot) error {
	// Interval 0: usage since the previous call (the first call: since boot).
	pct, err := cpu.PercentWithContext(ctx, 0, false)
	if err != nil {
		return err
	}
	if len(pct) > 0 {
		s.CPU.UtilizationPercent = f64(round(pct[0], 1))
	}
	if c.maxMHz == 0 {
		if info, err := cpu.InfoWithContext(ctx); err == nil && len(info) > 0 {
			c.maxMHz = info[0].Mhz
		}
	}
	if mhz := currentMHz(ctx); mhz > 0 {
		s.CPU.ClockSpeedGHz = f64(round(mhz/1000, 2))
	} else if c.maxMHz > 0 {
		s.CPU.ClockSpeedGHz = f64(round(c.maxMHz/1000, 2))
	}
	if up, err := host.UptimeWithContext(ctx); err == nil {
		s.CPU.UptimeSeconds = i64(int64(up))
	}
	return nil
}

// ------------------------------------------------------------------ memory

// MemorySource: RAM, pagefile and committed memory, process/thread/handle counts.
type MemorySource struct{}

func (MemorySource) Name() string { return "memory" }

func (MemorySource) Collect(ctx context.Context, s *models.Snapshot) error {
	vm, err := mem.VirtualMemoryWithContext(ctx)
	if err != nil {
		return err
	}
	s.RAM.UsagePercent = f64(round(vm.UsedPercent, 1))
	s.RAM.UsedGB = f64(round(float64(vm.Used)/gib, 2))
	s.RAM.TotalGB = f64(round(float64(vm.Total)/gib, 2))
	if sw, err := mem.SwapMemoryWithContext(ctx); err == nil && sw.Total > 0 {
		s.RAM.PagefileUsagePercent = f64(round(sw.UsedPercent, 1))
	}
	systemCounts(s) // platform-specific: commit charge and object counts
	return nil
}

// ------------------------------------------------------------------ disks

// DiskSource: capacity of each fixed drive, and read/write speed and active time across all disks.
type DiskSource struct {
	read, write rate
	busyMS      rate
}

func (DiskSource) Name() string { return "disk" }

func (d *DiskSource) Collect(ctx context.Context, s *models.Snapshot) error {
	parts, err := disk.PartitionsWithContext(ctx, false)
	if err != nil {
		return err
	}
	seen := map[string]bool{}
	for _, p := range parts {
		if seen[p.Mountpoint] || !fixedDrive(p) {
			continue
		}
		seen[p.Mountpoint] = true
		u, err := disk.UsageWithContext(ctx, p.Mountpoint)
		if err != nil || u.Total == 0 {
			continue
		}
		s.Storage = append(s.Storage, models.Storage{
			DeviceName:          str(p.Mountpoint),
			TotalCapacityGB:     f64(round(float64(u.Total)/gib, 1)),
			AvailableCapacityGB: f64(round(float64(u.Free)/gib, 1)),
		})
		if len(s.Storage) >= 64 { // the API's limit
			break
		}
	}
	io, err := disk.IOCountersWithContext(ctx)
	if err != nil {
		return nil // capacities are still useful
	}
	var rd, wr, busy uint64
	for _, c := range io {
		rd += c.ReadBytes
		wr += c.WriteBytes
		busy += c.ReadTime + c.WriteTime // milliseconds spent on requests
	}
	now := time.Now()
	s.Disk.ReadBytesPerS = d.read.next(rd, now)
	s.Disk.WriteBytesPerS = d.write.next(wr, now)
	if msPerS := d.busyMS.next(busy, now); msPerS != nil && len(io) > 0 {
		active := *msPerS / 10 / float64(len(io)) // ms per second -> percent, averaged over disks
		if active > 100 {
			active = 100
		}
		s.Disk.ActivePercent = f64(round(active, 1))
	}
	return nil
}

func fixedDrive(p disk.PartitionStat) bool {
	for _, opt := range p.Opts {
		if strings.EqualFold(opt, "removable") || strings.EqualFold(opt, "cdrom") {
			return false
		}
	}
	return p.Fstype != "" && !strings.EqualFold(p.Fstype, "cdfs") && !strings.EqualFold(p.Fstype, "udf")
}

// ------------------------------------------------------------------ network

// NetworkSource: the busiest adapter's name and download/upload speed.
type NetworkSource struct {
	rx, tx  map[string]*rate
	current string
}

func (NetworkSource) Name() string { return "network" }

func (n *NetworkSource) Collect(ctx context.Context, s *models.Snapshot) error {
	counters, err := psnet.IOCountersWithContext(ctx, true)
	if err != nil {
		return err
	}
	if n.rx == nil {
		n.rx, n.tx = map[string]*rate{}, map[string]*rate{}
	}
	now := time.Now()
	best, bestTotal := "", -1.0
	speeds := map[string][2]*float64{}
	for _, c := range counters {
		if skipAdapter(c.Name) {
			continue
		}
		if n.rx[c.Name] == nil {
			n.rx[c.Name], n.tx[c.Name] = &rate{}, &rate{}
		}
		r, t := n.rx[c.Name].next(c.BytesRecv, now), n.tx[c.Name].next(c.BytesSent, now)
		speeds[c.Name] = [2]*float64{r, t}
		total := float64(c.BytesRecv + c.BytesSent)
		if r != nil && t != nil {
			total = *r + *t // busiest right now, once rates are known
		}
		if total > bestTotal {
			best, bestTotal = c.Name, total
		}
	}
	if best == "" {
		return nil
	}
	n.current = best
	s.Network.AdapterName = str(truncate(best, 128))
	s.Network.ReceiveBytesPerS, s.Network.SendBytesPerS = speeds[best][0], speeds[best][1]
	if mbps := linkSpeedMbps(ctx, best); mbps > 0 {
		s.Network.LinkSpeedMbps = f64(mbps)
	}
	return nil
}

func skipAdapter(name string) bool {
	l := strings.ToLower(name)
	for _, skip := range []string{"loopback", "isatap", "teredo", "pseudo", "vethernet", "bluetooth"} {
		if strings.Contains(l, skip) {
			return true
		}
	}
	return false
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

// ------------------------------------------------------------------ processes

// ProcessSource: the programs using the most CPU right now (Task Manager's
// Processes tab). Only names, ids and resource use are read: never command
// lines, window titles, files or anything else personal.
type ProcessSource struct {
	Top   int
	last  map[int32]procSample
	at    time.Time
	cores int
}

type procSample struct {
	cpu     float64 // seconds of CPU used so far
	ioBytes uint64
	created int64
}

func (ProcessSource) Name() string { return "processes" }

func (p *ProcessSource) Collect(ctx context.Context, s *models.Snapshot) error {
	if p.Top <= 0 {
		return nil
	}
	if p.cores == 0 {
		if n, err := cpu.CountsWithContext(ctx, true); err == nil && n > 0 {
			p.cores = n
		} else {
			p.cores = 1
		}
	}
	procs, err := process.ProcessesWithContext(ctx)
	if err != nil {
		return err
	}
	now := time.Now()
	wall := now.Sub(p.at).Seconds()
	next := make(map[int32]procSample, len(procs))
	type usage struct {
		proc *process.Process
		pct  float64
	}
	var busy []usage
	for _, pr := range procs {
		if pr.Pid == 0 || pr.Pid == 4 { // idle and kernel
			continue
		}
		t, err := pr.TimesWithContext(ctx)
		if err != nil {
			continue
		}
		created, _ := pr.CreateTimeWithContext(ctx)
		sample := procSample{cpu: t.User + t.System, created: created}
		next[pr.Pid] = sample
		prev, ok := p.last[pr.Pid]
		if !ok || prev.created != created || wall <= 0 {
			continue // new process (or a reused pid): no rate yet
		}
		pct := (sample.cpu - prev.cpu) / (wall * float64(p.cores)) * 100
		if pct > 0 {
			busy = append(busy, usage{pr, pct})
		}
	}
	sort.Slice(busy, func(i, j int) bool { return busy[i].pct > busy[j].pct })
	if len(busy) > p.Top {
		busy = busy[:p.Top]
	}
	for _, u := range busy {
		name, err := u.proc.NameWithContext(ctx)
		if err != nil || name == "" {
			continue
		}
		entry := models.Process{Name: truncate(name, 128), PID: u.proc.Pid, CPUPercent: round(min(u.pct, 100), 1)}
		if m, err := u.proc.MemoryInfoWithContext(ctx); err == nil {
			entry.MemoryMB = f64(round(float64(m.RSS)/(1<<20), 1))
		}
		if io, err := u.proc.IOCountersWithContext(ctx); err == nil {
			total := io.ReadBytes + io.WriteBytes
			if prev, ok := p.last[u.proc.Pid]; ok && prev.ioBytes > 0 && total >= prev.ioBytes && wall > 0 {
				entry.DiskBytesPerS = f64(round(float64(total-prev.ioBytes)/wall, 1))
			}
			sample := next[u.proc.Pid]
			sample.ioBytes = total
			next[u.proc.Pid] = sample
		}
		s.Processes = append(s.Processes, entry)
	}
	p.last, p.at = next, now
	return nil
}

// ------------------------------------------------------------------ helpers

// DefaultSources is every source for this platform, in collection order.
func DefaultSources(topProcesses int) []Source {
	sources := []Source{&CPUSource{}, MemorySource{}, &DiskSource{}, &NetworkSource{}, &ProcessSource{Top: topProcesses}}
	return append(sources, platformSources()...)
}

// Describe returns a one-line OS description for linking (e.g. "Windows 11 Pro 10.0.26200 (amd64)").
func Describe(ctx context.Context) string {
	info, err := host.InfoWithContext(ctx)
	if err != nil {
		return ""
	}
	return truncate(fmt.Sprintf("%s %s (%s)", info.Platform, info.PlatformVersion, info.KernelArch), 256)
}

// MachineID returns a stable id for this PC (the OS's own machine id).
func MachineID(ctx context.Context) string {
	id, err := host.HostIDWithContext(ctx)
	if err != nil {
		return ""
	}
	return id
}
