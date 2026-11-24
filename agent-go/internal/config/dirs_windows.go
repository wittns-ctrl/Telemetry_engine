//go:build windows

package config

import (
	"fmt"
	"os"
	"path/filepath"
	"unsafe"

	"golang.org/x/sys/windows"
)

func defaultDir() string {
	base := os.Getenv("ProgramData")
	if base == "" {
		base = `C:\ProgramData`
	}
	return filepath.Join(base, "Lectio")
}

// Only SYSTEM and Administrators may read or change the agent's files: the
// folder holds the device key, the reading buffer and the fix undo records.
// P = don't inherit looser permissions from ProgramData; OICI = applies to files inside.
const folderSDDL = "D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)"

// EnsureDir creates the data folder and locks its permissions down.
func EnsureDir(dir string) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("creating %s: %w", dir, err)
	}
	if os.Getenv("LECTIO_DATA_DIR") != "" {
		return nil // tests and custom folders keep their own permissions
	}
	sd, err := windows.SecurityDescriptorFromString(folderSDDL)
	if err != nil {
		return err
	}
	dacl, _, err := sd.DACL()
	if err != nil {
		return err
	}
	err = windows.SetNamedSecurityInfo(dir, windows.SE_FILE_OBJECT,
		windows.DACL_SECURITY_INFORMATION|windows.PROTECTED_DACL_SECURITY_INFORMATION, nil, nil, dacl, nil)
	if err != nil {
		return fmt.Errorf("restricting access to %s: %w", dir, err)
	}
	return nil
}

// protect encrypts with DPAPI in machine scope, so the service (SYSTEM) and an
// administrator running "lectio-agent link" can both read it, and a copy of
// the file taken to another PC can't.
func protect(plain []byte) ([]byte, error) {
	return dpapi(plain, true)
}

func unprotect(sealed []byte) ([]byte, error) {
	return dpapi(sealed, false)
}

func dpapi(data []byte, encrypt bool) ([]byte, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("nothing to encrypt")
	}
	in := windows.DataBlob{Size: uint32(len(data)), Data: &data[0]}
	var out windows.DataBlob
	const flags = windows.CRYPTPROTECT_LOCAL_MACHINE | windows.CRYPTPROTECT_UI_FORBIDDEN
	var err error
	if encrypt {
		err = windows.CryptProtectData(&in, nil, nil, 0, nil, flags, &out)
	} else {
		err = windows.CryptUnprotectData(&in, nil, nil, 0, nil, flags, &out)
	}
	if err != nil {
		return nil, err
	}
	defer windows.LocalFree(windows.Handle(unsafe.Pointer(out.Data)))
	return append([]byte(nil), unsafe.Slice(out.Data, out.Size)...), nil
}
