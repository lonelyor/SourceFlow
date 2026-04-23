package api

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/lonelyor/sourceflow/kernel/conf"
)

func TestDownloadEditorCursorImage0SVGSuccess(t *testing.T) {
	svg := `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"></svg>`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/svg+xml")
		_, _ = w.Write([]byte(svg))
	}))
	defer server.Close()

	result, err := downloadEditorCursorImage0(server.URL+"/cursor.svg", server.Client())
	if nil != err {
		t.Fatalf("downloadEditorCursorImage0 returned error: %v", err)
	}
	if "cursor.svg" != result.Name {
		t.Fatalf("unexpected cursor name %q", result.Name)
	}
	const prefix = "data:image/svg+xml;base64,"
	if !strings.HasPrefix(result.DataURL, prefix) {
		t.Fatalf("unexpected data URL prefix: %s", result.DataURL)
	}
	decoded, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(result.DataURL, prefix))
	if nil != err {
		t.Fatalf("failed to decode data URL: %v", err)
	}
	if svg != string(decoded) {
		t.Fatalf("unexpected SVG payload %q", string(decoded))
	}
}

func TestDownloadEditorCursorImage0SniffsSVGWithoutContentType(t *testing.T) {
	svg := `<svg xmlns="http://www.w3.org/2000/svg"></svg>`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(svg))
	}))
	defer server.Close()

	result, err := downloadEditorCursorImage0(server.URL+"/cursor", server.Client())
	if nil != err {
		t.Fatalf("downloadEditorCursorImage0 returned error: %v", err)
	}
	if !strings.HasPrefix(result.DataURL, "data:image/svg+xml;base64,") {
		t.Fatalf("unexpected data URL %q", result.DataURL)
	}
}

func TestDownloadEditorCursorImage0RejectsUnsupportedFormat(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("plain-text"))
	}))
	defer server.Close()

	_, err := downloadEditorCursorImage0(server.URL+"/cursor.txt", server.Client())
	if nil == err {
		t.Fatal("expected error for unsupported remote cursor format")
	}
	if !strings.Contains(err.Error(), "unsupported remote cursor image format") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestNormalizeEditorCursorSavedImagesFiltersAndDeduplicates(t *testing.T) {
	now := time.Now().UnixMilli()
	input := []conf.EditorCursorSavedImage{
		{
			Name:      "Demo Cursor",
			Source:    "data:image/svg+xml;base64,PHN2Zy8+",
			CreatedAt: now,
		},
		{
			ID:        "duplicate",
			Name:      "Duplicate Cursor",
			Source:    "data:image/svg+xml;base64,PHN2Zy8+",
			CreatedAt: now + 1,
		},
		{
			ID:        "remote",
			Name:      "Remote Cursor",
			Source:    "https://example.com/cursor.svg",
			CreatedAt: now + 2,
		},
	}

	result := normalizeEditorCursorSavedImages(input)
	if 1 != len(result) {
		t.Fatalf("expected 1 saved cursor, got %d", len(result))
	}
	if "" == result[0].ID {
		t.Fatal("expected saved cursor ID to be generated")
	}
	if "Demo Cursor" != result[0].Name {
		t.Fatalf("unexpected saved cursor name %q", result[0].Name)
	}
	if "data:image/svg+xml;base64,PHN2Zy8+" != result[0].Source {
		t.Fatalf("unexpected saved cursor source %q", result[0].Source)
	}
	if 0 >= result[0].CreatedAt {
		t.Fatalf("unexpected createdAt %d", result[0].CreatedAt)
	}
}

func TestNormalizeEditorCursorImageRejectsUnsupportedDataURL(t *testing.T) {
	if got := normalizeEditorCursorImage("data:image/bmp;base64,Qk0="); "" != got {
		t.Fatalf("normalizeEditorCursorImage() = %q, want empty", got)
	}
}

func TestNormalizeEditorCursorImageRejectsOversizedDataURL(t *testing.T) {
	payload := base64.StdEncoding.EncodeToString(make([]byte, editorCursorImageMaxBytes+1))
	value := "data:image/png;base64," + payload
	if got := normalizeEditorCursorImage(value); "" != got {
		t.Fatalf("normalizeEditorCursorImage() returned oversized data URL")
	}
}

func TestNormalizeEditorCursorBlinkEffectFallback(t *testing.T) {
	if got := normalizeEditorCursorBlinkEffect("pulse"); "pulse" != got {
		t.Fatalf("normalizeEditorCursorBlinkEffect() = %q, want pulse", got)
	}
	if got := normalizeEditorCursorBlinkEffect("unknown"); defaultEditorCursorBlinkEffect != got {
		t.Fatalf("normalizeEditorCursorBlinkEffect() = %q, want %q", got, defaultEditorCursorBlinkEffect)
	}
}

func TestNormalizeEditorNoteBackgroundImageRejectsOversizedDataURL(t *testing.T) {
	payload := base64.StdEncoding.EncodeToString(make([]byte, editorNoteBackgroundImageMaxBytes+1))
	value := "data:image/png;base64," + payload
	if got := normalizeEditorNoteBackgroundImage(value); "" != got {
		t.Fatalf("normalizeEditorNoteBackgroundImage() returned oversized data URL")
	}
}

func TestNormalizeEditorNoteBackgroundImageAcceptsRemoteURL(t *testing.T) {
	const value = "https://example.com/background.webp"
	if got := normalizeEditorNoteBackgroundImage(value); value != got {
		t.Fatalf("normalizeEditorNoteBackgroundImage() = %q, want %q", got, value)
	}
}

func TestNormalizeEditorNoteBackgroundRange(t *testing.T) {
	if got := normalizeEditorNoteBackgroundOpacity(-1); 0 != got {
		t.Fatalf("normalizeEditorNoteBackgroundOpacity() = %d, want 0", got)
	}
	if got := normalizeEditorNoteBackgroundOpacity(140); 100 != got {
		t.Fatalf("normalizeEditorNoteBackgroundOpacity() = %d, want 100", got)
	}
	if got := normalizeEditorNoteBackgroundBlur(-3); 0 != got {
		t.Fatalf("normalizeEditorNoteBackgroundBlur() = %d, want 0", got)
	}
	if got := normalizeEditorNoteBackgroundBlur(120); 32 != got {
		t.Fatalf("normalizeEditorNoteBackgroundBlur() = %d, want 32", got)
	}
}
