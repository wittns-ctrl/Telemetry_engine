package fixes

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"time"
)

// ClearTempFiles deletes files in dir last changed before cutoff, then empty
// folders. Files in use (Windows refuses) are left alone and counted.
// Links are never followed, so nothing outside dir is touched.
func ClearTempFiles(dir string, cutoff time.Time) (string, error) {
	info, err := os.Lstat(dir)
	if err != nil || !info.IsDir() {
		return "", fail("Couldn't find the temporary files folder.")
	}
	var freed int64
	removed, skipped := 0, 0
	var dirs []string
	_ = filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			skipped++
			if d != nil && d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		if d.Type()&fs.ModeSymlink != 0 || d.Type()&fs.ModeIrregular != 0 {
			if d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		if d.IsDir() {
			if path != dir {
				dirs = append(dirs, path)
			}
			return nil
		}
		fi, err := d.Info()
		if err != nil || fi.ModTime().After(cutoff) {
			return nil
		}
		if os.Remove(path) == nil {
			freed += fi.Size()
			removed++
		} else {
			skipped++
		}
		return nil
	})
	// Deepest folders first, so emptied parents can go too.
	sort.Slice(dirs, func(i, j int) bool { return len(dirs[i]) > len(dirs[j]) })
	for _, d := range dirs {
		_ = os.Remove(d) // fails harmlessly unless empty
	}
	if removed == 0 {
		return "There were no old temporary files to clear.", nil
	}
	note := ""
	if skipped > 0 {
		note = fmt.Sprintf(" %d in use were left alone.", skipped)
	}
	return fmt.Sprintf("Done. Cleared %d temporary files and freed %s.%s", removed, humanSize(freed), note), nil
}

func humanSize(n int64) string {
	f := float64(n)
	for _, unit := range []string{"bytes", "KB", "MB", "GB"} {
		if f < 1024 || unit == "GB" {
			if unit == "bytes" {
				return fmt.Sprintf("%.0f %s", f, unit)
			}
			return fmt.Sprintf("%.1f %s", f, unit)
		}
		f /= 1024
	}
	return ""
}
