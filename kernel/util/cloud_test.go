package util

import "testing"

func TestDefaultBazaarSourceUsesCDN(t *testing.T) {
	ApplyBazaarSettings("", "", "", "", "", "")

	got := GetBazaarVersionInfoURL()
	want := "https://cdn.jsdelivr.net/gh/lonelyor/SourceFlow-plugins@main/version.json"
	if got != want {
		t.Fatalf("unexpected default version info url, got %q want %q", got, want)
	}
}

func TestLegacyGitHubPagesBazaarSourceAddsCDNFallbacks(t *testing.T) {
	ApplyBazaarSettings("", "https://lonelyor.github.io/SourceFlow-plugins/version.json", "https://lonelyor.github.io/SourceFlow-plugins", "https://lonelyor.github.io/SourceFlow-plugins", "https://lonelyor.github.io/SourceFlow-plugins/stat", "")
	defer ApplyBazaarSettings("", "", "", "", "", "")

	versionURLs := GetBazaarVersionInfoURLs()
	if len(versionURLs) < 2 {
		t.Fatalf("expected fallback version urls, got %#v", versionURLs)
	}
	if versionURLs[0] != "https://lonelyor.github.io/SourceFlow-plugins/version.json" {
		t.Fatalf("expected configured legacy url first, got %#v", versionURLs)
	}
	if versionURLs[1] != "https://cdn.jsdelivr.net/gh/lonelyor/SourceFlow-plugins@main/version.json" {
		t.Fatalf("expected CDN fallback second, got %#v", versionURLs)
	}

	packageURLs := GetBazaarPackageURLs("lonelyor/sourceflow-hello@abcdef123456")
	if len(packageURLs) < 2 {
		t.Fatalf("expected fallback package urls, got %#v", packageURLs)
	}
	if packageURLs[1] != "https://cdn.jsdelivr.net/gh/lonelyor/SourceFlow-plugins@main/package/lonelyor/sourceflow-hello@abcdef123456.zip" {
		t.Fatalf("expected CDN package fallback, got %#v", packageURLs)
	}
}

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
	ApplyBazaarSettings("", "", "", "https://lonelyor.github.io/SourceFlow-plugins", "", "")
	defer ApplyBazaarSettings("", "", "", "", "", "")

	got := GetBazaarPackageURL("lonelyor/sourceflow-hello@abcdef123456")
	want := "https://lonelyor.github.io/SourceFlow-plugins/package/lonelyor/sourceflow-hello@abcdef123456.zip"
	if got != want {
		t.Fatalf("unexpected package url, got %q want %q", got, want)
	}
}

func TestGetBazaarPackageURLGitHubStaticKeepsAssetPath(t *testing.T) {
	ApplyBazaarSettings("", "", "", "https://lonelyor.github.io/SourceFlow-plugins", "", "")
	defer ApplyBazaarSettings("", "", "", "", "", "")

	got := GetBazaarPackageURL("lonelyor/sourceflow-hello@abcdef123456/README.md")
	want := "https://lonelyor.github.io/SourceFlow-plugins/package/lonelyor/sourceflow-hello@abcdef123456/README.md"
	if got != want {
		t.Fatalf("unexpected asset url, got %q want %q", got, want)
	}
}
