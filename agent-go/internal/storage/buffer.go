// Package storage is the agent's on-disk buffer of readings not yet accepted
// by the server.
//
// Every batch is written to its own file before anything is sent, so readings
// survive network outages, server errors, restarts and crashes. A file is
// deleted only after the server has accepted the batch (or reported it as
// already stored). The buffer is capped by total size and by age: when it is
// full, the oldest batches go first, so it can never fill the disk.
package storage

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"lectio/agent/internal/models"
)

const suffix = ".batch.json"

type Buffer struct {
	dir      string
	maxBytes int64
	maxAge   time.Duration
	now      func() time.Time

	mu      sync.Mutex
	seq     uint64
	dropped atomic.Int64 // batches deleted unsent because of the limits
	corrupt atomic.Int64
}

type Item struct {
	Name  string
	Batch models.Batch
	Bytes int64
}

type Stats struct {
	Batches         int   `json:"batches"`
	Bytes           int64 `json:"bytes"`
	DroppedForSpace int64 `json:"dropped_over_limit"`
	Corrupt         int64 `json:"corrupt_removed"`
}

// Open creates (if needed) and opens the buffer folder.
func Open(dir string, maxBytes int64, maxAge time.Duration) (*Buffer, error) {
	if maxBytes <= 0 || maxAge <= 0 {
		return nil, errors.New("buffer limits must be positive")
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, fmt.Errorf("creating buffer folder: %w", err)
	}
	// Half-written files from a crash mid-write.
	tmps, _ := filepath.Glob(filepath.Join(dir, "*.tmp"))
	for _, t := range tmps {
		_ = os.Remove(t)
	}
	return &Buffer{dir: dir, maxBytes: maxBytes, maxAge: maxAge, now: time.Now}, nil
}

// Put stores a batch durably, then trims the buffer to its limits.
func (b *Buffer) Put(batch models.Batch) error {
	if len(batch.Readings) == 0 {
		return nil
	}
	data, err := json.Marshal(batch)
	if err != nil {
		return err
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.seq++
	name := fmt.Sprintf("%020d-%06d%s", b.now().UnixNano(), b.seq%1_000_000, suffix)
	path := filepath.Join(b.dir, name)
	if err := writeSynced(path+".tmp", data); err != nil {
		return fmt.Errorf("buffering readings: %w", err)
	}
	if err := os.Rename(path+".tmp", path); err != nil {
		return fmt.Errorf("buffering readings: %w", err)
	}
	return b.trimLocked()
}

func writeSynced(path string, data []byte) error {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}

type entry struct {
	name  string
	size  int64
	stamp time.Time
}

func (b *Buffer) listLocked() ([]entry, error) {
	dirents, err := os.ReadDir(b.dir)
	if err != nil {
		return nil, err
	}
	var out []entry
	for _, d := range dirents {
		if d.IsDir() || !strings.HasSuffix(d.Name(), suffix) {
			continue
		}
		info, err := d.Info()
		if err != nil {
			continue
		}
		out = append(out, entry{d.Name(), info.Size(), stampOf(d.Name(), info.ModTime())})
	}
	// Names start with a zero-padded timestamp, so name order is time order.
	sort.Slice(out, func(i, j int) bool { return out[i].name < out[j].name })
	return out, nil
}

func stampOf(name string, fallback time.Time) time.Time {
	if i := strings.IndexByte(name, '-'); i > 0 {
		if ns, err := strconv.ParseInt(name[:i], 10, 64); err == nil {
			return time.Unix(0, ns)
		}
	}
	return fallback
}

// trimLocked deletes batches past the age limit, then the oldest ones until
// the buffer fits its size limit.
func (b *Buffer) trimLocked() error {
	entries, err := b.listLocked()
	if err != nil {
		return err
	}
	var total int64
	for _, e := range entries {
		total += e.size
	}
	cutoff := b.now().Add(-b.maxAge)
	for _, e := range entries {
		if total <= b.maxBytes && !e.stamp.Before(cutoff) {
			break
		}
		if err := os.Remove(filepath.Join(b.dir, e.name)); err == nil || errors.Is(err, os.ErrNotExist) {
			total -= e.size
			b.dropped.Add(1)
		}
	}
	return nil
}

// Oldest returns the oldest buffered batch, or ok=false when there is none.
// Files that can't be read as a batch are removed (and counted).
func (b *Buffer) Oldest() (item Item, ok bool, err error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if err := b.trimLocked(); err != nil {
		return Item{}, false, err
	}
	entries, err := b.listLocked()
	if err != nil {
		return Item{}, false, err
	}
	for _, e := range entries {
		path := filepath.Join(b.dir, e.name)
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var batch models.Batch
		if json.Unmarshal(data, &batch) != nil || len(batch.Readings) == 0 {
			_ = os.Remove(path)
			b.corrupt.Add(1)
			continue
		}
		return Item{Name: e.name, Batch: batch, Bytes: e.size}, true, nil
	}
	return Item{}, false, nil
}

// Take returns the oldest buffered batches holding at most maxReadings
// readings in all (always at least one batch when any exist), oldest first.
// Readings are buffered as they're taken, so while the PC is online this is
// usually one reading; after an outage it gathers a full batch to catch up.
func (b *Buffer) Take(maxReadings int) ([]Item, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if err := b.trimLocked(); err != nil {
		return nil, err
	}
	entries, err := b.listLocked()
	if err != nil {
		return nil, err
	}
	var items []Item
	count := 0
	for _, e := range entries {
		path := filepath.Join(b.dir, e.name)
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var batch models.Batch
		if json.Unmarshal(data, &batch) != nil || len(batch.Readings) == 0 {
			_ = os.Remove(path)
			b.corrupt.Add(1)
			continue
		}
		if len(items) > 0 && count+len(batch.Readings) > maxReadings {
			break
		}
		items = append(items, Item{Name: e.name, Batch: batch, Bytes: e.size})
		count += len(batch.Readings)
		if count >= maxReadings {
			break
		}
	}
	return items, nil
}

// Remove deletes a batch once the server has it.
func (b *Buffer) Remove(name string) error {
	if strings.ContainsAny(name, `/\`) || !strings.HasSuffix(name, suffix) {
		return fmt.Errorf("not a buffer file: %q", name)
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	err := os.Remove(filepath.Join(b.dir, name))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func (b *Buffer) Stats() Stats {
	b.mu.Lock()
	entries, _ := b.listLocked()
	b.mu.Unlock()
	s := Stats{Batches: len(entries), DroppedForSpace: b.dropped.Load(), Corrupt: b.corrupt.Load()}
	for _, e := range entries {
		s.Bytes += e.size
	}
	return s
}
