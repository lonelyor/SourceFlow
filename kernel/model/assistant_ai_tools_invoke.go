package model

import (
	dbsql "database/sql"
	"encoding/json"
	"fmt"
	"strings"
)

func buildAssistantAIToolPrompt(profile *AssistantAIProfile, context *AssistantAINoteContext) string {
	policy := getAssistantAIToolPolicy(profile)
	available := make([]string, 0, len(assistantAIToolCatalog))
	for _, def := range assistantAIToolCatalog {
		mode := resolveAssistantAIToolDecision(policy, def)
		if AssistantAIToolModeDeny == mode {
			continue
		}
		available = append(available, fmt.Sprintf("- %s (%s, %s, mode=%s)", def.ID, def.Name, def.Risk, mode))
	}
	if 1 > len(available) {
		return ""
	}

	contextDesc := "- current note: unavailable"
	if nil != context && "" != strings.TrimSpace(context.RootID) {
		contextDesc = fmt.Sprintf("- current note: title=%q, notebook=%q, path=%q, rootID=%q", strings.TrimSpace(context.Title), strings.TrimSpace(context.Notebook), strings.TrimSpace(context.Path), strings.TrimSpace(context.RootID))
	}
	currentBlockDesc := "- current block: unavailable"
	if nil != context && "" != strings.TrimSpace(context.CurrentBlockID) {
		currentBlockDesc = fmt.Sprintf("- current block: id=%q, type=%q", strings.TrimSpace(context.CurrentBlockID), strings.TrimSpace(context.CurrentBlockType))
	}
	selectedTextDesc := "- selected text: unavailable"
	if nil != context && "" != strings.TrimSpace(context.SelectedText) {
		selectedTextDesc = fmt.Sprintf("- selected text: %q", truncateAssistantAIToolText(strings.TrimSpace(context.SelectedText), 200))
	}

	return strings.Join([]string{
		"You can use native note tools exposed by the local app.",
		"Available tools:",
		strings.Join(available, "\n"),
		"Context:",
		contextDesc,
		currentBlockDesc,
		selectedTextDesc,
		fmt.Sprintf("Read scope=%s, write scope=%s.", policy.ReadScope, policy.WriteScope),
		"If tools are useful, reply with JSON only, without Markdown fences, in this format:",
		`{"toolCalls":[{"tool":"search-blocks","args":{"query":"keyword","limit":5}}],"reply":"optional brief intent"}`,
		"Rules:",
		"- Keep at most 3 toolCalls.",
		"- Only use listed tools.",
		"- Prefer read tools first.",
		"- Use get-current-block when the user is asking about the currently focused block or the current selection.",
		"- Use get-current-block-context when the user needs the current block together with parent, sibling, child, or structural context.",
		"- Use get-block-references when the user asks how the current block is referenced, reused, or connected to other blocks.",
		"- After search-notes, use read-note to inspect a chosen note before concluding.",
		"- Use get-note-backlinks when the user asks how the current note relates to existing notes, references, mentions, or prior knowledge.",
		"- Use get-note-outline when the user asks about structure, sections, headings, or how to reorganize a note.",
		"- Use list-note-history when the user asks about prior versions, change history, or how a note evolved over time.",
		"- Use list-restore-points when the user asks about snapshot recovery, restore points, or backup rollback options.",
		"- After search-blocks, use read-block when you need the full block content or its exact document context.",
		"- Use create-child-note when the user wants a subnote, follow-up note, or child document under the current note.",
		"- Use insert-after-block when the user wants continuation, expansion, or a follow-up section inserted below the current block.",
		"- Use delete-block when the user clearly wants a non-root block removed or deleted.",
		"- Use append-current-note or create-note only when the user clearly wants content to be written.",
		"- Use create-workbench-item when the user asks to extract or create tasks, events, projects, or structured notes.",
		"- Use replace-block only when the user clearly wants an existing block to be rewritten, corrected, or normalized; never use it to delete a block.",
		"- For insert-after-block and replace-block, always provide non-empty content in args.markdown, args.content, or args.text.",
		"- For write tools, set args.dryRun=true when the user asks to preview, review, or inspect the impact before applying.",
		"- Use list-note-assets and read-note-asset-file first when the user asks about files attached to the current or specified note.",
		"- Use search-assets or read-asset-content when the user asks about workspace-wide attachments, indexed attachment text, or archived source material.",
		"- If no tool is needed, reply normally.",
	}, "\n")
}

func parseAssistantAIToolEnvelope(content string) (ret *assistantAIToolEnvelope, ok bool) {
	trimmed := strings.TrimSpace(content)
	if "" == trimmed {
		return nil, false
	}
	if strings.HasPrefix(trimmed, "```") {
		trimmed = strings.TrimSpace(strings.TrimPrefix(trimmed, "```json"))
		trimmed = strings.TrimSpace(strings.TrimPrefix(trimmed, "```"))
		trimmed = strings.TrimSpace(strings.TrimSuffix(trimmed, "```"))
	}
	if !strings.HasPrefix(trimmed, "{") || !strings.HasSuffix(trimmed, "}") {
		start := strings.Index(trimmed, "{")
		end := strings.LastIndex(trimmed, "}")
		if 0 <= start && start < end {
			trimmed = trimmed[start : end+1]
		}
	}
	envelope := &assistantAIToolEnvelope{}
	if err := json.Unmarshal([]byte(trimmed), envelope); nil != err {
		return nil, false
	}
	if nil == envelope.ToolCalls {
		envelope.ToolCalls = []*assistantAIToolCall{}
	}
	return envelope, 0 < len(envelope.ToolCalls) || "" != strings.TrimSpace(envelope.Reply)
}

func executeAssistantAIRequestedTools(db *dbsql.DB, profile *AssistantAIProfile, sessionID string, context *AssistantAINoteContext, calls []*assistantAIToolCall, fallbackReply, userPrompt string, securityMode AISecurityMode) (ret []*AssistantAIToolResult) {
	ret = []*AssistantAIToolResult{}
	for i, call := range calls {
		if nil == call || "" == strings.TrimSpace(call.Tool) {
			continue
		}
		if 3 <= i {
			break
		}
		toolID, normalizedArgs := normalizeAssistantAIToolInvocation(strings.TrimSpace(call.Tool), call.Args, fallbackReply, userPrompt)
		result, err := executeAssistantAITool(db, profile, sessionID, context, toolID, normalizedArgs, securityMode)
		if nil != err {
			def := getAssistantAIToolDefinition(toolID)
			name := toolID
			risk := AssistantAIToolRiskRead
			if nil != def {
				name = def.Name
				risk = def.Risk
			}
			result = &AssistantAIToolResult{
				ToolID:          toolID,
				Name:            name,
				Risk:            risk,
				Decision:        AssistantAIToolModeDeny,
				Executed:        false,
				RequiresConfirm: false,
				Summary:         err.Error(),
				Error:           err.Error(),
				Data:            map[string]interface{}{},
			}
		}
		ret = append(ret, result)
	}
	return ret
}

func normalizeAssistantAIToolInvocation(toolID string, args map[string]interface{}, fallbackReply, userPrompt string) (normalizedToolID string, normalizedArgs map[string]interface{}) {
	normalizedToolID = strings.TrimSpace(toolID)
	normalizedArgs = normalizeAssistantAIToolArgs(normalizedToolID, args, fallbackReply, userPrompt)
	if AssistantAIToolReplaceBlock == normalizedToolID && "" == strings.TrimSpace(getAssistantAIContentValue(normalizedArgs)) && assistantAIRequestSuggestsDelete(normalizedArgs, userPrompt, fallbackReply) {
		normalizedToolID = AssistantAIToolDeleteBlock
	}
	return
}

func normalizeAssistantAIToolArgs(toolID string, args map[string]interface{}, fallbackReply, userPrompt string) map[string]interface{} {
	ret := cloneAssistantAIMap(args)
	if nil == ret {
		ret = map[string]interface{}{}
	}
	normalizedReply := strings.TrimSpace(fallbackReply)
	if "" == strings.TrimSpace(getAssistantAIContentValue(ret)) && "" != normalizedReply {
		switch strings.TrimSpace(toolID) {
		case AssistantAIToolAppendCurrentNote, AssistantAIToolCreateNote, AssistantAIToolCreateChildNote, AssistantAIToolInsertAfterBlock, AssistantAIToolReplaceBlock:
			ret["content"] = normalizedReply
		}
	}
	if AssistantAIToolReplaceBlock == strings.TrimSpace(toolID) && "" == strings.TrimSpace(getAssistantAIContentValue(ret)) && assistantAIRequestSuggestsDelete(ret, userPrompt, fallbackReply) {
		ret["action"] = "delete"
	}
	return ret
}

func assistantAIRequestSuggestsDelete(args map[string]interface{}, userPrompt, fallbackReply string) bool {
	if assistantAIIsDeleteIntent(args) {
		return true
	}
	joined := strings.TrimSpace(strings.Join([]string{strings.TrimSpace(userPrompt), strings.TrimSpace(fallbackReply)}, "\n"))
	return assistantAITextSuggestsDelete(joined)
}

func assistantAITextSuggestsDelete(text string) bool {
	normalized := strings.ToLower(strings.TrimSpace(text))
	if "" == normalized {
		return false
	}
	for _, keyword := range []string{"删除", "删掉", "删去", "移除", "去掉", "清除", "remove", "delete", "erase"} {
		if strings.Contains(normalized, keyword) {
			return true
		}
	}
	return false
}

func buildAssistantAIToolFollowupPrompt(results []*AssistantAIToolResult) string {
	lines := []string{
		"Tool execution results are available below.",
		"Use these results to answer the user.",
		"Do not emit JSON now. Reply normally in the user's language.",
	}
	for _, item := range results {
		if nil == item {
			continue
		}
		status := "blocked"
		if item.Executed {
			status = "executed"
		}
		line := fmt.Sprintf("- %s (%s, %s): %s", item.ToolID, item.Risk, status, strings.TrimSpace(item.Summary))
		if "" != strings.TrimSpace(item.Error) {
			line += " | error=" + strings.TrimSpace(item.Error)
		}
		lines = append(lines, line)
		if 0 < len(item.Data) {
			if jsonBytes, err := json.Marshal(item.Data); nil == err {
				lines = append(lines, "  data="+string(jsonBytes))
			}
		}
	}
	return strings.Join(lines, "\n")
}

func executeAssistantAINativeToolCalls(db *dbsql.DB, profile *AssistantAIProfile, sessionID string, context *AssistantAINoteContext, toolCalls []map[string]interface{}, securityMode AISecurityMode) (ret []*AssistantAIToolResult) {
	ret = []*AssistantAIToolResult{}
	for i, tc := range toolCalls {
		if nil == tc || 3 <= i {
			continue
		}
		fn, _ := tc["function"].(map[string]interface{})
		if nil == fn {
			continue
		}
		toolID, _ := fn["name"].(string)
		argsJSON, _ := fn["arguments"].(string)
		args := extractAssistantAIToolCallArgs(argsJSON)
		result, err := executeAssistantAITool(db, profile, sessionID, context, strings.TrimSpace(toolID), args, securityMode)
		if nil != err {
			def := getAssistantAIToolDefinition(toolID)
			name := toolID
			risk := AssistantAIToolRiskRead
			if nil != def {
				name = def.Name
				risk = def.Risk
			}
			result = &AssistantAIToolResult{
				ToolID:          toolID,
				Name:            name,
				Risk:            risk,
				Decision:        AssistantAIToolModeDeny,
				Executed:        false,
				RequiresConfirm: false,
				Summary:         err.Error(),
				Error:           err.Error(),
				Data:            map[string]interface{}{},
			}
		}
		ret = append(ret, result)
	}
	return ret
}

func cloneAssistantAIToolCatalog() (ret []*AssistantAIToolDefinition) {
	ret = make([]*AssistantAIToolDefinition, 0, len(assistantAIToolCatalog))
	for _, item := range assistantAIToolCatalog {
		copied := *item
		ret = append(ret, &copied)
	}
	return ret
}

func getAssistantAIToolPolicy(profile *AssistantAIProfile) *AssistantAIToolPolicy {
	policy := &AssistantAIToolPolicy{
		ReadScope:  AssistantAIToolScopeWorkspace,
		WriteScope: AssistantAIToolScopeCurrentNotebook,
		TraceMode:  AssistantAIToolTraceAuditOnly,
		ToolModes:  map[string]string{},
	}
	if nil == profile || nil == profile.Settings {
		for _, def := range assistantAIToolCatalog {
			policy.ToolModes[def.ID] = def.DefaultMode
		}
		return policy
	}
	policy.ReadScope = normalizeAssistantAIToolScope(getAssistantAIStringSetting(profile.Settings, "toolReadScope", AssistantAIToolScopeWorkspace), AssistantAIToolScopeWorkspace)
	policy.WriteScope = normalizeAssistantAIToolScope(getAssistantAIStringSetting(profile.Settings, "toolWriteScope", AssistantAIToolScopeCurrentNotebook), AssistantAIToolScopeCurrentNotebook)
	policy.TraceMode = normalizeAssistantAIToolTraceMode(getAssistantAIStringSetting(profile.Settings, "toolTraceMode", AssistantAIToolTraceAuditOnly))
	rawModes, _ := profile.Settings["toolModes"].(map[string]interface{})
	for _, def := range assistantAIToolCatalog {
		mode := def.DefaultMode
		if nil != rawModes {
			if raw, ok := rawModes[def.ID]; ok && nil != raw {
				mode = normalizeAssistantAIToolMode(fmt.Sprint(raw), def.DefaultMode)
			}
		}
		policy.ToolModes[def.ID] = mode
	}
	return policy
}

func resolveAssistantAIToolDecision(policy *AssistantAIToolPolicy, def *AssistantAIToolDefinition) string {
	if nil == policy || nil == def {
		return AssistantAIToolModeDeny
	}
	mode := normalizeAssistantAIToolMode(policy.ToolModes[def.ID], def.DefaultMode)
	if AssistantAIToolModeDeny == mode {
		return mode
	}
	scope := resolveAssistantAIToolScope(policy, def)
	if AssistantAIToolScopeCurrentNotebook == def.Target && AssistantAIToolScopeCurrentNote == scope {
		return AssistantAIToolModeDeny
	}
	return mode
}

func resolveAssistantAIToolScope(policy *AssistantAIToolPolicy, def *AssistantAIToolDefinition) string {
	if nil == policy || nil == def {
		return AssistantAIToolScopeCurrentNote
	}
	if "write" == def.Category {
		return normalizeAssistantAIToolScope(policy.WriteScope, AssistantAIToolScopeCurrentNotebook)
	}
	return normalizeAssistantAIToolScope(policy.ReadScope, AssistantAIToolScopeWorkspace)
}

func normalizeAssistantAIToolMode(value, fallback string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case AssistantAIToolModeAuto:
		return AssistantAIToolModeAuto
	case AssistantAIToolModeConfirm:
		return AssistantAIToolModeConfirm
	case AssistantAIToolModeDeny:
		return AssistantAIToolModeDeny
	default:
		return fallback
	}
}

func normalizeAssistantAIToolScope(value, fallback string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case AssistantAIToolScopeCurrentNote:
		return AssistantAIToolScopeCurrentNote
	case AssistantAIToolScopeCurrentNotebook:
		return AssistantAIToolScopeCurrentNotebook
	case AssistantAIToolScopeWorkspace:
		return AssistantAIToolScopeWorkspace
	default:
		return fallback
	}
}

func normalizeAssistantAIToolTraceMode(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case AssistantAIToolTraceMarkdown:
		return AssistantAIToolTraceMarkdown
	default:
		return AssistantAIToolTraceAuditOnly
	}
}

func getAssistantAIToolDefinition(toolID string) *AssistantAIToolDefinition {
	for _, item := range assistantAIToolCatalog {
		if item.ID == strings.TrimSpace(toolID) {
			copied := *item
			return &copied
		}
	}
	return nil
}
