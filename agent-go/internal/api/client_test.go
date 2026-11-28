package api

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"io"
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

// body is the request body, uncompressed if the agent gzipped it.
func body(t *testing.T, r *http.Request) io.Reader {
	if r.Header.Get("Content-Encoding") != "gzip" {
		return r.Body
	}
	zr, err := gzip.NewReader(r.Body)
	if err != nil {
		t.Fatalf("bad gzip: %v", err)
	}
	return zr
}

func TestBigBodiesAreCompressedSmallOnesNot(t *testing.T) {
	var encodings []string
	c := server(t, func(w http.ResponseWriter, r *http.Request) {
		encodings = append(encodings, r.Header.Get("Content-Encoding"))
		var b models.Batch
		if err := json.NewDecoder(body(t, r)).Decode(&b); err != nil {
			t.Errorf("unreadable body: %v", err)
		}
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"status":"accepted"}`))
	})
	big := models.Batch{}
	for i := 0; i < 40; i++ {
		big.Readings = append(big.Readings, models.Reading{EventID: strings.Repeat("x", 30)})
	}
	_, _ = c.DailyCheck(context.Background(), models.DailyCheck{Day: "2026-11-28"}) // a few bytes: sent as is
	_, _ = c.SendBatch(context.Background(), big)
	if len(encodings) != 2 || encodings[0] != "" || encodings[1] != "gzip" {
		t.Fatalf("encodings %q", encodings)
	}
}

func TestAServerThatCantReadGzipGetsPlainJSON(t *testing.T) {
	calls := 0
	c := server(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Header.Get("Content-Encoding") == "gzip" {
			w.WriteHeader(http.StatusUnprocessableEntity) // an older API
			return
		}
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"status":"accepted","received":40,"stored":40}`))
	})
	big := models.Batch{}
	for i := 0; i < 40; i++ {
		big.Readings = append(big.Readings, models.Reading{EventID: strings.Repeat("y", 30)})
	}
	resp, err := c.SendBatch(context.Background(), big)
	if err != nil || resp.Stored != 40 || calls != 2 {
		t.Fatalf("resp %+v err %v calls %d", resp, err, calls)
	}
	_, _ = c.SendBatch(context.Background(), big) // remembered: plain straight away
	if calls != 3 {
		t.Fatalf("calls %d", calls)
	}
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
		if err := json.NewDecoder(body(t, r)).Decode(&b); err != nil || len(b.Readings) != 2 || b.Readings[0].EventID != "evt-1" {
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

func TestOnlyDataErrorsRefuseData(t *testing.T) {
	for code, want := range map[int][2]bool{ // {RefusesData, WrongEndpoint}
		400: {true, false}, 413: {true, false}, 422: {true, false},
		403: {false, false}, 404: {false, true}, 405: {false, true}, 410: {false, true},
		429: {false, false}, 500: {false, false}, 501: {false, true}, 503: {false, false},
	} {
		e := &StatusError{Code: code}
		if e.RefusesData() != want[0] || e.WrongEndpoint() != want[1] {
			t.Errorf("%d: RefusesData=%v WrongEndpoint=%v, want %v", code, e.RefusesData(), e.WrongEndpoint(), want)
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
