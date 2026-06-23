package api

import (
	"encoding/base64"
	"testing"
)

func TestNormalizeAppearanceMascotImageRejectsOversizedDataURL(t *testing.T) {
	payload := base64.StdEncoding.EncodeToString(make([]byte, appearanceMascotImageMaxBytes+1))
	value := "data:image/png;base64," + payload
	if got := normalizeAppearanceMascotImage(value); "" != got {
		t.Fatalf("normalizeAppearanceMascotImage() returned oversized data URL")
	}
}

func TestNormalizeAppearanceMascotImageAcceptsRemoteURL(t *testing.T) {
	const value = "https://example.com/mascot.webp"
	if got := normalizeAppearanceMascotImage(value); value != got {
		t.Fatalf("normalizeAppearanceMascotImage() = %q, want %q", got, value)
	}
}

func TestNormalizeAppearanceMascotRange(t *testing.T) {
	if got := normalizeAppearanceMascotPosition("left"); "left" != got {
		t.Fatalf("normalizeAppearanceMascotPosition() = %q, want left", got)
	}
	if got := normalizeAppearanceMascotPosition("bad"); defaultAppearanceMascotPosition != got {
		t.Fatalf("normalizeAppearanceMascotPosition() = %q, want %q", got, defaultAppearanceMascotPosition)
	}
	if got := normalizeAppearanceMascotEffect("pulse"); "pulse" != got {
		t.Fatalf("normalizeAppearanceMascotEffect() = %q, want pulse", got)
	}
	if got := normalizeAppearanceMascotEffect("bad"); defaultAppearanceMascotEffect != got {
		t.Fatalf("normalizeAppearanceMascotEffect() = %q, want %q", got, defaultAppearanceMascotEffect)
	}
	if got := normalizeAppearanceMascotOpacity(-1); 0 != got {
		t.Fatalf("normalizeAppearanceMascotOpacity() = %d, want 0", got)
	}
	if got := normalizeAppearanceMascotOpacity(140); 100 != got {
		t.Fatalf("normalizeAppearanceMascotOpacity() = %d, want 100", got)
	}
	if got := normalizeAppearanceMascotScale(0); 40 != got {
		t.Fatalf("normalizeAppearanceMascotScale() = %d, want 40", got)
	}
	if got := normalizeAppearanceMascotScale(220); 180 != got {
		t.Fatalf("normalizeAppearanceMascotScale() = %d, want 180", got)
	}
}
