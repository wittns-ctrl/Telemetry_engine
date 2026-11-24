package storage

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"lectio/agent/internal/models"
)

func batch(ids ...string) models.Batch {
	var b models.Batch
	for _, id := range ids {
		b.Readings = append(b.Readings, models.Reading{EventID: id, Snapshot: models.Snapshot{SensorID: "agent-test"}})
	}
	return b
}

func open(t *testing.T, maxBytes int64, maxAge time.Duration) *Buffer {
	t.Helper()
	b, err := Open(t.TempDir(), maxBytes, maxAge)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestReadingsComeBackOldestFirstAndGoOnlyWhenRemoved(t *testing.T) {
	b := open(t, 1<<20, time.Hour)
	for _, id := range []string{"a", "b", "c"} {
		if err := b.Put(batch(id)); err != nil {
			t.Fatal(err)
		}
	}
	items, err := b.Take(2)
	if err != nil || len(items) != 2 {
		t.Fatalf("take: %v, %d items", err, len(items))
	}
	if items[0].Batch.Readings[0].EventID != "a" || items[1].Batch.Readings[0].EventID != "b" {
		t.Fatal("not oldest first")
	}
	// Not removed yet: still there (e.g. the upload failed).
	again, _ := b.Take(10)
	if len(again) != 3 {
		t.Fatalf("expected 3 still buffered, got %d", len(again))
	}
	for _, it := range items {
		if err := b.Remove(it.Name); err != nil {
			t.Fatal(err)
		}
	}
	left, _ := b.Take(10)
	if len(left) != 1 || left[0].Batch.Readings[0].EventID != "c" {
		t.Fatal("wrong batch left")
	}
}

func TestBufferSurvivesARestart(t *testing.T) {
	dir := t.TempDir()
	b, _ := Open(dir, 1<<20, time.Hour)
	_ = b.Put(batch("kept"))
	// A crash mid-write leaves a .tmp file; it must be ignored and cleaned up.
	_ = os.WriteFile(filepath.Join(dir, "x.batch.json.tmp"), []byte("{half"), 0o600)

	reopened, err := Open(dir, 1<<20, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	items, _ := reopened.Take(10)
	if len(items) != 1 || items[0].Batch.Readings[0].EventID != "kept" {
		t.Fatal("reading lost across restart")
	}
	if tmps, _ := filepath.Glob(filepath.Join(dir, "*.tmp")); len(tmps) != 0 {
		t.Fatal("half-written file left behind")
	}
}

func TestSizeLimitDropsTheOldest(t *testing.T) {
	probe := open(t, 1<<20, time.Hour)
	_ = probe.Put(batch("probe"))
	one := probe.Stats().Bytes

	b := open(t, one*3+one/2, time.Hour) // room for 3
	for i := 0; i < 5; i++ {
		_ = b.Put(batch(fmt.Sprintf("r%d", i)))
	}
	st := b.Stats()
	if st.Batches != 3 || st.DroppedForSpace != 2 {
		t.Fatalf("stats %+v", st)
	}
	items, _ := b.Take(10)
	if items[0].Batch.Readings[0].EventID != "r2" {
		t.Fatalf("oldest kept is %s, want r2", items[0].Batch.Readings[0].EventID)
	}
	if st.Bytes > one*3+one/2 {
		t.Fatal("over the size limit")
	}
}

func TestAgeLimitDropsOldReadings(t *testing.T) {
	b := open(t, 1<<20, time.Hour)
	now := time.Now()
	b.now = func() time.Time { return now.Add(-2 * time.Hour) }
	_ = b.Put(batch("stale"))
	b.now = func() time.Time { return now }
	_ = b.Put(batch("fresh"))
	items, _ := b.Take(10)
	if len(items) != 1 || items[0].Batch.Readings[0].EventID != "fresh" {
		t.Fatal("stale reading not dropped")
	}
}

func TestDamagedFilesAreRemovedNotSentForever(t *testing.T) {
	dir := t.TempDir()
	b, _ := Open(dir, 1<<20, time.Hour)
	name := fmt.Sprintf("%020d-000001.batch.json", time.Now().Add(-time.Minute).UnixNano())
	_ = os.WriteFile(filepath.Join(dir, name), []byte("not json"), 0o600)
	_ = b.Put(batch("good"))
	items, _ := b.Take(10)
	if len(items) != 1 || b.Stats().Corrupt != 1 {
		t.Fatalf("items=%d stats=%+v", len(items), b.Stats())
	}
}

func TestTakeRespectsTheReadingLimitButAlwaysReturnsOne(t *testing.T) {
	b := open(t, 1<<20, time.Hour)
	_ = b.Put(batch("a", "b", "c"))
	_ = b.Put(batch("d"))
	items, _ := b.Take(2) // the first batch alone is over the limit: still sent
	if len(items) != 1 || len(items[0].Batch.Readings) != 3 {
		t.Fatal("expected just the first batch")
	}
}

func TestRemoveRefusesPaths(t *testing.T) {
	b := open(t, 1<<20, time.Hour)
	if b.Remove(`..\agent.json`) == nil || b.Remove("agent.json") == nil {
		t.Fatal("removed a file outside the buffer")
	}
}
