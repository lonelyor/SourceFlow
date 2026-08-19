package model

import (
	dbsql "database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
)

func ChatAssistantAI(req *AssistantAIChatRequest) (ret *AssistantAIChatResult, err error) {
	return chatAssistantAI0(req, nil)
}

func ChatAssistantAIStream(req *AssistantAIChatRequest, onDelta func(string) error) (ret *AssistantAIChatResult, err error) {
	return chatAssistantAI0(req, onDelta)
}

func EditAssistantAIMessage(req *AssistantAIMessageEditRequest) (ret *AssistantAIChatResult, err error) {
	return editAssistantAIMessage0(req, nil)
}

func EditAssistantAIMessageStream(req *AssistantAIMessageEditRequest, onDelta func(string) error) (ret *AssistantAIChatResult, err error) {
	return editAssistantAIMessage0(req, onDelta)
}

func chatAssistantAI0(req *AssistantAIChatRequest, onDelta func(string) error) (ret *AssistantAIChatResult, err error) {
	if nil == req {
		return nil, fmt.Errorf("assistant AI chat request is required")
	}

	message := strings.TrimSpace(req.Message)
	attachments := normalizeAssistantAIInputAttachments(req.Attachments)
	sources := normalizeAssistantAISourceCitations(req.Sources)
	if "" == message && 1 > len(attachments) {
		return nil, fmt.Errorf("assistant AI message is required")
	}

	db, err := getAssistantAIDB()
	if err != nil {
		return nil, err
	}

	var session *AssistantAISession
	sessionID := strings.TrimSpace(req.SessionID)
	if "" != sessionID {
		session, err = getAssistantAISession0(db, sessionID)
		if err != nil {
			return nil, err
		}
	}

	profileID := strings.TrimSpace(req.ProfileID)
	if "" == profileID && nil != session {
		profileID = session.ProfileID
	}
	profile, err := getAssistantAIProfile0(db, profileID)
	if err != nil {
		return nil, err
	}

	if nil == session {
		title := strings.TrimSpace(req.Title)
		if "" == title {
			title = buildAssistantAISessionTitle(message)
		}
		session, err = createAssistantAISession0(db, profile.ID, strings.TrimSpace(req.Mode), title)
		if err != nil {
			return nil, err
		}
	} else if profile.ID != session.ProfileID {
		if _, err = db.Exec(`UPDATE ai_sessions SET profile_id = ?, updated_at = ? WHERE id = ?`, profile.ID, time.Now().UnixMilli(), session.ID); err != nil {
			return nil, err
		}
		session.ProfileID = profile.ID
	}

	userMessage := &AssistantAIMessage{
		ID:        ast.NewNodeID(),
		SessionID: session.ID,
		Role:      "user",
		Content:   message,
		Metadata:  map[string]interface{}{},
		CreatedAt: time.Now().UnixMilli(),
	}
	if 0 < len(attachments) {
		userMessage.Metadata["attachments"] = assistantAIInputAttachmentsToMetadata(attachments)
	}
	if 0 < len(sources) {
		userMessage.Metadata["sources"] = assistantAISourceCitationsToMetadata(sources)
	}

	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer rollbackAssistantAITx(tx)

	if err = insertAssistantAIMessageTx(tx, userMessage); err != nil {
		return nil, err
	}
	if err = syncAssistantAISessionStatsTx(tx, session.ID); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}

	// C4: build the system prompt (note body + persona + tool context) first so
	// it can be measured against the model window together with the history,
	// instead of trimming history in isolation while the note body is ignored.
	systemPrompt := strings.TrimSpace(req.System)
	if "" == systemPrompt {
		systemPrompt = getAssistantAIStringSetting(profile.Settings, "systemPrompt", "")
	}

	personaPrompt := strings.TrimSpace(getAssistantAIStringSetting(profile.Settings, "personaPrompt", ""))
	if "" != personaPrompt {
		if "" != systemPrompt {
			systemPrompt = personaPrompt + "\n\n" + systemPrompt
		} else {
			systemPrompt = personaPrompt
		}
	}

	useNativeTools := req.EnableTools && (isAssistantAINativeToolProvider(profile.Provider) || AssistantAIProviderAnthropic == profile.Provider || AssistantAIProviderGemini == profile.Provider)
	if req.EnableTools && !useNativeTools {
		toolPrompt := buildAssistantAIToolPrompt(profile, req.Context)
		if "" != toolPrompt {
			systemPrompt = strings.TrimSpace(firstAssistantAINonEmpty(systemPrompt, "") + "\n\n" + toolPrompt)
		}
	}
	if useNativeTools {
		ctxPart := buildAssistantAIToolContextSystemPart(req.Context)
		if "" != ctxPart {
			systemPrompt = strings.TrimSpace(systemPrompt + "\n\n" + ctxPart)
		}
	}

	// C4: unified budget. Effective window = the model's real context window
	// when known (resolved per model on the profile), else the configured
	// history budget. Reserve room for output and the system prompt (which
	// carries the note body), then trim the oldest history so the whole
	// request fits the window.
	effectiveWindow := getAssistantAIIntSetting(profile.Settings, "contextWindow", 0)
	if effectiveWindow <= 0 {
		effectiveWindow = getAssistantAIIntSetting(profile.Settings, "maxContextTokens", assistantAIDefaultContextTokens)
	}
	outputReserve := getAssistantAIIntSetting(profile.Settings, "maxTokens", 0)
	if outputReserve <= 0 {
		outputReserve = 4096
	}
	historyBudget := effectiveWindow - outputReserve - estimateAssistantAITextTokens(systemPrompt)
	if historyBudget < 0 {
		historyBudget = 0
	}

	maxContextMessages := getAssistantAIIntSetting(profile.Settings, "maxContextMessages", assistantAIDefaultContextMessages)
	contextMessages, err := listAssistantAISessionMessages(db, session.ID, maxContextMessages)
	if err != nil {
		return nil, err
	}
	contextMessages = trimAssistantAIContextMessages(contextMessages, historyBudget)
	loopResult, loopErr := runAssistantAIToolLoop(&assistantAIToolLoopParams{
		DB:              db,
		Profile:         profile,
		SessionID:       session.ID,
		Context:         req.Context,
		RequestContext:  req.RequestContext,
		UserPrompt:      strings.TrimSpace(req.Message),
		SystemPrompt:    systemPrompt,
		ContextMessages: contextMessages,
		EnableTools:     req.EnableTools,
		UseNativeTools:  useNativeTools,
		SecurityMode:    req.SecurityMode,
		OnDelta:         onDelta,
	})
	if nil != loopErr {
		return nil, loopErr
	}
	reply := loopResult.Reply
	toolResults := loopResult.ToolResults

	assistantMessage := &AssistantAIMessage{
		ID:                ast.NewNodeID(),
		SessionID:         session.ID,
		Role:              "assistant",
		Content:           strings.TrimSpace(reply.Content),
		ProviderMessageID: reply.ProviderMessageID,
		InputTokens:       reply.InputTokens,
		OutputTokens:      reply.OutputTokens,
		Metadata:          cloneAssistantAIMap(reply.Metadata),
		CreatedAt:         time.Now().UnixMilli(),
	}
	if nil == assistantMessage.Metadata {
		assistantMessage.Metadata = map[string]interface{}{}
	}
	if 0 < len(toolResults) {
		toolResultsJSON, marshalErr := marshalAssistantAIToolResults(toolResults)
		if nil == marshalErr {
			assistantMessage.Metadata["toolResults"] = toolResultsJSON
		}
	}

	tx, err = db.Begin()
	if err != nil {
		return nil, err
	}
	defer rollbackAssistantAITx(tx)

	if err = insertAssistantAIMessageTx(tx, assistantMessage); err != nil {
		return nil, err
	}
	if err = syncAssistantAISessionStatsTx(tx, session.ID); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}

	session, err = getAssistantAISession0(db, session.ID)
	if err != nil {
		return nil, err
	}
	messages, err := listAssistantAISessionMessages(db, session.ID, 0)
	if err != nil {
		return nil, err
	}

	return &AssistantAIChatResult{Session: session, Profile: SanitizeAssistantAIProfile(profile), UserMessage: userMessage, AssistantMessage: assistantMessage, Messages: messages, ToolResults: toolResults}, nil
}

func editAssistantAIMessage0(req *AssistantAIMessageEditRequest, onDelta func(string) error) (ret *AssistantAIChatResult, err error) {
	if nil == req {
		return nil, fmt.Errorf("assistant AI edit request is required")
	}

	sessionID := strings.TrimSpace(req.SessionID)
	if "" == sessionID {
		return nil, fmt.Errorf("assistant AI session ID is required")
	}

	messageID := strings.TrimSpace(req.MessageID)
	if "" == messageID {
		return nil, fmt.Errorf("assistant AI message ID is required")
	}

	message := strings.TrimSpace(req.Message)
	attachments := normalizeAssistantAIInputAttachments(req.Attachments)
	sources := normalizeAssistantAISourceCitations(req.Sources)
	if "" == message && 1 > len(attachments) {
		return nil, fmt.Errorf("assistant AI message is required")
	}

	db, err := getAssistantAIDB()
	if err != nil {
		return nil, err
	}

	session, err := getAssistantAISession0(db, sessionID)
	if err != nil {
		return nil, err
	}

	profileID := strings.TrimSpace(req.ProfileID)
	if "" == profileID {
		profileID = session.ProfileID
	}
	profile, err := getAssistantAIProfile0(db, profileID)
	if err != nil {
		return nil, err
	}

	userMessage, userMessageRowID, err := getAssistantAIMessagePosition0(db, session.ID, messageID)
	if err != nil {
		return nil, err
	}
	if "user" != strings.TrimSpace(userMessage.Role) {
		return nil, fmt.Errorf("assistant AI only supports editing user messages")
	}

	editedAt := time.Now().UnixMilli()
	userMessage.Content = message
	userMessage.Metadata = cloneAssistantAIMap(userMessage.Metadata)
	if nil == userMessage.Metadata {
		userMessage.Metadata = map[string]interface{}{}
	}
	userMessage.Metadata["editedAt"] = editedAt
	if 0 < len(attachments) {
		userMessage.Metadata["attachments"] = assistantAIInputAttachmentsToMetadata(attachments)
	} else {
		delete(userMessage.Metadata, "attachments")
	}
	if 0 < len(sources) {
		userMessage.Metadata["sources"] = assistantAISourceCitationsToMetadata(sources)
	} else {
		delete(userMessage.Metadata, "sources")
	}

	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer rollbackAssistantAITx(tx)

	if err = updateAssistantAISessionProfileTx(tx, session, profile); err != nil {
		return nil, err
	}
	if err = updateAssistantAIMessageTx(tx, userMessage); err != nil {
		return nil, err
	}
	if err = deleteAssistantAISessionMessagesAfterTx(tx, session.ID, userMessage.CreatedAt, userMessageRowID); err != nil {
		return nil, err
	}
	if err = deleteAssistantAIToolAuditsAfterTx(tx, session.ID, userMessage.CreatedAt); err != nil {
		return nil, err
	}
	if err = syncAssistantAISessionStatsTx(tx, session.ID); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}

	maxContextMessages := getAssistantAIIntSetting(profile.Settings, "maxContextMessages", assistantAIDefaultContextMessages)
	contextMessages, err := listAssistantAISessionMessages(db, session.ID, maxContextMessages)
	if err != nil {
		return nil, err
	}
	maxContextTokens := getAssistantAIIntSetting(profile.Settings, "maxContextTokens", assistantAIDefaultContextTokens)
	contextMessages = trimAssistantAIContextMessages(contextMessages, maxContextTokens)

	systemPrompt := strings.TrimSpace(req.System)
	if "" == systemPrompt {
		systemPrompt = getAssistantAIStringSetting(profile.Settings, "systemPrompt", "")
	}

	personaPrompt := strings.TrimSpace(getAssistantAIStringSetting(profile.Settings, "personaPrompt", ""))
	if "" != personaPrompt {
		if "" != systemPrompt {
			systemPrompt = personaPrompt + "\n\n" + systemPrompt
		} else {
			systemPrompt = personaPrompt
		}
	}

	editUseNativeTools := req.EnableTools && isAssistantAINativeToolProvider(profile.Provider)
	if req.EnableTools && !editUseNativeTools {
		toolPrompt := buildAssistantAIToolPrompt(profile, req.Context)
		if "" != toolPrompt {
			systemPrompt = strings.TrimSpace(firstAssistantAINonEmpty(systemPrompt, "") + "\n\n" + toolPrompt)
		}
	}
	if editUseNativeTools {
		ctxPart := buildAssistantAIToolContextSystemPart(req.Context)
		if "" != ctxPart {
			systemPrompt = strings.TrimSpace(systemPrompt + "\n\n" + ctxPart)
		}
	}

	editLoopResult, editLoopErr := runAssistantAIToolLoop(&assistantAIToolLoopParams{
		DB:              db,
		Profile:         profile,
		SessionID:       session.ID,
		Context:         req.Context,
		RequestContext:  req.RequestContext,
		UserPrompt:      strings.TrimSpace(req.Message),
		SystemPrompt:    systemPrompt,
		ContextMessages: contextMessages,
		EnableTools:     req.EnableTools,
		UseNativeTools:  editUseNativeTools,
		SecurityMode:    req.SecurityMode,
		OnDelta:         onDelta,
	})
	if nil != editLoopErr {
		return nil, editLoopErr
	}
	reply := editLoopResult.Reply
	toolResults := editLoopResult.ToolResults

	assistantMessage := &AssistantAIMessage{
		ID:                ast.NewNodeID(),
		SessionID:         session.ID,
		Role:              "assistant",
		Content:           strings.TrimSpace(reply.Content),
		ProviderMessageID: reply.ProviderMessageID,
		InputTokens:       reply.InputTokens,
		OutputTokens:      reply.OutputTokens,
		Metadata:          cloneAssistantAIMap(reply.Metadata),
		CreatedAt:         time.Now().UnixMilli(),
	}
	if nil == assistantMessage.Metadata {
		assistantMessage.Metadata = map[string]interface{}{}
	}
	if 0 < len(toolResults) {
		toolResultsJSON, marshalErr := marshalAssistantAIToolResults(toolResults)
		if nil == marshalErr {
			assistantMessage.Metadata["toolResults"] = toolResultsJSON
		}
	}

	tx, err = db.Begin()
	if err != nil {
		return nil, err
	}
	defer rollbackAssistantAITx(tx)

	if err = insertAssistantAIMessageTx(tx, assistantMessage); err != nil {
		return nil, err
	}
	if err = syncAssistantAISessionStatsTx(tx, session.ID); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}

	session, err = getAssistantAISession0(db, session.ID)
	if err != nil {
		return nil, err
	}
	messages, err := listAssistantAISessionMessages(db, session.ID, 0)
	if err != nil {
		return nil, err
	}

	return &AssistantAIChatResult{Session: session, Profile: SanitizeAssistantAIProfile(profile), UserMessage: userMessage, AssistantMessage: assistantMessage, Messages: messages, ToolResults: toolResults}, nil
}

func AnalyzeAssistantAISession(req *AssistantAIAnalyzeRequest) (ret string, err error) {
	if nil == req {
		return "", fmt.Errorf("assistant AI analyze request is required")
	}
	sessionID := strings.TrimSpace(req.SessionID)
	if "" == sessionID {
		return "", fmt.Errorf("assistant AI session ID is required")
	}

	db, err := getAssistantAIDB()
	if err != nil {
		return "", err
	}
	session, err := getAssistantAISession0(db, sessionID)
	if err != nil {
		return "", err
	}

	profileID := strings.TrimSpace(req.ProfileID)
	if "" == profileID {
		profileID = session.ProfileID
	}
	profile, err := getAssistantAIProfile0(db, profileID)
	if err != nil {
		return "", err
	}

	messages, err := listAssistantAISessionMessages(db, sessionID, 0)
	if err != nil {
		return "", err
	}
	prompt := strings.TrimSpace(req.Prompt)
	if "" == prompt {
		prompt = "Analyze the conversation, extract the key decisions, open questions, actionable next steps, and produce a clean Markdown summary."
	}
	messages = append(messages, &AssistantAIMessage{
		ID:        ast.NewNodeID(),
		SessionID: sessionID,
		Role:      "user",
		Content:   prompt,
		CreatedAt: time.Now().UnixMilli(),
	})

	reply, err := chatWithAssistantAIProvider(profile, getAssistantAIStringSetting(profile.Settings, "systemPrompt", ""), messages, nil)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(reply.Content), nil
}

func ConfirmAssistantAITool(req *AssistantAIToolConfirmRequest) (ret *AssistantAIChatResult, err error) {
	if nil == req {
		return nil, fmt.Errorf("assistant AI tool confirm request is required")
	}
	sessionID := strings.TrimSpace(req.SessionID)
	if "" == sessionID {
		return nil, fmt.Errorf("assistant AI session ID is required")
	}

	db, err := getAssistantAIDB()
	if err != nil {
		return nil, err
	}
	session, err := getAssistantAISession0(db, sessionID)
	if err != nil {
		return nil, err
	}

	profileID := strings.TrimSpace(req.ProfileID)
	if "" == profileID {
		profileID = session.ProfileID
	}
	profile, err := getAssistantAIProfile0(db, profileID)
	if err != nil {
		return nil, err
	}

	sessionMessages, listErr := listAssistantAISessionMessages(db, session.ID, 0)
	if nil != listErr {
		return nil, listErr
	}
	userPrompt := assistantAIPrecedingUserPrompt(sessionMessages, strings.TrimSpace(req.MessageID))

	toolResult, err := confirmAssistantAITool(db, profile, session.ID, req.Context, strings.TrimSpace(req.ToolID), cloneAssistantAIMap(req.Args), userPrompt, req.SecurityMode)
	if err != nil {
		return nil, err
	}
	if !toolResult.Executed {
		return nil, fmt.Errorf("%s", firstAssistantAINonEmpty(toolResult.Error, toolResult.Summary, "assistant AI tool confirm failed"))
	}

	if updateErr := updateAssistantAIMessageToolResult(db, strings.TrimSpace(req.MessageID), strings.TrimSpace(req.AuditID), toolResult); nil != updateErr {
		return nil, updateErr
	}

	messages, err := listAssistantAISessionMessages(db, session.ID, getAssistantAIIntSetting(profile.Settings, "maxContextMessages", assistantAIDefaultContextMessages))
	if err != nil {
		return nil, err
	}
	messages = trimAssistantAIContextMessages(messages, getAssistantAIIntSetting(profile.Settings, "maxContextTokens", assistantAIDefaultContextTokens))
	messages = append(messages, &AssistantAIMessage{
		ID:        ast.NewNodeID(),
		SessionID: session.ID,
		Role:      "user",
		Content:   buildAssistantAIToolFollowupPrompt([]*AssistantAIToolResult{toolResult}),
		CreatedAt: time.Now().UnixMilli(),
	})

	reply, chatErr := chatWithAssistantAIProvider(profile, getAssistantAIStringSetting(profile.Settings, "systemPrompt", ""), messages, nil)
	if nil != chatErr {
		reply = &assistantAIProviderReply{
			Content: assistantTextForToolConfirmFallback(toolResult),
		}
	}

	assistantMessage := &AssistantAIMessage{
		ID:                ast.NewNodeID(),
		SessionID:         session.ID,
		Role:              "assistant",
		Content:           strings.TrimSpace(reply.Content),
		ProviderMessageID: reply.ProviderMessageID,
		InputTokens:       reply.InputTokens,
		OutputTokens:      reply.OutputTokens,
		Metadata:          cloneAssistantAIMap(reply.Metadata),
		CreatedAt:         time.Now().UnixMilli(),
	}
	if nil == assistantMessage.Metadata {
		assistantMessage.Metadata = map[string]interface{}{}
	}
	toolResultsJSON, marshalErr := marshalAssistantAIToolResults([]*AssistantAIToolResult{toolResult})
	if nil == marshalErr {
		assistantMessage.Metadata["toolResults"] = toolResultsJSON
	}

	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer rollbackAssistantAITx(tx)

	if err = insertAssistantAIMessageTx(tx, assistantMessage); err != nil {
		return nil, err
	}
	if err = syncAssistantAISessionStatsTx(tx, session.ID); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}

	session, err = getAssistantAISession0(db, session.ID)
	if err != nil {
		return nil, err
	}
	allMessages, err := listAssistantAISessionMessages(db, session.ID, 0)
	if err != nil {
		return nil, err
	}

	return &AssistantAIChatResult{
		Session:          session,
		Profile:          SanitizeAssistantAIProfile(profile),
		UserMessage:      nil,
		AssistantMessage: assistantMessage,
		Messages:         allMessages,
		ToolResults:      []*AssistantAIToolResult{toolResult},
	}, nil
}

func RejectAssistantAITool(req *AssistantAIToolRejectRequest) (ret *AssistantAIChatResult, err error) {
	if nil == req {
		return nil, fmt.Errorf("assistant AI tool reject request is required")
	}
	sessionID := strings.TrimSpace(req.SessionID)
	if "" == sessionID {
		return nil, fmt.Errorf("assistant AI session ID is required")
	}

	db, err := getAssistantAIDB()
	if err != nil {
		return nil, err
	}
	session, err := getAssistantAISession0(db, sessionID)
	if err != nil {
		return nil, err
	}

	profileID := strings.TrimSpace(req.ProfileID)
	if "" == profileID {
		profileID = session.ProfileID
	}
	profile, err := getAssistantAIProfile0(db, profileID)
	if err != nil {
		return nil, err
	}

	toolResult, err := rejectAssistantAITool(db, profile, session.ID, strings.TrimSpace(req.ToolID))
	if err != nil {
		return nil, err
	}

	if updateErr := updateAssistantAIMessageToolResult(db, strings.TrimSpace(req.MessageID), strings.TrimSpace(toolResult.AuditID), toolResult); nil != updateErr {
		return nil, updateErr
	}

	session, err = getAssistantAISession0(db, session.ID)
	if err != nil {
		return nil, err
	}
	allMessages, err := listAssistantAISessionMessages(db, session.ID, 0)
	if err != nil {
		return nil, err
	}

	return &AssistantAIChatResult{
		Session:     session,
		Profile:     SanitizeAssistantAIProfile(profile),
		Messages:    allMessages,
		ToolResults: []*AssistantAIToolResult{toolResult},
	}, nil
}

func updateAssistantAIMessageToolResult(db *dbsql.DB, messageID, auditID string, replacement *AssistantAIToolResult) error {
	if nil == db || "" == strings.TrimSpace(messageID) || nil == replacement {
		return nil
	}

	var metadataJSON string
	if err := db.QueryRow(`SELECT metadata FROM ai_messages WHERE id = ?`, strings.TrimSpace(messageID)).Scan(&metadataJSON); err != nil {
		return err
	}

	metadata := map[string]interface{}{}
	if "" != strings.TrimSpace(metadataJSON) {
		if err := json.Unmarshal([]byte(metadataJSON), &metadata); err != nil {
			return err
		}
	}

	rawResults, _ := metadata["toolResults"].([]interface{})
	if 0 == len(rawResults) {
		return nil
	}

	replacementJSON, err := json.Marshal(replacement)
	if err != nil {
		return err
	}
	replacementRow := map[string]interface{}{}
	if err = json.Unmarshal(replacementJSON, &replacementRow); err != nil {
		return err
	}

	replaced := false
	for index, raw := range rawResults {
		row, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		if "" != auditID && strings.TrimSpace(fmt.Sprint(row["auditId"])) == strings.TrimSpace(auditID) {
			rawResults[index] = replacementRow
			replaced = true
			break
		}
	}
	if !replaced {
		for index, raw := range rawResults {
			row, ok := raw.(map[string]interface{})
			if !ok {
				continue
			}
			if strings.TrimSpace(fmt.Sprint(row["toolId"])) == replacement.ToolID && strings.TrimSpace(fmt.Sprint(row["executed"])) != "true" {
				rawResults[index] = replacementRow
				replaced = true
				break
			}
		}
	}
	if !replaced {
		rawResults = append(rawResults, replacementRow)
	}
	metadata["toolResults"] = rawResults

	metadataBytes, err := marshalAssistantAIMap(metadata)
	if err != nil {
		return err
	}
	_, err = db.Exec(`UPDATE ai_messages SET metadata = ? WHERE id = ?`, string(metadataBytes), strings.TrimSpace(messageID))
	return err
}

func assistantTextForToolConfirmFallback(result *AssistantAIToolResult) string {
	if nil == result {
		return "工具已执行。"
	}
	lines := []string{
		"工具已执行。",
		fmt.Sprintf("工具：%s", firstAssistantAINonEmpty(result.Name, result.ToolID)),
		fmt.Sprintf("结果：%s", firstAssistantAINonEmpty(result.Summary, "已完成")),
	}
	if 0 < len(result.Data) {
		if payload, err := json.MarshalIndent(result.Data, "", "  "); nil == err {
			lines = append(lines, "", string(payload))
		}
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

func assistantAIPrecedingUserPrompt(messages []*AssistantAIMessage, messageID string) string {
	messageID = strings.TrimSpace(messageID)
	if "" == messageID || 0 == len(messages) {
		return ""
	}
	for i, item := range messages {
		if nil == item || strings.TrimSpace(item.ID) != messageID {
			continue
		}
		for j := i - 1; 0 <= j; j-- {
			prev := messages[j]
			if nil == prev || "user" != strings.TrimSpace(prev.Role) {
				continue
			}
			return strings.TrimSpace(prev.Content)
		}
		break
	}
	return ""
}
