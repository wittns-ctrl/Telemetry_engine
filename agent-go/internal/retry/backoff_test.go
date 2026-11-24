package retry

import (
	"context"
	"testing"
	"time"
)

func TestBackoffGrowsToTheCapWithJitter(t *testing.T) {
	b := New(time.Second, 8*time.Second)
	b.rand = func(n int64) int64 { return n - 1 } // the top of each range
	var got []time.Duration
	for i := 0; i < 6; i++ {
		got = append(got, b.Next().Round(time.Second))
	}
	want := []time.Duration{1, 2, 4, 8, 8, 8}
	for i := range want {
		if got[i] != want[i]*time.Second {
			t.Fatalf("attempt %d: %v, want %vs (all %v)", i, got[i], want[i], got)
		}
	}
	b.rand = func(int64) int64 { return 0 } // the bottom: half the ceiling, never zero
	b.Reset()
	if d := b.Next(); d != 500*time.Millisecond {
		t.Fatalf("after reset: %v", d)
	}
}

func TestSleepStopsWhenCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	start := time.Now()
	if Sleep(ctx, time.Hour) {
		t.Fatal("slept through a cancel")
	}
	if time.Since(start) > time.Second {
		t.Fatal("didn't return promptly")
	}
}
