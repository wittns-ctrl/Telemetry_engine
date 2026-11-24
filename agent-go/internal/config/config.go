// Package config loads and saves the agent's settings.
//
// Settings come from, in order of precedence:
//  1. environment variables (LECTIO_API, LECTIO_INTERVAL_SECONDS, ...),
//  2. the config file, agent.json in the data folder,
//  3. built-in defaults (the API address is set at build time).
//
// The device key is stored encrypted (Windows DPAPI, machine scope) and the
// data folder is readable only by SYSTEM and Administrators (see dirs_windows.go).
package config

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// DefaultAPI is replaced at build time: go build -ldflags "-X lectio/agent/internal/config.DefaultAPI=https://api.example.com"
var DefaultAPI = "http://localhost:8000"

const (
	fileName     = "agent.json"
	MinInterval  = time.Second
	MaxInterval  = 5 * time.Minute
	MaxBatchSize = 100 // the API's INGEST_BATCH_MAX
)

// Config is what agent.json holds. Durations are stored in seconds.
type Config struct {
	APIURL          string `json:"api_url"`
	IntervalSeconds int    `json:"interval_seconds"`
	BatchSize       int    `json:"batch_size"` // most readings sent in one request
	BufferMaxMB     int    `json:"buffer_max_mb"`
	BufferMaxDays   int    `json:"buffer_max_days"`
	FixesEnabled    bool   `json:"fixes_enabled"`
	LogLevel        string `json:"log_level"`
	TopProcesses    int    `json:"top_processes"`

	// Set when the PC is linked to an account (lectio-agent link).
	DeviceName         string `json:"device_name,omitempty"`
	DeviceID           string `json:"device_id,omitempty"`
	SystemUUID         string `json:"system_uuid,omitempty"`
	DeviceKeyProtected string `json:"device_key_protected,omitempty"`

	dir string
}

func Defaults() Config {
	return Config{
		APIURL:          DefaultAPI,
		IntervalSeconds: 5,
		BatchSize:       12,
		BufferMaxMB:     100,
		BufferMaxDays:   7,
		FixesEnabled:    true,
		LogLevel:        "info",
		TopProcesses:    10,
	}
}

// Dir is the agent's data folder (config, buffer, logs, state).
func Dir() string {
	if d := os.Getenv("LECTIO_DATA_DIR"); d != "" {
		return d
	}
	return defaultDir()
}

func Path(dir string) string { return filepath.Join(dir, fileName) }

// LogDir holds the logs and status.json. Unlike the rest of the data folder,
// any user on the PC may read it (it holds no secrets), so "lectio-agent
// status" and troubleshooting work without administrator rights.
func LogDir(dir string) string { return filepath.Join(dir, "logs") }

// Load reads agent.json from dir (defaults if it doesn't exist) and applies
// environment overrides. The result is validated.
func Load(dir string) (Config, error) {
	cfg := Defaults()
	raw, err := os.ReadFile(Path(dir))
	switch {
	case err == nil:
		if err := json.Unmarshal(raw, &cfg); err != nil {
			return cfg, fmt.Errorf("config %s is not valid JSON: %w", Path(dir), err)
		}
	case errors.Is(err, os.ErrNotExist):
	default:
		return cfg, fmt.Errorf("reading config: %w", err)
	}
	cfg.dir = dir
	if err := cfg.applyEnv(); err != nil {
		return cfg, err
	}
	return cfg, cfg.Validate()
}

func (c *Config) applyEnv() error {
	if v := os.Getenv("LECTIO_API"); v != "" {
		c.APIURL = v
	}
	ints := map[string]*int{
		"LECTIO_INTERVAL_SECONDS": &c.IntervalSeconds,
		"LECTIO_BATCH_SIZE":       &c.BatchSize,
		"LECTIO_BUFFER_MAX_MB":    &c.BufferMaxMB,
	}
	for name, field := range ints {
		if v := os.Getenv(name); v != "" {
			n, err := strconv.Atoi(v)
			if err != nil {
				return fmt.Errorf("%s must be a whole number", name)
			}
			*field = n
		}
	}
	if v := os.Getenv("LECTIO_FIXES"); v != "" {
		c.FixesEnabled = v == "on" || v == "1" || strings.EqualFold(v, "true")
	}
	if v := os.Getenv("LECTIO_LOG_LEVEL"); v != "" {
		c.LogLevel = v
	}
	return nil
}

// Validate checks every setting and fixes nothing silently.
func (c *Config) Validate() error {
	c.APIURL = strings.TrimRight(c.APIURL, "/")
	u, err := url.Parse(c.APIURL)
	if err != nil || u.Host == "" {
		return fmt.Errorf("api_url %q is not a valid address", c.APIURL)
	}
	switch u.Scheme {
	case "https":
	case "http":
		// Plain HTTP only for a server on this same PC (development).
		if h := u.Hostname(); h != "localhost" && h != "127.0.0.1" && h != "::1" {
			return fmt.Errorf("api_url must use https:// (http is only allowed for localhost)")
		}
	default:
		return fmt.Errorf("api_url must start with https://")
	}
	interval := c.Interval()
	if interval < MinInterval || interval > MaxInterval {
		return fmt.Errorf("interval_seconds must be from %d to %d", int(MinInterval.Seconds()), int(MaxInterval.Seconds()))
	}
	if c.BatchSize < 1 || c.BatchSize > MaxBatchSize {
		return fmt.Errorf("batch_size must be from 1 to %d", MaxBatchSize)
	}
	if c.BufferMaxMB < 1 || c.BufferMaxMB > 10240 {
		return fmt.Errorf("buffer_max_mb must be from 1 to 10240")
	}
	if c.BufferMaxDays < 1 || c.BufferMaxDays > 30 {
		return fmt.Errorf("buffer_max_days must be from 1 to 30")
	}
	if c.TopProcesses < 0 || c.TopProcesses > 20 {
		return fmt.Errorf("top_processes must be from 0 to 20")
	}
	switch c.LogLevel {
	case "debug", "info", "warn", "error":
	default:
		return fmt.Errorf("log_level must be debug, info, warn or error")
	}
	return nil
}

func (c Config) Interval() time.Duration { return time.Duration(c.IntervalSeconds) * time.Second }
func (c Config) BufferMaxBytes() int64   { return int64(c.BufferMaxMB) << 20 }
func (c Config) BufferMaxAge() time.Duration {
	return time.Duration(c.BufferMaxDays) * 24 * time.Hour
}
func (c Config) Dir() string { return c.dir }

// Linked reports whether this PC has a device key.
func (c Config) Linked() bool { return c.DeviceKeyProtected != "" }

// DeviceKey decrypts the stored device key.
func (c Config) DeviceKey() (string, error) {
	if c.DeviceKeyProtected == "" {
		return "", errors.New("this PC isn't linked to a Lectio account yet (run: lectio-agent link)")
	}
	sealed, err := base64.StdEncoding.DecodeString(c.DeviceKeyProtected)
	if err != nil {
		return "", fmt.Errorf("stored device key is damaged: %w", err)
	}
	plain, err := unprotect(sealed)
	if err != nil {
		return "", fmt.Errorf("couldn't decrypt the device key: %w", err)
	}
	return string(plain), nil
}

// SetDeviceKey encrypts and stores the device key (saved by Save).
func (c *Config) SetDeviceKey(key string) error {
	sealed, err := protect([]byte(key))
	if err != nil {
		return fmt.Errorf("couldn't encrypt the device key: %w", err)
	}
	c.DeviceKeyProtected = base64.StdEncoding.EncodeToString(sealed)
	return nil
}

// Save writes agent.json atomically (write a temp file, then rename).
func (c *Config) Save(dir string) error {
	if err := EnsureDir(dir); err != nil {
		return err
	}
	c.dir = dir
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return WriteFileAtomic(Path(dir), data)
}

// WriteFileAtomic replaces path with data so readers never see half a file.
func WriteFileAtomic(path string, data []byte) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
