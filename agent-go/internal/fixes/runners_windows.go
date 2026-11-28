//go:build windows

package fixes

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unicode/utf16"
	"unsafe"

	"github.com/shirou/gopsutil/v4/process"
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"
)

const (
	balancedPlan = "381b4222-f694-41f0-9685-ff5bb260df2e"
	runKey       = `Software\Microsoft\Windows\CurrentVersion\Run`
	approvalWait = 5 * time.Minute
)

// WindowsRunner carries out fixes. As a service it runs as LocalSystem, so
// admin repairs need no extra prompt; per-user changes (temporary files,
// startup apps) are made for the person signed in at the PC.
type WindowsRunner struct{}

func NewRunner() Runner { return WindowsRunner{} }

func (WindowsRunner) Run(fixID string, p map[string]any) (string, map[string]any, error) {
	switch fixID {
	case "cool_down":
		return coolDown(p["minutes"].(int), p["max_percent"].(int))
	case "balanced_power":
		return balancedPower()
	case "clear_temp_files":
		dir, err := userTempDir()
		if err != nil {
			return "", nil, err
		}
		msg, err := ClearTempFiles(dir, time.Now().Add(-24*time.Hour))
		return msg, nil, err
	case "close_app":
		msg, err := closeApp(p["process"].(string))
		return msg, nil, err
	case "disable_startup_app":
		return disableStartupApp(p["name"].(string))
	case "restart_service":
		msg, err := restartService(p["service"].(string))
		return msg, nil, err
	case "repair_system_files":
		msg, err := repairSystemFiles()
		return msg, nil, err
	case "check_disk":
		msg, err := checkDisk()
		return msg, nil, err
	case "defender_quick_scan":
		msg, err := defenderQuickScan()
		return msg, nil, err
	case "defender_full_scan":
		msg, err := defenderFullScan()
		return msg, nil, err
	case "defender_update":
		msg, err := defenderUpdate()
		return msg, nil, err
	case "defender_remove_threats":
		msg, err := defenderRemoveThreats()
		return msg, nil, err
	case AIScript:
		msg, err := runAIScript(p["script"].(string))
		return msg, nil, err
	}
	return "", nil, fail("This PC's Lectio doesn't know that fix.")
}

func (WindowsRunner) Undo(fixID string, u map[string]any) (string, error) {
	switch fixID {
	case "cool_down":
		ac, dc := num(u["ac"]), num(u["dc"])
		if ac < 5 || ac > 100 || dc < 5 || dc > 100 {
			return "", fail("The previous processor setting wasn't recorded properly.")
		}
		if err := setThrottle(ac, dc); err != nil {
			return "", err
		}
		return "The processor is back to its normal speed.", nil
	case "balanced_power":
		plan, _ := u["plan"].(string)
		if !guid.MatchString(plan) {
			return "", fail("The previous power plan wasn't recorded properly.")
		}
		if _, err := run("powercfg", "/setactive", plan); err != nil {
			return "", err
		}
		return "Your previous power plan is back.", nil
	case "disable_startup_app":
		return undoDisableStartupApp(u)
	}
	return "", fail("This fix can't be undone.")
}

func num(v any) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	}
	return -1
}

// run starts a fixed Windows program with fixed arguments (never anything
// from the server) without a window, and returns its output.
func run(program string, args ...string) (string, error) {
	return runTimeout(time.Minute, program, args...)
}

func runTimeout(timeout time.Duration, program string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	path := filepath.Join(os.Getenv("SystemRoot"), "System32", program+".exe")
	cmd := exec.CommandContext(ctx, path, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW}
	out, err := cmd.CombinedOutput()
	text := decodeOutput(out)
	if ctx.Err() != nil {
		return text, fail("The repair took too long and was stopped.")
	}
	if err != nil {
		if _, isExit := err.(*exec.ExitError); isExit {
			return text, fail("%s", firstLine(text, program+" failed"))
		}
		return text, fail("Windows couldn't run %s: %v", program, err)
	}
	return text, nil
}

// decodeOutput handles sfc's UTF-16 output as well as plain console text.
func decodeOutput(b []byte) string {
	if len(b) >= 2 && (b[1] == 0 || (b[0] == 0xff && b[1] == 0xfe)) {
		u := make([]uint16, 0, len(b)/2)
		for i := 0; i+1 < len(b); i += 2 {
			u = append(u, uint16(b[i])|uint16(b[i+1])<<8)
		}
		return strings.TrimPrefix(string(utf16.Decode(u)), string(rune(0xFEFF)))
	}
	return string(b)
}

func firstLine(s, fallback string) string {
	for _, line := range strings.Split(s, "\n") {
		if l := strings.TrimSpace(line); l != "" {
			if len(l) > 300 {
				l = l[:300]
			}
			return l
		}
	}
	return fallback
}

// ------------------------------------------------------------------ cool down

var throttleIndex = regexp.MustCompile(`Current (AC|DC) Power Setting Index:\s*0x([0-9a-fA-F]+)`)

func throttleValues() (ac, dc int, err error) {
	out, err := run("powercfg", "/query", "SCHEME_CURRENT", "SUB_PROCESSOR", "PROCTHROTTLEMAX")
	if err != nil {
		return 0, 0, err
	}
	ac, dc = -1, -1
	for _, m := range throttleIndex.FindAllStringSubmatch(out, -1) {
		v, _ := strconv.ParseInt(m[2], 16, 32)
		if m[1] == "AC" {
			ac = int(v)
		} else {
			dc = int(v)
		}
	}
	if ac < 0 {
		return 0, 0, fail("Couldn't read the processor's power setting.")
	}
	if dc < 0 {
		dc = ac
	}
	return ac, dc, nil
}

func setThrottle(ac, dc int) error {
	steps := [][]string{
		{"/setacvalueindex", "SCHEME_CURRENT", "SUB_PROCESSOR", "PROCTHROTTLEMAX", strconv.Itoa(ac)},
		{"/setdcvalueindex", "SCHEME_CURRENT", "SUB_PROCESSOR", "PROCTHROTTLEMAX", strconv.Itoa(dc)},
		{"/setactive", "SCHEME_CURRENT"},
	}
	for _, args := range steps {
		if _, err := run("powercfg", args...); err != nil {
			return err
		}
	}
	return nil
}

func coolDown(minutes, limit int) (string, map[string]any, error) {
	ac, dc, err := throttleValues()
	if err != nil {
		return "", nil, err
	}
	if err := setThrottle(min(ac, limit), min(dc, limit)); err != nil {
		_ = setThrottle(ac, dc) // half-applied: put back what was there
		return "", nil, err
	}
	revertAt := float64(time.Now().Add(time.Duration(minutes) * time.Minute).Unix())
	msg := fmt.Sprintf("Done. The processor is limited to %d%% for %d minutes, then goes back to normal.", limit, minutes)
	return msg, map[string]any{"ac": float64(ac), "dc": float64(dc), "revert_at": revertAt}, nil
}

// ------------------------------------------------------------------ power plan

var guid = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
var guidIn = regexp.MustCompile(`(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`)

func balancedPower() (string, map[string]any, error) {
	out, err := run("powercfg", "/getactivescheme")
	if err != nil {
		return "", nil, err
	}
	before := strings.ToLower(guidIn.FindString(out))
	if before == "" {
		return "", nil, fail("Couldn't read the current power plan.")
	}
	if before == balancedPlan {
		return "Your PC is already on the Balanced power plan.", nil, nil
	}
	if _, err := run("powercfg", "/setactive", balancedPlan); err != nil {
		return "", nil, err
	}
	return "Done. Your PC is on the Balanced power plan.", map[string]any{"plan": before}, nil
}

// ------------------------------------------------------------------ close an app

func closeApp(name string) (string, error) {
	if ProtectedProcesses[strings.ToLower(name)] {
		return "", fail("%s is part of Windows and can't be closed.", name)
	}
	procs, err := process.Processes()
	if err != nil {
		return "", fail("Couldn't list running programs.")
	}
	me := int32(os.Getpid())
	var targets []*process.Process
	for _, p := range procs {
		if n, err := p.Name(); err == nil && strings.EqualFold(n, name) && p.Pid != me {
			targets = append(targets, p)
		}
	}
	if len(targets) == 0 {
		return fmt.Sprintf("%s wasn't running any more.", name), nil
	}
	for _, p := range targets {
		_ = p.Terminate()
	}
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		alive := 0
		for _, p := range targets {
			if ok, _ := p.IsRunning(); ok {
				alive++
			}
		}
		if alive == 0 {
			return fmt.Sprintf("Done. Closed %s.", name), nil
		}
		time.Sleep(300 * time.Millisecond)
	}
	return "", fail("Windows wouldn't let Lectio close %s.", name)
}

// ------------------------------------------------------------------ startup apps

// userRunKey opens the signed-in person's Run key (HKEY_USERS\<their SID>\...).
// In console mode it's simply the current user's.
func userRunKey(access uint32) (registry.Key, error) {
	sid, err := activeUserSID()
	if err != nil {
		return registry.OpenKey(registry.CURRENT_USER, runKey, access)
	}
	return registry.OpenKey(registry.USERS, sid+`\`+runKey, access)
}

func disableStartupApp(name string) (string, map[string]any, error) {
	k, err := userRunKey(registry.QUERY_VALUE | registry.SET_VALUE)
	if err != nil {
		return "", nil, fail("Windows wouldn't open the startup apps list.")
	}
	defer k.Close()
	value, kind, err := k.GetStringValue(name)
	if err != nil {
		return "", nil, fail("Couldn't find %s among the apps that start with Windows.", name)
	}
	if err := k.DeleteValue(name); err != nil {
		return "", nil, fail("Windows wouldn't change the startup apps: %v", err)
	}
	return fmt.Sprintf("Done. %s won't start with Windows any more.", name),
		map[string]any{"name": name, "value": value, "type": float64(kind)}, nil
}

func undoDisableStartupApp(u map[string]any) (string, error) {
	name, _ := u["name"].(string)
	value, _ := u["value"].(string)
	if !startupName.MatchString(name) {
		return "", fail("The startup entry wasn't recorded properly.")
	}
	k, err := userRunKey(registry.SET_VALUE)
	if err != nil {
		return "", fail("Windows wouldn't open the startup apps list.")
	}
	defer k.Close()
	if num(u["type"]) == registry.EXPAND_SZ {
		err = k.SetExpandStringValue(name, value)
	} else {
		err = k.SetStringValue(name, value)
	}
	if err != nil {
		return "", fail("Windows wouldn't change the startup apps: %v", err)
	}
	return fmt.Sprintf("%s will start with Windows again.", name), nil
}

// ------------------------------------------------------------------ services

func restartService(name string) (string, error) {
	label, ok := RestartableServices[name]
	if !ok {
		return "", fail("Lectio doesn't restart that service.")
	}
	m, err := mgr.Connect()
	if err != nil {
		return "", fail("Restarting services needs administrator rights (the Lectio service has them).")
	}
	defer m.Disconnect()
	s, err := m.OpenService(name)
	if err != nil {
		return "", fail("Couldn't find the %s service.", label)
	}
	defer s.Close()
	if st, err := s.Query(); err == nil && st.State != svc.Stopped {
		if _, err := s.Control(svc.Stop); err != nil {
			return "", fail("Windows wouldn't stop %s.", label)
		}
		deadline := time.Now().Add(30 * time.Second)
		for {
			st, err := s.Query()
			if err == nil && st.State == svc.Stopped {
				break
			}
			if time.Now().After(deadline) {
				return "", fail("%s didn't stop in time.", label)
			}
			time.Sleep(500 * time.Millisecond)
		}
	}
	if err := s.Start(); err != nil {
		return "", fail("Windows couldn't start %s again.", label)
	}
	return fmt.Sprintf("Done. %s was restarted.", label), nil
}

// ------------------------------------------------------------------ admin repairs

func repairSystemFiles() (string, error) {
	out, _ := runTimeout(time.Hour, "sfc", "/scannow")
	text := strings.ToLower(strings.Join(strings.Fields(out), " "))
	switch {
	case strings.Contains(text, "did not find any integrity violations"):
		return "Windows checked its system files and found nothing wrong.", nil
	case strings.Contains(text, "successfully repaired"):
		return "Windows found damaged system files and repaired them. Restart your PC to finish.", nil
	case strings.Contains(text, "unable to fix"):
		return "", fail("Windows found damaged system files it couldn't repair. A technician may need to look at it.")
	case strings.Contains(text, "must be an administrator"):
		return "", fail("Repairing system files needs administrator rights (the Lectio service has them).")
	}
	return "", fail("The system file check didn't finish. Try again later.")
}

func checkDisk() (string, error) {
	drive := os.Getenv("SystemDrive")
	if drive == "" {
		drive = "C:"
	}
	out, _ := runTimeout(time.Hour, "chkdsk", drive, "/scan")
	text := strings.ToLower(strings.Join(strings.Fields(out), " "))
	switch {
	case strings.Contains(text, "found no problems"):
		return fmt.Sprintf("Windows checked drive %s and found no problems.", drive), nil
	case strings.Contains(text, "found problems"), strings.Contains(text, "errors found"):
		return fmt.Sprintf("Windows found problems on drive %s. Back up your files, then restart to let Windows repair it.", drive), nil
	}
	return "", fail("The drive check didn't finish. Try again later.")
}

// ------------------------------------------------------------------ signed-in user

// activeUserToken is the token of the person signed in at the PC's screen.
// Only a service (LocalSystem) may ask for it; elsewhere it fails.
func activeUserToken() (windows.Token, error) {
	session := windows.WTSGetActiveConsoleSessionId()
	if session == 0xFFFFFFFF {
		return 0, fmt.Errorf("nobody is signed in")
	}
	var token windows.Token
	if err := windows.WTSQueryUserToken(session, &token); err != nil {
		return 0, err
	}
	return token, nil
}

func activeUserSID() (string, error) {
	token, err := activeUserToken()
	if err != nil {
		return "", err
	}
	defer token.Close()
	user, err := token.GetTokenUser()
	if err != nil {
		return "", err
	}
	return user.User.Sid.String(), nil
}

// userTempDir is the signed-in person's temporary folder (in console mode, ours).
func userTempDir() (string, error) {
	token, err := activeUserToken()
	if err != nil {
		return os.TempDir(), nil
	}
	defer token.Close()
	profile, err := token.GetUserProfileDirectory()
	if err != nil || profile == "" {
		return "", fail("Couldn't find the signed-in user's folders.")
	}
	return filepath.Join(profile, "AppData", "Local", "Temp"), nil
}

// ------------------------------------------------------------------ asking

var procWTSSendMessage = windows.NewLazySystemDLL("wtsapi32.dll").NewProc("WTSSendMessageW")

// AskOnPC shows a Yes/No box on the signed-in person's screen (from the
// service too, via Remote Desktop Services). It counts as "no" if nobody
// answers within 5 minutes or nobody is signed in.
func AskOnPC(title, text string) bool {
	session := windows.WTSGetActiveConsoleSessionId()
	if session == 0xFFFFFFFF {
		return false
	}
	t, _ := windows.UTF16FromString("Lectio: " + title)
	m, _ := windows.UTF16FromString(text)
	// MB_YESNO | MB_ICONQUESTION | MB_DEFBUTTON2 (No is the default) | MB_TOPMOST | MB_SETFOREGROUND
	const style = 0x4 | 0x20 | 0x100 | 0x40000 | 0x10000
	var response uint32
	r, _, _ := procWTSSendMessage.Call(
		0, // WTS_CURRENT_SERVER_HANDLE
		uintptr(session),
		uintptr(unsafe.Pointer(&t[0])), uintptr((len(t)-1)*2),
		uintptr(unsafe.Pointer(&m[0])), uintptr((len(m)-1)*2),
		style, uintptr(approvalWait.Seconds()),
		uintptr(unsafe.Pointer(&response)), 1, // wait for the answer
	)
	return r != 0 && response == 6 // IDYES
}
