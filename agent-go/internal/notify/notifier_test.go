package notify

import (
	"bytes"
	"context"
	"encoding/xml"
	"image/png"
	"io"
	"log/slog"
	"strings"
	"testing"

	"lectio/agent/internal/models"
)

type fakeSource struct{ pending models.PendingNotifications }

func (f *fakeSource) PendingNotifications(context.Context) (models.PendingNotifications, error) {
	return f.pending, nil
}

const id = "6b092f8c5062a715f9acee82"

func notifier(src *fakeSource, shown *[]Note) *Notifier {
	return &Notifier{
		Client: src, Dashboard: "https://getlectio.vercel.app/", PCName: "Office PC",
		Log:  slog.New(slog.NewTextHandler(io.Discard, nil)),
		Show: func(n Note) error { *shown = append(*shown, n); return nil },
	}
}

func TestEachAlertIsShownOnceWithALocalLink(t *testing.T) {
	src := &fakeSource{pending: models.PendingNotifications{Notifications: []models.PCNotification{
		{AlertID: id, Severity: "CRITICAL", Title: "CPU core temperature critical", Body: "96.0°C at or above 95.0°C."},
	}}}
	var shown []Note
	n := notifier(src, &shown)
	n.checkOnce(context.Background())
	n.checkOnce(context.Background()) // the server repeats it: still shown once
	if len(shown) != 1 {
		t.Fatalf("shown %d times", len(shown))
	}
	if shown[0].URL != "https://getlectio.vercel.app/?alert="+id {
		t.Fatalf("link %q", shown[0].URL)
	}
	if shown[0].PCName != "Office PC" {
		t.Fatalf("pc name %q", shown[0].PCName)
	}
}

func TestAMalformedAlertIdIsNotShown(t *testing.T) {
	// The id ends up in the link, so anything but a database id is refused.
	for _, bad := range []string{"", "../evil", id + "&next=https://evil.example", "ZZ" + id[2:]} {
		src := &fakeSource{pending: models.PendingNotifications{Notifications: []models.PCNotification{{AlertID: bad, Title: "x"}}}}
		var shown []Note
		notifier(src, &shown).checkOnce(context.Background())
		if len(shown) != 0 {
			t.Fatalf("%q was shown", bad)
		}
	}
}

func TestTextIsCleanedAndShortened(t *testing.T) {
	if got := clean("a\x00b\r\nc   d", 50); got != "a b c d" {
		t.Fatalf("%q", got)
	}
	long := strings.Repeat("x", 500)
	if got := clean(long, maxBody); len([]rune(got)) != maxBody {
		t.Fatalf("length %d", len([]rune(got)))
	}
}

func TestToastXMLEscapesTextAndHasBothButtons(t *testing.T) {
	n := Note{AlertID: id, Title: `<script>&"hot"`, Body: "96°C", PCName: "Bob's PC",
		URL: "https://getlectio.vercel.app/?alert=" + id}
	doc := ToastXML(n, `C:\Users\me\AppData\Local\Lectio\icon.png`)
	if err := xml.Unmarshal([]byte(doc), new(struct{})); err != nil {
		t.Fatalf("not valid XML: %v\n%s", err, doc)
	}
	if strings.Contains(doc, "<script>") {
		t.Fatal("title not escaped")
	}
	for _, want := range []string{`content="Open dashboard"`, `content="Dismiss"`, `scenario="reminder"`,
		`activationType="protocol" arguments="https://getlectio.vercel.app/?alert=` + id + `"`} {
		if !strings.Contains(doc, want) {
			t.Fatalf("missing %s in\n%s", want, doc)
		}
	}
}

func TestNoteSurvivesTheCommandLine(t *testing.T) {
	in := Note{AlertID: id, Title: `Quotes " and spaces`, Body: "°C", URL: "https://x/?alert=" + id}
	out, err := DecodeNote(EncodeNote(in))
	if err != nil || out != in {
		t.Fatalf("got %+v, %v", out, err)
	}
	if strings.ContainsAny(EncodeNote(in), `" &|<>`) {
		t.Fatal("encoded note has characters the command line would split on")
	}
}

func TestIconIsAPNG(t *testing.T) {
	img, err := png.Decode(bytes.NewReader(IconPNG(64)))
	if err != nil || img.Bounds().Dx() != 64 {
		t.Fatalf("icon: %v", err)
	}
}
