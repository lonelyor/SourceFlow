package filesys

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/lonelyor/sourceflow/kernel/cache"
	"github.com/lonelyor/sourceflow/kernel/treenode"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
	"github.com/lonelyor/sourceflow/third_party/go/lute/parse"
)

func TestLoadTreeReturnsIndependentInstancesFromCache(t *testing.T) {
	oldDataDir := util.DataDir
	util.DataDir = t.TempDir()
	defer func() {
		util.DataDir = oldDataDir
		cache.ClearTreeCache()
	}()
	cache.ClearTreeCache()

	const boxID = "box"
	const docPath = "/20260601104000-abcdefg.sf"
	tree := treenode.NewTree(boxID, docPath, "/Note", "Note")
	raw, filePath, err := prepareWriteTree(tree)
	if err != nil {
		t.Fatalf("prepare tree: %s", err)
	}
	if err = os.WriteFile(filePath, raw, 0644); err != nil {
		t.Fatalf("write tree fixture: %s", err)
	}
	cache.ClearTreeCache()

	luteEngine := util.NewLute()
	first, err := LoadTree(boxID, docPath, luteEngine)
	if err != nil {
		t.Fatalf("load first tree: %s", err)
	}
	time.Sleep(100 * time.Millisecond)
	second, err := LoadTree(boxID, docPath, luteEngine)
	if err != nil {
		t.Fatalf("load second tree: %s", err)
	}
	if first == second {
		t.Fatal("LoadTree must not return the same mutable tree instance from cache")
	}
	if first.Root == second.Root {
		t.Fatal("LoadTree must not return the same mutable root node from cache")
	}

	first.Path = "/mutated.sf"
	first.Root.SetIALAttr("title", "Mutated")
	if second.Path == first.Path {
		t.Fatal("mutating one loaded tree path must not affect another load")
	}
	if second.Root.IALAttr("title") == "Mutated" {
		t.Fatal("mutating one loaded tree root must not affect another load")
	}
}

func TestPrepareWriteTreeRefusesEmptyTreeOverExistingDocument(t *testing.T) {
	oldDataDir := util.DataDir
	util.DataDir = t.TempDir()
	defer func() {
		util.DataDir = oldDataDir
		cache.ClearTreeCache()
	}()
	cache.ClearTreeCache()

	const boxID = "box"
	const docPath = "/20260601105000-abcdefg.sf"
	filePath := filepath.Join(util.DataDir, boxID, docPath)
	if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		t.Fatalf("create fixture dir: %s", err)
	}
	if err := os.WriteFile(filePath, []byte(`{"Type":"NodeDocument"}`), 0644); err != nil {
		t.Fatalf("write existing tree fixture: %s", err)
	}

	rootID := util.GetTreeID(docPath)
	tree := &parse.Tree{
		ID:   rootID,
		Box:  boxID,
		Path: docPath,
		Root: &ast.Node{Type: ast.NodeDocument, ID: rootID, Box: boxID, Path: docPath},
	}
	_, _, err := prepareWriteTree(tree)
	if err == nil {
		t.Fatal("prepareWriteTree must refuse to overwrite an existing document with an empty tree")
	}
	if !strings.Contains(err.Error(), "refuse to write empty tree") {
		t.Fatalf("unexpected error: %s", err)
	}

	data, readErr := os.ReadFile(filePath)
	if readErr != nil {
		t.Fatalf("read existing tree fixture: %s", readErr)
	}
	if string(data) != `{"Type":"NodeDocument"}` {
		t.Fatalf("existing document changed after refused write: %s", data)
	}
}
