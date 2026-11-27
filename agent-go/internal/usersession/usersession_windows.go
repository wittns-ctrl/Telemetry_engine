//go:build windows

// Package usersession runs a copy of the agent as the person signed in at
// the PC's screen. The service runs in session 0, which has no desktop and no
// user: showing a notification or asking Windows for the PC's location both
// need the signed-in person's session.
package usersession

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

var ErrNobodySignedIn = errors.New("nobody is signed in at the PC")

// InService reports whether this process runs in session 0 (as the service).
func InService() bool {
	var session uint32
	if err := windows.ProcessIdToSessionId(windows.GetCurrentProcessId(), &session); err != nil {
		return true
	}
	return session == 0
}

func signedInToken() (windows.Token, error) {
	session := windows.WTSGetActiveConsoleSessionId()
	if session == 0xFFFFFFFF {
		return 0, ErrNobodySignedIn
	}
	var token windows.Token
	if err := windows.WTSQueryUserToken(session, &token); err != nil {
		return 0, fmt.Errorf("%w: %v", ErrNobodySignedIn, err)
	}
	return token, nil
}

// Start runs "lectio-agent <args...>" as the signed-in person without a
// window. With wait > 0 it waits up to that long for it to finish and
// returns its exit code; otherwise it returns at once.
func Start(args []string, wait time.Duration) (int, error) {
	token, err := signedInToken()
	if err != nil {
		return -1, err
	}
	defer token.Close()

	exe, err := os.Executable()
	if err != nil {
		return -1, err
	}
	line := `"` + exe + `"`
	for _, a := range args {
		if strings.ContainsAny(a, " \t\"") {
			return -1, fmt.Errorf("argument %q needs no quoting", a) // callers pass plain words and base64
		}
		line += " " + a
	}
	cmdline, err := windows.UTF16PtrFromString(line)
	if err != nil {
		return -1, err
	}
	var env *uint16
	if err := windows.CreateEnvironmentBlock(&env, token, false); err != nil {
		return -1, err
	}
	defer windows.DestroyEnvironmentBlock(env)

	desktop, _ := windows.UTF16PtrFromString(`winsta0\default`)
	si := windows.StartupInfo{Cb: uint32(unsafe.Sizeof(windows.StartupInfo{})), Desktop: desktop}
	var pi windows.ProcessInformation
	const flags = windows.CREATE_NO_WINDOW | windows.CREATE_UNICODE_ENVIRONMENT
	if err := windows.CreateProcessAsUser(token, nil, cmdline, nil, nil, false, flags, env, nil, &si, &pi); err != nil {
		return -1, fmt.Errorf("starting it for the signed-in person: %w", err)
	}
	defer windows.CloseHandle(pi.Process)
	windows.CloseHandle(pi.Thread)
	if wait <= 0 {
		return 0, nil
	}
	if ev, _ := windows.WaitForSingleObject(pi.Process, uint32(wait.Milliseconds())); ev != windows.WAIT_OBJECT_0 {
		_ = windows.TerminateProcess(pi.Process, 1)
		return -1, errors.New("it took too long and was stopped")
	}
	var code uint32
	if err := windows.GetExitCodeProcess(pi.Process, &code); err != nil {
		return -1, err
	}
	return int(code), nil
}

// LocalAppData is the signed-in person's %LOCALAPPDATA% (when run as that
// person, our own).
func LocalAppData() (string, error) {
	if !InService() {
		if d := os.Getenv("LOCALAPPDATA"); d != "" {
			return d, nil
		}
	}
	token, err := signedInToken()
	if err != nil {
		return "", err
	}
	defer token.Close()
	profile, err := token.GetUserProfileDirectory()
	if err != nil || profile == "" {
		return "", errors.New("couldn't find the signed-in person's folders")
	}
	return filepath.Join(profile, "AppData", "Local"), nil
}
