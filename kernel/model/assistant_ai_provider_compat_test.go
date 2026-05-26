package model

import (
	"errors"
	"strings"
	"testing"

	"github.com/sashabaranov/go-openai"
)

func TestListAssistantAIProviderTypesIncludesDefaults(t *testing.T) {
	providers := ListAssistantAIProviderTypes()
	if 0 == len(providers) {
		t.Fatal("expected provider catalog")
	}
	var openAI *AssistantAIProviderType
	for _, provider := range providers {
		if AssistantAIProviderOpenAICompatible == provider.ID {
			openAI = provider
			break
		}
	}
	if nil == openAI {
		t.Fatal("expected OpenAI compatible provider")
	}
	if "" == openAI.BaseURL || "" == openAI.DefaultModel {
		t.Fatalf("expected base URL and default model, got baseURL=%q model=%q", openAI.BaseURL, openAI.DefaultModel)
	}
	if 0 == len(openAI.RecommendedSettings) {
		t.Fatal("expected recommended settings")
	}
	openAI.RecommendedSettings["temperature"] = 99
	providersAgain := ListAssistantAIProviderTypes()
	for _, provider := range providersAgain {
		if AssistantAIProviderOpenAICompatible == provider.ID && 99 == provider.RecommendedSettings["temperature"] {
			t.Fatal("provider recommended settings should be cloned")
		}
	}
}

func TestAssistantAIFakeProviderConfigAndConnectivity(t *testing.T) {
	providers := ListAssistantAIProviderTypes()
	var fake *AssistantAIProviderType
	for _, provider := range providers {
		if AssistantAIProviderFake == provider.ID {
			fake = provider
			break
		}
	}
	if nil == fake {
		t.Fatal("expected fake provider")
	}
	if "sourceflow://fake" != fake.BaseURL || "sourceflow-fake-chat" != fake.DefaultModel {
		t.Fatalf("unexpected fake provider defaults: baseURL=%q model=%q", fake.BaseURL, fake.DefaultModel)
	}
	if got := getAssistantAIFloatSetting(fake.RecommendedSettings, "temperature", -1); 0 != got {
		t.Fatalf("expected fake provider temperature 0, got %v", got)
	}

	result := TestAssistantAIConnection("sourceflow-fake", "", "", "", "")
	if nil == result || !result.OK {
		t.Fatalf("expected fake connection to succeed without network, got %#v", result)
	}

	models := ListAssistantAIModels(AssistantAIProviderFake, "", "", "", "")
	if "" != models.Error || 1 != len(models.Models) || "sourceflow-fake-chat" != models.Models[0].ID {
		t.Fatalf("unexpected fake models result: %#v", models)
	}
}

func TestAssistantAIFakeProviderReplyAndStream(t *testing.T) {
	profile := &AssistantAIProfile{
		Provider: AssistantAIProviderFake,
		Model:    "sourceflow-fake-chat",
		Settings: map[string]interface{}{},
	}
	messages := []*AssistantAIMessage{{Role: "user", Content: "hello fake provider"}}

	reply, err := chatWithAssistantAIProvider(profile, "", messages, &assistantAIChatOptions{})
	if nil != err {
		t.Fatal(err)
	}
	if !strings.Contains(reply.Content, "Fake Reply") {
		t.Fatalf("expected fake reply content, got %q", reply.Content)
	}
	if !strings.HasPrefix(reply.ProviderMessageID, "fake-") {
		t.Fatalf("expected fake message id, got %q", reply.ProviderMessageID)
	}
	if AssistantAIProviderFake != reply.Metadata["provider"] || true != reply.Metadata["fake"] {
		t.Fatalf("expected fake metadata, got %#v", reply.Metadata)
	}

	var deltas []string
	streamReply, err := chatWithAssistantAIProviderStream(profile, "", messages, func(delta string) error {
		deltas = append(deltas, delta)
		return nil
	}, &assistantAIChatOptions{})
	if nil != err {
		t.Fatal(err)
	}
	if strings.Join(deltas, "") != streamReply.Content {
		t.Fatalf("expected stream deltas to reconstruct content, got %q vs %q", strings.Join(deltas, ""), streamReply.Content)
	}
	if true != streamReply.Metadata["stream"] {
		t.Fatalf("expected stream metadata, got %#v", streamReply.Metadata)
	}
}

func TestAssistantAIFakeProviderToolLoopPreviewPatch(t *testing.T) {
	profile := &AssistantAIProfile{
		ID:       "fake-profile",
		Provider: AssistantAIProviderFake,
		Model:    "sourceflow-fake-chat",
		Settings: map[string]interface{}{
			"toolWriteScope": AssistantAIToolScopeCurrentNote,
		},
	}
	normalizeAssistantAIProfileSettings(profile)
	context := &AssistantAINoteContext{
		RootID:   "root-doc",
		Notebook: "notebook",
		Path:     "/fake-test-note",
		Title:    "Fake Note",
	}
	userPrompt := "请预览追加一段 AI 冒烟测试摘要"
	systemPrompt := buildAssistantAIToolPrompt(profile, context)
	if !strings.Contains(systemPrompt, AssistantAIToolAppendCurrentNote) {
		t.Fatal("expected tool prompt to include append-current-note")
	}

	result, err := runAssistantAIToolLoop(&assistantAIToolLoopParams{
		DB:              nil,
		Profile:         profile,
		SessionID:       "fake-session",
		Context:         context,
		UserPrompt:      userPrompt,
		SystemPrompt:    systemPrompt,
		ContextMessages: []*AssistantAIMessage{{Role: "user", Content: userPrompt}},
		EnableTools:     true,
		UseNativeTools:  false,
	})
	if nil != err {
		t.Fatal(err)
	}
	if 1 != len(result.ToolResults) {
		t.Fatalf("expected one tool result, got %d", len(result.ToolResults))
	}
	toolResult := result.ToolResults[0]
	if AssistantAIToolAppendCurrentNote != toolResult.ToolID {
		t.Fatalf("expected append tool, got %q", toolResult.ToolID)
	}
	if toolResult.Executed {
		t.Fatal("expected dry-run tool result to remain unexecuted")
	}
	patch, ok := toolResult.Data["previewPatch"].(map[string]interface{})
	if !ok || nil == patch {
		t.Fatalf("expected preview patch, got %#v", toolResult.Data)
	}
	if AssistantAIToolAppendCurrentNote != patch["toolId"] {
		t.Fatalf("expected preview patch tool id, got %#v", patch)
	}
	if !strings.Contains(result.Reply.Content, "Fake tool flow complete") {
		t.Fatalf("expected normal follow-up reply, got %q", result.Reply.Content)
	}
}

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
