package model

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/sashabaranov/go-openai"
)

func chatWithAssistantAIProvider(profile *AssistantAIProfile, systemPrompt string, messages []*AssistantAIMessage, opts *assistantAIChatOptions) (ret *assistantAIProviderReply, err error) {
	switch profile.Provider {
	case AssistantAIProviderFake:
		return chatAssistantAIFake(profile, systemPrompt, messages, opts)
	case AssistantAIProviderAnthropic:
		return chatAssistantAIAnthropic(profile, systemPrompt, messages)
	case AssistantAIProviderGemini:
		return chatAssistantAIGemini(profile, systemPrompt, messages, opts)
	default:
		return chatAssistantAIOpenAICompatible(profile, systemPrompt, messages, opts)
	}
}

func chatWithAssistantAIProviderStream(profile *AssistantAIProfile, systemPrompt string, messages []*AssistantAIMessage, onDelta func(string) error, opts *assistantAIChatOptions) (ret *assistantAIProviderReply, err error) {
	switch profile.Provider {
	case AssistantAIProviderFake:
		return chatAssistantAIFakeStream(profile, systemPrompt, messages, onDelta, opts)
	case AssistantAIProviderAnthropic:
		return chatAssistantAIAnthropicStream(profile, systemPrompt, messages, onDelta, opts)
	case AssistantAIProviderGemini:
		return chatAssistantAIGeminiStream(profile, systemPrompt, messages, onDelta, opts)
	default:
		return chatAssistantAIOpenAICompatibleStream(profile, systemPrompt, messages, onDelta, opts)
	}
}

func chatAssistantAIOpenAICompatible(profile *AssistantAIProfile, systemPrompt string, messages []*AssistantAIMessage, opts *assistantAIChatOptions) (ret *assistantAIProviderReply, err error) {
	client, clientErr := newAssistantAIOpenAICompatibleClient(profile, false)
	if nil != clientErr {
		return nil, clientErr
	}

	maxTokens := getAssistantAIIntSetting(profile.Settings, "maxTokens", 0)
	temperature := float32(getAssistantAIFloatSetting(profile.Settings, "temperature", assistantAIDefaultTemperature))

	req := openai.ChatCompletionRequest{
		Model:    profile.Model,
		Messages: buildAssistantAIOpenAICompatibleMessages(systemPrompt, messages),
	}
	if nil != opts && opts.EnableTools {
		if tools := buildAssistantAIOpenAIToolDefinitions(profile); 0 < len(tools) {
			req.Tools = tools
		}
	}
	applyAssistantAIOpenAICompatibleRequestOptions(profile, &req, maxTokens, temperature)

	ctx, cancel := assistantAIRequestContext(profile, opts)
	defer cancel()

	resp, err := createAssistantAIOpenAICompatibleCompletion(ctx, client, profile, req)
	if err != nil {
		return nil, err
	}
	if 1 > len(resp.Choices) {
		return nil, fmt.Errorf("assistant AI provider returned empty choices")
	}

	choice := resp.Choices[0]
	ret = &assistantAIProviderReply{
		Content:      strings.TrimSpace(choice.Message.Content),
		InputTokens:  resp.Usage.PromptTokens,
		OutputTokens: resp.Usage.CompletionTokens,
		Metadata: map[string]interface{}{
			"provider":     profile.Provider,
			"finishReason": choice.FinishReason,
			"model":        resp.Model,
		},
	}
	if 0 < len(choice.Message.ToolCalls) {
		toolCalls := make([]map[string]interface{}, 0, len(choice.Message.ToolCalls))
		for _, tc := range choice.Message.ToolCalls {
			toolCalls = append(toolCalls, map[string]interface{}{
				"id":   tc.ID,
				"type": string(tc.Type),
				"function": map[string]interface{}{
					"name":      tc.Function.Name,
					"arguments": tc.Function.Arguments,
				},
			})
		}
		ret.ToolCalls = toolCalls
	}
	return ret, nil
}

func chatAssistantAIOpenAICompatibleStream(profile *AssistantAIProfile, systemPrompt string, messages []*AssistantAIMessage, onDelta func(string) error, opts *assistantAIChatOptions) (ret *assistantAIProviderReply, err error) {
	client, clientErr := newAssistantAIOpenAICompatibleClient(profile, true)
	if nil != clientErr {
		return nil, clientErr
	}

	maxTokens := getAssistantAIIntSetting(profile.Settings, "maxTokens", 0)
	temperature := float32(getAssistantAIFloatSetting(profile.Settings, "temperature", assistantAIDefaultTemperature))

	req := openai.ChatCompletionRequest{
		Model:         profile.Model,
		Messages:      buildAssistantAIOpenAICompatibleMessages(systemPrompt, messages),
		StreamOptions: &openai.StreamOptions{IncludeUsage: true},
	}
	if nil != opts && opts.EnableTools {
		if tools := buildAssistantAIOpenAIToolDefinitions(profile); 0 < len(tools) {
			req.Tools = tools
		}
	}
	applyAssistantAIOpenAICompatibleRequestOptions(profile, &req, maxTokens, temperature)

	ctx, idleGuard := assistantAIStreamContext(profile, opts)
	defer idleGuard.Stop()

	stream, err := client.CreateChatCompletionStream(ctx, req)
	if nil != err {
		if idleGuard.TimedOut() {
			return nil, idleGuard.TimeoutError()
		}
		fallback, fallbackErr := createAssistantAIOpenAICompatibleCompletion(ctx, client, profile, req)
		if nil != fallbackErr {
			if idleGuard.TimedOut() {
				return nil, idleGuard.TimeoutError()
			}
			return nil, err
		}
		if 1 > len(fallback.Choices) {
			return nil, fmt.Errorf("assistant AI provider returned empty choices")
		}
		choice := fallback.Choices[0]
		ret = &assistantAIProviderReply{
			Content:      strings.TrimSpace(choice.Message.Content),
			InputTokens:  fallback.Usage.PromptTokens,
			OutputTokens: fallback.Usage.CompletionTokens,
			Metadata: map[string]interface{}{
				"provider":     profile.Provider,
				"finishReason": choice.FinishReason,
				"model":        fallback.Model,
			},
		}
		if 0 < len(choice.Message.ToolCalls) {
			toolCalls := make([]map[string]interface{}, 0, len(choice.Message.ToolCalls))
			for _, tc := range choice.Message.ToolCalls {
				toolCalls = append(toolCalls, map[string]interface{}{
					"id":   tc.ID,
					"type": string(tc.Type),
					"function": map[string]interface{}{
						"name":      tc.Function.Name,
						"arguments": tc.Function.Arguments,
					},
				})
			}
			ret.ToolCalls = toolCalls
		}
		return ret, nil
	}
	defer stream.Close()

	builder := &strings.Builder{}
	providerMessageID := ""
	modelName := profile.Model
	finishReason := ""
	inputTokens := 0
	outputTokens := 0
	var aggregatedToolCalls []map[string]interface{}

	for {
		chunk, recvErr := stream.Recv()
		if nil != recvErr {
			if io.EOF == recvErr {
				break
			}
			if idleGuard.TimedOut() {
				return nil, idleGuard.TimeoutError()
			}
			return nil, recvErr
		}
		idleGuard.Reset()
		if "" == providerMessageID {
			providerMessageID = chunk.ID
		}
		if "" == modelName && "" != strings.TrimSpace(chunk.Model) {
			modelName = chunk.Model
		}
		if nil != chunk.Usage {
			inputTokens = chunk.Usage.PromptTokens
			outputTokens = chunk.Usage.CompletionTokens
		}
		if 1 > len(chunk.Choices) {
			continue
		}
		choice := chunk.Choices[0]
		if "" != strings.TrimSpace(choice.Delta.Content) {
			builder.WriteString(choice.Delta.Content)
			if nil != onDelta {
				if emitErr := onDelta(choice.Delta.Content); nil != emitErr {
					return nil, emitErr
				}
			}
		}
		for _, tc := range choice.Delta.ToolCalls {
			idx := 0
			if nil != tc.Index {
				idx = *tc.Index
			}
			for len(aggregatedToolCalls) <= idx {
				aggregatedToolCalls = append(aggregatedToolCalls, map[string]interface{}{
					"id":       "",
					"type":     "function",
					"function": map[string]interface{}{"name": "", "arguments": ""},
				})
			}
			entry := aggregatedToolCalls[idx]
			if "" != tc.ID {
				entry["id"] = tc.ID
			}
			fn := entry["function"].(map[string]interface{})
			if "" != tc.Function.Name {
				fn["name"] = tc.Function.Name
			}
			if "" != tc.Function.Arguments {
				fn["arguments"] = fn["arguments"].(string) + tc.Function.Arguments
			}
		}
		if choice.FinishReason != "" && choice.FinishReason != openai.FinishReasonNull {
			finishReason = string(choice.FinishReason)
		}
	}

	ret = &assistantAIProviderReply{
		Content:           strings.TrimSpace(builder.String()),
		ProviderMessageID: providerMessageID,
		InputTokens:       inputTokens,
		OutputTokens:      outputTokens,
		Metadata: map[string]interface{}{
			"provider":     profile.Provider,
			"finishReason": finishReason,
			"model":        modelName,
		},
	}
	if 0 < len(aggregatedToolCalls) {
		ret.ToolCalls = aggregatedToolCalls
	}
	return ret, nil
}

func chatAssistantAIAnthropic(profile *AssistantAIProfile, systemPrompt string, messages []*AssistantAIMessage) (ret *assistantAIProviderReply, err error) {
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
	}
	if "" != strings.TrimSpace(systemPrompt) {
		reqBody["system"] = systemPrompt
	}

	var resp struct {
		ID      string `json:"id"`
		Model   string `json:"model"`
		Content []struct {
			Type  string          `json:"type"`
			Text  string          `json:"text"`
			ID    string          `json:"id"`
			Name  string          `json:"name"`
			Input json.RawMessage `json:"input"`
		} `json:"content"`
		StopReason string `json:"stop_reason"`
		Usage      struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}

	headers := map[string]string{
		"x-api-key":         profile.APIKey,
		"anthropic-version": firstAssistantAINonEmpty(strings.TrimSpace(profile.Version), assistantAIDefaultAnthropicVersion),
	}
	if err = doAssistantAIJSONRequest(profile, http.MethodPost, endpoint, headers, reqBody, &resp, nil); err != nil {
		return nil, err
	}
	if nil != resp.Error && "" != strings.TrimSpace(resp.Error.Message) {
		return nil, fmt.Errorf("%s", resp.Error.Message)
	}

	builder := &strings.Builder{}
	var toolCalls []map[string]interface{}
	for _, item := range resp.Content {
		switch item.Type {
		case "text":
			builder.WriteString(item.Text)
		case "tool_use":
			toolCalls = append(toolCalls, map[string]interface{}{
				"id":   item.ID,
				"type": "function",
				"function": map[string]interface{}{
					"name":      item.Name,
					"arguments": string(item.Input),
				},
			})
		}
	}
	ret = &assistantAIProviderReply{
		Content:           strings.TrimSpace(builder.String()),
		ProviderMessageID: resp.ID,
		InputTokens:       resp.Usage.InputTokens,
		OutputTokens:      resp.Usage.OutputTokens,
		Metadata: map[string]interface{}{
			"provider":     profile.Provider,
			"finishReason": resp.StopReason,
			"model":        resp.Model,
		},
	}
	if 0 < len(toolCalls) {
		ret.ToolCalls = toolCalls
	}
	return ret, nil
}

func chatAssistantAIGemini(profile *AssistantAIProfile, systemPrompt string, messages []*AssistantAIMessage, opts *assistantAIChatOptions) (ret *assistantAIProviderReply, err error) {
	endpoint := strings.TrimRight(profile.BaseURL, "/")
	if strings.HasSuffix(endpoint, "/v1beta") {
		endpoint += "/models/" + url.PathEscape(profile.Model) + ":generateContent"
	} else {
		endpoint += "/v1beta/models/" + url.PathEscape(profile.Model) + ":generateContent"
	}

	reqBody := map[string]interface{}{
		"contents": buildGeminiMessages(messages),
		"generationConfig": map[string]interface{}{
			"temperature":     resolveAssistantAIRequestTemperature(profile, assistantAIDefaultTemperature),
			"maxOutputTokens": maxAssistantAIInt(resolveAssistantAIRequestMaxTokens(profile, 2048), 1),
		},
	}
	if "" != strings.TrimSpace(systemPrompt) {
		reqBody["system_instruction"] = map[string]interface{}{
			"parts": []map[string]string{{"text": systemPrompt}},
		}
	}
	if nil != opts && opts.EnableTools {
		if declarations := buildAssistantAIGeminiTools(profile); 0 < len(declarations) {
			reqBody["tools"] = []map[string]interface{}{
				{"function_declarations": declarations},
			}
		}
	}

	headers := map[string]string{
		"x-goog-api-key": profile.APIKey,
	}

	var resp struct {
		Candidates []struct {
			FinishReason string `json:"finishReason"`
			Content      struct {
				Parts []struct {
					Text         string `json:"text"`
					FunctionCall *struct {
						Name string          `json:"name"`
						Args json.RawMessage `json:"args"`
					} `json:"functionCall"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
		UsageMetadata struct {
			PromptTokenCount     int `json:"promptTokenCount"`
			CandidatesTokenCount int `json:"candidatesTokenCount"`
		} `json:"usageMetadata"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}

	if err = doAssistantAIJSONRequest(profile, http.MethodPost, endpoint, headers, reqBody, &resp, opts); err != nil {
		return nil, err
	}
	if nil != resp.Error && "" != strings.TrimSpace(resp.Error.Message) {
		return nil, fmt.Errorf("%s", resp.Error.Message)
	}
	if 1 > len(resp.Candidates) {
		return nil, fmt.Errorf("assistant AI provider returned empty candidates")
	}

	builder := &strings.Builder{}
	var toolCalls []map[string]interface{}
	for _, part := range resp.Candidates[0].Content.Parts {
		if "" != strings.TrimSpace(part.Text) {
			builder.WriteString(part.Text)
		}
		if nil != part.FunctionCall {
			toolCalls = append(toolCalls, map[string]interface{}{
				"id":   fmt.Sprintf("gemini_%s", part.FunctionCall.Name),
				"type": "function",
				"function": map[string]interface{}{
					"name":      part.FunctionCall.Name,
					"arguments": string(part.FunctionCall.Args),
				},
			})
		}
	}
	ret = &assistantAIProviderReply{
		Content:      strings.TrimSpace(builder.String()),
		InputTokens:  resp.UsageMetadata.PromptTokenCount,
		OutputTokens: resp.UsageMetadata.CandidatesTokenCount,
		Metadata: map[string]interface{}{
			"provider":     profile.Provider,
			"finishReason": resp.Candidates[0].FinishReason,
			"model":        profile.Model,
		},
	}
	if 0 < len(toolCalls) {
		ret.ToolCalls = toolCalls
	}
	return ret, nil
}

func doAssistantAIJSONRequest(profile *AssistantAIProfile, method, endpoint string, headers map[string]string, reqBody interface{}, respBody interface{}, opts *assistantAIChatOptions) (err error) {
	data, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	ctx, cancel := assistantAIRequestContext(profile, opts)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, method, endpoint, strings.NewReader(string(data)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if userAgent := resolveAssistantAIUserAgent(profile.UserAgent); "" != userAgent {
		req.Header.Set("User-Agent", userAgent)
	}
	for k, v := range headers {
		if "" != strings.TrimSpace(v) {
			req.Header.Set(k, v)
		}
	}

	client, err := newAssistantAIHTTPClient(profile)
	if err != nil {
		return err
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if 400 <= resp.StatusCode {
		var failure struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&failure)
		if "" != strings.TrimSpace(failure.Error.Message) {
			return fmt.Errorf("%s", failure.Error.Message)
		}
		return fmt.Errorf("assistant AI provider request failed with status %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(respBody)
}

func newAssistantAIHTTPClient(profile *AssistantAIProfile) (ret *http.Client, err error) {
	return newAssistantAIHTTPClient0(profile, false)
}

func newAssistantAIStreamingHTTPClient(profile *AssistantAIProfile) (ret *http.Client, err error) {
	return newAssistantAIHTTPClient0(profile, true)
}

func newAssistantAIHTTPClient0(profile *AssistantAIProfile, streaming bool) (ret *http.Client, err error) {
	timeout := assistantAIRequestTimeout(profile)
	cacheKey := fmt.Sprintf("%t\x00%s\x00%d", streaming, strings.TrimSpace(profile.Proxy), int(timeout.Seconds()))
	assistantAIHTTPClientsMu.Lock()
	defer assistantAIHTTPClientsMu.Unlock()

	if cached, ok := assistantAIHTTPClients[cacheKey]; ok {
		return cached, nil
	}

	transport, transportErr := assistantAIHTTPTransport(profile, streaming)
	if nil != transportErr {
		return nil, transportErr
	}
	ret = &http.Client{Transport: transport}
	if !streaming {
		ret.Timeout = timeout
	}
	assistantAIHTTPClients[cacheKey] = ret
	return ret, nil
}

func buildAssistantAIOpenAICompatibleMessages(systemPrompt string, messages []*AssistantAIMessage) []openai.ChatCompletionMessage {
	ret := make([]openai.ChatCompletionMessage, 0, len(messages)+1)
	if "" != strings.TrimSpace(systemPrompt) {
		ret = append(ret, openai.ChatCompletionMessage{Role: openai.ChatMessageRoleSystem, Content: systemPrompt})
	}
	for _, msg := range messages {
		attachments := assistantAIMessageAttachments(msg)
		if 0 < len(attachments) && "user" == strings.TrimSpace(msg.Role) {
			parts := []openai.ChatMessagePart{}
			if "" != strings.TrimSpace(msg.Content) {
				parts = append(parts, openai.ChatMessagePart{
					Type: openai.ChatMessagePartTypeText,
					Text: msg.Content,
				})
			}
			for _, attachment := range attachments {
				parts = append(parts, openai.ChatMessagePart{
					Type: openai.ChatMessagePartTypeImageURL,
					ImageURL: &openai.ChatMessageImageURL{
						URL:    assistantAIInputAttachmentDataURL(attachment),
						Detail: openai.ImageURLDetailAuto,
					},
				})
			}
			ret = append(ret, openai.ChatCompletionMessage{Role: msg.Role, MultiContent: parts})
			continue
		}
		ret = append(ret, openai.ChatCompletionMessage{Role: msg.Role, Content: msg.Content})
	}
	return ret
}

func buildAnthropicMessages(messages []*AssistantAIMessage) []map[string]interface{} {
	ret := make([]map[string]interface{}, 0, len(messages))
	for _, msg := range messages {
		role := msg.Role
		if "system" == role {
			role = "user"
		}
		content := make([]map[string]interface{}, 0, 1)
		if "user" == role {
			for _, attachment := range assistantAIMessageAttachments(msg) {
				content = append(content, map[string]interface{}{
					"type": "image",
					"source": map[string]string{
						"type":       "base64",
						"media_type": attachment.MimeType,
						"data":       attachment.Data,
					},
				})
			}
		}
		if "" != strings.TrimSpace(msg.Content) || 0 == len(content) {
			content = append(content, map[string]interface{}{
				"type": "text",
				"text": msg.Content,
			})
		}
		ret = append(ret, map[string]interface{}{
			"role":    role,
			"content": content,
		})
	}
	return ret
}

func buildGeminiMessages(messages []*AssistantAIMessage) []map[string]interface{} {
	ret := make([]map[string]interface{}, 0, len(messages))
	for _, msg := range messages {
		role := "user"
		if "assistant" == msg.Role {
			role = "model"
		}
		parts := make([]map[string]interface{}, 0, 1)
		if "user" == role {
			for _, attachment := range assistantAIMessageAttachments(msg) {
				parts = append(parts, map[string]interface{}{
					"inlineData": map[string]string{
						"mimeType": attachment.MimeType,
						"data":     attachment.Data,
					},
				})
			}
		}
		if "" != strings.TrimSpace(msg.Content) || 0 == len(parts) {
			parts = append(parts, map[string]interface{}{"text": msg.Content})
		}
		ret = append(ret, map[string]interface{}{
			"role":  role,
			"parts": parts,
		})
	}
	return ret
}
