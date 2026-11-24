package auth

import (
	"context"
	"fmt"
	"testing"

	"lectio/agent/internal/api"
	"lectio/agent/internal/config"
	"lectio/agent/internal/models"
)

type fakeAPI struct {
	goodPassword string
	logins       int
	registered   models.RegisterRequest
	registerErr  error
}

func (f *fakeAPI) Health(context.Context) error { return nil }
func (f *fakeAPI) Login(_ context.Context, email, password string) (string, error) {
	f.logins++
	if password != f.goodPassword {
		return "", &api.StatusError{Code: 401}
	}
	return "token", nil
}
func (f *fakeAPI) Register(_ context.Context, token string, req models.RegisterRequest) (models.RegisterResponse, error) {
	f.registered = req
	if f.registerErr != nil {
		return models.RegisterResponse{}, f.registerErr
	}
	return models.RegisterResponse{Device: models.Device{ID: "dev1", DeviceName: req.DeviceName}, DeviceKey: "the-device-key-123456"}, nil
}

type scripted struct{ passwords []string }

func (s *scripted) Email() (string, error) { return "me@example.com", nil }
func (s *scripted) Password() (string, error) {
	if len(s.passwords) == 0 {
		return "", fmt.Errorf("no more passwords")
	}
	p := s.passwords[0]
	s.passwords = s.passwords[1:]
	return p, nil
}
func (s *scripted) Country() (string, error) { return " Rwanda ", nil }
func (s *scripted) Say(string, ...any)       {}

func TestLinkRetriesAWrongPasswordThenStoresTheKey(t *testing.T) {
	f := &fakeAPI{goodPassword: "right"}
	cfg := config.Defaults()
	err := Link(context.Background(), f, &cfg, &scripted{passwords: []string{"wrong", "right"}},
		Options{DeviceName: "Office PC", MachineID: "machine-id-abcdef", AskCountry: true})
	if err != nil {
		t.Fatal(err)
	}
	if f.logins != 2 || cfg.DeviceID != "dev1" || cfg.SystemUUID != "machine-id-abcdef" {
		t.Fatalf("logins=%d cfg=%+v", f.logins, cfg)
	}
	if key, _ := cfg.DeviceKey(); key != "the-device-key-123456" {
		t.Fatal("key not stored")
	}
	if f.registered.Country == nil || *f.registered.Country != "Rwanda" {
		t.Fatal("country not sent")
	}
}

func TestLinkGivesUpAfterThreeWrongPasswords(t *testing.T) {
	f := &fakeAPI{goodPassword: "right"}
	cfg := config.Defaults()
	err := Link(context.Background(), f, &cfg, &scripted{passwords: []string{"a", "b", "c", "right"}}, Options{DeviceName: "PC"})
	if err == nil || f.logins != 3 || cfg.Linked() {
		t.Fatalf("err=%v logins=%d", err, f.logins)
	}
}

func TestRelinkingKeepsTheSameMachineID(t *testing.T) {
	f := &fakeAPI{goodPassword: "pw"}
	cfg := config.Defaults()
	cfg.SystemUUID = "already-linked-uuid"
	_ = Link(context.Background(), f, &cfg, &scripted{passwords: []string{"pw"}}, Options{DeviceName: "PC", MachineID: "other"})
	if f.registered.SystemUUID != "already-linked-uuid" {
		t.Fatal("re-linking created a new device")
	}
}

func TestPCLinkedElsewhereIsExplained(t *testing.T) {
	f := &fakeAPI{goodPassword: "pw", registerErr: &api.StatusError{Code: 409}}
	cfg := config.Defaults()
	err := Link(context.Background(), f, &cfg, &scripted{passwords: []string{"pw"}}, Options{DeviceName: "PC"})
	if err == nil || cfg.Linked() {
		t.Fatal("expected a clear error")
	}
}
