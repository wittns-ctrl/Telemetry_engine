package daily

import (
	"context"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"lectio/agent/internal/models"
	"lectio/agent/internal/notify"
)

type fake struct {
	asked []models.DailyCheck
	reply models.DailyCheckReply
}

func (f *fake) DailyCheck(_ context.Context, r models.DailyCheck) (models.DailyCheckReply, error) {
	f.asked = append(f.asked, r)
	return f.reply, nil
}

func checker(t *testing.T, f *fake, now *time.Time, shown *[]notify.Note) *Checker {
	return &Checker{
		Client: f, Dashboard: "https://getlectio.vercel.app", PCName: "Office PC", Dir: t.TempDir(),
		Log:  slog.New(slog.NewTextHandler(io.Discard, nil)),
		Now:  func() time.Time { return *now },
		Show: func(n notify.Note) error { *shown = append(*shown, n); return nil },
	}
}

var kigali = time.FixedZone("CAT", 2*3600)

func TestReportsTheDayAt8pmOnceWithANotification(t *testing.T) {
	f := &fake{reply: models.DailyCheckReply{Status: "ready", ReportID: "6b092f8c5062a715f9acee82", Title: "Daily check: 86/100", Body: "Clean the fans. See the full report."}}
	now := time.Date(2026, 11, 28, 19, 50, 0, 0, kigali)
	var shown []notify.Note
	c := checker(t, f, &now, &shown)

	c.checkOnce(context.Background()) // before 8 pm: yesterday's day
	if len(f.asked) != 1 || f.asked[0].Day != "2026-11-27" || f.asked[0].UTCOffsetMinutes != 120 {
		t.Fatalf("asked %+v", f.asked)
	}
	now = now.Add(20 * time.Minute) // 8:10 pm: today
	c.checkOnce(context.Background())
	c.checkOnce(context.Background()) // already done today
	if len(f.asked) != 2 || f.asked[1].Day != "2026-11-28" {
		t.Fatalf("asked %+v", f.asked)
	}
	if len(shown) != 2 || !strings.HasSuffix(shown[1].URL, "/?report=6b092f8c5062a715f9acee82") || shown[1].PCName != "Office PC" {
		t.Fatalf("notification %+v", shown)
	}
}

func TestNoDataMeansNoNotification(t *testing.T) {
	f := &fake{reply: models.DailyCheckReply{Status: "no_data"}}
	now := time.Date(2026, 11, 28, 21, 0, 0, 0, kigali)
	var shown []notify.Note
	c := checker(t, f, &now, &shown)
	c.checkOnce(context.Background())
	c.checkOnce(context.Background())
	if len(shown) != 0 || len(f.asked) != 1 {
		t.Fatalf("shown %d, asked %d", len(shown), len(f.asked))
	}
}

func TestABadReportIdOpensNothing(t *testing.T) {
	f := &fake{reply: models.DailyCheckReply{Status: "ready", ReportID: "../../evil", Title: "x"}}
	now := time.Date(2026, 11, 28, 21, 0, 0, 0, kigali)
	var shown []notify.Note
	checker(t, f, &now, &shown).checkOnce(context.Background())
	if len(shown) != 0 {
		t.Fatal("a malformed report id was linked")
	}
}
