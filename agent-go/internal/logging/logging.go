// Package logging sets up structured (JSON) logs with rotation.
//
// Logs go to <data folder>\logs\agent.log, rotated at 10 MB, keeping 5 old
// files for at most 14 days (compressed). In console mode they are also
// printed to the terminal in a readable form.
package logging

import (
	"context"
	"io"
	"log/slog"
	"os"
	"path/filepath"

	"gopkg.in/natefinch/lumberjack.v2"
)

const (
	maxSizeMB  = 10
	maxBackups = 5
	maxAgeDays = 14
)

// Setup returns a logger writing to dir/logs/agent.log, and the closer for it.
func Setup(dir, level string, console bool) (*slog.Logger, io.Closer, error) {
	logDir := filepath.Join(dir, "logs")
	if err := os.MkdirAll(logDir, 0o700); err != nil {
		return nil, nil, err
	}
	file := &lumberjack.Logger{
		Filename:   filepath.Join(logDir, "agent.log"),
		MaxSize:    maxSizeMB,
		MaxBackups: maxBackups,
		MaxAge:     maxAgeDays,
		Compress:   true,
	}
	opts := &slog.HandlerOptions{Level: ParseLevel(level)}
	var handler slog.Handler = slog.NewJSONHandler(file, opts)
	if console {
		handler = fanout{handler, slog.NewTextHandler(os.Stderr, opts)}
	}
	return slog.New(handler), file, nil
}

func ParseLevel(level string) slog.Level {
	switch level {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// fanout sends each record to two handlers (file and console).
type fanout [2]slog.Handler

func (f fanout) Enabled(ctx context.Context, l slog.Level) bool {
	return f[0].Enabled(ctx, l) || f[1].Enabled(ctx, l)
}

func (f fanout) Handle(ctx context.Context, r slog.Record) error {
	var first error
	for _, h := range f {
		if h.Enabled(ctx, r.Level) {
			if err := h.Handle(ctx, r.Clone()); err != nil && first == nil {
				first = err
			}
		}
	}
	return first
}

func (f fanout) WithAttrs(attrs []slog.Attr) slog.Handler {
	return fanout{f[0].WithAttrs(attrs), f[1].WithAttrs(attrs)}
}

func (f fanout) WithGroup(name string) slog.Handler {
	return fanout{f[0].WithGroup(name), f[1].WithGroup(name)}
}
