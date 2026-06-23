package model

import (
	"encoding/json"
	"fmt"
	"hash/fnv"
	"strings"
)

func chatAssistantAIFake(profile *AssistantAIProfile, systemPrompt string, messages []*AssistantAIMessage, opts *assistantAIChatOptions) (ret *assistantAIProviderReply, err error) {
	content := buildAssistantAIFakeContent(systemPrompt, messages, opts)
	model := assistantAIFakeModel(profile)
	return &assistantAIProviderReply{
		Content:           content,
		ProviderMessageID: buildAssistantAIFakeMessageID(model, content),
		InputTokens:       estimateAssistantAIFakeTokens(systemPrompt + "\n" + assistantAIFakeLastUserContent(messages)),
		OutputTokens:      estimateAssistantAIFakeTokens(content),
		Metadata: map[string]interface{}{
			"provider":     AssistantAIProviderFake,
			"model":        model,
			"finishReason": "stop",
			"fake":         true,
		},
	}, nil
}

func chatAssistantAIFakeStream(profile *AssistantAIProfile, systemPrompt string, messages []*AssistantAIMessage, onDelta func(string) error, opts *assistantAIChatOptions) (ret *assistantAIProviderReply, err error) {
	ret, err = chatAssistantAIFake(profile, systemPrompt, messages, opts)
	if nil != err {
		return nil, err
	}
	if nil == onDelta || assistantAIFakeContentIsToolEnvelope(ret.Content) {
		ret.Metadata["stream"] = true
		return ret, nil
	}
	for _, chunk := range splitAssistantAIFakeStreamChunks(ret.Content) {
		if "" == chunk {
			continue
		}
		if deltaErr := onDelta(chunk); nil != deltaErr {
			return nil, deltaErr
		}
	}
	ret.Metadata["stream"] = true
	return ret, nil
}

func buildAssistantAIFakeContent(systemPrompt string, messages []*AssistantAIMessage, opts *assistantAIChatOptions) string {
	lastUser := assistantAIFakeLastUserContent(messages)
	if assistantAIFakeIsToolFollowup(lastUser) {
		return "Fake tool flow complete. Review the generated patch before applying it."
	}
	if assistantAIFakeShouldUseTool(systemPrompt, lastUser) {
		return buildAssistantAIFakeToolEnvelope(lastUser)
	}
	return strings.TrimSpace(strings.Join([]string{
		"## Fake Reply",
		"",
		"Received: " + assistantAIFakePreview(lastUser, 240),
		"",
		"- Provider: SourceFlow Fake",
		"- Mode: deterministic local validation",
	}, "\n"))
}

func buildAssistantAIFakeToolEnvelope(userPrompt string) string {
	markdown := strings.TrimSpace(strings.Join([]string{
		"## AI 冒烟测试摘要",
		"",
		"- Provider: SourceFlow Fake",
		"- 请求：" + assistantAIFakePreview(userPrompt, 120),
		"- 结果：已生成 dry-run patch，可在审阅后应用。",
	}, "\n"))
	envelope := map[string]interface{}{
		"toolCalls": []map[string]interface{}{
			{
				"tool": AssistantAIToolAppendCurrentNote,
				"args": map[string]interface{}{
					"dryRun":   true,
					"markdown": markdown,
				},
			},
		},
		"reply": "已生成当前笔记追加内容预览。",
	}
	buf, err := json.Marshal(envelope)
	if nil != err {
		return `{"toolCalls":[],"reply":"fake provider failed to build tool envelope"}`
	}
	return string(buf)
}

func assistantAIFakeShouldUseTool(systemPrompt, userPrompt string) bool {
	if !strings.Contains(systemPrompt, `"toolCalls"`) || !strings.Contains(systemPrompt, AssistantAIToolAppendCurrentNote) {
		return false
	}
	normalized := strings.ToLower(strings.TrimSpace(userPrompt))
	if "" == normalized {
		return false
	}
	for _, keyword := range []string{"预览", "追加", "写入", "patch", "工具", "append", "write", "preview"} {
		if strings.Contains(normalized, keyword) {
			return true
		}
	}
	return false
}

func assistantAIFakeIsToolFollowup(content string) bool {
	return strings.Contains(content, "Tool execution results are available below.")
}

func assistantAIFakeContentIsToolEnvelope(content string) bool {
	trimmed := strings.TrimSpace(content)
	return strings.HasPrefix(trimmed, "{") && strings.Contains(trimmed, `"toolCalls"`)
}

func assistantAIFakeLastUserContent(messages []*AssistantAIMessage) string {
	for i := len(messages) - 1; 0 <= i; i-- {
		if nil != messages[i] && "user" == strings.TrimSpace(messages[i].Role) {
			return strings.TrimSpace(messages[i].Content)
		}
	}
	if 0 < len(messages) && nil != messages[len(messages)-1] {
		return strings.TrimSpace(messages[len(messages)-1].Content)
	}
	return ""
}

func assistantAIFakeModel(profile *AssistantAIProfile) string {
	if nil != profile && "" != strings.TrimSpace(profile.Model) {
		return strings.TrimSpace(profile.Model)
	}
	return "sourceflow-fake-chat"
}

func buildAssistantAIFakeMessageID(model, content string) string {
	hasher := fnv.New64a()
	_, _ = hasher.Write([]byte(strings.TrimSpace(model) + "\n" + strings.TrimSpace(content)))
	return fmt.Sprintf("fake-%x", hasher.Sum64())
}

func estimateAssistantAIFakeTokens(content string) int {
	runes := []rune(strings.TrimSpace(content))
	if 1 > len(runes) {
		return 0
	}
	tokens := len(runes) / 4
	if 1 > tokens {
		return 1
	}
	return tokens
}

func assistantAIFakePreview(content string, limit int) string {
	content = strings.Join(strings.Fields(strings.TrimSpace(content)), " ")
	if "" == content {
		return "(empty)"
	}
	runes := []rune(content)
	if len(runes) <= limit {
		return content
	}
	if 1 > limit {
		return ""
	}
	return strings.TrimSpace(string(runes[:limit])) + "..."
}

func splitAssistantAIFakeStreamChunks(content string) []string {
	runes := []rune(content)
	if 2 >= len(runes) {
		return []string{content}
	}
	mid := len(runes) / 2
	return []string{string(runes[:mid]), string(runes[mid:])}
}
