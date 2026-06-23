package model

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type anthropicStreamEvent struct {
	Type         string `json:"type"`
	Index        int    `json:"index,omitempty"`
	ContentBlock *struct {
		Type  string          `json:"type"`
		ID    string          `json:"id,omitempty"`
		Name  string          `json:"name,omitempty"`
		Text  string          `json:"text,omitempty"`
		Input json.RawMessage `json:"input,omitempty"`
	} `json:"content_block,omitempty"`
	Delta *struct {
		Type        string `json:"type"`
		Text        string `json:"text,omitempty"`
		PartialJSON string `json:"partial_json,omitempty"`
		StopReason  string `json:"stop_reason,omitempty"`
	} `json:"delta,omitempty"`
	Message *struct {
		ID    string `json:"id"`
		Model string `json:"model"`
		Usage struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
		StopReason string `json:"stop_reason"`
	} `json:"message,omitempty"`
	Usage *struct {
		OutputTokens int `json:"output_tokens"`
	} `json:"usage,omitempty"`
}

type anthropicToolCallAccumulator struct {
	id        string
	name      string
	inputJSON strings.Builder
}

func chatAssistantAIAnthropicStream(profile *AssistantAIProfile, systemPrompt string, messages []*AssistantAIMessage, onDelta func(string) error, opts *assistantAIChatOptions) (ret *assistantAIProviderReply, err error) {
	endpoint := strings.TrimRight(profile.BaseURL, "/")
	if strings.HasSuffix(endpoint, "/v1") {
		endpoint += "/messages"
	} else {
		endpoint += "/v1/messages"
	}

	reqBody := map[string]interface{}{
		"model":       profile.Model,
		"max_tokens":  maxAssistantAIInt(resolveAssistantAIRequestMaxTokens(profile, 2048), 1),
		"temperature": resolveAssistantAIRequestTemperature(profile, assistantAIDefaultTemperature),
		"messages":    buildAnthropicMessages(messages),
		"stream":      true,
	}
	if "" != strings.TrimSpace(systemPrompt) {
		reqBody["system"] = systemPrompt
	}
	if nil != opts && opts.EnableTools {
		if tools := buildAssistantAIAnthropicTools(profile); 0 < len(tools) {
			reqBody["tools"] = tools
		}
	}

	data, marshalErr := json.Marshal(reqBody)
	if nil != marshalErr {
		return nil, marshalErr
	}

	ctx, idleGuard := assistantAIStreamContext(profile, opts)
	defer idleGuard.Stop()

	req, reqErr := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(data))
	if nil != reqErr {
		return nil, reqErr
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", profile.APIKey)
	req.Header.Set("anthropic-version", firstAssistantAINonEmpty(strings.TrimSpace(profile.Version), assistantAIDefaultAnthropicVersion))
	if userAgent := resolveAssistantAIUserAgent(profile.UserAgent); "" != userAgent {
		req.Header.Set("User-Agent", userAgent)
	}

	client, clientErr := newAssistantAIStreamingHTTPClient(profile)
	if nil != clientErr {
		return nil, clientErr
	}
	resp, respErr := client.Do(req)
	if nil != respErr {
		if idleGuard.TimedOut() {
			return nil, idleGuard.TimeoutError()
		}
		return nil, respErr
	}
	defer resp.Body.Close()

	if 400 <= resp.StatusCode {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("Anthropic stream request failed (status %d): %s", resp.StatusCode, sanitizeAIProviderErrorBody(string(body)))
	}

	return parseAnthropicSSEStream(resp.Body, onDelta, idleGuard)
}

func parseAnthropicSSEStream(body io.Reader, onDelta func(string) error, idleGuard *assistantAIStreamIdleGuard) (ret *assistantAIProviderReply, err error) {
	builder := &strings.Builder{}
	providerMessageID := ""
	modelName := ""
	stopReason := ""
	inputTokens := 0
	outputTokens := 0
	toolAccumulators := map[int]*anthropicToolCallAccumulator{}
	var toolCallOrder []int

	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	for scanner.Scan() {
		idleGuard.Reset()
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		payload := strings.TrimPrefix(line, "data: ")
		payload = strings.TrimSpace(payload)
		if "" == payload {
			continue
		}

		event := &anthropicStreamEvent{}
		if jsonErr := json.Unmarshal([]byte(payload), event); nil != jsonErr {
			continue
		}

		switch event.Type {
		case "message_start":
			if nil != event.Message {
				providerMessageID = event.Message.ID
				modelName = event.Message.Model
				inputTokens = event.Message.Usage.InputTokens
				outputTokens = event.Message.Usage.OutputTokens
			}
		case "content_block_start":
			if nil != event.ContentBlock && "tool_use" == event.ContentBlock.Type {
				acc := &anthropicToolCallAccumulator{
					id:   event.ContentBlock.ID,
					name: event.ContentBlock.Name,
				}
				toolAccumulators[event.Index] = acc
				toolCallOrder = append(toolCallOrder, event.Index)
			}
		case "content_block_delta":
			if nil != event.Delta {
				if "text_delta" == event.Delta.Type && "" != event.Delta.Text {
					builder.WriteString(event.Delta.Text)
					if nil != onDelta {
						if emitErr := onDelta(event.Delta.Text); nil != emitErr {
							return nil, emitErr
						}
					}
				}
				if "input_json_delta" == event.Delta.Type && "" != event.Delta.PartialJSON {
					if acc, ok := toolAccumulators[event.Index]; ok {
						acc.inputJSON.WriteString(event.Delta.PartialJSON)
					}
				}
			}
		case "message_delta":
			if nil != event.Delta && "" != event.Delta.StopReason {
				stopReason = event.Delta.StopReason
			}
			if nil != event.Usage {
				outputTokens += event.Usage.OutputTokens
			}
		}
	}
	if scanErr := scanner.Err(); nil != scanErr {
		if idleGuard.TimedOut() {
			return nil, idleGuard.TimeoutError()
		}
		return nil, scanErr
	}

	ret = &assistantAIProviderReply{
		Content:           strings.TrimSpace(builder.String()),
		ProviderMessageID: providerMessageID,
		InputTokens:       inputTokens,
		OutputTokens:      outputTokens,
		Metadata: map[string]interface{}{
			"provider":     "anthropic",
			"finishReason": stopReason,
			"model":        modelName,
		},
	}

	if 0 < len(toolCallOrder) {
		toolCalls := make([]map[string]interface{}, 0, len(toolCallOrder))
		for _, idx := range toolCallOrder {
			acc, ok := toolAccumulators[idx]
			if !ok || nil == acc {
				continue
			}
			toolCalls = append(toolCalls, map[string]interface{}{
				"id":   acc.id,
				"type": "function",
				"function": map[string]interface{}{
					"name":      acc.name,
					"arguments": acc.inputJSON.String(),
				},
			})
		}
		ret.ToolCalls = toolCalls
	}

	return ret, nil
}
