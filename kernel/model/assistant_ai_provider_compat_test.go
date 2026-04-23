package model

import (
	"errors"
	"strings"
	"testing"

	"github.com/sashabaranov/go-openai"
)

func TestNormalizeAssistantAIProfileSettingsKimiK25(t *testing.T) {
	profile := &AssistantAIProfile{
		Provider: AssistantAIProviderKimi,
		Model:    "kimi-k2.5",
		Settings: map[string]interface{}{
			"temperature": 0.7,
		},
	}

	normalizeAssistantAIProfileSettings(profile)

	if got := getAssistantAIFloatSetting(profile.Settings, "temperature", 0); 1 != got {
		t.Fatalf("expected temperature to be normalized to 1, got %v", got)
	}
}

func TestBuildAssistantAIOpenAICompatibleRetryFromProviderError(t *testing.T) {
	profile := &AssistantAIProfile{
		Provider: AssistantAIProviderKimi,
		Model:    "kimi-k2.5",
		Settings: map[string]interface{}{
			"temperature": 0.7,
		},
	}
	req := openai.ChatCompletionRequest{Temperature: 0.7}

	retryReq, shouldRetry, shouldPersist := buildAssistantAIOpenAICompatibleRetry(profile, req, errors.New("invalid temperature: only 1 is allowed for this model"))
	if !shouldRetry {
		t.Fatal("expected adaptive retry to be enabled")
	}
	if !shouldPersist {
		t.Fatal("expected adaptive retry to persist normalized settings")
	}
	if got := retryReq.Temperature; 1 != got {
		t.Fatalf("expected retry temperature to be 1, got %v", got)
	}
	if got := getAssistantAIFloatSetting(profile.Settings, "temperature", 0); 1 != got {
		t.Fatalf("expected persisted temperature to be 1, got %v", got)
	}
}

func TestResolveAssistantAIRequestTemperatureAnthropicClamp(t *testing.T) {
	profile := &AssistantAIProfile{
		Provider: AssistantAIProviderAnthropic,
		Settings: map[string]interface{}{
			"temperature": 1.8,
		},
	}

	if got := resolveAssistantAIRequestTemperature(profile, assistantAIDefaultTemperature); 1 != got {
		t.Fatalf("expected anthropic temperature to be clamped to 1, got %v", got)
	}
}

func TestResolveAssistantAIRequestMaxTokensDeepSeekReasoner(t *testing.T) {
	profile := &AssistantAIProfile{
		Provider: AssistantAIProviderDeepSeek,
		Model:    "deepseek-reasoner",
		Settings: map[string]interface{}{},
	}

	if got := resolveAssistantAIRequestMaxTokens(profile, 0); 32768 != got {
		t.Fatalf("expected deepseek-reasoner max tokens preset 32768, got %d", got)
	}
	if !shouldOmitAssistantAITemperature(profile, 1) {
		t.Fatal("expected deepseek-reasoner temperature to be omitted")
	}
}

func TestResolveAssistantAIOpenAICompatibleAPIKeyOllamaLocal(t *testing.T) {
	profile := &AssistantAIProfile{
		Provider: AssistantAIProviderOllama,
		BaseURL:  "http://127.0.0.1:11434/v1",
	}

	if got := resolveAssistantAIOpenAICompatibleAPIKey(profile); "ollama" != got {
		t.Fatalf("expected ollama local API key fallback, got %q", got)
	}
}

func TestNormalizeAssistantAIProfileSettingsVolcenginePreset(t *testing.T) {
	profile := &AssistantAIProfile{
		Provider: AssistantAIProviderVolcengine,
		Settings: map[string]interface{}{},
	}

	normalizeAssistantAIProfileSettings(profile)

	if got := getAssistantAIFloatSetting(profile.Settings, "temperature", 0); 0.1 != got {
		t.Fatalf("expected volcengine preset temperature 0.1, got %v", got)
	}
	if got := getAssistantAIIntSetting(profile.Settings, "maxTokens", 0); 4096 != got {
		t.Fatalf("expected volcengine preset max tokens 4096, got %d", got)
	}
}

func TestNormalizeAssistantAIProfileSettingsVolcenginePlanPreset(t *testing.T) {
	profile := &AssistantAIProfile{
		Provider: AssistantAIProviderVolcenginePlan,
		Settings: map[string]interface{}{},
	}

	normalizeAssistantAIProfileSettings(profile)

	if got := getAssistantAIFloatSetting(profile.Settings, "temperature", 0); 0.1 != got {
		t.Fatalf("expected volcengine plan preset temperature 0.1, got %v", got)
	}
	if got := getAssistantAIIntSetting(profile.Settings, "maxTokens", 0); 4096 != got {
		t.Fatalf("expected volcengine plan preset max tokens 4096, got %d", got)
	}
}

func TestTrimAssistantAIContextMessages(t *testing.T) {
	messages := []*AssistantAIMessage{
		{Content: strings.Repeat("a", 800)},
		{Content: strings.Repeat("b", 800)},
		{Content: strings.Repeat("c", 800)},
	}

	trimmed := trimAssistantAIContextMessages(messages, 300)
	if got := len(trimmed); 1 != got {
		t.Fatalf("expected only the newest message to remain, got %d", got)
	}
	if got := trimmed[0].Content; got != messages[2].Content {
		t.Fatalf("expected newest message to remain, got %q", got)
	}
}
