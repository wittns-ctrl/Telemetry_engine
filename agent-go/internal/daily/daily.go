// Package daily asks for the PC's end-of-day health check: at 8 pm PC time,
// or at the next start if the PC was off then, once per day. When the report
// is ready, the person at the PC gets a notification that opens it.
package daily

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"lectio/agent/internal/api"
	"lectio/agent/internal/config"
	"lectio/agent/internal/models"
	"lectio/agent/internal/notify"
	"lectio/agent/internal/retry"
)

const (
	checkEvery = 10 * time.Minute
	eveningAt  = 20 // 8 pm
	stateFile  = "daily.json"
)

var reportID = regexp.MustCompile(`^[a-f0-9]{24}$`)

type Server interface {
	DailyCheck(ctx context.Context, req models.DailyCheck) (models.DailyCheckReply, error)
}

type Checker struct {
	Client    Server
	Show      func(notify.Note) error
	Dashboard string
	PCName    string
	Dir       string // where the last checked day is kept
	Log       *slog.Logger
	Now       func() time.Time
}

type state struct {
	LastDay string `json:"last_day"`
}

func (c *Checker) now() time.Time {
	if c.Now != nil {
		return c.Now()
	}
	return time.Now()
}

func (c *Checker) Run(ctx context.Context) {
	for {
		c.checkOnce(ctx)
		if !retry.Sleep(ctx, checkEvery) {
			return
		}
	}
}

// due is the day to report on: today after 8 pm, otherwise yesterday.
func due(now time.Time) string {
	if now.Hour() >= eveningAt {
		return now.Format("2006-01-02")
	}
	return now.AddDate(0, 0, -1).Format("2006-01-02")
}

func (c *Checker) checkOnce(ctx context.Context) {
	now := c.now()
	day := due(now)
	st := c.load()
	if st.LastDay >= day {
		return
	}
	_, offset := now.Zone()
	reply, err := c.Client.DailyCheck(ctx, models.DailyCheck{Day: day, UTCOffsetMinutes: offset / 60})
	if err != nil {
		if !errors.Is(err, context.Canceled) && !errors.Is(err, api.ErrUnauthorized) {
			c.Log.Debug("daily check failed; trying again later", "day", day, "error", err)
		}
		return
	}
	if reply.Status == "ready" && reportID.MatchString(reply.ReportID) {
		note := notify.Note{
			AlertID: reply.ReportID,
			Title:   reply.Title,
			Body:    reply.Body,
			PCName:  c.PCName,
			URL:     strings.TrimRight(c.Dashboard, "/") + "/?report=" + reply.ReportID,
		}
		if err := c.Show(note); err != nil {
			c.Log.Warn("couldn't show the daily check notification", "error", err)
		}
		c.Log.Info("daily health check ready", "day", day)
	}
	c.save(state{LastDay: day})
}

func (c *Checker) load() state {
	var st state
	if data, err := os.ReadFile(filepath.Join(c.Dir, stateFile)); err == nil {
		_ = json.Unmarshal(data, &st)
	}
	return st
}

func (c *Checker) save(st state) {
	data, _ := json.Marshal(st)
	if err := config.WriteFileAtomic(filepath.Join(c.Dir, stateFile), data); err != nil {
		c.Log.Warn("couldn't save the daily check state", "error", err)
	}
}
