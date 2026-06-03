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

func TestAssistantEmbeddingConfigAPIKeyActions(t *testing.T) {
	withAssistantEmbeddingTestDataDir(t)

	if err := SetAssistantEmbeddingConfig(&AssistantEmbeddingConfig{
		Provider:     "openai-compatible",
		BaseURL:      "https://example.invalid/v1",
		APIKey:       "secret-key",
		APIKeyAction: AssistantAPIKeyActionReplace,
		Model:        "embed",
		Enabled:      true,
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
		Provider:     "openai-compatible",
		BaseURL:      "https://example.invalid/v1",
		APIKeyAction: AssistantAPIKeyActionKeep,
		Model:        "embed-v2",
		Enabled:      true,
	}); err != nil {
		t.Fatalf("save config with keep key action: %s", err)
	}

	cfg := GetAssistantEmbeddingConfig()
	if cfg.APIKey != "secret-key" {
		t.Fatal("keep embedding API key action must preserve the stored key")
	}
	if cfg.Model != "embed-v2" {
		t.Fatalf("non-secret fields must still update, got model %q", cfg.Model)
	}

	if err := SetAssistantEmbeddingConfig(&AssistantEmbeddingConfig{
		Provider:     "openai-compatible",
		BaseURL:      "https://example.invalid/v1",
		APIKeyAction: AssistantAPIKeyActionClear,
		Model:        "embed-v3",
		Enabled:      true,
	}); err != nil {
		t.Fatalf("clear embedding API key: %s", err)
	}
	cfg = GetAssistantEmbeddingConfig()
	if cfg.APIKey != "" {
		t.Fatalf("clear embedding API key action should remove key, got %q", cfg.APIKey)
	}
	view = GetAssistantEmbeddingConfigView()
	if view.HasAPIKey {
		t.Fatal("embedding config view should report no key after clear")
	}

	if err := SetAssistantEmbeddingConfig(&AssistantEmbeddingConfig{
		Provider:     "openai-compatible",
		BaseURL:      "https://example.invalid/v1",
		APIKey:       "new-secret",
		APIKeyAction: AssistantAPIKeyActionReplace,
		Model:        "embed-v4",
		Enabled:      true,
	}); err != nil {
		t.Fatalf("replace embedding API key: %s", err)
	}

	data, err := os.ReadFile(filepath.Join(util.DataDir, "storage", "assistant_embedding.json"))
	if err != nil {
		t.Fatalf("read saved config: %s", err)
	}
	if !strings.Contains(string(data), "new-secret") || strings.Contains(string(data), "secret-key") {
		t.Fatal("stored embedding config should contain only the replaced key on disk")
	}

	if err := SetAssistantEmbeddingConfig(&AssistantEmbeddingConfig{
		Provider:     "openai-compatible",
		BaseURL:      "https://example.invalid/v1",
		APIKeyAction: AssistantAPIKeyActionReplace,
		Model:        "embed-v5",
		Enabled:      true,
	}); err == nil {
		t.Fatal("replace embedding API key action with blank key should fail")
	}
}
