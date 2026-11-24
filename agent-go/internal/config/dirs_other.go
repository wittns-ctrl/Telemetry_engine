//go:build !windows

package config

import (
	"fmt"
	"os"
)

// Linux (systemd) and macOS (launchd) support can build on this: the data
// folder below and file permissions of 0700/0600 stand in for Windows ACLs.
// There is no OS key store here yet, so the key is only protected by those
// permissions.

func defaultDir() string { return "/var/lib/lectio" }

func EnsureDir(dir string) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("creating %s: %w", dir, err)
	}
	return os.Chmod(dir, 0o700)
}

func protect(plain []byte) ([]byte, error)    { return append([]byte(nil), plain...), nil }
func unprotect(sealed []byte) ([]byte, error) { return append([]byte(nil), sealed...), nil }
