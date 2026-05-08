package model

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"
)

func TestReplaceObsidianAssetEmbedsResolvesUniqueBasename(t *testing.T) {
	root := t.TempDir()
	noteDir := filepath.Join(root, "Notes")
	attachmentsDir := filepath.Join(root, "Attachments")
	assetsDir := filepath.Join(root, "ImportedAssets")
	for _, dir := range []string{noteDir, attachmentsDir, assetsDir} {
		if err := os.MkdirAll(dir, 0755); nil != err {
			t.Fatalf("mkdir %s: %v", dir, err)
		}
	}

	source := filepath.Join(attachmentsDir, "Pasted image 1.png")
	if err := os.WriteFile(source, []byte("png"), 0644); nil != err {
		t.Fatalf("write source asset: %v", err)
	}

	assetsDone := map[string]string{}
	got := replaceObsidianAssetEmbeds("cover ![[Pasted image 1.png|示意图]] done", noteDir, newImportAssetIndex(root), assetsDir, assetsDone)
	if !regexp.MustCompile(`cover !\[示意图\]\(assets/Pasted image 1-\d{14}-[0-9A-Za-z]{7}\.png\) done`).MatchString(got) {
		t.Fatalf("unexpected converted markdown: %s", got)
	}

	name := assetsDone[filepath.Clean(source)]
	if "" == name {
		t.Fatalf("source asset was not recorded in assetsDone: %#v", assetsDone)
	}
	if _, err := os.Stat(filepath.Join(assetsDir, name)); nil != err {
		t.Fatalf("copied asset missing: %v", err)
	}
}

func TestReplaceObsidianAssetEmbedsKeepsAmbiguousBasename(t *testing.T) {
	root := t.TempDir()
	noteDir := filepath.Join(root, "Notes")
	for _, dir := range []string{noteDir, filepath.Join(root, "A"), filepath.Join(root, "B"), filepath.Join(root, "ImportedAssets")} {
		if err := os.MkdirAll(dir, 0755); nil != err {
			t.Fatalf("mkdir %s: %v", dir, err)
		}
	}
	for _, source := range []string{filepath.Join(root, "A", "same.png"), filepath.Join(root, "B", "same.png")} {
		if err := os.WriteFile(source, []byte("png"), 0644); nil != err {
			t.Fatalf("write source asset: %v", err)
		}
	}

	got := replaceObsidianAssetEmbeds("![[same.png]]", noteDir, newImportAssetIndex(root), filepath.Join(root, "ImportedAssets"), map[string]string{})
	if got != "![[same.png]]" {
		t.Fatalf("ambiguous basename should be left unchanged, got %q", got)
	}
}
