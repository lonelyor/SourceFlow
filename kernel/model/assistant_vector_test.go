package model

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/lonelyor/sourceflow/kernel/util"
)

func withAssistantVectorTestDataDir(t *testing.T) {
	t.Helper()

	oldDataDir := util.DataDir
	vectorStoreLock.Lock()
	oldVectorStore := vectorStore
	oldVectorLoaded := vectorLoaded
	vectorStore = map[string]*AssistantNoteVector{}
	vectorLoaded = true
	vectorStoreLock.Unlock()

	util.DataDir = t.TempDir()
	t.Cleanup(func() {
		vectorStoreLock.Lock()
		vectorStore = oldVectorStore
		vectorLoaded = oldVectorLoaded
		vectorStoreLock.Unlock()
		util.DataDir = oldDataDir
	})
}

func TestRemoveNoteVectorsPersistsDeletion(t *testing.T) {
	withAssistantVectorTestDataDir(t)

	StoreNoteVector("20260601120000-abcdefg", []float64{1, 0, 0}, "Note", "/Note")
	StoreNoteVector("20260601120100-abcdefg", []float64{0, 1, 0}, "Keep", "/Keep")

	RemoveNoteVectors([]string{"20260601120000-abcdefg"})

	if count := GetVectorCount(); count != 1 {
		t.Fatalf("unexpected vector count after deletion: %d", count)
	}

	data, err := os.ReadFile(filepath.Join(util.DataDir, "storage", "assistant_vectors.json"))
	if err != nil {
		t.Fatalf("read vector store: %s", err)
	}
	content := string(data)
	if strings.Contains(content, "20260601120000-abcdefg") {
		t.Fatal("deleted note vector must not remain in persisted vector store")
	}
	if !strings.Contains(content, "20260601120100-abcdefg") {
		t.Fatal("unrelated note vector should remain persisted")
	}
}
