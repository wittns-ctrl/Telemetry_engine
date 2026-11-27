//go:build windows

package locate

import (
	"context"
	"testing"
	"time"
)

func TestWindowsAnswers(t *testing.T) {
	at := time.Now()
	cases := map[string]psAnswer{
		"off":         {Status: "Disabled", Permission: "Granted"},
		"unavailable": {Status: "NoData", Permission: "Granted", Known: false},
	}
	for want, a := range cases {
		if got := fromAnswer(a, at).Status; got != want {
			t.Errorf("%+v: got %s, want %s", a, got, want)
		}
	}
	if f := fromAnswer(psAnswer{Status: "Ready", Permission: "Denied", Known: true, Lat: 1, Lon: 1}, at); f.Status != "off" {
		t.Errorf("denied permission must read as off, got %s", f.Status)
	}
	if f := fromAnswer(psAnswer{Status: "Ready", Permission: "Granted", Known: true, Lat: -1.95, Lon: 30.06, Acc: 69}, at); f.Status != "ok" {
		t.Errorf("a good answer must read as ok, got %s", f.Status)
	}
}

// Asks this PC's Windows Location for real; logs the status and accuracy, never the position.
func TestReadOnThisPC(t *testing.T) {
	if testing.Short() {
		t.Skip("asks Windows Location")
	}
	f, err := Read(context.Background())
	if err != nil {
		t.Skipf("Windows Location didn't answer: %v", err)
	}
	t.Logf("status=%s accuracy=%.0f m valid=%v", f.Status, f.AccuracyM, f.Valid())
	if f.Status == "ok" && !f.Valid() {
		t.Fatal("an ok answer with an impossible position")
	}
}
