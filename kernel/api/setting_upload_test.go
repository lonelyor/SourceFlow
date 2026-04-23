package api

import (
	"testing"

	"github.com/lonelyor/sourceflow/kernel/conf"
)

func TestNormalizeEditorAssetUploadProvider(t *testing.T) {
	if got := normalizeEditorAssetUploadProvider("picgo"); conf.EditorAssetUploadProviderPicGo != got {
		t.Fatalf("normalizeEditorAssetUploadProvider() = %q, want %q", got, conf.EditorAssetUploadProviderPicGo)
	}
	if got := normalizeEditorAssetUploadProvider("unknown"); conf.EditorAssetUploadProviderLocal != got {
		t.Fatalf("normalizeEditorAssetUploadProvider() = %q, want %q", got, conf.EditorAssetUploadProviderLocal)
	}
}

func TestNormalizeEditorPicGoServerURL(t *testing.T) {
	if got := normalizeEditorPicGoServerURL(""); conf.DefaultEditorPicGoServerURL != got {
		t.Fatalf("normalizeEditorPicGoServerURL() = %q, want %q", got, conf.DefaultEditorPicGoServerURL)
	}
	if got := normalizeEditorPicGoServerURL("127.0.0.1:36677"); "http://127.0.0.1:36677/upload" != got {
		t.Fatalf("normalizeEditorPicGoServerURL() = %q", got)
	}
	if got := normalizeEditorPicGoServerURL("https://example.com/custom"); "https://example.com/custom" != got {
		t.Fatalf("normalizeEditorPicGoServerURL() = %q", got)
	}
}

func TestNormalizeEditorHTMLPasteMode(t *testing.T) {
	if got := normalizeEditorHTMLPasteMode("html"); conf.EditorHTMLPasteModeHTML != got {
		t.Fatalf("normalizeEditorHTMLPasteMode() = %q, want %q", got, conf.EditorHTMLPasteModeHTML)
	}
	if got := normalizeEditorHTMLPasteMode("image"); conf.EditorHTMLPasteModeImage != got {
		t.Fatalf("normalizeEditorHTMLPasteMode() = %q, want %q", got, conf.EditorHTMLPasteModeImage)
	}
	if got := normalizeEditorHTMLPasteMode("unknown"); conf.EditorHTMLPasteModeSmart != got {
		t.Fatalf("normalizeEditorHTMLPasteMode() = %q, want %q", got, conf.EditorHTMLPasteModeSmart)
	}
}
