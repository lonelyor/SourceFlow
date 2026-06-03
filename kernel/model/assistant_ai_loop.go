package model

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
)

type assistantAIToolLoopParams struct {
	DB              *sql.DB
	Profile         *AssistantAIProfile
	SessionID       string
	Context         *AssistantAINoteContext
	UserPrompt      string
	SystemPrompt    string
	ContextMessages []*AssistantAIMessage
	EnableTools     bool
	UseNativeTools  bool
	SecurityMode    AISecurityMode
	OnDelta         func(string) error
}

type assistantAIToolLoopResult struct {
	Reply       *assistantAIProviderReply
	ToolResults []*AssistantAIToolResult
}

func runAssistantAIToolLoop(params *assistantAIToolLoopParams) (ret *assistantAIToolLoopResult, err error) {
	if nil == params {
		return nil, fmt.Errorf("assistant AI tool loop params is required")
	}

	ret = &assistantAIToolLoopResult{}

	profile := params.Profile
	db := params.DB
	sessionID := params.SessionID
	onDelta := params.OnDelta
	currentMessages := params.ContextMessages
	systemPrompt := params.SystemPrompt
	enableTools := params.EnableTools
	useNativeTools := params.UseNativeTools
	securityMode := NormalizeAISecurityMode(params.SecurityMode, GetAISecurityConfig().DefaultMode)

	chatOpts := &assistantAIChatOptions{
		EnableTools: useNativeTools,
		Context:     params.Context,
		UserPrompt:  params.UserPrompt,
	}

	var reply *assistantAIProviderReply
	if nil != onDelta && canStreamAssistantAIProvider(profile) {
		reply, err = chatWithAssistantAIProviderStream(profile, systemPrompt, currentMessages, onDelta, chatOpts)
	} else {
		reply, err = chatWithAssistantAIProvider(profile, systemPrompt, currentMessages, chatOpts)
	}
	if err != nil {
		return nil, err
	}

	if !enableTools {
		ret.Reply = reply
		return ret, nil
	}

	for round := 0; round < assistantAIMaxToolRounds; round++ {
		var toolResults []*AssistantAIToolResult
		shouldContinue := false

		if useNativeTools && 0 < len(reply.ToolCalls) {
			toolResults = executeAssistantAINativeToolCalls(db, profile, sessionID, params.Context, reply.ToolCalls, securityMode)
			shouldContinue = true
		} else if !useNativeTools {
			envelope, ok := parseAssistantAIToolEnvelope(reply.Content)
			if ok && 0 < len(envelope.ToolCalls) {
				fallbackReply := ""
				if 1 == len(envelope.ToolCalls) {
					fallbackReply = strings.TrimSpace(envelope.Reply)
				}
				toolResults = executeAssistantAIRequestedTools(db, profile, sessionID, params.Context, envelope.ToolCalls, fallbackReply, params.UserPrompt, securityMode)
				shouldContinue = true
			} else if ok && "" != strings.TrimSpace(envelope.Reply) {
				reply.Content = strings.TrimSpace(envelope.Reply)
			}
		}

		if !shouldContinue || 0 == len(toolResults) {
			break
		}

		ret.ToolResults = append(ret.ToolResults, toolResults...)

		assistantMsg := &AssistantAIMessage{
			ID:        ast.NewNodeID(),
			SessionID: sessionID,
			Role:      "assistant",
			Content:   strings.TrimSpace(reply.Content),
			CreatedAt: time.Now().UnixMilli(),
		}
		if 0 < len(reply.ToolCalls) {
			assistantMsg.Metadata = map[string]interface{}{"nativeToolCalls": reply.ToolCalls}
		}

		userMsg := &AssistantAIMessage{
			ID:        ast.NewNodeID(),
			SessionID: sessionID,
			Role:      "user",
			Content:   buildAssistantAIToolFollowupPrompt(toolResults),
			CreatedAt: time.Now().UnixMilli(),
		}

		currentMessages = append(currentMessages, assistantMsg, userMsg)

		followupSystem := systemPrompt
		nextDelta := onDelta
		if nil != onDelta && 0 < round {
			nextDelta = nil
		}

		if nil != nextDelta && canStreamAssistantAIProvider(profile) {
			reply, err = chatWithAssistantAIProviderStream(profile, followupSystem, currentMessages, nextDelta, &assistantAIChatOptions{})
		} else {
			reply, err = chatWithAssistantAIProvider(profile, followupSystem, currentMessages, &assistantAIChatOptions{})
		}
		if err != nil {
			return nil, err
		}
	}

	ret.Reply = reply
	return ret, nil
}
