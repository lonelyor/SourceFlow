package util

import "testing"

func TestGetBazaarPackageURLDynamicServerKeepsLegacyPath(t *testing.T) {
	ApplyBazaarSettings("", "", "", "https://sync.sourceflow.app/bazaar/package", "", "")
	defer ApplyBazaarSettings("", "", "", "", "", "")

	got := GetBazaarPackageURL("lonelyor/sourceflow-hello@abcdef123456")
	want := "https://sync.sourceflow.app/bazaar/package/package/lonelyor/sourceflow-hello@abcdef123456"
	if got != want {
		t.Fatalf("unexpected package url, got %q want %q", got, want)
	}
}

func TestGetBazaarPackageURLGitHubStaticUsesZipForArchives(t *testing.T) {
	ApplyBazaarSettings("", "", "", "https://lonelyor.github.io/sourceflow-bazaar", "", "")
	defer ApplyBazaarSettings("", "", "", "", "", "")

	got := GetBazaarPackageURL("lonelyor/sourceflow-hello@abcdef123456")
	want := "https://lonelyor.github.io/sourceflow-bazaar/package/lonelyor/sourceflow-hello@abcdef123456.zip"
	if got != want {
		t.Fatalf("unexpected package url, got %q want %q", got, want)
	}
}

func TestGetBazaarPackageURLGitHubStaticKeepsAssetPath(t *testing.T) {
	ApplyBazaarSettings("", "", "", "https://lonelyor.github.io/sourceflow-bazaar", "", "")
	defer ApplyBazaarSettings("", "", "", "", "", "")

	got := GetBazaarPackageURL("lonelyor/sourceflow-hello@abcdef123456/README.md")
	want := "https://lonelyor.github.io/sourceflow-bazaar/package/lonelyor/sourceflow-hello@abcdef123456/README.md"
	if got != want {
		t.Fatalf("unexpected asset url, got %q want %q", got, want)
	}
}
