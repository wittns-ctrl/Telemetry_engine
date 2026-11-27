//go:build windows

package notify

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"

	"lectio/agent/internal/usersession"
)

// ShowOnPC shows the note to whoever is signed in at the PC's screen. The
// service runs in session 0, which has no screen, so it starts a copy of
// itself ("lectio-agent notify ...") as the signed-in person; run in a
// window ("lectio-agent run"), it shows the notification directly.
func ShowOnPC(n Note) error {
	if !usersession.InService() {
		return Toast(n)
	}
	_, err := usersession.Start([]string{"notify", EncodeNote(n)}, 0)
	return err
}

// EncodeNote and DecodeNote carry a note on the command line of the helper.
func EncodeNote(n Note) string {
	data, _ := json.Marshal(n)
	return base64.RawURLEncoding.EncodeToString(data)
}

func DecodeNote(s string) (Note, error) {
	var n Note
	data, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return n, err
	}
	err = json.Unmarshal(data, &n)
	return n, err
}

// Toast shows the notification as the current user. Windows' notification
// API is reached through PowerShell (built into Windows), with the note's
// XML passed as base64 so no text can turn into a command.
func Toast(n Note) error {
	icon, err := register()
	if err != nil {
		return fmt.Errorf("registering Lectio for notifications: %w", err)
	}
	xmlB64 := base64.StdEncoding.EncodeToString([]byte(ToastXML(n, icon)))
	tag := n.AlertID
	if !alertID.MatchString(tag) {
		tag = "lectio"
	}
	script := strings.Join([]string{
		`$ErrorActionPreference = 'Stop'`,
		`[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]`,
		`[void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]`,
		`$x = New-Object Windows.Data.Xml.Dom.XmlDocument`,
		`$x.LoadXml([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('` + xmlB64 + `')))`,
		`$t = [Windows.UI.Notifications.ToastNotification]::new($x)`,
		`$t.Tag = '` + tag[:min(len(tag), 16)] + `'`,
		`[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('` + AppID + `').Show($t)`,
	}, "\n")
	encoded := base64.StdEncoding.EncodeToString(utf16le(script))

	ps := filepath.Join(os.Getenv("SystemRoot"), "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, ps, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
		"-WindowStyle", "Hidden", "-EncodedCommand", encoded)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if len(msg) > 300 {
			msg = msg[:300]
		}
		return fmt.Errorf("showing the notification: %v %s", err, msg)
	}
	return nil
}

// register names Lectio (with its logo) to Windows for this user, so the
// notification says "Lectio" instead of "Windows PowerShell". Returns the
// logo's path.
func register() (string, error) {
	dir := filepath.Join(os.Getenv("LOCALAPPDATA"), "Lectio")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	icon := filepath.Join(dir, "lectio-notification.png")
	data := IconPNG(128)
	if old, err := os.ReadFile(icon); err != nil || !bytes.Equal(old, data) {
		if err := os.WriteFile(icon, data, 0o644); err != nil {
			return "", err
		}
	}
	k, _, err := registry.CreateKey(registry.CURRENT_USER, `Software\Classes\AppUserModelId\`+AppID, registry.SET_VALUE)
	if err != nil {
		return "", err
	}
	defer k.Close()
	if err := k.SetStringValue("DisplayName", "Lectio"); err != nil {
		return "", err
	}
	if err := k.SetExpandStringValue("IconUri", icon); err != nil {
		return "", err
	}
	if err := k.SetStringValue("IconBackgroundColor", "FFFFFFFF"); err != nil {
		return "", err
	}
	return icon, nil
}

func utf16le(s string) []byte {
	u := windows.StringToUTF16(s)
	u = u[:len(u)-1] // no terminating zero
	b := make([]byte, len(u)*2)
	for i, c := range u {
		b[2*i], b[2*i+1] = byte(c), byte(c>>8)
	}
	return b
}
