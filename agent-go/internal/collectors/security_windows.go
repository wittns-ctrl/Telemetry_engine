//go:build windows

package collectors

import (
	"context"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v4/process"
	"github.com/yusufpapurcu/wmi"

	"lectio/agent/internal/models"
)

const (
	defenderNS      = `root\Microsoft\Windows\Defender`
	securityCenter  = `root\SecurityCenter2`
	securityEvery   = 2 * time.Minute
	threatHistory   = 30 * 24 * time.Hour
	maxThreats      = 20
	maxSuspicious   = 10
	neverScanned    = 4294967295 // Defender's "no scan yet" age
	defenderProduct = "Windows Defender"
)

// SecuritySource reads Microsoft Defender's status and threat history, other
// antivirus products, and Windows program names running from the wrong
// folder. That takes a few seconds, so it runs every 2 minutes in the
// background and the last result goes into every reading.
type SecuritySource struct {
	mu      sync.Mutex
	last    *models.Security
	at      time.Time
	running bool
}

func (*SecuritySource) Name() string { return "security" }

func (s *SecuritySource) Collect(ctx context.Context, snap *models.Snapshot) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.running && (s.at.IsZero() || time.Since(s.at) > securityEvery) {
		s.running = true
		go s.refresh()
	}
	snap.Security = s.last
	return nil
}

func (s *SecuritySource) refresh() {
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	sec := ReadSecurity(ctx)
	s.mu.Lock()
	defer s.mu.Unlock()
	s.running, s.at = false, time.Now()
	if sec != nil {
		s.last = sec
	}
}

type mpStatus struct {
	AMServiceEnabled              bool
	AntivirusEnabled              bool
	RealTimeProtectionEnabled     bool
	IsTamperProtected             bool
	AMRunningMode                 string
	AntivirusSignatureAge         uint32
	AntivirusSignatureVersion     string
	AntivirusSignatureLastUpdated time.Time
	QuickScanAge                  uint32
	QuickScanEndTime              time.Time
	FullScanAge                   uint32
	FullScanEndTime               time.Time
}

type mpThreat struct {
	ThreatID         int64
	ThreatName       string
	SeverityID       uint8
	IsActive         bool
	DidThreatExecute bool
}

type mpDetection struct {
	ThreatID             int64
	ThreatStatusID       uint8
	InitialDetectionTime time.Time
	Resources            []string
}

type avProduct struct {
	DisplayName  string `wmi:"displayName"`
	ProductState uint32 `wmi:"productState"`
}

// ReadSecurity gathers everything once. Parts that can't be read are left
// empty rather than guessed; nil only if nothing at all could be read.
func ReadSecurity(ctx context.Context) *models.Security {
	sec := &models.Security{CheckedAt: time.Now().UTC(), Threats: []models.Threat{}, SuspiciousProcesses: []models.SuspiciousProcess{}}
	gotAnything := false

	var status []mpStatus
	if err := wmiNS(ctx, "SELECT * FROM MSFT_MpComputerStatus", &status, defenderNS); err == nil && len(status) > 0 {
		gotAnything = true
		st := status[0]
		active := st.AMServiceEnabled && st.AntivirusEnabled && !strings.EqualFold(st.AMRunningMode, "Passive Mode")
		sec.DefenderActive = &active
		rtp := st.RealTimeProtectionEnabled
		sec.RealtimeProtection = &rtp
		tamper := st.IsTamperProtected
		sec.TamperProtected = &tamper
		sec.DefinitionsAgeDays = days(st.AntivirusSignatureAge)
		sec.DefinitionsVersion = st.AntivirusSignatureVersion
		sec.DefinitionsUpdatedAt = when(st.AntivirusSignatureLastUpdated)
		sec.QuickScanAgeDays = days(st.QuickScanAge)
		sec.LastQuickScanAt = when(st.QuickScanEndTime)
		sec.FullScanAgeDays = days(st.FullScanAge)
		sec.LastFullScanAt = when(st.FullScanEndTime)
		if active {
			sec.Antivirus = "Microsoft Defender"
		}
		sec.Threats = readThreats(ctx)
	}

	// Another antivirus switched on takes over from Defender.
	var products []avProduct
	if err := wmiNS(ctx, "SELECT displayName, productState FROM AntiVirusProduct", &products, securityCenter); err == nil {
		gotAnything = true
		for _, p := range products {
			on := (p.ProductState>>12)&0xF == 1
			if on && !strings.EqualFold(p.DisplayName, defenderProduct) {
				sec.Antivirus = p.DisplayName
				break
			}
		}
	}

	sec.SuspiciousProcesses = disguisedProcesses(ctx)
	if !gotAnything && len(sec.SuspiciousProcesses) == 0 {
		return nil
	}
	return sec
}

func readThreats(ctx context.Context) []models.Threat {
	var threats []mpThreat
	var detections []mpDetection
	if wmiNS(ctx, "SELECT ThreatID, ThreatName, SeverityID, IsActive, DidThreatExecute FROM MSFT_MpThreat", &threats, defenderNS) != nil ||
		wmiNS(ctx, "SELECT ThreatID, ThreatStatusID, InitialDetectionTime, Resources FROM MSFT_MpThreatDetection", &detections, defenderNS) != nil {
		return []models.Threat{}
	}
	byID := map[int64]mpThreat{}
	for _, t := range threats {
		byID[t.ThreatID] = t
	}
	sort.Slice(detections, func(i, j int) bool {
		return detections[i].InitialDetectionTime.After(detections[j].InitialDetectionTime)
	})
	since := time.Now().Add(-threatHistory)
	newest := map[int64]bool{} // a threat still active shows as active on its newest detection only
	out := []models.Threat{}
	for _, d := range detections {
		if d.InitialDetectionTime.Before(since) || len(out) >= maxThreats {
			break
		}
		t := byID[d.ThreatID]
		first := !newest[d.ThreatID]
		newest[d.ThreatID] = true
		out = append(out, models.Threat{
			Name:       clip(t.ThreatName, 120),
			Severity:   severityName(t.SeverityID),
			Status:     statusName(d.ThreatStatusID),
			Active:     first && t.IsActive,
			Executed:   t.DidThreatExecute,
			Path:       resourcePath(d.Resources),
			DetectedAt: d.InitialDetectionTime.UTC(),
		})
	}
	return out
}

// Windows' own programs and the folders they belong in. A process with one
// of these names running from anywhere else is a classic malware disguise.
var systemPrograms = map[string]bool{
	"svchost.exe": true, "csrss.exe": true, "lsass.exe": true, "smss.exe": true, "wininit.exe": true,
	"winlogon.exe": true, "services.exe": true, "spoolsv.exe": true, "taskhostw.exe": true, "dwm.exe": true,
	"conhost.exe": true, "lsm.exe": true, "rundll32.exe": true, "dllhost.exe": true, "ctfmon.exe": true,
	"sihost.exe": true, "fontdrvhost.exe": true, "explorer.exe": true, "taskmgr.exe": true, "ntoskrnl.exe": true,
}

func disguisedProcesses(ctx context.Context) []models.SuspiciousProcess {
	out := []models.SuspiciousProcess{}
	procs, err := process.ProcessesWithContext(ctx)
	if err != nil {
		return out
	}
	root := strings.ToLower(filepath.Clean(os.Getenv("SystemRoot")))
	if root == "." || root == "" {
		root = `c:\windows`
	}
	for _, p := range procs {
		name, err := p.NameWithContext(ctx)
		if err != nil || !systemPrograms[strings.ToLower(name)] {
			continue
		}
		exe, err := p.ExeWithContext(ctx)
		if err != nil || exe == "" {
			continue // protected processes don't say; never guess
		}
		if !inWindowsFolder(exe, root) {
			out = append(out, models.SuspiciousProcess{Name: name, Path: clip(exe, 260), PID: p.Pid})
			if len(out) >= maxSuspicious {
				break
			}
		}
	}
	return out
}

// inWindowsFolder: the program sits in Windows' own folders (System32,
// SysWOW64, WinSxS, or the Windows folder itself for explorer.exe).
func inWindowsFolder(exe, root string) bool {
	dir := strings.ToLower(filepath.Dir(filepath.Clean(exe)))
	if dir == root {
		return true
	}
	for _, sub := range []string{"system32", "syswow64", "winsxs", `systemapps`} {
		if dir == filepath.Join(root, sub) || strings.HasPrefix(dir, filepath.Join(root, sub)+`\`) {
			return true
		}
	}
	return false
}

func wmiNS(ctx context.Context, query string, dst any, namespace string) error {
	done := make(chan error, 1)
	go func() { done <- wmi.QueryNamespace(query, dst, namespace) }()
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func days(v uint32) *int {
	if v == neverScanned {
		return nil
	}
	n := int(v)
	return &n
}

func when(t time.Time) *time.Time {
	if t.IsZero() || t.Year() < 2000 {
		return nil
	}
	u := t.UTC()
	return &u
}

func severityName(id uint8) string {
	switch id {
	case 1:
		return "low"
	case 2:
		return "moderate"
	case 4:
		return "high"
	case 5:
		return "severe"
	}
	return "unknown"
}

func statusName(id uint8) string {
	switch id {
	case 1:
		return "detected"
	case 2:
		return "cleaned"
	case 3:
		return "quarantined"
	case 4:
		return "removed"
	case 5:
		return "allowed"
	case 6:
		return "blocked"
	case 102, 103, 104, 107:
		return "failed"
	case 105:
		return "abandoned"
	}
	return "unknown"
}

// resourcePath is the first affected item, without Defender's "file:_" style prefix.
func resourcePath(resources []string) string {
	if len(resources) == 0 {
		return ""
	}
	r := resources[0]
	if i := strings.Index(r, ":_"); i > 0 && i < 20 {
		r = r[i+2:]
	}
	return clip(strings.TrimPrefix(r, `\\?\`), 260)
}

func clip(s string, max int) string {
	if r := []rune(s); len(r) > max {
		return string(r[:max-1]) + "…"
	}
	return s
}
