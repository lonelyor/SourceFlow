package api

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveDocTreeRootRejectsTraversal(t *testing.T) {
	root := t.TempDir()

	for _, unsafePath := range []string{"/../outside.sf", `..\outside.sf`, `C:\outside.sf`} {
		if _, err := resolveDocTreeRoot(root, unsafePath); err == nil {
			t.Fatalf("resolveDocTreeRoot(%q) must reject traversal", unsafePath)
		}
	}
}

func TestResolveDocTreeRootAllowsRootRelativeDocPath(t *testing.T) {
	root := t.TempDir()
	got, err := resolveDocTreeRoot(root, "/20260601120000-abcdefg.sf")
	if err != nil {
		t.Fatalf("resolveDocTreeRoot returned error: %s", err)
	}

	want := filepath.Join(root, "20260601120000-abcdefg")
	if filepath.Clean(got) != filepath.Clean(want) {
		t.Fatalf("resolveDocTreeRoot = %q, want %q", got, want)
	}
}

func TestCountDocTreeCountsNestedDocsOnce(t *testing.T) {
	root := t.TempDir()
	parentID := "20260522120000-abcdefg"
	childID := "20260522120001-bcdefgh"

	if err := os.WriteFile(filepath.Join(root, parentID+".sf"), []byte("{}"), 0644); err != nil {
		t.Fatalf("write parent doc: %s", err)
	}
	parentDir := filepath.Join(root, parentID)
	if err := os.Mkdir(parentDir, 0755); err != nil {
		t.Fatalf("mkdir parent doc dir: %s", err)
	}
	if err := os.WriteFile(filepath.Join(parentDir, childID+".sf"), []byte("{}"), 0644); err != nil {
		t.Fatalf("write child doc: %s", err)
	}

	count, err := countDocTree(root)
	if err != nil {
		t.Fatalf("countDocTree() error: %s", err)
	}
	if count != 2 {
		t.Fatalf("countDocTree() = %d, want 2", count)
	}
}
