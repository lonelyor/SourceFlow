package model

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
	"github.com/sashabaranov/go-openai"
)

func normalizeAssistantAIProfileSettings(profile *AssistantAIProfile) {
	if nil == profile {
		return
	}
	if nil == profile.Settings {
		profile.Settings = map[string]interface{}{}
	}
	preset := getAssistantAIRecommendedSettings(profile)
	if 1 > getAssistantAIIntSetting(profile.Settings, "timeout", 0) {
		profile.Settings["timeout"] = assistantAIDefaultTimeout
	}
	if 1 > getAssistantAIIntSetting(profile.Settings, "maxContextMessages", 0) {
		profile.Settings["maxContextMessages"] = assistantAIDefaultContextMessages
	}
	if 1 > getAssistantAIIntSetting(profile.Settings, "maxContextTokens", 0) {
		profile.Settings["maxContextTokens"] = assistantAIDefaultContextTokens
	}
	if 0 >= getAssistantAIIntSetting(profile.Settings, "maxTokens", 0) && 0 < preset.MaxTokens {
		profile.Settings["maxTokens"] = preset.MaxTokens
	}

	temperature := getAssistantAIFloatSetting(profile.Settings, "temperature", 0)
	switch {
	case nil != preset.FixedTemperature:
		profile.Settings["temperature"] = *preset.FixedTemperature
	case 0 < preset.Temperature && (0 >= temperature || assistantAIDefaultTemperature == temperature):
		profile.Settings["temperature"] = preset.Temperature
	case 0 >= temperature:
		profile.Settings["temperature"] = assistantAIDefaultTemperature
	}
	profile.Settings["temperature"] = clampAssistantAITemperature(getAssistantAIFloatSetting(profile.Settings, "temperature", assistantAIDefaultTemperature), preset)
	profile.Settings["toolReadScope"] = normalizeAssistantAIToolScope(getAssistantAIStringSetting(profile.Settings, "toolReadScope", AssistantAIToolScopeWorkspace), AssistantAIToolScopeWorkspace)
	profile.Settings["toolWriteScope"] = normalizeAssistantAIToolScope(getAssistantAIStringSetting(profile.Settings, "toolWriteScope", AssistantAIToolScopeCurrentNotebook), AssistantAIToolScopeCurrentNotebook)
	profile.Settings["toolTraceMode"] = normalizeAssistantAIToolTraceMode(getAssistantAIStringSetting(profile.Settings, "toolTraceMode", AssistantAIToolTraceAuditOnly))
	rawModes, _ := profile.Settings["toolModes"].(map[string]interface{})
	if nil == rawModes {
		rawModes = map[string]interface{}{}
	}
	for _, def := range assistantAIToolCatalog {
		rawModes[def.ID] = normalizeAssistantAIToolMode(fmt.Sprint(rawModes[def.ID]), def.DefaultMode)
	}
	profile.Settings["toolModes"] = rawModes
}

func applyAssistantAIOpenAICompatibleRequestOptions(profile *AssistantAIProfile, req *openai.ChatCompletionRequest, maxTokens int, temperature float32) {
	if nil == req {
		return
	}

	util.ApplyOpenAICompatibleMaxTokens(req, resolveAssistantAIRequestMaxTokens(profile, maxTokens))
	if shouldOmitAssistantAITemperature(profile, temperature) {
		req.Temperature = 0
		return
	}
	req.Temperature = float32(resolveAssistantAIRequestTemperature(profile, float64(temperature)))
}

func createAssistantAIOpenAICompatibleCompletion(ctx context.Context, client *openai.Client, profile *AssistantAIProfile, req openai.ChatCompletionRequest) (ret openai.ChatCompletionResponse, err error) {
	ret, err = client.CreateChatCompletion(ctx, req)
	if nil == err {
		return ret, nil
	}

	retryReq, shouldRetry, shouldPersist := buildAssistantAIOpenAICompatibleRetry(profile, req, err)
	if !shouldRetry {
		return ret, err
	}

	retryResp, retryErr := client.CreateChatCompletion(ctx, retryReq)
	if nil != retryErr {
		return retryResp, retryErr
	}
	if shouldPersist {
		if persistErr := persistAssistantAIProfileSettings(profile); nil != persistErr {
			logging.LogWarnf("persist assistant AI adaptive settings for profile [%s] failed: %s", profile.ID, persistErr)
		}
	}
	return retryResp, nil
}

func buildAssistantAIOpenAICompatibleRetry(profile *AssistantAIProfile, req openai.ChatCompletionRequest, err error) (ret openai.ChatCompletionRequest, shouldRetry, shouldPersist bool) {
	ret = req
	if nil == err {
		return ret, false, false
	}

	msg := strings.ToLower(strings.TrimSpace(err.Error()))
	if strings.Contains(msg, "temperature") && (strings.Contains(msg, "only 1 is allowed") || strings.Contains(msg, "fixed at 1")) {
		if 1 == ret.Temperature {
			return ret, false, false
		}
		ret.Temperature = 1
		if nil != profile {
			normalizeAssistantAIProfileSettings(profile)
			profile.Settings["temperature"] = 1.0
		}
		return ret, true, true
	}
	if strings.Contains(msg, "temperature") && (strings.Contains(msg, "between 0 and 1") || strings.Contains(msg, "range [0, 1]") || strings.Contains(msg, "range [0,1]")) {
		nextTemperature := float32(clampAssistantAITemperature(float64(ret.Temperature), assistantAIRecommendedSettings{
			TemperatureMin: assistantAIFloat64Ptr(0),
			TemperatureMax: assistantAIFloat64Ptr(1),
		}))
		if nextTemperature == ret.Temperature {
			return ret, false, false
		}
		ret.Temperature = nextTemperature
		if nil != profile {
			normalizeAssistantAIProfileSettings(profile)
			profile.Settings["temperature"] = float64(nextTemperature)
		}
		return ret, true, nil != profile
	}

	if strings.Contains(msg, "temperature") && (strings.Contains(msg, "does not support") || strings.Contains(msg, "unsupported")) {
		if 0 == ret.Temperature {
			return ret, false, false
		}
		ret.Temperature = 0
		return ret, true, false
	}
	return ret, false, false
}

func shouldOmitAssistantAITemperature(profile *AssistantAIProfile, temperature float32) bool {
	if nil == profile {
		return false
	}
	return getAssistantAIRecommendedSettings(profile).OmitTemperature
}

type assistantAIRecommendedSettings struct {
	Temperature         float64
	MaxTokens           int
	FixedTemperature    *float64
	OmitTemperature     bool
	TemperatureMin      *float64
	TemperatureMax      *float64
	LocalAPIKeyFallback string
}

func getAssistantAIRecommendedSettings(profile *AssistantAIProfile) (ret assistantAIRecommendedSettings) {
	if nil == profile {
		return ret
	}

	switch normalizeAssistantAIProvider(profile.Provider) {
	case AssistantAIProviderAnthropic:
		ret.Temperature = 1.0
		ret.TemperatureMin = assistantAIFloat64Ptr(0)
		ret.TemperatureMax = assistantAIFloat64Ptr(1)
	case AssistantAIProviderGemini:
		model := strings.ToLower(strings.TrimSpace(profile.Model))
		if strings.HasPrefix(model, "gemini-3") {
			ret.Temperature = 1.0
		}
	case AssistantAIProviderVolcengine:
		ret.Temperature = 0.1
		ret.MaxTokens = 4096
		ret.TemperatureMin = assistantAIFloat64Ptr(0)
		ret.TemperatureMax = assistantAIFloat64Ptr(1)
	case AssistantAIProviderVolcenginePlan:
		ret.Temperature = 0.1
		ret.MaxTokens = 4096
		ret.TemperatureMin = assistantAIFloat64Ptr(0)
		ret.TemperatureMax = assistantAIFloat64Ptr(1)
	case AssistantAIProviderKimi:
		model := strings.ToLower(strings.TrimSpace(profile.Model))
		if strings.HasPrefix(model, "kimi-k2.5") {
			ret.FixedTemperature = assistantAIFloat64Ptr(1)
		}
	case AssistantAIProviderGLM:
		model := strings.ToLower(strings.TrimSpace(profile.Model))
		switch {
		case strings.HasPrefix(model, "glm-4.5"):
			ret.Temperature = 0.6
			ret.MaxTokens = 4096
		case strings.HasPrefix(model, "glm-4.6"), strings.HasPrefix(model, "glm-4.7"), strings.HasPrefix(model, "glm-5"):
			ret.Temperature = 1.0
			ret.MaxTokens = 4096
		}
	case AssistantAIProviderOpenRouter:
		ret.Temperature = 1.0
	case AssistantAIProviderDeepSeek:
		model := strings.ToLower(strings.TrimSpace(profile.Model))
		if strings.Contains(model, "reasoner") {
			ret.OmitTemperature = true
			ret.MaxTokens = 32768
		} else {
			ret.Temperature = 1.0
			ret.MaxTokens = 4096
		}
	case AssistantAIProviderOllama:
		ret.LocalAPIKeyFallback = "ollama"
	}
	return ret
}

func assistantAIFloat64Ptr(v float64) *float64 {
	return &v
}

func resolveAssistantAIRequestTemperature(profile *AssistantAIProfile, fallback float64) float64 {
	preset := getAssistantAIRecommendedSettings(profile)
	if nil != preset.FixedTemperature {
		return *preset.FixedTemperature
	}
	temperature := getAssistantAIFloatSetting(profile.Settings, "temperature", fallback)
	return clampAssistantAITemperature(temperature, preset)
}

func resolveAssistantAIRequestMaxTokens(profile *AssistantAIProfile, fallback int) int {
	preset := getAssistantAIRecommendedSettings(profile)
	maxTokens := getAssistantAIIntSetting(profile.Settings, "maxTokens", fallback)
	if 0 >= maxTokens && 0 < preset.MaxTokens {
		return preset.MaxTokens
	}
	return maxTokens
}

func resolveAssistantAIOpenAICompatibleAPIKey(profile *AssistantAIProfile) string {
	if nil == profile {
		return ""
	}
	if key := strings.TrimSpace(profile.APIKey); "" != key {
		return key
	}
	preset := getAssistantAIRecommendedSettings(profile)
	if "" != preset.LocalAPIKeyFallback && isAssistantAILocalBaseURL(profile.BaseURL) {
		return preset.LocalAPIKeyFallback
	}
	return ""
}

func clampAssistantAITemperature(temperature float64, preset assistantAIRecommendedSettings) float64 {
	if nil != preset.FixedTemperature {
		return *preset.FixedTemperature
	}
	if nil != preset.TemperatureMin && temperature < *preset.TemperatureMin {
		temperature = *preset.TemperatureMin
	}
	if nil != preset.TemperatureMax && temperature > *preset.TemperatureMax {
		temperature = *preset.TemperatureMax
	}
	return temperature
}

func isAssistantAILocalBaseURL(baseURL string) bool {
	baseURL = strings.TrimSpace(baseURL)
	if "" == baseURL {
		return false
	}
	parsed, err := url.Parse(baseURL)
	if nil != err {
		return strings.Contains(baseURL, "127.0.0.1") || strings.Contains(baseURL, "localhost")
	}
	host := strings.ToLower(parsed.Hostname())
	return "127.0.0.1" == host || "localhost" == host
}

func persistAssistantAIProfileSettings(profile *AssistantAIProfile) (err error) {
	if nil == profile || "" == strings.TrimSpace(profile.ID) {
		return nil
	}

	db, err := getAssistantAIDB()
	if nil != err {
		return err
	}
	settingsJSON, err := json.Marshal(profile.Settings)
	if nil != err {
		return err
	}
	_, err = db.Exec(`UPDATE ai_profiles SET settings = ?, updated_at = ? WHERE id = ?`, string(settingsJSON), time.Now().UnixMilli(), profile.ID)
	return err
}

func trimAssistantAIContextMessages(messages []*AssistantAIMessage, maxContextTokens int) []*AssistantAIMessage {
	if 1 > maxContextTokens || 1 > len(messages) {
		return messages
	}

	total := 0
	start := len(messages)
	for i := len(messages) - 1; i >= 0; i-- {
		total += estimateAssistantAIMessageTokens(messages[i])
		if total > maxContextTokens {
			break
		}
		start = i
	}
	if start < 0 {
		start = 0
	}
	if start >= len(messages) {
		return messages[len(messages)-1:]
	}
	return messages[start:]
}

func estimateAssistantAIMessageTokens(message *AssistantAIMessage) int {
	if nil == message {
		return 0
	}
	if 0 < message.InputTokens || 0 < message.OutputTokens {
		total := message.InputTokens + message.OutputTokens
		if 0 < total {
			return total
		}
	}
	contentTokens := len([]rune(message.Content))/4 + 16
	if contentTokens < 32 {
		contentTokens = 32
	}
	return contentTokens
}
