package model

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type AssistantAIConnectionTestResult struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
	Latency int64  `json:"latency"`
}

type AssistantAIModelEntry struct {
	ID   string `json:"id"`
	Name string `json:"name"`
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

	return parseAssistantAIModelsResponse(provider, resp)
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
			ID   string `json:"id"`
			Name string `json:"name"`
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
		models = append(models, &AssistantAIModelEntry{ID: m.ID, Name: name})
	}
	return &AssistantAIModelListResult{Models: models}
}

func parseGeminiModelsResponse(body []byte) *AssistantAIModelListResult {
	var raw struct {
		Models []struct {
			Name        string `json:"name"`
			DisplayName string `json:"displayName"`
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
		models = append(models, &AssistantAIModelEntry{ID: id, Name: name})
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

func getAssistantAIStaticModels(provider string) []*AssistantAIModelEntry {
	switch provider {
	case AssistantAIProviderFake:
		return []*AssistantAIModelEntry{
			{ID: "sourceflow-fake-chat", Name: "SourceFlow Fake Chat"},
		}
	case AssistantAIProviderAnthropic:
		return []*AssistantAIModelEntry{
			{ID: "claude-sonnet-4-20250514", Name: "Claude Sonnet 4"},
			{ID: "claude-opus-4-20250514", Name: "Claude Opus 4"},
			{ID: "claude-3-7-sonnet-20250219", Name: "Claude 3.7 Sonnet"},
			{ID: "claude-3-5-haiku-20241022", Name: "Claude 3.5 Haiku"},
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
