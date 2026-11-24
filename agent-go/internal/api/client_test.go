package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"lectio/agent/internal/models"
)

func server(t *testing.T, h http.HandlerFunc) *Client {
	t.Helper()
	s := httptest.NewServer(h)
	t.Cleanup(s.Close)
	c := New(s.URL, "test", 5*time.Second)
	c.SetDeviceKey("device-key-1234567890")
	return c
}

func TestSendBatchSendsTheKeyAndJSON(t *testing.T) {
	c := server(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/telemetry/ingest/batch" || r.Method != http.MethodPost {
			t.Errorf("unexpected %s %s", r.Method, r.URL.Path)
		}
		if r.Header.Get("X-Device-Key") != "device-key-1234567890" || r.Header.Get("Authorization") != "" {
			t.Error("device key not sent (or a bearer token leaked)")
		}
		var b models.Batch
		if err := json.NewDecoder(r.Body).Decode(&b); err != nil || len(b.Readings) != 2 || b.Readings[0].EventID != "evt-1" {
			t.Errorf("bad body: %v %+v", err, b)
		}
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"status":"accepted","received":2,"stored":1,"duplicates":1,"too_old":0}`))
	})
	resp, err := c.SendBatch(context.Background(), models.Batch{Readings: []models.Reading{{EventID: "evt-1"}, {EventID: "evt-2"}}})
	if err != nil || resp.Stored != 1 || resp.Duplicates != 1 {
		t.Fatalf("%+v %v", resp, err)
	}
}

func TestStatusesAreClassified(t *testing.T) {
	for code, check := range map[int]func(error) bool{
		401: func(err error) bool { return errors.Is(err, ErrUnauthorized) },
		422: func(err error) bool { var s *StatusError; return errors.As(err, &s) && !s.Retryable() },
		429: func(err error) bool { var s *StatusError; return errors.As(err, &s) && s.Retryable() },
		503: func(err error) bool { var s *StatusError; return errors.As(err, &s) && s.Retryable() },
	} {
		c := server(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(code) })
		_, err := c.SendBatch(context.Background(), models.Batch{Readings: []models.Reading{{EventID: "evt-1"}}})
		if !check(err) {
			t.Errorf("%d classified wrongly: %v", code, err)
		}
	}
}

func TestReceivedCountIsChecked(t *testing.T) {
	c := server(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"received":1,"stored":1}`))
	})
	_, err := c.SendBatch(context.Background(), models.Batch{Readings: []models.Reading{{EventID: "a"}, {EventID: "b"}}})
	if err == nil {
		t.Fatal("a short count was accepted")
	}
}

func TestTimeoutIsEnforced(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(2 * time.Second)
	}))
	defer s.Close()
	c := New(s.URL, "test", 300*time.Millisecond)
	start := time.Now()
	if err := c.Health(context.Background()); err == nil {
		t.Fatal("expected a timeout")
	}
	if time.Since(start) > 1500*time.Millisecond {
		t.Fatal("timeout not applied")
	}
}

func TestLoginUsesTheFormAndNoDeviceKey(t *testing.T) {
	c := server(t, func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		if r.Form.Get("username") != "a@b.c" || r.Form.Get("password") != "pw" {
			t.Error("form not sent")
		}
		_, _ = w.Write([]byte(`{"access_token":"tok","token_type":"bearer"}`))
	})
	tok, err := c.Login(context.Background(), "a@b.c", "pw")
	if err != nil || tok != "tok" {
		t.Fatal(tok, err)
	}
}

func TestFixIDsAreCheckedBeforeUseInAPath(t *testing.T) {
	c := server(t, func(w http.ResponseWriter, r *http.Request) { t.Error("request sent") })
	if err := c.ReportFix(context.Background(), "../../auth/logout", models.FixResult{}); err == nil {
		t.Fatal("path injection accepted")
	}
}

func TestHugeRepliesAreCut(t *testing.T) {
	c := server(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
		_, _ = w.Write([]byte(strings.Repeat("x", 5<<20)))
	})
	err := c.Health(context.Background())
	var s *StatusError
	if !errors.As(err, &s) || len(s.Body) > 400 {
		t.Fatalf("%v", err)
	}
}

func TestCertificatesAreVerified(t *testing.T) {
	s := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer s.Close()
	c := New(s.URL, "test", 3*time.Second) // self-signed: must be refused
	if err := c.Health(context.Background()); err == nil {
		t.Fatal("an untrusted certificate was accepted")
	}
}
