package api

import (
	"os"
	"path/filepath"
	"testing"
)

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
