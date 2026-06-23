package model

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

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

func TestAssistantAIHTTPClientCacheRespectsTimeout(t *testing.T) {
	assistantAIHTTPClientsMu.Lock()
	oldClients := assistantAIHTTPClients
	assistantAIHTTPClients = map[string]*http.Client{}
	assistantAIHTTPClientsMu.Unlock()
	t.Cleanup(func() {
		assistantAIHTTPClientsMu.Lock()
		assistantAIHTTPClients = oldClients
		assistantAIHTTPClientsMu.Unlock()
	})

	first, err := newAssistantAIHTTPClient(&AssistantAIProfile{
		Proxy:    "",
		Settings: map[string]interface{}{"timeout": 3},
	})
	if err != nil {
		t.Fatalf("create first client: %s", err)
	}
	second, err := newAssistantAIHTTPClient(&AssistantAIProfile{
		Proxy:    "",
		Settings: map[string]interface{}{"timeout": 90},
	})
	if err != nil {
		t.Fatalf("create second client: %s", err)
	}

	if first.Timeout != 3*time.Second {
		t.Fatalf("first timeout = %s, want 3s", first.Timeout)
	}
	if second.Timeout != 90*time.Second {
		t.Fatalf("second timeout = %s, want 90s", second.Timeout)
	}
	if first == second {
		t.Fatal("clients with different timeout should not share a cache entry")
	}
}

func TestAssistantAIOpenAICompatibleStreamUsesIdleTimeoutNotTotalDeadline(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if "/v1/chat/completions" != r.URL.Path {
			http.NotFound(w, r)
			return
		}
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming is unsupported", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		writeChunk := func(payload string) bool {
			if _, err := w.Write([]byte("data: " + payload + "\n\n")); nil != err {
				t.Errorf("write stream chunk: %s", err)
				return false
			}
			flusher.Flush()
			return true
		}
		if !writeChunk(`{"id":"chatcmpl-test","object":"chat.completion.chunk","created":0,"model":"test-model","choices":[{"index":0,"delta":{"content":"hello"},"finish_reason":null}]}`) {
			return
		}
		time.Sleep(600 * time.Millisecond)
		if !writeChunk(`{"id":"chatcmpl-test","object":"chat.completion.chunk","created":0,"model":"test-model","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}`) {
			return
		}
		time.Sleep(600 * time.Millisecond)
		if !writeChunk(`{"id":"chatcmpl-test","object":"chat.completion.chunk","created":0,"model":"test-model","choices":[{"index":0,"delta":{"content":"!"},"finish_reason":"stop"}]}`) {
			return
		}
		writeChunk("[DONE]")
	}))
	defer server.Close()

	profile := &AssistantAIProfile{
		Provider: AssistantAIProviderOpenAICompatible,
		BaseURL:  server.URL + "/v1",
		APIKey:   "test-key",
		Model:    "test-model",
		Settings: map[string]interface{}{"timeout": 1},
	}
	var deltas []string
	startedAt := time.Now()
	reply, err := chatAssistantAIOpenAICompatibleStream(profile, "", []*AssistantAIMessage{{Role: "user", Content: "hello"}}, func(delta string) error {
		deltas = append(deltas, delta)
		return nil
	}, &assistantAIChatOptions{})
	if nil != err {
		t.Fatalf("stream should not hit a total deadline while data keeps flowing: %s", err)
	}
	if time.Since(startedAt) < time.Second {
		t.Fatal("test stream should run longer than the configured 1s timeout")
	}
	if "hello world!" != reply.Content {
		t.Fatalf("unexpected reply content %q", reply.Content)
	}
	if "hello world!" != strings.Join(deltas, "") {
		t.Fatalf("unexpected stream deltas %q", strings.Join(deltas, ""))
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
