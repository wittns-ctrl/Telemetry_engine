//go:build !windows

package notify

import (
	"encoding/base64"
	"encoding/json"
	"errors"
)

var errUnsupported = errors.New("notifications are only shown on Windows")

func ShowOnPC(Note) error { return errUnsupported }
func Toast(Note) error    { return errUnsupported }

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
