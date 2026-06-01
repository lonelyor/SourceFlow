package model

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/lonelyor/sourceflow/kernel/util"
)

func withAssistantEmbeddingTestDataDir(t *testing.T) {
	t.Helper()

	oldDataDir := util.DataDir
	embeddingConfigLock.Lock()
	oldConfigCache := embeddingConfigCache
	embeddingConfigCache = nil
	embeddingConfigLock.Unlock()

	util.DataDir = t.TempDir()
	t.Cleanup(func() {
		embeddingConfigLock.Lock()
		embeddingConfigCache = oldConfigCache
		embeddingConfigLock.Unlock()
		util.DataDir = oldDataDir
	})
}

func TestAssistantEmbeddingConfigViewHidesAPIKeyAndBlankSavePreservesKey(t *testing.T) {
	withAssistantEmbeddingTestDataDir(t)

	if err := SetAssistantEmbeddingConfig(&AssistantEmbeddingConfig{
		Provider: "openai-compatible",
		BaseURL:  "https://example.invalid/v1",
		APIKey:   "secret-key",
		Model:    "embed",
		Enabled:  true,
	}); err != nil {
		t.Fatalf("save initial config: %s", err)
	}

	view := GetAssistantEmbeddingConfigView()
	if view.APIKey != "" {
		t.Fatal("embedding config API view must not expose the stored API key")
	}
	if !view.HasAPIKey {
		t.Fatal("embedding config API view should report that a key is stored")
	}

	if err := SetAssistantEmbeddingConfig(&AssistantEmbeddingConfig{
		Provider: "openai-compatible",
		BaseURL:  "https://example.invalid/v1",
		Model:    "embed-v2",
		Enabled:  true,
	}); err != nil {
		t.Fatalf("save config with blank key: %s", err)
	}

	cfg := GetAssistantEmbeddingConfig()
	if cfg.APIKey != "secret-key" {
		t.Fatal("blank embedding API key save must preserve the stored key")
	}
	if cfg.Model != "embed-v2" {
		t.Fatalf("non-secret fields must still update, got model %q", cfg.Model)
	}

	data, err := os.ReadFile(filepath.Join(util.DataDir, "storage", "assistant_embedding.json"))
	if err != nil {
		t.Fatalf("read saved config: %s", err)
	}
	if !strings.Contains(string(data), "secret-key") {
		t.Fatal("stored embedding config should keep the preserved key on disk")
	}
}
