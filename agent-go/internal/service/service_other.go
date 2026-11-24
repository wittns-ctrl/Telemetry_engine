//go:build !windows

// Package service: only Windows is supported so far. Linux (a systemd unit
// running "lectio-agent run") and macOS (a launchd plist) can implement the
// same functions here.
package service

import (
	"context"
	"errors"
)

const Name = "LectioAgent"

var errUnsupported = errors.New("installing as a background service is only supported on Windows so far; use: lectio-agent run")

func IsService() bool                           { return false }
func IsAdmin() bool                             { return true }
func RelaunchElevated([]string) error           { return errUnsupported }
func Install() error                            { return errUnsupported }
func Uninstall() error                          { return errUnsupported }
func Start() error                              { return errUnsupported }
func Stop() error                               { return errUnsupported }
func State() (string, error)                    { return "", errUnsupported }
func InstalledExe() string                      { return "" }
func Run(func(ctx context.Context) error) error { return errUnsupported }
