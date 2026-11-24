//go:build !windows

package collectors

import (
	"context"

	"lectio/agent/internal/models"
)

// Other systems get the portable gopsutil readings only for now. Linux could
// add hwmon temperatures and nvidia-smi here.

func platformSources() []Source                     { return nil }
func currentMHz(context.Context) float64            { return 0 }
func systemCounts(*models.Snapshot)                 {}
func linkSpeedMbps(context.Context, string) float64 { return 0 }
