// Package api talks to the Lectio FastAPI backend over HTTPS.
//
// Endpoints used (all existing; see app/api/v1):
//
//	GET  /api/v1/health                       is the server there
//	POST /api/v1/auth/login                   sign in once, to link the PC
//	POST /api/v1/devices/register             link the PC, get its device key
//	POST /api/v1/telemetry/ingest/batch       send buffered readings
//	GET  /api/v1/agent/fixes/next             check in, take the next fix
//	POST /api/v1/agent/fixes/{id}/result      report a fix's result
//	POST /api/v1/agent/fixes/{id}/reverted    a timed fix ran out
//
// After linking, every call authenticates with the X-Device-Key header.
// TLS certificates are always verified (TLS 1.2 or newer).
package api

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"lectio/agent/internal/models"
)

const (
	userAgent       = "lectio-agent"
	maxResponseSize = 1 << 20 // replies are small JSON; never read more than 1 MB
)

var (
	// ErrUnauthorized: the device key was rejected (PC deleted or re-linked elsewhere).
	ErrUnauthorized = errors.New("the server rejected this PC's device key")
	// ErrRejected: the server refused the request itself (4xx); retrying won't help.
	ErrRejected  = errors.New("the server refused the request")
	fixRequestID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)
)

// StatusError is a reply with an unexpected HTTP status.
type StatusError struct {
	Code int
	Body string
}

func (e *StatusError) Error() string {
	return fmt.Sprintf("server answered %d: %s", e.Code, e.Body)
}

// Retryable reports whether trying again later may work (server errors,
// rate limits); 4xx answers otherwise mean the request itself is wrong.
func (e *StatusError) Retryable() bool {
	return e.Code >= 500 || e.Code == http.StatusTooManyRequests || e.Code == http.StatusRequestTimeout
}

// RefusesData reports whether the server judged the data itself unacceptable
// (malformed, too large, failed validation), so sending it again can never
// work. Only these answers may make the agent throw readings away: any other
// refusal (404 from a wrong or outdated server, 403 from a proxy, ...) says
// nothing about the readings, which are kept and sent once it's sorted out.
func (e *StatusError) RefusesData() bool {
	return e.Code == http.StatusBadRequest || e.Code == http.StatusRequestEntityTooLarge || e.Code == http.StatusUnprocessableEntity
}

// WrongEndpoint reports answers meaning this server doesn't have the API
// path at all: usually a wrong API address, or a server older than the agent.
func (e *StatusError) WrongEndpoint() bool {
	switch e.Code {
	case http.StatusNotFound, http.StatusMethodNotAllowed, http.StatusGone, http.StatusNotImplemented:
		return true
	}
	return false
}

type Client struct {
	base      string
	http      *http.Client
	deviceKey string
	Version   string
}

// New returns a client for the API at base (e.g. https://api.example.com).
func New(base, version string, timeout time.Duration) *Client {
	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		DialContext:           (&net.Dialer{Timeout: 15 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
		TLSClientConfig:       &tls.Config{MinVersion: tls.VersionTLS12},
		TLSHandshakeTimeout:   15 * time.Second,
		ResponseHeaderTimeout: timeout,
		MaxIdleConns:          4,
		MaxIdleConnsPerHost:   2,
		IdleConnTimeout:       90 * time.Second,
		ForceAttemptHTTP2:     true,
	}
	return &Client{
		base:    strings.TrimRight(base, "/"),
		http:    &http.Client{Timeout: timeout, Transport: transport},
		Version: version,
	}
}

func (c *Client) SetDeviceKey(key string) { c.deviceKey = key }

// Base is the API address this client talks to (for log messages).
func (c *Client) Base() string { return c.base }

func (c *Client) do(ctx context.Context, method, path string, query url.Values, body any, form url.Values,
	auth string, want int, out any) error {
	u := c.base + path
	if len(query) > 0 {
		u += "?" + query.Encode()
	}
	var reader io.Reader
	contentType := ""
	switch {
	case form != nil:
		reader = strings.NewReader(form.Encode())
		contentType = "application/x-www-form-urlencoded"
	case body != nil:
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(data)
		contentType = "application/json"
	}
	req, err := http.NewRequestWithContext(ctx, method, u, reader)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", userAgent+"/"+c.Version)
	req.Header.Set("Accept", "application/json")
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	switch {
	case auth != "":
		req.Header.Set("Authorization", "Bearer "+auth)
	case c.deviceKey != "":
		req.Header.Set("X-Device-Key", c.deviceKey)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseSize))
	if err != nil {
		return err
	}
	if resp.StatusCode == http.StatusUnauthorized && auth == "" && c.deviceKey != "" {
		return ErrUnauthorized
	}
	if resp.StatusCode != want {
		return &StatusError{Code: resp.StatusCode, Body: snippet(raw)}
	}
	if out != nil {
		if err := json.Unmarshal(raw, out); err != nil {
			return fmt.Errorf("unexpected reply from the server: %w", err)
		}
	}
	return nil
}

func snippet(raw []byte) string {
	s := strings.TrimSpace(string(raw))
	if len(s) > 300 {
		s = s[:300] + "..."
	}
	return s
}

// Health checks the server answers.
func (c *Client) Health(ctx context.Context) error {
	return c.do(ctx, http.MethodGet, "/api/v1/health", nil, nil, nil, "", http.StatusOK, nil)
}

// Login signs in with an account's email and password (only while linking).
func (c *Client) Login(ctx context.Context, email, password string) (string, error) {
	var out models.LoginResponse
	form := url.Values{"username": {email}, "password": {password}}
	if err := c.do(ctx, http.MethodPost, "/api/v1/auth/login", nil, nil, form, "", http.StatusOK, &out); err != nil {
		return "", err
	}
	if out.AccessToken == "" {
		return "", errors.New("the server didn't return a sign-in token")
	}
	return out.AccessToken, nil
}

// Register links this PC to the signed-in account and returns its device key.
func (c *Client) Register(ctx context.Context, token string, req models.RegisterRequest) (models.RegisterResponse, error) {
	var out models.RegisterResponse
	err := c.do(ctx, http.MethodPost, "/api/v1/devices/register", nil, req, nil, token, http.StatusCreated, &out)
	if err == nil && (out.DeviceKey == "" || out.Device.ID == "") {
		err = errors.New("the server's reply had no device key")
	}
	return out, err
}

// SendBatch uploads readings. The server skips readings it already has (same
// event id), so a batch can be resent safely after a timeout.
func (c *Client) SendBatch(ctx context.Context, batch models.Batch) (models.BatchResponse, error) {
	var out models.BatchResponse
	err := c.do(ctx, http.MethodPost, "/api/v1/telemetry/ingest/batch", nil, batch, nil, "", http.StatusAccepted, &out)
	if err == nil && out.Received != len(batch.Readings) {
		err = fmt.Errorf("server reported %d readings received, sent %d", out.Received, len(batch.Readings))
	}
	return out, err
}

// NextFix checks in (records that the agent is running) and takes the next fix, if any.
func (c *Client) NextFix(ctx context.Context) (models.AgentNext, error) {
	var out models.AgentNext
	q := url.Values{"agent_version": {c.Version}}
	err := c.do(ctx, http.MethodGet, "/api/v1/agent/fixes/next", q, nil, nil, "", http.StatusOK, &out)
	return out, err
}

// LocationWanted asks whether this PC should report its location.
func (c *Client) LocationWanted(ctx context.Context) (models.LocationWanted, error) {
	var out models.LocationWanted
	err := c.do(ctx, http.MethodGet, "/api/v1/agent/location", nil, nil, nil, "", http.StatusOK, &out)
	return out, err
}

// ReportLocation sends the PC's position (or why there isn't one).
func (c *Client) ReportLocation(ctx context.Context, r models.LocationReport) error {
	return c.do(ctx, http.MethodPost, "/api/v1/agent/location", nil, r, nil, "", http.StatusOK, nil)
}

// PendingNotifications asks for new critical alerts to show on this PC.
func (c *Client) PendingNotifications(ctx context.Context) (models.PendingNotifications, error) {
	var out models.PendingNotifications
	err := c.do(ctx, http.MethodGet, "/api/v1/agent/alerts/pending", nil, nil, nil, "", http.StatusOK, &out)
	return out, err
}

func (c *Client) ReportFix(ctx context.Context, requestID string, result models.FixResult) error {
	if !fixRequestID.MatchString(requestID) {
		return fmt.Errorf("malformed fix id")
	}
	if len(result.Message) > 1000 {
		result.Message = result.Message[:1000]
	}
	return c.do(ctx, http.MethodPost, "/api/v1/agent/fixes/"+requestID+"/result", nil, result, nil, "", http.StatusOK, nil)
}

func (c *Client) ReportReverted(ctx context.Context, requestID string) error {
	if !fixRequestID.MatchString(requestID) {
		return fmt.Errorf("malformed fix id")
	}
	return c.do(ctx, http.MethodPost, "/api/v1/agent/fixes/"+requestID+"/reverted", nil, nil, nil, "", http.StatusOK, nil)
}

// ValidFixID reports whether an id from the server is safe to use in a path.
func ValidFixID(id string) bool { return fixRequestID.MatchString(id) }
