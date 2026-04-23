package api

import (
	"encoding/base64"
	"testing"

	"github.com/lonelyor/sourceflow/kernel/conf"
)

func TestNormalizeAppearanceStartupPageImageRejectsOversizedDataURL(t *testing.T) {
	payload := base64.StdEncoding.EncodeToString(make([]byte, appearanceStartupPageImageMaxBytes+1))
	value := "data:image/png;base64," + payload
	if got := normalizeAppearanceStartupPageImage(value); "" != got {
		t.Fatalf("normalizeAppearanceStartupPageImage() returned oversized data URL")
	}
}

func TestNormalizeAppearanceStartupPageImageAcceptsRemoteURL(t *testing.T) {
	const value = "https://example.com/startup.webp"
	if got := normalizeAppearanceStartupPageImage(value); value != got {
		t.Fatalf("normalizeAppearanceStartupPageImage() = %q, want %q", got, value)
	}
}

func TestNormalizeAppearanceStartupPageImageAcceptsAppAssetPath(t *testing.T) {
	const value = "/appearance/boot/startup-logo.png"
	if got := normalizeAppearanceStartupPageImage(value); value != got {
		t.Fatalf("normalizeAppearanceStartupPageImage() = %q, want %q", got, value)
	}
}

func TestNormalizeAppearanceStartupPageRange(t *testing.T) {
	if got := normalizeAppearanceStartupPageOpacity(-1); 0 != got {
		t.Fatalf("normalizeAppearanceStartupPageOpacity() = %d, want 0", got)
	}
	if got := normalizeAppearanceStartupPageOpacity(140); 100 != got {
		t.Fatalf("normalizeAppearanceStartupPageOpacity() = %d, want 100", got)
	}
	if got := normalizeAppearanceStartupPageBlur(-3); 0 != got {
		t.Fatalf("normalizeAppearanceStartupPageBlur() = %d, want 0", got)
	}
	if got := normalizeAppearanceStartupPageBlur(120); 32 != got {
		t.Fatalf("normalizeAppearanceStartupPageBlur() = %d, want 32", got)
	}
}

func TestNewAppearanceUsesDefaultStartupLogo(t *testing.T) {
	appearance := conf.NewAppearance()
	if appearance.StartupPageImage != conf.DefaultStartupPageImage {
		t.Fatalf("conf.NewAppearance().StartupPageImage = %q, want %q", appearance.StartupPageImage, conf.DefaultStartupPageImage)
	}
}
