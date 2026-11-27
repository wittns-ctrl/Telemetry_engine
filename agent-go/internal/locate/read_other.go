//go:build !windows

package locate

import (
	"context"
	"errors"
	"time"
)

var errUnsupported = errors.New("location is only read on Windows")

func Read(context.Context) (Fix, error) { return Fix{}, errUnsupported }
func WriteFix(context.Context) error    { return errUnsupported }

func FindOnPC(context.Context) (Fix, error) {
	return Fix{Status: "unavailable", At: time.Now()}, nil
}
