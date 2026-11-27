//go:build !windows

package usersession

import (
	"errors"
	"os"
	"time"
)

var ErrNobodySignedIn = errors.New("nobody is signed in at the PC")

func InService() bool { return false }

func Start([]string, time.Duration) (int, error) {
	return -1, errors.New("only on Windows")
}

func LocalAppData() (string, error) {
	if d := os.Getenv("LOCALAPPDATA"); d != "" {
		return d, nil
	}
	return os.UserCacheDir()
}
