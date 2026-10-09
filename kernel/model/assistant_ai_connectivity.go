package model

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

type AssistantAIConnectionTestResult struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
	Latency int64  `json:"latency"`
}

type AssistantAIModelEntry struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	ContextWindow int    `json:"contextWindow,omitempty"`
}

type AssistantAIModelListResult struct {
	Models []*AssistantAIModelEntry `json:"models"`
	Error  string                   `json:"error,omitempty"`
}

func TestAssistantAIConnection(provider, baseURL, apiKey, proxy, userAgent string) *AssistantAIConnectionTestResult {
	provider = normalizeAssistantAIProvider(provider)
	if AssistantAIProviderFake == provider {
		return &AssistantAIConnectionTestResult{OK: true, Message: "OK (fake provider)", Latency: 0}
	}
	baseURL = strings.TrimSpace(baseURL)
	apiKey = strings.TrimSpace(apiKey)
	if "" == baseURL {
		return &AssistantAIConnectionTestResult{OK: false, Message: "Base URL is required"}
	}

	profile := &AssistantAIProfile{
		Provider:  provider,
		BaseURL:   baseURL,
		APIKey:    apiKey,
		Proxy:     proxy,
		UserAgent: userAgent,
		Settings:  map[string]interface{}{"timeout": 15},
	}

	endpoint := resolveAssistantAIModelsEndpoint(provider, baseURL)

	start := time.Now()
	client, clientErr := newAssistantAIHTTPClient(profile)
	if nil != clientErr {
		return &AssistantAIConnectionTestResult{OK: false, Message: fmt.Sprintf("HTTP client error: %s", clientErr.Error())}
	}

	req, reqErr := http.NewRequestWithContext(context.Background(), http.MethodGet, endpoint, nil)
	if nil != reqErr {
		return &AssistantAIConnectionTestResult{OK: false, Message: fmt.Sprintf("request error: %s", reqErr.Error())}
	}

	setAssistantAIRequestHeaders(provider, apiKey, req)
	if "" != userAgent {
		req.Header.Set("User-Agent", userAgent)
	}

	resp, respErr := client.Do(req)
	latency := time.Since(start).Milliseconds()
	if nil != respErr {
		return &AssistantAIConnectionTestResult{OK: false, Message: fmt.Sprintf("connection failed: %s", respErr.Error()), Latency: latency}
	}
	defer resp.Body.Close()

	if 200 <= resp.StatusCode && resp.StatusCode < 300 {
		return &AssistantAIConnectionTestResult{OK: true, Message: "OK", Latency: latency}
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
	return &AssistantAIConnectionTestResult{
		OK:      false,
		Message: fmt.Sprintf("HTTP %d: %s", resp.StatusCode, sanitizeAIProviderErrorBody(string(body))),
		Latency: latency,
	}
}

func ListAssistantAIModels(provider, baseURL, apiKey, proxy, userAgent string) *AssistantAIModelListResult {
	provider = normalizeAssistantAIProvider(provider)
	if AssistantAIProviderFake == provider {
		return &AssistantAIModelListResult{Models: getAssistantAIStaticModels(provider)}
	}
	baseURL = strings.TrimSpace(baseURL)
	apiKey = strings.TrimSpace(apiKey)
	if "" == baseURL || "" == apiKey {
		if AssistantAIProviderOllama != provider {
			return &AssistantAIModelListResult{Error: "Base URL and API Key are required"}
		}
	}

	if preset := getAssistantAIStaticModels(provider); nil != preset {
		return &AssistantAIModelListResult{Models: preset}
	}

	profile := &AssistantAIProfile{
		Provider:  provider,
		BaseURL:   baseURL,
		APIKey:    apiKey,
		Proxy:     proxy,
		UserAgent: userAgent,
		Settings:  map[string]interface{}{"timeout": 15},
	}

	endpoint := resolveAssistantAIModelsEndpoint(provider, baseURL)
	client, clientErr := newAssistantAIHTTPClient(profile)
	if nil != clientErr {
		return &AssistantAIModelListResult{Error: clientErr.Error()}
	}

	req, reqErr := http.NewRequestWithContext(context.Background(), http.MethodGet, endpoint, nil)
	if nil != reqErr {
		return &AssistantAIModelListResult{Error: reqErr.Error()}
	}

	setAssistantAIRequestHeaders(provider, apiKey, req)
	if "" != userAgent {
		req.Header.Set("User-Agent", userAgent)
	}

	resp, respErr := client.Do(req)
	if nil != respErr {
		return &AssistantAIModelListResult{Error: respErr.Error()}
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return &AssistantAIModelListResult{Error: fmt.Sprintf("HTTP %d", resp.StatusCode)}
	}

	result := parseAssistantAIModelsResponse(provider, resp)
	// Ollama /api/tags does not expose context length, so without this lookup
	// every Ollama model falls back to the provider catalog guess and local
	// small-window models get overfed. Best-effort enrichment via /api/show.
	if AssistantAIProviderOllama == provider && "" == result.Error && 0 < len(result.Models) {
		enrichOllamaModelContextWindows(client, baseURL, result.Models)
	}
	return result
}

func resolveAssistantAIModelsEndpoint(provider, baseURL string) string {
	switch provider {
	case AssistantAIProviderGemini:
		endpoint := strings.TrimRight(baseURL, "/")
		return endpoint + "/v1beta/models"
	case AssistantAIProviderOllama:
		endpoint := strings.TrimRight(baseURL, "/")
		if strings.HasSuffix(endpoint, "/v1") {
			return strings.TrimSuffix(endpoint, "/v1") + "/api/tags"
		}
		return endpoint + "/api/tags"
	default:
		endpoint := strings.TrimRight(baseURL, "/")
		return endpoint + "/models"
	}
}

func setAssistantAIRequestHeaders(provider, apiKey string, req *http.Request) {
	switch provider {
	case AssistantAIProviderAnthropic:
		req.Header.Set("x-api-key", apiKey)
		req.Header.Set("anthropic-version", "2023-06-01")
	case AssistantAIProviderGemini:
		req.Header.Set("x-goog-api-key", apiKey)
	default:
		if "" != apiKey {
			req.Header.Set("Authorization", "Bearer "+apiKey)
		}
	}
	req.Header.Set("Content-Type", "application/json")
}

func parseAssistantAIModelsResponse(provider string, resp *http.Response) *AssistantAIModelListResult {
	body, readErr := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
	if nil != readErr {
		return &AssistantAIModelListResult{Error: readErr.Error()}
	}

	switch provider {
	case AssistantAIProviderGemini:
		return parseGeminiModelsResponse(body)
	case AssistantAIProviderOllama:
		return parseOllamaModelsResponse(body)
	default:
		return parseOpenAIModelsResponse(body)
	}
}

func parseOpenAIModelsResponse(body []byte) *AssistantAIModelListResult {
	var raw struct {
		Data []struct {
			ID            string `json:"id"`
			Name          string `json:"name"`
			ContextLength int    `json:"context_length"`
			MaxContextLen int    `json:"max_context_length"`
		} `json:"data"`
	}
	if jsonErr := json.Unmarshal(body, &raw); nil != jsonErr {
		return &AssistantAIModelListResult{Error: jsonErr.Error()}
	}
	models := make([]*AssistantAIModelEntry, 0, len(raw.Data))
	for _, m := range raw.Data {
		name := m.Name
		if "" == name {
			name = m.ID
		}
		// OpenRouter and some OpenAI-compatible gateways expose the real
		// context window on the models endpoint. Capture it when present so the
		// frontend can size note context per model instead of per provider.
		contextWindow := m.ContextLength
		if m.MaxContextLen > contextWindow {
			contextWindow = m.MaxContextLen
		}
		models = append(models, &AssistantAIModelEntry{ID: m.ID, Name: name, ContextWindow: contextWindow})
	}
	return &AssistantAIModelListResult{Models: models}
}

func parseGeminiModelsResponse(body []byte) *AssistantAIModelListResult {
	var raw struct {
		Models []struct {
			Name            string `json:"name"`
			DisplayName     string `json:"displayName"`
			InputTokenLimit int    `json:"inputTokenLimit"`
		} `json:"models"`
	}
	if jsonErr := json.Unmarshal(body, &raw); nil != jsonErr {
		return &AssistantAIModelListResult{Error: jsonErr.Error()}
	}
	models := make([]*AssistantAIModelEntry, 0, len(raw.Models))
	for _, m := range raw.Models {
		id := strings.TrimPrefix(m.Name, "models/")
		name := m.DisplayName
		if "" == name {
			name = id
		}
		models = append(models, &AssistantAIModelEntry{ID: id, Name: name, ContextWindow: m.InputTokenLimit})
	}
	return &AssistantAIModelListResult{Models: models}
}

func parseOllamaModelsResponse(body []byte) *AssistantAIModelListResult {
	var raw struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	if jsonErr := json.Unmarshal(body, &raw); nil != jsonErr {
		return &AssistantAIModelListResult{Error: jsonErr.Error()}
	}
	models := make([]*AssistantAIModelEntry, 0, len(raw.Models))
	for _, m := range raw.Models {
		models = append(models, &AssistantAIModelEntry{ID: m.Name, Name: m.Name})
	}
	return &AssistantAIModelListResult{Models: models}
}

// ollamaNumCtxRe matches the num_ctx parameter in the /api/show "parameters"
// block. Ollama renders Modelfile parameters either quoted
// ('parameter' 'num_ctx' '8192') or plain (PARAMETER num_ctx 8192).
var ollamaNumCtxRe = regexp.MustCompile(`num_ctx[^0-9\-]*([0-9]+)`)

func resolveAssistantAIOllamaShowEndpoint(baseURL string) string {
	endpoint := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if strings.HasSuffix(endpoint, "/v1") {
		endpoint = strings.TrimSuffix(endpoint, "/v1")
	}
	return endpoint + "/api/show"
}

func parseOllamaShowContextLength(body []byte) int {
	var raw struct {
		Parameters string         `json:"parameters"`
		ModelInfo  map[string]any `json:"model_info"`
	}
	if jsonErr := json.Unmarshal(body, &raw); nil != jsonErr {
		return 0
	}
	// Newer Ollama exposes ollama.context_length in model_info. Values are
	// usually grpc StringValue-style strings, but tolerate raw numbers too.
	for _, key := range []string{"ollama.context_length", "context_length"} {
		if val, ok := raw.ModelInfo[key]; ok {
			switch v := val.(type) {
			case string:
				if n, err := strconv.Atoi(strings.TrimSpace(v)); nil == err && n > 0 {
					return n
				}
			case float64:
				if v > 0 {
					return int(v)
				}
			}
		}
	}
	if match := ollamaNumCtxRe.FindStringSubmatch(raw.Parameters); nil != match {
		if n, err := strconv.Atoi(match[1]); nil == err && n > 0 {
			return n
		}
	}
	return 0
}

func fetchOllamaModelContextWindow(ctx context.Context, client *http.Client, endpoint, modelName, userAgent string) int {
	payload, err := json.Marshal(map[string]string{"model": modelName})
	if nil != err {
		return 0
	}
	req, reqErr := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if nil != reqErr {
		return 0
	}
	req.Header.Set("Content-Type", "application/json")
	if "" != userAgent {
		req.Header.Set("User-Agent", userAgent)
	}
	resp, respErr := client.Do(req)
	if nil != respErr {
		return 0
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return 0
	}
	body, readErr := io.ReadAll(io.LimitReader(resp.Body, 1024*1024))
	if nil != readErr {
		return 0
	}
	return parseOllamaShowContextLength(body)
}

// enrichOllamaModelContextWindows resolves each model's real context window
// via POST {base}/api/show, concurrently and best-effort: failures or timeouts
// leave ContextWindow at 0 so the frontend falls back to the catalog default.
func enrichOllamaModelContextWindows(client *http.Client, baseURL string, models []*AssistantAIModelEntry) {
	const maxEnrichedModels = 64
	if len(models) > maxEnrichedModels {
		models = models[:maxEnrichedModels]
	}
	endpoint := resolveAssistantAIOllamaShowEndpoint(baseURL)
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()

	var wg sync.WaitGroup
	sem := make(chan struct{}, 8)
	for _, model := range models {
		if nil == model || "" == strings.TrimSpace(model.ID) || 0 < model.ContextWindow {
			continue
		}
		wg.Add(1)
		go func(entry *AssistantAIModelEntry) {
			defer wg.Done()
			select {
			case sem <- struct{}{}:
				defer func() { <-sem }()
			case <-ctx.Done():
				return
			}
			if window := fetchOllamaModelContextWindow(ctx, client, endpoint, entry.ID, ""); window > 0 {
				entry.ContextWindow = window
			}
		}(model)
	}
	wg.Wait()
}

func getAssistantAIStaticModels(provider string) []*AssistantAIModelEntry {
	switch provider {
	case AssistantAIProviderFake:
		return []*AssistantAIModelEntry{
			{ID: "sourceflow-fake-chat", Name: "SourceFlow Fake Chat", ContextWindow: 32768},
		}
	case AssistantAIProviderAnthropic:
		// Anthropic does not expose token limits via API; all current Claude
		// models ship a 200k window. Stamped here so the frontend can size
		// note context without a per-model lookup.
		return []*AssistantAIModelEntry{
			{ID: "claude-sonnet-4-20250514", Name: "Claude Sonnet 4", ContextWindow: 200000},
			{ID: "claude-opus-4-20250514", Name: "Claude Opus 4", ContextWindow: 200000},
			{ID: "claude-3-7-sonnet-20250219", Name: "Claude 3.7 Sonnet", ContextWindow: 200000},
			{ID: "claude-3-5-haiku-20241022", Name: "Claude 3.5 Haiku", ContextWindow: 200000},
		}
	}
	return nil
}

func sanitizeAIProviderErrorBody(body string) string {
	s := strings.TrimSpace(body)
	if runic := []rune(s); len(runic) > 256 {
		s = string(runic[:256])
	}
	return s
}
