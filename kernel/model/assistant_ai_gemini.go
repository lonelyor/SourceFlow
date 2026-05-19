package model

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type geminiStreamChunk struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text         string `json:"text"`
				FunctionCall *struct {
					Name string          `json:"name"`
					Args json.RawMessage `json:"args"`
				} `json:"functionCall"`
			} `json:"parts"`
		} `json:"content"`
		FinishReason string `json:"finishReason"`
	} `json:"candidates"`
	UsageMetadata struct {
		PromptTokenCount     int `json:"promptTokenCount"`
		CandidatesTokenCount int `json:"candidatesTokenCount"`
	} `json:"usageMetadata"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func chatAssistantAIGeminiStream(profile *AssistantAIProfile, systemPrompt string, messages []*AssistantAIMessage, onDelta func(string) error, opts *assistantAIChatOptions) (ret *assistantAIProviderReply, err error) {
	endpoint := strings.TrimRight(profile.BaseURL, "/")
	if strings.HasSuffix(endpoint, "/v1beta") {
		endpoint += "/models/" + url.PathEscape(profile.Model) + ":streamGenerateContent?alt=sse"
	} else {
		endpoint += "/v1beta/models/" + url.PathEscape(profile.Model) + ":streamGenerateContent?alt=sse"
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

	data, marshalErr := json.Marshal(reqBody)
	if nil != marshalErr {
		return nil, marshalErr
	}

	timeout := getAssistantAIIntSetting(profile.Settings, "timeout", assistantAIDefaultTimeout)
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout)*time.Second)
	defer cancel()

	req, reqErr := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(data))
	if nil != reqErr {
		return nil, reqErr
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-goog-api-key", profile.APIKey)
	if userAgent := resolveAssistantAIUserAgent(profile.UserAgent); "" != userAgent {
		req.Header.Set("User-Agent", userAgent)
	}

	client, clientErr := newAssistantAIHTTPClient(profile)
	if nil != clientErr {
		return nil, clientErr
	}
	resp, respErr := client.Do(req)
	if nil != respErr {
		return nil, respErr
	}
	defer resp.Body.Close()

	if 400 <= resp.StatusCode {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Gemini stream request failed (status %d): %s", resp.StatusCode, string(body))
	}

	builder := &strings.Builder{}
	finishReason := ""
	inputTokens := 0
	outputTokens := 0
	var toolCalls []map[string]interface{}

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		payload := strings.TrimPrefix(line, "data: ")
		payload = strings.TrimSpace(payload)
		if "" == payload {
			continue
		}

		chunk := &geminiStreamChunk{}
		if jsonErr := json.Unmarshal([]byte(payload), chunk); nil != jsonErr {
			continue
		}
		if nil != chunk.Error && "" != strings.TrimSpace(chunk.Error.Message) {
			return nil, fmt.Errorf(chunk.Error.Message)
		}
		if 0 < chunk.UsageMetadata.PromptTokenCount {
			inputTokens = chunk.UsageMetadata.PromptTokenCount
		}
		if 0 < chunk.UsageMetadata.CandidatesTokenCount {
			outputTokens = chunk.UsageMetadata.CandidatesTokenCount
		}
		if 1 > len(chunk.Candidates) {
			continue
		}
		candidate := chunk.Candidates[0]
		if "" != candidate.FinishReason {
			finishReason = candidate.FinishReason
		}
		for _, part := range candidate.Content.Parts {
			if "" != strings.TrimSpace(part.Text) {
				builder.WriteString(part.Text)
				if nil != onDelta {
					if emitErr := onDelta(part.Text); nil != emitErr {
						return nil, emitErr
					}
				}
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
	}

	ret = &assistantAIProviderReply{
		Content:      strings.TrimSpace(builder.String()),
		InputTokens:  inputTokens,
		OutputTokens: outputTokens,
		Metadata: map[string]interface{}{
			"provider":     profile.Provider,
			"finishReason": finishReason,
			"model":        profile.Model,
		},
	}
	if 0 < len(toolCalls) {
		ret.ToolCalls = toolCalls
	}
	return ret, nil
}
