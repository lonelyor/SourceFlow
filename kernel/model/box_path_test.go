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

func TestBoxDocIALDoesNotMoveDocumentOnMissingProperties(t *testing.T) {
	oldDataDir := util.DataDir
	oldWorkspaceDir := util.WorkspaceDir
	util.DataDir = t.TempDir()
	util.WorkspaceDir = t.TempDir()
	defer func() {
		util.DataDir = oldDataDir
		util.WorkspaceDir = oldWorkspaceDir
	}()

	box := &Box{ID: "box", Name: "box"}
	docPath := "20260601123000-abcdefg.sf"
	absPath := filepath.Join(util.DataDir, box.ID, docPath)
	if err := os.MkdirAll(filepath.Dir(absPath), 0755); err != nil {
		t.Fatalf("create doc dir: %s", err)
	}
	if err := os.WriteFile(absPath, []byte(`{"Type":"NodeDocument"}`), 0644); err != nil {
		t.Fatalf("write malformed doc fixture: %s", err)
	}

	if ial := box.docIAL(docPath); ial != nil {
		t.Fatalf("expected no IAL for malformed document, got %v", ial)
	}
	if _, err := os.Stat(absPath); err != nil {
		t.Fatalf("malformed document must remain in place after read: %s", err)
	}
}

func TestDocFromFileInfoFallsBackToPathID(t *testing.T) {
	oldConf := Conf
	oldTimeLangs := util.TimeLangs
	Conf = &AppConf{Lang: "zh_CN"}
	util.TimeLangs = map[string]map[string]interface{}{
		"zh_CN": {
			"albl": "", "blbl": "", "now": "now", "1s": "1s", "xs": "%ds", "1m": "1m", "xm": "%dm",
			"1h": "1h", "xh": "%dh", "1d": "1d", "xd": "%dd", "1w": "1w", "xw": "%dw",
			"1M": "1M", "xM": "%dM", "1y": "1y", "2y": "2y", "xy": "%dy", "max": "max",
		},
	}
	defer func() {
		Conf = oldConf
		util.TimeLangs = oldTimeLangs
	}()

	box := &Box{ID: "box", Name: "box"}
	docID := "20260601124000-abcdefg"
	doc := box.docFromFileInfo(&FileInfo{
		path: "/" + docID + ".sf",
		name: docID + ".sf",
		size: 32,
	}, map[string]string{
		"title": "Bad IAL",
	})

	if doc.ID != docID {
		t.Fatalf("doc ID = %q, want fallback path ID %q", doc.ID, docID)
	}
	if doc.CTime == 0 {
		t.Fatal("doc creation time should be derived from fallback path ID")
	}
}
