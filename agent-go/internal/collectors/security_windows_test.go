//go:build windows

package collectors

import (
	"context"
	"testing"
	"time"
)

// Reads this PC's real Defender status. Skips where Windows says nothing.
func TestReadSecurityOnThisPC(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	sec := ReadSecurity(ctx)
	if sec == nil {
		t.Skip("no security information on this PC")
	}
	if sec.DefenderActive != nil && *sec.DefenderActive && sec.DefinitionsVersion == "" {
		t.Fatalf("Defender is on but reported no definitions: %+v", sec)
	}
	for _, th := range sec.Threats {
		if th.Name == "" || th.DetectedAt.IsZero() || th.Status == "" {
			t.Fatalf("incomplete threat %+v", th)
		}
	}
	t.Logf("antivirus=%q realtime=%v defs=%v quickScanAge=%v threats=%d suspicious=%d",
		sec.Antivirus, deref(sec.RealtimeProtection), derefI(sec.DefinitionsAgeDays), derefI(sec.QuickScanAgeDays),
		len(sec.Threats), len(sec.SuspiciousProcesses))
	for i, th := range sec.Threats {
		if i < 3 {
			t.Logf("  %s %s %s active=%v %s", th.DetectedAt.Format(time.RFC3339), th.Status, th.Name, th.Active, th.Path)
		}
	}
}

func TestWindowsFolders(t *testing.T) {
	root := `c:\windows`
	for path, want := range map[string]bool{
		`C:\Windows\System32\svchost.exe`:         true,
		`C:\Windows\explorer.exe`:                 true,
		`C:\Windows\SysWOW64\rundll32.exe`:        true,
		`C:\Users\HP\AppData\Roaming\svchost.exe`: false,
		`C:\Windows\System32Fake\svchost.exe`:     false,
		`D:\sysvolume\csrss.exe`:                  false,
	} {
		if got := inWindowsFolder(path, root); got != want {
			t.Errorf("%s: got %v", path, got)
		}
	}
}

func deref(b *bool) any {
	if b == nil {
		return nil
	}
	return *b
}
func derefI(i *int) any {
	if i == nil {
		return nil
	}
	return *i
}
