// Package auth links the PC to a Lectio account.
//
// Linking signs in once with the account's email and password, registers the
// PC (POST /devices/register) and stores the device key it gets back
// (encrypted, see package config). The password is used for that one request
// and never stored. After that the agent only ever sends the device key.
package auth

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"strings"

	"lectio/agent/internal/api"
	"lectio/agent/internal/config"
	"lectio/agent/internal/models"
)

// Prompter asks the person linking the PC for their details.
type Prompter interface {
	Email() (string, error)
	Password() (string, error)
	Country() (string, error)
	Say(format string, args ...any)
}

type Linker interface {
	Health(ctx context.Context) error
	Login(ctx context.Context, email, password string) (string, error)
	Register(ctx context.Context, token string, req models.RegisterRequest) (models.RegisterResponse, error)
}

type Options struct {
	DeviceName string // shown on the dashboard
	OSInfo     string
	MachineID  string // the OS's machine id, reused as system_uuid
	Country    string // asked for when empty and AskCountry is set
	AskCountry bool
}

const signInTries = 3

// Link signs in, registers this PC and stores its key in cfg (the caller saves cfg).
func Link(ctx context.Context, c Linker, cfg *config.Config, p Prompter, opt Options) error {
	if err := c.Health(ctx); err != nil {
		return fmt.Errorf("couldn't reach Lectio at %s: %w", cfg.APIURL, err)
	}
	p.Say("Sign in with your Lectio account to link this PC (%s).", cfg.APIURL)
	p.Say("Your password is only used now and is never saved.")

	var token string
	for attempt := 1; ; attempt++ {
		email, err := p.Email()
		if err != nil {
			return err
		}
		password, err := p.Password()
		if err != nil {
			return err
		}
		token, err = c.Login(ctx, strings.TrimSpace(email), password)
		if err == nil {
			break
		}
		var se *api.StatusError
		if errors.As(err, &se) && (se.Code == 400 || se.Code == 401 || se.Code == 403) && attempt < signInTries {
			p.Say("That email and password didn't work. Please try again.")
			continue
		}
		return fmt.Errorf("sign-in failed: %w", err)
	}

	country := opt.Country
	if country == "" && opt.AskCountry {
		c, err := p.Country()
		if err != nil {
			return err
		}
		country = strings.TrimSpace(c)
	}

	systemUUID := cfg.SystemUUID
	if systemUUID == "" {
		systemUUID = opt.MachineID
	}
	if len(systemUUID) < 8 {
		systemUUID = randomUUID()
	}
	req := models.RegisterRequest{DeviceName: opt.DeviceName, SystemUUID: systemUUID, OSInfo: opt.OSInfo}
	if country != "" {
		req.Country = &country
	}
	resp, err := c.Register(ctx, token, req)
	if err != nil {
		var se *api.StatusError
		if errors.As(err, &se) && se.Code == 409 {
			return errors.New("this PC is already linked to another Lectio account; remove it there first")
		}
		return fmt.Errorf("linking this PC failed: %w", err)
	}
	if err := cfg.SetDeviceKey(resp.DeviceKey); err != nil {
		return err
	}
	cfg.SystemUUID = systemUUID
	cfg.DeviceID = resp.Device.ID
	cfg.DeviceName = resp.Device.DeviceName
	p.Say("Linked '%s' to your account.", resp.Device.DeviceName)
	return nil
}

func randomUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}
