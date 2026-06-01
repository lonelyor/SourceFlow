package util

import (
	"path/filepath"
	"testing"
)

func TestResolvePathUnderRejectsTraversal(t *testing.T) {
	root := t.TempDir()
	if _, err := ResolvePathUnder(root, "/../outside.sf"); err == nil {
		t.Fatal("ResolvePathUnder must reject parent traversal")
	}
	if _, err := ResolvePathUnder(root, `..\outside.sf`); err == nil {
		t.Fatal("ResolvePathUnder must reject backslash parent traversal")
	}
	if _, err := ResolvePathUnder(root, `C:\outside.sf`); err == nil {
		t.Fatal("ResolvePathUnder must reject drive-qualified paths")
	}
}

func TestResolvePathUnderAllowsRootRelativeSlashPath(t *testing.T) {
	root := t.TempDir()
	got, err := ResolvePathUnder(root, "/20260601120000-abcdefg.sf")
	if err != nil {
		t.Fatalf("ResolvePathUnder returned error: %s", err)
	}
	want := filepath.Join(root, "20260601120000-abcdefg.sf")
	if got != want {
		t.Fatalf("resolved path = %q, want %q", got, want)
	}
}
