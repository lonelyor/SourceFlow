package model

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/lonelyor/sourceflow/kernel/util"
)

func TestBoxRemoveRejectsPathTraversal(t *testing.T) {
	oldDataDir := util.DataDir
	util.DataDir = t.TempDir()
	defer func() {
		util.DataDir = oldDataDir
	}()

	box := &Box{ID: "box", Name: "box"}
	if err := os.MkdirAll(filepath.Join(util.DataDir, box.ID), 0755); err != nil {
		t.Fatalf("create box dir: %s", err)
	}
	outside := filepath.Join(util.DataDir, "outside.sf")
	if err := os.WriteFile(outside, []byte("safe"), 0644); err != nil {
		t.Fatalf("write outside fixture: %s", err)
	}

	if err := box.Remove("/../outside.sf"); err == nil {
		t.Fatal("Box.Remove must reject parent traversal")
	}
	if _, err := os.Stat(outside); err != nil {
		t.Fatalf("outside file must remain after rejected remove: %s", err)
	}
}

func TestBoxMoveRejectsPathTraversal(t *testing.T) {
	oldDataDir := util.DataDir
	util.DataDir = t.TempDir()
	defer func() {
		util.DataDir = oldDataDir
	}()

	box := &Box{ID: "box", Name: "box"}
	boxDir := filepath.Join(util.DataDir, box.ID)
	if err := os.MkdirAll(boxDir, 0755); err != nil {
		t.Fatalf("create box dir: %s", err)
	}
	source := filepath.Join(boxDir, "20260601120000-abcdefg.sf")
	if err := os.WriteFile(source, []byte("safe"), 0644); err != nil {
		t.Fatalf("write source fixture: %s", err)
	}

	if err := box.Move("/20260601120000-abcdefg.sf", "/../outside.sf"); err == nil {
		t.Fatal("Box.Move must reject destination traversal")
	}
	if _, err := os.Stat(source); err != nil {
		t.Fatalf("source file must remain after rejected move: %s", err)
	}
}
