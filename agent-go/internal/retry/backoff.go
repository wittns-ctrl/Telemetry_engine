// Package retry computes waits between retries: exponential backoff with
// "full jitter" (a random wait up to the current ceiling), so many agents
// coming back after an outage don't all retry at the same moment.
package retry

import (
	"context"
	"math/rand/v2"
	"time"
)

type Backoff struct {
	Base     time.Duration // first ceiling
	Max      time.Duration // ceiling never grows past this
	attempts int
	rand     func(n int64) int64
}

func New(base, max time.Duration) *Backoff {
	return &Backoff{Base: base, Max: max, rand: rand.Int64N}
}

// Next returns how long to wait before the next try, and counts the attempt.
func (b *Backoff) Next() time.Duration {
	ceiling := b.Base
	for i := 0; i < b.attempts && ceiling < b.Max; i++ {
		ceiling *= 2
	}
	if ceiling > b.Max {
		ceiling = b.Max
	}
	b.attempts++
	// At least half the ceiling, so retries are never immediate.
	half := int64(ceiling / 2)
	return time.Duration(half + b.rand(half+1))
}

// Reset starts over after a success.
func (b *Backoff) Reset() { b.attempts = 0 }

func (b *Backoff) Attempts() int { return b.attempts }

// Sleep waits d, or returns false early if ctx is cancelled.
func Sleep(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}
