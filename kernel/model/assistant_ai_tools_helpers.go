package model

import (
	"encoding/json"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"strings"
	"unicode/utf8"

	dbsql "database/sql"
)

func truncateAssistantAIToolText(text string, limit int) string {
	text = strings.TrimSpace(text)
	if 0 >= limit {
		return text
	}
	runes := []rune(text)
	if len(runes) <= limit {
		return text
	}
	return strings.TrimSpace(string(runes[:limit])) + "\n\n[truncated]"
}

func assistantAINoteAssetMeta(assetPath string) map[string]interface{} {
	assetPath = normalizeAssistantAINoteAssetPath(assetPath)
	if "" == assetPath {
		return nil
	}
	ret := map[string]interface{}{
		"path": assetPath,
		"name": path.Base(assetPath),
		"ext":  strings.ToLower(path.Ext(assetPath)),
	}
	ret["kind"] = assistantAIAssetKind(getAssistantAIStringValue(ret, "ext", ""))
	absPath, err := GetAssetAbsPath(assetPath)
	if nil != err || "" == absPath {
		ret["exists"] = false
		if nil != err {
			ret["error"] = err.Error()
		}
		return ret
	}
	ret["exists"] = true
	ret["absPath"] = absPath
	if stat, statErr := os.Stat(absPath); nil == statErr {
		ret["size"] = stat.Size()
		ret["updatedAt"] = stat.ModTime().UnixMilli()
	}
	return ret
}

func normalizeAssistantAINoteAssetPath(assetPath string) string {
	assetPath = strings.TrimSpace(assetPath)
	if idx := strings.Index(assetPath, "?"); 0 <= idx {
		assetPath = assetPath[:idx]
	}
	return strings.TrimSpace(strings.TrimPrefix(filepath.ToSlash(assetPath), "./"))
}

func resolveAssistantAINoteAssetPath(rootID, assetPath string) (ret string, err error) {
	paths, listErr := DocAssets(strings.TrimSpace(rootID))
	if nil != listErr {
		return "", listErr
	}
	assetPath = normalizeAssistantAINoteAssetPath(assetPath)
	for _, item := range paths {
		item = normalizeAssistantAINoteAssetPath(item)
		if item == assetPath {
			return item, nil
		}
	}
	return "", fmt.Errorf("指定附件不属于当前目标笔记")
}

func assistantAIAssetKind(ext string) string {
	ext = strings.ToLower(strings.TrimSpace(ext))
	if "" == ext {
		return "binary"
	}
	textExts := map[string]bool{
		".txt": true, ".md": true, ".markdown": true, ".csv": true, ".tsv": true,
		".json": true, ".jsonl": true, ".yaml": true, ".yml": true, ".toml": true,
		".ini": true, ".conf": true, ".properties": true, ".log": true,
		".html": true, ".htm": true, ".xml": true, ".svg": true,
		".css": true, ".scss": true, ".less": true,
		".js": true, ".jsx": true, ".ts": true, ".tsx": true,
		".go": true, ".py": true, ".java": true, ".kt": true, ".rs": true,
		".c": true, ".cc": true, ".cpp": true, ".h": true, ".hpp": true,
		".php": true, ".rb": true, ".lua": true, ".sh": true, ".ps1": true,
		".sql": true, ".bat": true, ".cmd": true, ".tex": true, ".rst": true,
	}
	if textExts[ext] {
		return "text"
	}
	imageExts := map[string]bool{
		".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true,
		".bmp": true, ".ico": true, ".tif": true, ".tiff": true, ".avif": true,
		".heic": true, ".heif": true,
	}
	if imageExts[ext] {
		return "image"
	}
	return "binary"
}

func assistantAITextAssetKind(kind string) bool {
	return "text" == strings.TrimSpace(kind)
}

func readAssistantAITextAsset(absPath string) (content string, truncated bool, err error) {
	data, err := os.ReadFile(absPath)
	if nil != err {
		return "", false, err
	}
	if !utf8.Valid(data) {
		return "", false, fmt.Errorf("该附件不是 UTF-8 文本文件")
	}
	const maxRunes = 16000
	text := strings.TrimSpace(string(data))
	runes := []rune(text)
	if len(runes) <= maxRunes {
		return text, false, nil
	}
	return strings.TrimSpace(string(runes[:maxRunes])) + "\n\n[truncated]", true, nil
}

func assistantAINoteMatchesScope(scope string, context *AssistantAINoteContext, boxID, docPath, rootID string) bool {
	switch normalizeAssistantAIToolScope(scope, AssistantAIToolScopeWorkspace) {
	case AssistantAIToolScopeCurrentNote:
		return "" != rootID && "" != contextID(context) && rootID == contextID(context)
	case AssistantAIToolScopeCurrentNotebook:
		return "" != boxID && boxID == contextNotebook(context)
	default:
		return true
	}
}

func contextID(context *AssistantAINoteContext) string {
	if nil == context {
		return ""
	}
	return strings.TrimSpace(context.RootID)
}

func contextNotebook(context *AssistantAINoteContext) string {
	if nil == context {
		return ""
	}
	return strings.TrimSpace(context.Notebook)
}

func contextPath(context *AssistantAINoteContext) string {
	if nil == context {
		return ""
	}
	return strings.TrimSpace(context.Path)
}

func contextTitle(context *AssistantAINoteContext) string {
	if nil == context {
		return ""
	}
	return strings.TrimSpace(context.Title)
}

func contextCurrentBlockID(context *AssistantAINoteContext) string {
	if nil == context {
		return ""
	}
	return strings.TrimSpace(context.CurrentBlockID)
}

func contextSelectedText(context *AssistantAINoteContext) string {
	if nil == context {
		return ""
	}
	return strings.TrimSpace(context.SelectedText)
}

func cloneAssistantAINoteContext(context *AssistantAINoteContext) *AssistantAINoteContext {
	if nil == context {
		return nil
	}
	return &AssistantAINoteContext{
		RootID:               strings.TrimSpace(context.RootID),
		Notebook:             strings.TrimSpace(context.Notebook),
		Path:                 strings.TrimSpace(context.Path),
		Title:                strings.TrimSpace(context.Title),
		CurrentBlockID:       strings.TrimSpace(context.CurrentBlockID),
		CurrentBlockType:     strings.TrimSpace(context.CurrentBlockType),
		CurrentBlockMarkdown: strings.TrimSpace(context.CurrentBlockMarkdown),
		SelectedText:         strings.TrimSpace(context.SelectedText),
	}
}

func assistantAIBoolStringValue(data map[string]interface{}, key, fallback string) string {
	if nil == data {
		return fallback
	}
	raw, ok := data[key]
	if !ok || nil == raw {
		return fallback
	}
	switch value := raw.(type) {
	case bool:
		if value {
			return "true"
		}
		return "false"
	case string:
		normalized := strings.ToLower(strings.TrimSpace(value))
		switch normalized {
		case "true", "1", "yes", "false", "0", "no":
			return normalized
		}
	}
	return fallback
}

func assistantAIJoinedStringArrayValue(data map[string]interface{}, key string) string {
	if nil == data {
		return ""
	}
	raw, ok := data[key]
	if !ok || nil == raw {
		return ""
	}
	values := []string{}
	switch v := raw.(type) {
	case []interface{}:
		for _, item := range v {
			if trimmed := strings.TrimSpace(fmt.Sprint(item)); "" != trimmed {
				values = append(values, trimmed)
			}
		}
	case []string:
		for _, item := range v {
			if trimmed := strings.TrimSpace(item); "" != trimmed {
				values = append(values, trimmed)
			}
		}
	default:
		text := strings.TrimSpace(fmt.Sprint(v))
		if "" == text {
			return ""
		}
		for _, item := range strings.Split(strings.ReplaceAll(text, "，", ","), ",") {
			if trimmed := strings.TrimSpace(item); "" != trimmed {
				values = append(values, trimmed)
			}
		}
	}
	if 1 > len(values) {
		return ""
	}
	return strings.Join(values, ",")
}

func assistantAIWorkbenchItemLabel(typ string) string {
	switch strings.TrimSpace(typ) {
	case "task":
		return "任务"
	case "event":
		return "事件"
	case "project":
		return "项目"
	default:
		return "笔记"
	}
}

func allAssistantAIAssetTypes() (ret []string) {
	ret = make([]string, 0, len(assetContentSearcher.parsers))
	for ext := range assetContentSearcher.parsers {
		ret = append(ret, ext)
	}
	return ret
}

func insertAssistantAIToolAudit(db *dbsql.DB, audit *assistantAIToolAuditRecord) error {
	if nil == db || nil == audit {
		return nil
	}
	argsJSON, err := marshalAssistantAIMap(audit.Args)
	if nil != err {
		return err
	}
	resultJSON, err := marshalAssistantAIMap(audit.Result)
	if nil != err {
		return err
	}
	_, err = db.Exec(`INSERT INTO ai_tool_audits (id, session_id, profile_id, tool_id, risk, decision, executed, target_scope, target_id, status, args, result, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		audit.ID, audit.SessionID, audit.ProfileID, audit.ToolID, audit.Risk, audit.Decision, boolToInt(audit.Executed),
		audit.TargetScope, audit.TargetID, audit.Status, string(argsJSON), string(resultJSON), audit.CreatedAt)
	return err
}

func ListAssistantAIToolAudits(sessionID, profileID string, limit int) (ret []*AssistantAIToolAudit, err error) {
	ret = []*AssistantAIToolAudit{}
	db, err := getAssistantAIDB()
	if err != nil {
		return nil, err
	}

	limit = clampAssistantAIToolLimit(limit, 1, 100)
	sessionID = strings.TrimSpace(sessionID)
	profileID = strings.TrimSpace(profileID)

	query := `SELECT id, session_id, profile_id, tool_id, risk, decision, executed, target_scope, target_id, status, args, result, created_at
        FROM ai_tool_audits`
	var queryArgs []interface{}
	if "" != sessionID {
		query += ` WHERE session_id = ?`
		queryArgs = append(queryArgs, sessionID)
	} else if "" != profileID {
		query += ` WHERE profile_id = ?`
		queryArgs = append(queryArgs, profileID)
	}
	query += ` ORDER BY created_at DESC LIMIT ?`
	queryArgs = append(queryArgs, limit)

	rows, err := db.Query(query, queryArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var audit AssistantAIToolAudit
		var executed int
		var argsJSON, resultJSON string
		if err = rows.Scan(&audit.ID, &audit.SessionID, &audit.ProfileID, &audit.ToolID, &audit.Risk, &audit.Decision, &executed,
			&audit.TargetScope, &audit.TargetID, &audit.Status, &argsJSON, &resultJSON, &audit.CreatedAt); err != nil {
			return nil, err
		}
		audit.Executed = 1 == executed
		audit.ToolName = firstAssistantAINonEmpty(getAssistantAIToolDefinitionName(audit.ToolID), audit.ToolID)
		if "" != strings.TrimSpace(argsJSON) {
			audit.Args = map[string]interface{}{}
			if err = json.Unmarshal([]byte(argsJSON), &audit.Args); err != nil {
				audit.Args = map[string]interface{}{}
			}
		}
		if "" != strings.TrimSpace(resultJSON) {
			audit.Result = map[string]interface{}{}
			if err = json.Unmarshal([]byte(resultJSON), &audit.Result); err != nil {
				audit.Result = map[string]interface{}{}
			}
		}
		audit.Summary = getAssistantAIStringValue(audit.Result, "summary", "")
		audit.Error = getAssistantAIStringValue(audit.Result, "error", "")
		ret = append(ret, &audit)
	}
	return ret, rows.Err()
}

func marshalAssistantAIToolResults(results []*AssistantAIToolResult) ([]map[string]interface{}, error) {
	ret := make([]map[string]interface{}, 0, len(results))
	for _, item := range results {
		if nil == item {
			continue
		}
		buf, err := json.Marshal(item)
		if nil != err {
			return nil, err
		}
		row := map[string]interface{}{}
		if err = json.Unmarshal(buf, &row); nil != err {
			return nil, err
		}
		ret = append(ret, row)
	}
	return ret, nil
}

func getAssistantAIToolDefinitionName(toolID string) string {
	if def := getAssistantAIToolDefinition(toolID); nil != def {
		return def.Name
	}
	return ""
}

func getAssistantAIStringValue(data map[string]interface{}, key, fallback string) string {
	if nil == data {
		return fallback
	}
	if raw, ok := data[key]; ok && nil != raw {
		if value := strings.TrimSpace(fmt.Sprint(raw)); "" != value {
			return value
		}
	}
	return fallback
}

func getAssistantAIFirstStringValue(data map[string]interface{}, fallback string, keys ...string) string {
	for _, key := range keys {
		if value := getAssistantAIStringValue(data, key, ""); "" != value {
			return value
		}
	}
	return fallback
}

func getAssistantAIContentValue(data map[string]interface{}) string {
	return getAssistantAIFirstStringValue(data, "", "markdown", "content", "text", "body", "replacement", "value")
}

func assistantAIIsDeleteIntent(data map[string]interface{}) bool {
	if nil == data {
		return false
	}
	if "true" == assistantAIBoolStringValue(data, "delete", "") {
		return true
	}
	for _, key := range []string{"action", "mode", "op", "intent"} {
		switch strings.ToLower(strings.TrimSpace(getAssistantAIStringValue(data, key, ""))) {
		case "delete", "remove":
			return true
		}
	}
	return false
}

func getAssistantAIIntValue(data map[string]interface{}, key string, fallback int) int {
	if nil == data {
		return fallback
	}
	return getAssistantAIIntSetting(data, key, fallback)
}

func clampAssistantAIToolLimit(value, min, max int) int {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}
