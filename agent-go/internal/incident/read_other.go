//go:build !windows

package incident

import (
	"context"
	"time"
)

// ReadWindows: only Windows keeps these records.
func ReadWindows(context.Context, time.Time) ([]Event, error) { return nil, nil }
