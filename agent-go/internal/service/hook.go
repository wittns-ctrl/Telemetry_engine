package service

import "sync"

// The power hook is told when the PC is shutting down ("shutdown"), going
// to sleep or hibernating ("sleep", which includes Windows' Fast Startup), or
// the agent is being stopped ("stop"). It runs before the agent stops, so it
// must return within a few seconds.
var (
	hookMu sync.Mutex
	hook   func(reason string)
)

func SetPowerHook(f func(reason string)) {
	hookMu.Lock()
	defer hookMu.Unlock()
	hook = f
}

func callPowerHook(reason string) {
	hookMu.Lock()
	f := hook
	hookMu.Unlock()
	if f != nil {
		f(reason)
	}
}
