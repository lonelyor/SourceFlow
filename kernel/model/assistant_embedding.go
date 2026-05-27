package model

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/lonelyor/sourceflow/kernel/util"
)

type AssistantEmbeddingConfig struct {
	Provider string `json:"provider"`
	BaseURL  string `json:"baseURL"`
	APIKey   string `json:"apiKey"`
	Model    string `json:"model"`
	Enabled  bool   `json:"enabled"`
}

var (
	embeddingConfigOnce  sync.Once
	embeddingConfigCache *AssistantEmbeddingConfig
	embeddingConfigLock  sync.Mutex
)

func embeddingConfigPath() string {
	return filepath.Join(util.DataDir, "storage", "assistant_embedding.json")
}

func GetAssistantEmbeddingConfig() *AssistantEmbeddingConfig {
	embeddingConfigLock.Lock()
	defer embeddingConfigLock.Unlock()
	if embeddingConfigCache != nil {
		return embeddingConfigCache
	}
	cfg := &AssistantEmbeddingConfig{}
	p := embeddingConfigPath()
	data, err := os.ReadFile(p)
	if err != nil {
		return cfg
	}
	_ = json.Unmarshal(data, cfg)
	embeddingConfigCache = cfg
	return cfg
}

func SetAssistantEmbeddingConfig(cfg *AssistantEmbeddingConfig) error {
	embeddingConfigLock.Lock()
	defer embeddingConfigLock.Unlock()
	if cfg == nil {
		cfg = &AssistantEmbeddingConfig{}
	}
	dir := filepath.Dir(embeddingConfigPath())
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("create embedding config dir: %w", err)
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal embedding config: %w", err)
	}
	if err := os.WriteFile(embeddingConfigPath(), data, 0644); err != nil {
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

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read embedding response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("embedding API returned status %d: %s", resp.StatusCode, string(body))
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
