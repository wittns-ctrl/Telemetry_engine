package config

import (
	"os"
	"strings"
	"testing"
)

func TestDefaultsAreValid(t *testing.T) {
	c := Defaults()
	if err := c.Validate(); err != nil {
		t.Fatal(err)
	}
}

func TestPlainHTTPOnlyForLocalhost(t *testing.T) {
	for api, ok := range map[string]bool{
		"https://api.example.com": true,
		"http://localhost:8000":   true,
		"http://127.0.0.1:8000":   true,
		"http://api.example.com":  false,
		"ftp://api.example.com":   false,
		"not a url":               false,
	} {
		c := Defaults()
		c.APIURL = api
		if err := c.Validate(); (err == nil) != ok {
			t.Errorf("%s: valid=%v, want %v (%v)", api, err == nil, ok, err)
		}
	}
}

func TestLimitsAreChecked(t *testing.T) {
	cases := []func(*Config){
		func(c *Config) { c.IntervalSeconds = 0 },
		func(c *Config) { c.IntervalSeconds = 301 },
		func(c *Config) { c.BatchSize = 101 },
		func(c *Config) { c.BufferMaxMB = 0 },
		func(c *Config) { c.BufferMaxDays = 31 },
		func(c *Config) { c.LogLevel = "loud" },
	}
	for i, change := range cases {
		c := Defaults()
		change(&c)
		if c.Validate() == nil {
			t.Errorf("case %d: invalid setting accepted", i)
		}
	}
}

func TestEnvironmentOverridesFile(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("LECTIO_DATA_DIR", dir)
	c := Defaults()
	c.IntervalSeconds = 10
	if err := c.Save(dir); err != nil {
		t.Fatal(err)
	}
	t.Setenv("LECTIO_INTERVAL_SECONDS", "3")
	t.Setenv("LECTIO_FIXES", "off")
	got, err := Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	if got.IntervalSeconds != 3 || got.FixesEnabled {
		t.Fatalf("env not applied: %+v", got)
	}
	t.Setenv("LECTIO_INTERVAL_SECONDS", "soon")
	if _, err := Load(dir); err == nil {
		t.Fatal("bad number accepted")
	}
}

func TestDeviceKeyIsStoredEncrypted(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("LECTIO_DATA_DIR", dir)
	c := Defaults()
	const key = "super-secret-device-key-123456"
	if err := c.SetDeviceKey(key); err != nil {
		t.Fatal(err)
	}
	if err := c.Save(dir); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(Path(dir))
	if strings.Contains(string(raw), key) && isWindows() {
		t.Fatal("device key saved in plain text")
	}
	loaded, err := Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	got, err := loaded.DeviceKey()
	if err != nil || got != key {
		t.Fatalf("key round trip: %q, %v", got, err)
	}
}

func TestUnlinkedHasNoKey(t *testing.T) {
	c := Defaults()
	if c.Linked() {
		t.Fatal("fresh config claims to be linked")
	}
	if _, err := c.DeviceKey(); err == nil {
		t.Fatal("expected an error")
	}
}

func TestUseServerDropsTheOldLink(t *testing.T) {
	c := Defaults()
	c.APIURL = "http://localhost:8000"
	c.DeviceName, c.DeviceID, c.SystemUUID, c.DeviceKeyProtected = "PC", "dev1", "uuid", "key"

	if !c.UseServer("https://api.example.com/") {
		t.Fatal("a different server should count as a change")
	}
	if c.APIURL != "https://api.example.com" || c.Linked() || c.DeviceID != "" {
		t.Fatalf("expected new address and no link, got %+v", c)
	}
	if c.DeviceName != "PC" || c.SystemUUID != "uuid" {
		t.Fatal("the name and machine id should stay for linking again")
	}
}

func TestUseServerKeepsTheLinkOnTheSameServer(t *testing.T) {
	c := Defaults()
	c.APIURL = "https://api.example.com"
	c.DeviceKeyProtected = "key"
	if c.UseServer("https://API.example.com/") || !c.Linked() {
		t.Fatal("the same server must not drop the link")
	}
}
