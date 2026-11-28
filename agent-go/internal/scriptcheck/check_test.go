package scriptcheck

import "testing"

func TestTheSharedExamples(t *testing.T) {
	ok, bad := Examples()
	if len(ok) < 5 || len(bad) < 10 {
		t.Fatal("rules.json lost its examples")
	}
	for _, s := range ok {
		if r := Check(s); !r.OK {
			t.Errorf("should run: %q\n  refused: %s", s, r.Reason)
		}
	}
	for _, s := range bad {
		if r := Check(s); r.OK {
			t.Errorf("should be refused: %q", s)
		}
	}
}

func TestReadOnly(t *testing.T) {
	if r := Check("Get-Process | Sort-Object CPU -Descending | Select-Object -First 5"); !r.OK || !r.ReadOnly {
		t.Errorf("looking at processes changes nothing: %+v", r)
	}
	if r := Check("Restart-Service -Name Spooler"); !r.OK || r.ReadOnly {
		t.Errorf("restarting a service changes something: %+v", r)
	}
	if r := Check("$p = Get-Process chrome\n$p.PriorityClass = 'BelowNormal'"); !r.OK || r.ReadOnly {
		t.Errorf("setting a property changes something: %+v", r)
	}
}

func TestLimits(t *testing.T) {
	long := ""
	for i := 0; i < 31; i++ {
		long += "Get-Date\n"
	}
	if Check(long).OK || Check("   ").OK {
		t.Error("too long and empty scripts must be refused")
	}
}
