package model

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/filelock"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
)

type AssistantEmbeddingConfig struct {
	Provider     string `json:"provider"`
	BaseURL      string `json:"baseURL"`
	APIKey       string `json:"apiKey"`
	APIKeyAction string `json:"apiKeyAction,omitempty"`
	Model        string `json:"model"`
	Enabled      bool   `json:"enabled"`
}

type AssistantEmbeddingConfigView struct {
	Provider  string `json:"provider"`
	BaseURL   string `json:"baseURL"`
	APIKey    string `json:"apiKey"`
	Model     string `json:"model"`
	Enabled   bool   `json:"enabled"`
	HasAPIKey bool   `json:"hasAPIKey"`
}

var (
	embeddingConfigCache *AssistantEmbeddingConfig
	embeddingConfigLock  sync.Mutex
)

const assistantEmbeddingResponseMaxBytes = 4 * 1024 * 1024
const assistantEmbeddingErrorMaxBytes = 512 * 1024

func embeddingConfigPath() string {
	return filepath.Join(util.DataDir, "storage", "assistant_embedding.json")
}

func cloneAssistantEmbeddingConfig(cfg *AssistantEmbeddingConfig) *AssistantEmbeddingConfig {
	if nil == cfg {
		return &AssistantEmbeddingConfig{}
	}
	ret := *cfg
	return &ret
}

func normalizeAssistantEmbeddingConfig(cfg *AssistantEmbeddingConfig) *AssistantEmbeddingConfig {
	ret := cloneAssistantEmbeddingConfig(cfg)
	ret.Provider = strings.TrimSpace(ret.Provider)
	ret.BaseURL = strings.TrimRight(strings.TrimSpace(ret.BaseURL), "/")
	ret.APIKey = strings.TrimSpace(ret.APIKey)
	if action, err := NormalizeAssistantAPIKeyAction(ret.APIKeyAction, ret.APIKey); nil == err {
		ret.APIKeyAction = action
	} else {
		ret.APIKeyAction = strings.TrimSpace(ret.APIKeyAction)
	}
	ret.Model = strings.TrimSpace(ret.Model)
	return ret
}

func GetAssistantEmbeddingConfig() *AssistantEmbeddingConfig {
	embeddingConfigLock.Lock()
	defer embeddingConfigLock.Unlock()
	return cloneAssistantEmbeddingConfig(getAssistantEmbeddingConfigLocked())
}

func getAssistantEmbeddingConfigLocked() *AssistantEmbeddingConfig {
	if embeddingConfigCache != nil {
		return embeddingConfigCache
	}
	cfg := &AssistantEmbeddingConfig{}
	p := embeddingConfigPath()
	data, err := os.ReadFile(p)
	if err != nil {
		embeddingConfigCache = cfg
		return cfg
	}
	if err = json.Unmarshal(data, cfg); err != nil {
		logging.LogWarnf("parse embedding config [%s] failed: %s", p, err)
		cfg = &AssistantEmbeddingConfig{}
	}
	cfg = normalizeAssistantEmbeddingConfig(cfg)
	embeddingConfigCache = cfg
	return cfg
}

func GetAssistantEmbeddingConfigView() *AssistantEmbeddingConfigView {
	cfg := GetAssistantEmbeddingConfig()
	return &AssistantEmbeddingConfigView{
		Provider:  cfg.Provider,
		BaseURL:   cfg.BaseURL,
		APIKey:    "",
		Model:     cfg.Model,
		Enabled:   cfg.Enabled,
		HasAPIKey: "" != cfg.APIKey,
	}
}

func SetAssistantEmbeddingConfig(cfg *AssistantEmbeddingConfig) error {
	embeddingConfigLock.Lock()
	defer embeddingConfigLock.Unlock()
	if cfg == nil {
		cfg = &AssistantEmbeddingConfig{}
	}
	cfg = normalizeAssistantEmbeddingConfig(cfg)
	switch cfg.APIKeyAction {
	case AssistantAPIKeyActionKeep:
		cfg.APIKey = getAssistantEmbeddingConfigLocked().APIKey
	case AssistantAPIKeyActionReplace:
		if "" == cfg.APIKey {
			return fmt.Errorf("embedding API key is required when replacing")
		}
	case AssistantAPIKeyActionClear:
		cfg.APIKey = ""
	default:
		return fmt.Errorf("unsupported API key action [%s]", cfg.APIKeyAction)
	}
	cfg.APIKeyAction = ""
	dir := filepath.Dir(embeddingConfigPath())
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("create embedding config dir: %w", err)
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal embedding config: %w", err)
	}
	if err := filelock.WriteFile(embeddingConfigPath(), data); err != nil {
		return fmt.Errorf("write embedding config: %w", err)
	}
	embeddingConfigCache = cfg
	return nil
}

type embeddingRequest struct {
	Model string `json:"model"`
	Input string `json:"input"`
}

type embeddingResponse struct {
	Data []struct {
		Embedding []float64 `json:"embedding"`
	} `json:"data"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func GenerateEmbedding(text string, cfg *AssistantEmbeddingConfig) ([]float64, error) {
	if cfg == nil || !cfg.Enabled {
		return nil, fmt.Errorf("embedding is not enabled")
	}
	if cfg.BaseURL == "" {
		return nil, fmt.Errorf("embedding base URL is not configured")
	}
	if cfg.Model == "" {
		return nil, fmt.Errorf("embedding model is not configured")
	}

	reqBody := embeddingRequest{
		Model: cfg.Model,
		Input: text,
	}
	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal embedding request: %w", err)
	}

	endpoint := cfg.BaseURL
	if len(endpoint) > 0 && endpoint[len(endpoint)-1] == '/' {
		endpoint = endpoint[:len(endpoint)-1]
	}
	endpoint = endpoint + "/embeddings"

	req, err := http.NewRequest("POST", endpoint, bytes.NewReader(jsonData))
	if err != nil {
		return nil, fmt.Errorf("create embedding request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if cfg.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call embedding API: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, assistantEmbeddingResponseMaxBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read embedding response: %w", err)
	}
	responseTooLarge := len(body) > assistantEmbeddingResponseMaxBytes
	if responseTooLarge {
		body = body[:assistantEmbeddingResponseMaxBytes]
	}

	if resp.StatusCode != http.StatusOK {
		if len(body) > assistantEmbeddingErrorMaxBytes {
			body = body[:assistantEmbeddingErrorMaxBytes]
		}
		return nil, fmt.Errorf("embedding API returned status %d: %s", resp.StatusCode, string(body))
	}
	if responseTooLarge {
		return nil, fmt.Errorf("embedding API response exceeds %d bytes", assistantEmbeddingResponseMaxBytes)
	}

	var embResp embeddingResponse
	if err := json.Unmarshal(body, &embResp); err != nil {
		return nil, fmt.Errorf("parse embedding response: %w", err)
	}

	if embResp.Error != nil {
		return nil, fmt.Errorf("embedding API error: %s", embResp.Error.Message)
	}

	if len(embResp.Data) == 0 {
		return nil, fmt.Errorf("embedding API returned no data")
	}

	if len(embResp.Data[0].Embedding) == 0 {
		return nil, fmt.Errorf("embedding API returned empty vector")
	}

	return embResp.Data[0].Embedding, nil
}
