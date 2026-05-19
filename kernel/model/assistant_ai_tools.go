package model

import (
	dbsql "database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	sql "github.com/lonelyor/sourceflow/kernel/sql"
	"github.com/lonelyor/sourceflow/kernel/treenode"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/lute"
	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
	"github.com/lonelyor/sourceflow/third_party/go/lute/parse"
)

const (
	AssistantAIToolReadCurrentNote         = "get-current-note"
	AssistantAIToolReadCurrentBlock        = "get-current-block"
	AssistantAIToolSearchNotes             = "search-notes"
	AssistantAIToolReadNote                = "read-note"
	AssistantAIToolReadNoteBacklinks       = "get-note-backlinks"
	AssistantAIToolReadNoteOutline         = "get-note-outline"
	AssistantAIToolSearchBlocks            = "search-blocks"
	AssistantAIToolReadBlock               = "read-block"
	AssistantAIToolReadCurrentBlockContext = "get-current-block-context"
	AssistantAIToolReadBlockReferences     = "get-block-references"
	AssistantAIToolListNoteHistory         = "list-note-history"
	AssistantAIToolListRestorePoints       = "list-restore-points"
	AssistantAIToolListNoteAssets          = "list-note-assets"
	AssistantAIToolReadNoteAsset           = "read-note-asset-file"
	AssistantAIToolSearchAssets            = "search-assets"
	AssistantAIToolReadAssetContent        = "read-asset-content"
	AssistantAIToolAppendCurrentNote       = "append-current-note"
	AssistantAIToolCreateNote              = "create-note"
	AssistantAIToolCreateChildNote         = "create-child-note"
	AssistantAIToolCreateWorkbench         = "create-workbench-item"
	AssistantAIToolInsertAfterBlock        = "insert-after-block"
	AssistantAIToolDeleteBlock             = "delete-block"
	AssistantAIToolReplaceBlock            = "replace-block"

	AssistantAIToolRiskRead        = "L1"
	AssistantAIToolRiskLowWrite    = "L2"
	AssistantAIToolRiskMediumWrite = "L3"

	AssistantAIToolModeAuto    = "auto"
	AssistantAIToolModeConfirm = "confirm"
	AssistantAIToolModeDeny    = "deny"

	AssistantAIToolScopeCurrentNote     = "current-note"
	AssistantAIToolScopeCurrentNotebook = "current-notebook"
	AssistantAIToolScopeWorkspace       = "workspace"

	AssistantAIToolTraceAuditOnly = "audit-only"
	AssistantAIToolTraceMarkdown  = "markdown"
)

type AssistantAINoteContext struct {
	RootID               string `json:"rootID"`
	Notebook             string `json:"notebook"`
	Path                 string `json:"path"`
	Title                string `json:"title"`
	CurrentBlockID       string `json:"currentBlockID"`
	CurrentBlockType     string `json:"currentBlockType"`
	CurrentBlockMarkdown string `json:"currentBlockMarkdown"`
	SelectedText         string `json:"selectedText"`
}

type AssistantAIToolDefinition struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Risk        string `json:"risk"`
	Category    string `json:"category"`
	Target      string `json:"target"`
	DefaultMode string `json:"defaultMode"`
}

type AssistantAIToolPolicy struct {
	ReadScope  string            `json:"readScope"`
	WriteScope string            `json:"writeScope"`
	TraceMode  string            `json:"traceMode"`
	ToolModes  map[string]string `json:"toolModes"`
}

type AssistantAIToolCatalogResult struct {
	Tools  []*AssistantAIToolDefinition `json:"tools"`
	Policy *AssistantAIToolPolicy       `json:"policy"`
}

type AssistantAIToolRequest struct {
	ProfileID string                  `json:"profileId"`
	SessionID string                  `json:"sessionId"`
	Context   *AssistantAINoteContext `json:"context"`
	ToolID    string                  `json:"toolId"`
	Args      map[string]interface{}  `json:"args"`
}

type AssistantAIToolResult struct {
	ToolID          string                  `json:"toolId"`
	Name            string                  `json:"name"`
	Risk            string                  `json:"risk"`
	Decision        string                  `json:"decision"`
	Executed        bool                    `json:"executed"`
	TargetScope     string                  `json:"targetScope"`
	RequiresConfirm bool                    `json:"requiresConfirm"`
	Summary         string                  `json:"summary"`
	Error           string                  `json:"error,omitempty"`
	Data            map[string]interface{}  `json:"data,omitempty"`
	AuditID         string                  `json:"auditId,omitempty"`
	Args            map[string]interface{}  `json:"args,omitempty"`
	Context         *AssistantAINoteContext `json:"context,omitempty"`
}

type assistantAIToolCall struct {
	Tool string                 `json:"tool"`
	Args map[string]interface{} `json:"args"`
}

type assistantAIToolEnvelope struct {
	ToolCalls []*assistantAIToolCall `json:"toolCalls"`
	Reply     string                 `json:"reply"`
}

type assistantAIToolAuditRecord struct {
	ID          string
	SessionID   string
	ProfileID   string
	ToolID      string
	Risk        string
	Decision    string
	Executed    bool
	TargetScope string
	TargetID    string
	Status      string
	Args        map[string]interface{}
	Result      map[string]interface{}
	CreatedAt   int64
}

type AssistantAIToolAudit struct {
	ID          string                 `json:"id"`
	SessionID   string                 `json:"sessionId"`
	ProfileID   string                 `json:"profileId"`
	ToolID      string                 `json:"toolId"`
	ToolName    string                 `json:"toolName"`
	Risk        string                 `json:"risk"`
	Decision    string                 `json:"decision"`
	Executed    bool                   `json:"executed"`
	TargetScope string                 `json:"targetScope"`
	TargetID    string                 `json:"targetId"`
	Status      string                 `json:"status"`
	Summary     string                 `json:"summary"`
	Error       string                 `json:"error,omitempty"`
	Args        map[string]interface{} `json:"args,omitempty"`
	Result      map[string]interface{} `json:"result,omitempty"`
	CreatedAt   int64                  `json:"createdAt"`
}

var assistantAIToolCatalog = []*AssistantAIToolDefinition{
	{
		ID:          AssistantAIToolReadCurrentNote,
		Name:        "读取当前笔记",
		Description: "读取当前打开笔记的标题、路径、属性和正文内容",
		Risk:        AssistantAIToolRiskRead,
		Category:    "read",
		Target:      AssistantAIToolScopeCurrentNote,
		DefaultMode: AssistantAIToolModeAuto,
	},
	{
		ID:          AssistantAIToolReadCurrentBlock,
		Name:        "读取当前块",
		Description: "读取当前聚焦内容块的内容、Markdown 和当前选中文本",
		Risk:        AssistantAIToolRiskRead,
		Category:    "read",
		Target:      AssistantAIToolScopeCurrentNote,
		DefaultMode: AssistantAIToolModeAuto,
	},
	{
		ID:          AssistantAIToolSearchNotes,
		Name:        "搜索笔记",
		Description: "按关键词搜索相关笔记标题和路径",
		Risk:        AssistantAIToolRiskRead,
		Category:    "search",
		Target:      AssistantAIToolScopeWorkspace,
		DefaultMode: AssistantAIToolModeAuto,
	},
	{
		ID:          AssistantAIToolReadNote,
		Name:        "读取指定笔记",
		Description: "按笔记本和路径读取指定笔记的标题、属性和正文",
		Risk:        AssistantAIToolRiskRead,
		Category:    "read",
		Target:      AssistantAIToolScopeWorkspace,
		DefaultMode: AssistantAIToolModeAuto,
	},
	{
		ID:          AssistantAIToolReadNoteBacklinks,
		Name:        "读取笔记反链与提及",
		Description: "读取指定笔记或当前笔记的反链、提及和引用计数",
		Risk:        AssistantAIToolRiskRead,
		Category:    "read",
		Target:      AssistantAIToolScopeWorkspace,
		DefaultMode: AssistantAIToolModeAuto,
	},
	{
		ID:          AssistantAIToolReadNoteOutline,
		Name:        "读取笔记大纲",
		Description: "读取指定笔记或当前笔记的标题层级结构",
		Risk:        AssistantAIToolRiskRead,
		Category:    "read",
		Target:      AssistantAIToolScopeWorkspace,
		DefaultMode: AssistantAIToolModeAuto,
	},
	{
		ID:          AssistantAIToolSearchBlocks,
		Name:        "搜索内容块",
		Description: "按关键词搜索相关块内容和所在文档",
		Risk:        AssistantAIToolRiskRead,
		Category:    "search",
		Target:      AssistantAIToolScopeWorkspace,
		DefaultMode: AssistantAIToolModeAuto,
	},
	{
		ID:          AssistantAIToolReadBlock,
		Name:        "读取指定块",
		Description: "按块 ID 读取块内容、Markdown 和所在文档信息",
		Risk:        AssistantAIToolRiskRead,
		Category:    "read",
		Target:      AssistantAIToolScopeWorkspace,
		DefaultMode: AssistantAIToolModeAuto,
	},
	{
		ID:          AssistantAIToolReadCurrentBlockContext,
		Name:        "读取当前块上下文",
		Description: "读取当前块的父块、前后块、直接子块和结构上下文",
		Risk:        AssistantAIToolRiskRead,
		Category:    "read",
		Target:      AssistantAIToolScopeCurrentNote,
		DefaultMode: AssistantAIToolModeAuto,
	},
	{
		ID:          AssistantAIToolReadBlockReferences,
		Name:        "读取块引用关系",
		Description: "读取当前块或指定块的引用文本、被引用情况和引用块摘要",
		Risk:        AssistantAIToolRiskRead,
		Category:    "read",
		Target:      AssistantAIToolScopeWorkspace,
		DefaultMode: AssistantAIToolModeAuto,
	},
	{
		ID:          AssistantAIToolListNoteHistory,
		Name:        "列出笔记历史",
		Description: "列出当前笔记或指定笔记的历史版本时间点与变更条目",
		Risk:        AssistantAIToolRiskRead,
		Category:    "read",
		Target:      AssistantAIToolScopeWorkspace,
		DefaultMode: AssistantAIToolModeAuto,
	},
	{
		ID:          AssistantAIToolListRestorePoints,
		Name:        "列出恢复点",
		Description: "列出本地和备份端的恢复点、保护标签和快照统计信息",
		Risk:        AssistantAIToolRiskRead,
		Category:    "read",
		Target:      AssistantAIToolScopeWorkspace,
		DefaultMode: AssistantAIToolModeAuto,
	},
	{
		ID:          AssistantAIToolListNoteAssets,
		Name:        "列出笔记附件",
		Description: "列出当前笔记或指定笔记关联的附件、图片和资源文件",
		Risk:        AssistantAIToolRiskRead,
		Category:    "read",
		Target:      AssistantAIToolScopeWorkspace,
		DefaultMode: AssistantAIToolModeAuto,
	},
	{
		ID:          AssistantAIToolReadNoteAsset,
		Name:        "读取笔记附件文件",
		Description: "读取当前笔记或指定笔记中的文本型附件内容；图片和二进制文件返回元信息",
		Risk:        AssistantAIToolRiskRead,
		Category:    "read",
		Target:      AssistantAIToolScopeWorkspace,
		DefaultMode: AssistantAIToolModeAuto,
	},
	{
		ID:          AssistantAIToolSearchAssets,
		Name:        "搜索附件与 OCR 文本",
		Description: "按关键词搜索附件正文索引、PDF 文本和图片 OCR 文本",
		Risk:        AssistantAIToolRiskRead,
		Category:    "search",
		Target:      AssistantAIToolScopeWorkspace,
		DefaultMode: AssistantAIToolModeAuto,
	},
	{
		ID:          AssistantAIToolReadAssetContent,
		Name:        "读取附件内容",
		Description: "按资源 ID 读取附件索引内容片段",
		Risk:        AssistantAIToolRiskRead,
		Category:    "read",
		Target:      AssistantAIToolScopeWorkspace,
		DefaultMode: AssistantAIToolModeAuto,
	},
	{
		ID:          AssistantAIToolAppendCurrentNote,
		Name:        "追加到当前笔记",
		Description: "将 AI 结果以 Markdown 追加到当前笔记末尾",
		Risk:        AssistantAIToolRiskLowWrite,
		Category:    "write",
		Target:      AssistantAIToolScopeCurrentNote,
		DefaultMode: AssistantAIToolModeConfirm,
	},
	{
		ID:          AssistantAIToolCreateNote,
		Name:        "新建笔记",
		Description: "在当前笔记本内创建新的 Markdown 笔记",
		Risk:        AssistantAIToolRiskLowWrite,
		Category:    "write",
		Target:      AssistantAIToolScopeCurrentNotebook,
		DefaultMode: AssistantAIToolModeConfirm,
	},
	{
		ID:          AssistantAIToolCreateChildNote,
		Name:        "创建当前笔记子文档",
		Description: "在当前笔记下面创建一个新的子文档",
		Risk:        AssistantAIToolRiskLowWrite,
		Category:    "write",
		Target:      AssistantAIToolScopeCurrentNote,
		DefaultMode: AssistantAIToolModeConfirm,
	},
	{
		ID:          AssistantAIToolCreateWorkbench,
		Name:        "创建工作台条目",
		Description: "创建普通笔记、任务、事件或项目，并写入统一工作台属性",
		Risk:        AssistantAIToolRiskLowWrite,
		Category:    "write",
		Target:      AssistantAIToolScopeCurrentNotebook,
		DefaultMode: AssistantAIToolModeConfirm,
	},
	{
		ID:          AssistantAIToolInsertAfterBlock,
		Name:        "在块后插入内容",
		Description: "在当前块或指定块后插入新的 Markdown 内容",
		Risk:        AssistantAIToolRiskLowWrite,
		Category:    "write",
		Target:      AssistantAIToolScopeCurrentNote,
		DefaultMode: AssistantAIToolModeConfirm,
	},
	{
		ID:          AssistantAIToolDeleteBlock,
		Name:        "删除指定块",
		Description: "删除当前块或指定块，不允许删除根文档",
		Risk:        AssistantAIToolRiskMediumWrite,
		Category:    "write",
		Target:      AssistantAIToolScopeWorkspace,
		DefaultMode: AssistantAIToolModeConfirm,
	},
	{
		ID:          AssistantAIToolReplaceBlock,
		Name:        "替换指定块",
		Description: "按块 ID 替换指定块的 Markdown 内容",
		Risk:        AssistantAIToolRiskMediumWrite,
		Category:    "write",
		Target:      AssistantAIToolScopeWorkspace,
		DefaultMode: AssistantAIToolModeConfirm,
	},
}

func ListAssistantAIToolCatalog(profileID string) (ret *AssistantAIToolCatalogResult, err error) {
	db, err := getAssistantAIDB()
	if err != nil {
		return nil, err
	}
	profile, err := getAssistantAIProfile0(db, strings.TrimSpace(profileID))
	if nil != err && "" != strings.TrimSpace(profileID) {
		return nil, err
	}
	return &AssistantAIToolCatalogResult{
		Tools:  cloneAssistantAIToolCatalog(),
		Policy: getAssistantAIToolPolicy(profile),
	}, nil
}

func ExecuteAssistantAITool(req *AssistantAIToolRequest) (ret *AssistantAIToolResult, err error) {
	if nil == req {
		return nil, fmt.Errorf("assistant AI tool request is required")
	}
	db, err := getAssistantAIDB()
	if err != nil {
		return nil, err
	}
	profile, err := getAssistantAIProfile0(db, strings.TrimSpace(req.ProfileID))
	if err != nil {
		return nil, err
	}
	return executeAssistantAITool(db, profile, strings.TrimSpace(req.SessionID), req.Context, strings.TrimSpace(req.ToolID), req.Args)
}

func executeAssistantAITool(db *dbsql.DB, profile *AssistantAIProfile, sessionID string, context *AssistantAINoteContext, toolID string, args map[string]interface{}) (ret *AssistantAIToolResult, err error) {
	return executeAssistantAITool0(db, profile, sessionID, context, toolID, args, false)
}

func confirmAssistantAITool(db *dbsql.DB, profile *AssistantAIProfile, sessionID string, context *AssistantAINoteContext, toolID string, args map[string]interface{}, userPrompt string) (ret *AssistantAIToolResult, err error) {
	return executeAssistantAITool0(db, profile, sessionID, context, toolID, normalizeAssistantAIToolArgs(toolID, args, "", userPrompt), true)
}

func executeAssistantAITool0(db *dbsql.DB, profile *AssistantAIProfile, sessionID string, context *AssistantAINoteContext, toolID string, args map[string]interface{}, allowConfirm bool) (ret *AssistantAIToolResult, err error) {
	def := getAssistantAIToolDefinition(toolID)
	if nil == def {
		return nil, fmt.Errorf("unsupported assistant AI tool [%s]", toolID)
	}
	policy := getAssistantAIToolPolicy(profile)
	decision := resolveAssistantAIToolDecision(policy, def)
	ret = &AssistantAIToolResult{
		ToolID:          def.ID,
		Name:            def.Name,
		Risk:            def.Risk,
		Decision:        decision,
		Executed:        false,
		TargetScope:     resolveAssistantAIToolScope(policy, def),
		RequiresConfirm: AssistantAIToolModeConfirm == decision,
		Data:            map[string]interface{}{},
		Args:            cloneAssistantAIMap(args),
		Context:         cloneAssistantAINoteContext(context),
	}

	audit := &assistantAIToolAuditRecord{
		ID:          ast.NewNodeID(),
		SessionID:   strings.TrimSpace(sessionID),
		ProfileID:   firstAssistantAINonEmpty(profile.ID),
		ToolID:      def.ID,
		Risk:        def.Risk,
		Decision:    decision,
		Executed:    false,
		TargetScope: ret.TargetScope,
		Status:      "blocked",
		Args:        cloneAssistantAIMap(args),
		Result:      map[string]interface{}{},
		CreatedAt:   time.Now().UnixMilli(),
	}
	defer func() {
		if nil == audit {
			return
		}
		if nil != ret {
			audit.Result = cloneAssistantAIMap(ret.Data)
			audit.TargetID = firstAssistantAINonEmpty(audit.TargetID, getAssistantAIStringValue(ret.Data, "targetID", ""))
			if "" != ret.Summary {
				audit.Result["summary"] = ret.Summary
			}
			if !ret.Executed && "" != ret.Error {
				audit.Result["error"] = ret.Error
			}
		}
		if nil != err {
			audit.Result["error"] = err.Error()
		}
		if persistErr := insertAssistantAIToolAudit(db, audit); nil == persistErr && nil != ret {
			ret.AuditID = audit.ID
		}
	}()

	switch decision {
	case AssistantAIToolModeDeny:
		ret.Error = "该工具已被当前配置禁止"
		ret.Summary = ret.Error
		return ret, nil
	case AssistantAIToolModeConfirm:
		if !allowConfirm {
			ret.Error = "该工具需要确认后才能执行"
			ret.Summary = ret.Error
			return ret, nil
		}
		ret.RequiresConfirm = false
	}

	data, summary, targetID, execErr := runAssistantAITool(def, policy, context, args)
	if nil != execErr {
		ret.Error = execErr.Error()
		ret.Summary = ret.Error
		audit.Status = "error"
		return ret, nil
	}
	ret.Executed = true
	ret.Summary = summary
	ret.Data = data
	audit.Executed = true
	audit.Status = "executed"
	audit.TargetID = targetID
	return ret, nil
}

func runAssistantAITool(def *AssistantAIToolDefinition, policy *AssistantAIToolPolicy, context *AssistantAINoteContext, args map[string]interface{}) (ret map[string]interface{}, summary, targetID string, err error) {
	ret = map[string]interface{}{}
	switch def.ID {
	case AssistantAIToolReadCurrentNote:
		note, noteErr := getAssistantAICurrentNote(context)
		if nil != noteErr {
			return nil, "", "", noteErr
		}
		return note, "已读取当前笔记", note["rootID"].(string), nil
	case AssistantAIToolReadCurrentBlock:
		block, blockErr := getAssistantAICurrentBlock(context, policy.ReadScope)
		if nil != blockErr {
			return nil, "", "", blockErr
		}
		return block, "已读取当前块", getAssistantAIStringValue(block, "targetID", ""), nil
	case AssistantAIToolSearchNotes:
		query := strings.TrimSpace(getAssistantAIStringValue(args, "query", ""))
		if "" == query {
			return nil, "", "", fmt.Errorf("搜索关键词不能为空")
		}
		limit := clampAssistantAIToolLimit(getAssistantAIIntValue(args, "limit", 5), 1, 10)
		results, queryScope, searchErr := searchAssistantAINotes(query, limit, context, policy.ReadScope)
		if nil != searchErr {
			return nil, "", "", searchErr
		}
		ret["query"] = query
		ret["count"] = len(results)
		ret["scope"] = queryScope
		ret["items"] = results
		return ret, fmt.Sprintf("已搜索到 %d 条相关笔记", len(results)), firstAssistantAINonEmpty(contextID(context)), nil
	case AssistantAIToolReadNote:
		notebook := strings.TrimSpace(getAssistantAIStringValue(args, "notebook", ""))
		docPath := strings.TrimSpace(getAssistantAIStringValue(args, "path", ""))
		if "" == notebook || "" == docPath {
			return nil, "", "", fmt.Errorf("读取指定笔记需要 notebook 和 path")
		}
		note, scope, readErr := readAssistantAINote(notebook, docPath, context, policy.ReadScope)
		if nil != readErr {
			return nil, "", "", readErr
		}
		note["scope"] = scope
		return note, "已读取指定笔记", getAssistantAIStringValue(note, "rootID", ""), nil
	case AssistantAIToolReadNoteBacklinks:
		note, scope, readErr := readAssistantAINoteBacklinks(args, context, policy.ReadScope)
		if nil != readErr {
			return nil, "", "", readErr
		}
		note["scope"] = scope
		return note, "已读取笔记反链与提及", getAssistantAIStringValue(note, "rootID", ""), nil
	case AssistantAIToolReadNoteOutline:
		note, scope, readErr := readAssistantAINoteOutline(args, context, policy.ReadScope)
		if nil != readErr {
			return nil, "", "", readErr
		}
		note["scope"] = scope
		return note, "已读取笔记大纲", getAssistantAIStringValue(note, "rootID", ""), nil
	case AssistantAIToolSearchBlocks:
		query := strings.TrimSpace(getAssistantAIStringValue(args, "query", ""))
		if "" == query {
			return nil, "", "", fmt.Errorf("搜索关键词不能为空")
		}
		limit := clampAssistantAIToolLimit(getAssistantAIIntValue(args, "limit", 5), 1, 10)
		results, queryScope, searchErr := searchAssistantAIBlocks(query, limit, context, policy.ReadScope)
		if nil != searchErr {
			return nil, "", "", searchErr
		}
		ret["query"] = query
		ret["count"] = len(results)
		ret["scope"] = queryScope
		ret["items"] = results
		return ret, fmt.Sprintf("已搜索到 %d 条相关内容块", len(results)), firstAssistantAINonEmpty(contextID(context)), nil
	case AssistantAIToolReadBlock:
		blockID := strings.TrimSpace(getAssistantAIStringValue(args, "id", ""))
		if "" == blockID {
			return nil, "", "", fmt.Errorf("块 ID 不能为空")
		}
		block, scope, readErr := readAssistantAIBlock(blockID, context, policy.ReadScope)
		if nil != readErr {
			return nil, "", "", readErr
		}
		block["scope"] = scope
		return block, "已读取指定块", getAssistantAIStringValue(block, "id", blockID), nil
	case AssistantAIToolReadCurrentBlockContext:
		block, readErr := getAssistantAICurrentBlockContext(context, policy.ReadScope)
		if nil != readErr {
			return nil, "", "", readErr
		}
		return block, "已读取当前块上下文", getAssistantAIStringValue(block, "id", contextCurrentBlockID(context)), nil
	case AssistantAIToolReadBlockReferences:
		block, scope, readErr := readAssistantAIBlockReferences(args, context, policy.ReadScope)
		if nil != readErr {
			return nil, "", "", readErr
		}
		block["scope"] = scope
		return block, "已读取块引用关系", getAssistantAIStringValue(block, "id", ""), nil
	case AssistantAIToolListNoteHistory:
		history, scope, readErr := listAssistantAINoteHistory(args, context, policy.ReadScope)
		if nil != readErr {
			return nil, "", "", readErr
		}
		history["scope"] = scope
		return history, fmt.Sprintf("已列出 %d 组笔记历史", getAssistantAIIntValue(history, "groupCount", 0)), getAssistantAIStringValue(history, "rootID", ""), nil
	case AssistantAIToolListRestorePoints:
		points, readErr := listAssistantAIRestorePoints(args)
		if nil != readErr {
			return nil, "", "", readErr
		}
		return points, "已列出可用恢复点", firstAssistantAINonEmpty(contextID(context), "restore-points"), nil
	case AssistantAIToolListNoteAssets:
		assets, scope, readErr := listAssistantAINoteAssets(args, context, policy.ReadScope)
		if nil != readErr {
			return nil, "", "", readErr
		}
		assets["scope"] = scope
		return assets, fmt.Sprintf("已列出 %d 个笔记附件", getAssistantAIIntValue(assets, "count", 0)), getAssistantAIStringValue(assets, "rootID", ""), nil
	case AssistantAIToolReadNoteAsset:
		asset, scope, readErr := readAssistantAINoteAssetFile(args, context, policy.ReadScope)
		if nil != readErr {
			return nil, "", "", readErr
		}
		asset["scope"] = scope
		return asset, "已读取笔记附件文件", getAssistantAIStringValue(asset, "path", ""), nil
	case AssistantAIToolSearchAssets:
		query := strings.TrimSpace(getAssistantAIStringValue(args, "query", ""))
		if "" == query {
			return nil, "", "", fmt.Errorf("搜索关键词不能为空")
		}
		limit := clampAssistantAIToolLimit(getAssistantAIIntValue(args, "limit", 5), 1, 10)
		results, searchErr := searchAssistantAIAssets(query, limit)
		if nil != searchErr {
			return nil, "", "", searchErr
		}
		ret["query"] = query
		ret["count"] = len(results)
		ret["items"] = results
		return ret, fmt.Sprintf("已搜索到 %d 条相关附件", len(results)), firstAssistantAINonEmpty(contextID(context)), nil
	case AssistantAIToolReadAssetContent:
		assetID := strings.TrimSpace(getAssistantAIStringValue(args, "id", ""))
		if "" == assetID {
			return nil, "", "", fmt.Errorf("附件 ID 不能为空")
		}
		content, readErr := readAssistantAIAssetContent(assetID)
		if nil != readErr {
			return nil, "", "", readErr
		}
		return content, "已读取附件内容", getAssistantAIStringValue(content, "id", assetID), nil
	case AssistantAIToolAppendCurrentNote:
		if AssistantAIToolScopeCurrentNote != policy.WriteScope {
			return nil, "", "", fmt.Errorf("当前写入范围不允许追加当前笔记")
		}
		rootID := contextID(context)
		if "" == rootID {
			return nil, "", "", fmt.Errorf("当前没有可用的笔记上下文")
		}
		markdown := strings.TrimSpace(getAssistantAIContentValue(args))
		if "" == markdown {
			return nil, "", "", fmt.Errorf("追加内容不能为空")
		}
		traceMode := normalizeAssistantAIToolTraceMode(getAssistantAIStringValue(map[string]interface{}{"traceMode": policy.TraceMode}, "traceMode", AssistantAIToolTraceAuditOnly))
		if AssistantAIToolTraceMarkdown == traceMode {
			markdown = buildAssistantAIToolTrace(def, markdown)
		}
		if appendErr := appendAssistantAIMarkdown(rootID, markdown); nil != appendErr {
			return nil, "", "", appendErr
		}
		ret["targetID"] = rootID
		ret["appendedLength"] = len([]rune(markdown))
		return ret, "已追加到当前笔记", rootID, nil
	case AssistantAIToolCreateNote:
		notebook, hPath, createErr := resolveAssistantAINewNoteTarget(args, context, policy.WriteScope)
		if nil != createErr {
			return nil, "", "", createErr
		}
		markdown := strings.TrimSpace(getAssistantAIContentValue(args))
		if "" == markdown {
			return nil, "", "", fmt.Errorf("新建笔记内容不能为空")
		}
		traceMode := normalizeAssistantAIToolTraceMode(getAssistantAIStringValue(map[string]interface{}{"traceMode": policy.TraceMode}, "traceMode", AssistantAIToolTraceAuditOnly))
		if AssistantAIToolTraceMarkdown == traceMode {
			markdown = buildAssistantAIToolTrace(def, markdown)
		}
		id, createErr := CreateWithMarkdown("", notebook, hPath, markdown, "", ast.NewNodeID(), false, "")
		if nil != createErr {
			return nil, "", "", createErr
		}
		ret["targetID"] = id
		ret["notebook"] = notebook
		ret["path"] = hPath
		return ret, "已创建新笔记", id, nil
	case AssistantAIToolCreateChildNote:
		return createAssistantAIChildNote(def, policy, context, args)
	case AssistantAIToolCreateWorkbench:
		return createAssistantAIWorkbenchItem(def, policy, context, args)
	case AssistantAIToolInsertAfterBlock:
		return insertAssistantAIBlockAfter(policy, context, args)
	case AssistantAIToolDeleteBlock:
		return deleteAssistantAIBlock(policy, context, args)
	case AssistantAIToolReplaceBlock:
		return replaceAssistantAIBlock(policy, context, args)
	default:
		return nil, "", "", fmt.Errorf("unsupported assistant AI tool [%s]", def.ID)
	}
}

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

func executeAssistantAIRequestedTools(db *dbsql.DB, profile *AssistantAIProfile, sessionID string, context *AssistantAINoteContext, calls []*assistantAIToolCall, fallbackReply, userPrompt string) (ret []*AssistantAIToolResult) {
	ret = []*AssistantAIToolResult{}
	for i, call := range calls {
		if nil == call || "" == strings.TrimSpace(call.Tool) {
			continue
		}
		if 3 <= i {
			break
		}
		toolID, normalizedArgs := normalizeAssistantAIToolInvocation(strings.TrimSpace(call.Tool), call.Args, fallbackReply, userPrompt)
		result, err := executeAssistantAITool(db, profile, sessionID, context, toolID, normalizedArgs)
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

func executeAssistantAINativeToolCalls(db *dbsql.DB, profile *AssistantAIProfile, sessionID string, context *AssistantAINoteContext, toolCalls []map[string]interface{}) (ret []*AssistantAIToolResult) {
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
		result, err := executeAssistantAITool(db, profile, sessionID, context, strings.TrimSpace(toolID), args)
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

func getAssistantAICurrentNote(context *AssistantAINoteContext) (ret map[string]interface{}, err error) {
	rootID := contextID(context)
	if "" == rootID {
		return nil, fmt.Errorf("当前没有可用的笔记上下文")
	}
	pathValue, boxID, err := GetPathByID(rootID)
	if nil != err {
		return nil, err
	}
	info := GetDocInfo(rootID)
	if nil == info {
		return nil, fmt.Errorf("读取当前笔记信息失败")
	}
	markdown := strings.TrimSpace(GetBlockKramdown(rootID, ""))
	ret = map[string]interface{}{
		"rootID":           rootID,
		"notebook":         boxID,
		"path":             pathValue,
		"title":            info.Name,
		"attrs":            info.IAL,
		"markdown":         truncateAssistantAIToolText(markdown, 16000),
		"currentBlockID":   contextCurrentBlockID(context),
		"currentBlockType": strings.TrimSpace(context.CurrentBlockType),
		"selectedText":     truncateAssistantAIToolText(contextSelectedText(context), 4000),
	}
	return ret, nil
}

func getAssistantAICurrentBlock(context *AssistantAINoteContext, scope string) (ret map[string]interface{}, err error) {
	blockID := strings.TrimSpace(contextCurrentBlockID(context))
	if "" == blockID {
		return nil, fmt.Errorf("当前没有可用的块上下文")
	}
	block, resolvedScope, readErr := readAssistantAIBlock(blockID, context, scope)
	if nil != readErr {
		return nil, readErr
	}
	block["scope"] = resolvedScope
	block["targetID"] = blockID
	if selectedText := strings.TrimSpace(contextSelectedText(context)); "" != selectedText {
		block["selectedText"] = truncateAssistantAIToolText(selectedText, 4000)
	}
	return block, nil
}

func readAssistantAINoteBacklinks(args map[string]interface{}, context *AssistantAINoteContext, scope string) (ret map[string]interface{}, resolvedScope string, err error) {
	rootID, notebook, docPath, resolvedScope, err := resolveAssistantAINoteTarget(args, context, scope)
	if nil != err {
		return nil, resolvedScope, err
	}
	title := ""
	if info := GetDocInfo(rootID); nil != info {
		title = strings.TrimSpace(info.Name)
	}
	keyword := strings.TrimSpace(getAssistantAIStringValue(args, "keyword", ""))
	mentionKeyword := strings.TrimSpace(getAssistantAIStringValue(args, "mentionKeyword", ""))
	limit := clampAssistantAIToolLimit(getAssistantAIIntValue(args, "limit", 8), 1, 32)
	_, backlinks, backmentions, linkRefsCount, mentionsCount := GetBacklink2(rootID, keyword, mentionKeyword, util.SortModeUpdatedDESC, util.SortModeUpdatedDESC, Conf.Editor.BacklinkContainChildren)
	ret = map[string]interface{}{
		"rootID":         rootID,
		"notebook":       notebook,
		"path":           docPath,
		"title":          title,
		"keyword":        keyword,
		"mentionKeyword": mentionKeyword,
		"linkRefsCount":  linkRefsCount,
		"mentionsCount":  mentionsCount,
		"backlinks":      flattenAssistantAIPaths(backlinks, limit),
		"backmentions":   flattenAssistantAIPaths(backmentions, limit),
	}
	return ret, resolvedScope, nil
}

func readAssistantAINoteOutline(args map[string]interface{}, context *AssistantAINoteContext, scope string) (ret map[string]interface{}, resolvedScope string, err error) {
	rootID, notebook, docPath, resolvedScope, err := resolveAssistantAINoteTarget(args, context, scope)
	if nil != err {
		return nil, resolvedScope, err
	}
	title := ""
	if info := GetDocInfo(rootID); nil != info {
		title = strings.TrimSpace(info.Name)
	}
	limit := clampAssistantAIToolLimit(getAssistantAIIntValue(args, "limit", 24), 1, 128)
	outline, outlineErr := Outline(rootID, false)
	if nil != outlineErr {
		return nil, resolvedScope, outlineErr
	}
	ret = map[string]interface{}{
		"rootID":   rootID,
		"notebook": notebook,
		"path":     docPath,
		"title":    title,
		"count":    len(flattenAssistantAIPaths(outline, 0)),
		"headings": flattenAssistantAIPaths(outline, limit),
	}
	return ret, resolvedScope, nil
}

func resolveAssistantAINoteTarget(args map[string]interface{}, context *AssistantAINoteContext, scope string) (rootID, notebook, docPath, resolvedScope string, err error) {
	resolvedScope = normalizeAssistantAIToolScope(scope, AssistantAIToolScopeWorkspace)
	rootID = strings.TrimSpace(getAssistantAIStringValue(args, "rootID", ""))
	notebook = strings.TrimSpace(getAssistantAIStringValue(args, "notebook", ""))
	docPath = strings.TrimSpace(getAssistantAIStringValue(args, "path", ""))
	if "" != rootID {
		docPath, notebook, err = GetPathByID(rootID)
		if nil != err {
			return "", "", "", resolvedScope, err
		}
	} else if "" != notebook && "" != docPath {
		bt := treenode.GetBlockTreeRootByPath(notebook, docPath)
		if nil == bt || "" == strings.TrimSpace(bt.RootID) {
			return "", "", "", resolvedScope, fmt.Errorf("未找到指定笔记")
		}
		rootID = strings.TrimSpace(bt.RootID)
	} else {
		rootID = contextID(context)
		notebook = contextNotebook(context)
		docPath = contextPath(context)
	}
	if "" == rootID || "" == notebook || "" == docPath {
		return "", "", "", resolvedScope, fmt.Errorf("当前没有可用的笔记上下文")
	}
	if !assistantAINoteMatchesScope(resolvedScope, context, notebook, docPath, rootID) {
		return "", "", "", resolvedScope, fmt.Errorf("当前读取范围不允许读取该笔记")
	}
	return rootID, notebook, docPath, resolvedScope, nil
}

func flattenAssistantAIPaths(paths []*Path, limit int) (ret []map[string]interface{}) {
	ret = []map[string]interface{}{}
	var walk func(items []*Path)
	walk = func(items []*Path) {
		for _, item := range items {
			if nil == item {
				continue
			}
			if 0 < limit && limit <= len(ret) {
				return
			}
			ret = append(ret, map[string]interface{}{
				"id":       strings.TrimSpace(item.ID),
				"box":      strings.TrimSpace(item.Box),
				"name":     truncateAssistantAIToolText(strings.TrimSpace(item.Name), 240),
				"hPath":    strings.TrimSpace(item.HPath),
				"nodeType": strings.TrimSpace(item.NodeType),
				"subType":  strings.TrimSpace(item.SubType),
				"depth":    item.Depth,
				"count":    item.Count,
				"folded":   item.Folded,
				"updated":  strings.TrimSpace(item.Updated),
				"created":  strings.TrimSpace(item.Created),
			})
			if 0 < len(item.Children) {
				walk(item.Children)
			}
			if 0 < limit && limit <= len(ret) {
				return
			}
		}
	}
	walk(paths)
	return ret
}

func searchAssistantAINotes(query string, limit int, context *AssistantAINoteContext, scope string) (ret []map[string]interface{}, resolvedScope string, err error) {
	ret = []map[string]interface{}{}
	resolvedScope = normalizeAssistantAIToolScope(scope, AssistantAIToolScopeWorkspace)
	rows := SearchDocs(query, false, nil)
	for _, row := range rows {
		if limit <= len(ret) {
			break
		}
		boxID := strings.TrimSpace(row["box"])
		docPath := strings.TrimSpace(row["path"])
		bt := treenode.GetBlockTreeRootByPath(boxID, docPath)
		rootID := ""
		if nil != bt {
			rootID = strings.TrimSpace(bt.RootID)
		}
		if !assistantAINoteMatchesScope(resolvedScope, context, boxID, docPath, rootID) {
			continue
		}
		ret = append(ret, map[string]interface{}{
			"rootID":   rootID,
			"notebook": boxID,
			"path":     docPath,
			"title":    strings.TrimSpace(row["hPath"]),
			"boxIcon":  strings.TrimSpace(row["boxIcon"]),
		})
	}
	return ret, resolvedScope, nil
}

func readAssistantAINote(notebook, docPath string, context *AssistantAINoteContext, scope string) (ret map[string]interface{}, resolvedScope string, err error) {
	resolvedScope = normalizeAssistantAIToolScope(scope, AssistantAIToolScopeWorkspace)
	notebook = strings.TrimSpace(notebook)
	docPath = strings.TrimSpace(docPath)
	if "" == notebook || "" == docPath {
		return nil, resolvedScope, fmt.Errorf("读取指定笔记需要 notebook 和 path")
	}
	bt := treenode.GetBlockTreeRootByPath(notebook, docPath)
	if nil == bt || "" == strings.TrimSpace(bt.RootID) {
		return nil, resolvedScope, fmt.Errorf("未找到指定笔记")
	}
	rootID := strings.TrimSpace(bt.RootID)
	if !assistantAINoteMatchesScope(resolvedScope, context, notebook, docPath, rootID) {
		return nil, resolvedScope, fmt.Errorf("当前读取范围不允许读取该笔记")
	}
	info := GetDocInfo(rootID)
	if nil == info {
		return nil, resolvedScope, fmt.Errorf("读取指定笔记信息失败")
	}
	markdown := strings.TrimSpace(GetBlockKramdown(rootID, ""))
	ret = map[string]interface{}{
		"rootID":   rootID,
		"notebook": notebook,
		"path":     docPath,
		"title":    info.Name,
		"attrs":    info.IAL,
		"markdown": truncateAssistantAIToolText(markdown, 16000),
	}
	return ret, resolvedScope, nil
}

func searchAssistantAIBlocks(query string, limit int, context *AssistantAINoteContext, scope string) (ret []map[string]interface{}, resolvedScope string, err error) {
	ret = []map[string]interface{}{}
	resolvedScope = normalizeAssistantAIToolScope(scope, AssistantAIToolScopeWorkspace)
	var boxes []string
	var paths []string
	switch resolvedScope {
	case AssistantAIToolScopeCurrentNote:
		if nil == context || "" == strings.TrimSpace(context.Path) {
			return nil, resolvedScope, fmt.Errorf("当前没有可用的笔记上下文")
		}
		paths = []string{strings.TrimSpace(context.Path)}
	case AssistantAIToolScopeCurrentNotebook:
		if nil == context || "" == strings.TrimSpace(context.Notebook) {
			return nil, resolvedScope, fmt.Errorf("当前没有可用的笔记本上下文")
		}
		boxes = []string{strings.TrimSpace(context.Notebook)}
	}
	blocks, _, _, _, _ := FullTextSearchBlock(query, boxes, paths, nil, 0, 7, 0, 1, limit)
	for _, item := range blocks {
		if nil == item {
			continue
		}
		ret = append(ret, map[string]interface{}{
			"id":       item.ID,
			"rootID":   item.RootID,
			"type":     item.Type,
			"notebook": item.Box,
			"path":     item.Path,
			"content":  truncateAssistantAIToolText(strings.TrimSpace(item.Content), 240),
		})
	}
	return ret, resolvedScope, nil
}

func readAssistantAIBlock(blockID string, context *AssistantAINoteContext, scope string) (ret map[string]interface{}, resolvedScope string, err error) {
	resolvedScope = normalizeAssistantAIToolScope(scope, AssistantAIToolScopeWorkspace)
	blockID = strings.TrimSpace(blockID)
	if "" == blockID {
		return nil, resolvedScope, fmt.Errorf("块 ID 不能为空")
	}
	block := sql.GetBlock(blockID)
	if nil == block {
		return nil, resolvedScope, fmt.Errorf("未找到指定块")
	}
	if !assistantAINoteMatchesScope(resolvedScope, context, strings.TrimSpace(block.Box), strings.TrimSpace(block.Path), strings.TrimSpace(block.RootID)) {
		return nil, resolvedScope, fmt.Errorf("当前读取范围不允许读取该块")
	}
	markdown := strings.TrimSpace(GetBlockKramdown(blockID, ""))
	attrs := map[string]string{}
	if tree, treeErr := LoadTreeByBlockID(blockID); nil == treeErr && nil != tree {
		if node := treenode.GetNodeInTree(tree, blockID); nil != node {
			attrs = parse.IAL2Map(node.KramdownIAL)
		}
	}
	ret = map[string]interface{}{
		"id":        block.ID,
		"rootID":    block.RootID,
		"parentID":  block.ParentID,
		"type":      block.Type,
		"subType":   block.SubType,
		"notebook":  block.Box,
		"path":      block.Path,
		"hPath":     block.HPath,
		"title":     firstAssistantAINonEmpty(strings.TrimSpace(block.Name), strings.TrimSpace(block.HPath)),
		"content":   truncateAssistantAIToolText(strings.TrimSpace(block.Content), 1200),
		"markdown":  truncateAssistantAIToolText(markdown, 8000),
		"attrs":     attrs,
		"created":   block.Created,
		"updated":   block.Updated,
		"docTitle":  strings.TrimSpace(block.HPath),
		"docPath":   strings.TrimSpace(block.Path),
		"docRootID": strings.TrimSpace(block.RootID),
	}
	return ret, resolvedScope, nil
}

func getAssistantAICurrentBlockContext(context *AssistantAINoteContext, scope string) (ret map[string]interface{}, err error) {
	blockID := contextCurrentBlockID(context)
	if "" == blockID {
		return nil, fmt.Errorf("当前没有可用的块上下文")
	}
	resolvedScope := normalizeAssistantAIToolScope(scope, AssistantAIToolScopeCurrentNote)
	block, _, readErr := readAssistantAIBlock(blockID, context, resolvedScope)
	if nil != readErr {
		return nil, readErr
	}
	ret = cloneAssistantAIMap(block)
	ret["scope"] = resolvedScope
	ret["refText"] = truncateAssistantAIToolText(GetBlockRefText(blockID), 800)
	if markdown := strings.TrimSpace(context.CurrentBlockMarkdown); "" != markdown {
		ret["currentBlockMarkdown"] = truncateAssistantAIToolText(markdown, 4000)
	}
	if selectedText := contextSelectedText(context); "" != selectedText {
		ret["selectedText"] = truncateAssistantAIToolText(selectedText, 4000)
	}

	parentID, previousID, nextID, idsErr := GetBlockRelevantIDs(blockID)
	if nil == idsErr {
		if preview := assistantAICompactBlockPreviewByID(parentID, context, resolvedScope); nil != preview {
			ret["parent"] = preview
		}
		if preview := assistantAICompactBlockPreviewByID(previousID, context, resolvedScope); nil != preview {
			ret["previous"] = preview
		}
		if preview := assistantAICompactBlockPreviewByID(nextID, context, resolvedScope); nil != preview {
			ret["next"] = preview
		}
	}
	if unfoldedParentID := strings.TrimSpace(GetUnfoldedParentID(blockID)); "" != unfoldedParentID && unfoldedParentID != blockID {
		ret["unfoldedParentID"] = unfoldedParentID
		if preview := assistantAICompactBlockPreviewByID(unfoldedParentID, context, resolvedScope); nil != preview {
			ret["unfoldedParent"] = preview
		}
	}

	if tree, treeErr := LoadTreeByBlockID(blockID); nil == treeErr && nil != tree {
		if node := treenode.GetNodeInTree(tree, blockID); nil != node {
			children := []map[string]interface{}{}
			childCount := 0
			for child := node.FirstChild; nil != child; child = child.Next {
				if !child.IsBlock() || ast.NodeKramdownBlockIAL == child.Type {
					continue
				}
				childCount++
				if 8 <= len(children) {
					continue
				}
				children = append(children, assistantAICompactBlockPreviewNode(child))
			}
			ret["childCount"] = childCount
			ret["children"] = children
		}
	}
	return ret, nil
}

func readAssistantAIBlockReferences(args map[string]interface{}, context *AssistantAINoteContext, scope string) (ret map[string]interface{}, resolvedScope string, err error) {
	blockID := strings.TrimSpace(firstAssistantAINonEmpty(
		getAssistantAIStringValue(args, "id", ""),
		contextCurrentBlockID(context),
	))
	if "" == blockID {
		return nil, normalizeAssistantAIToolScope(scope, AssistantAIToolScopeWorkspace), fmt.Errorf("当前没有可用的块上下文")
	}
	block, resolvedScope, readErr := readAssistantAIBlock(blockID, context, scope)
	if nil != readErr {
		return nil, resolvedScope, readErr
	}
	ret = cloneAssistantAIMap(block)
	ret["refText"] = truncateAssistantAIToolText(GetBlockRefText(blockID), 800)

	refDefs, originalRefBlockIDs := GetBlockRefs(blockID)
	items := make([]map[string]interface{}, 0, len(refDefs))
	for _, refDef := range refDefs {
		if nil == refDef {
			continue
		}
		refID := strings.TrimSpace(refDef.RefID)
		if "" == refID {
			continue
		}
		preview := assistantAICompactBlockPreviewByID(refID, context, resolvedScope)
		if nil == preview {
			continue
		}
		preview["defIDs"] = append([]string{}, refDef.DefIDs...)
		if originalRefID := strings.TrimSpace(originalRefBlockIDs[refID]); "" != originalRefID {
			preview["originalRefBlockID"] = originalRefID
		}
		items = append(items, preview)
	}
	ret["referenceCount"] = len(items)
	ret["references"] = items
	return ret, resolvedScope, nil
}

func listAssistantAINoteHistory(args map[string]interface{}, context *AssistantAINoteContext, scope string) (ret map[string]interface{}, resolvedScope string, err error) {
	rootID, notebook, docPath, resolvedScope, err := resolveAssistantAINoteTarget(args, context, scope)
	if nil != err {
		return nil, resolvedScope, err
	}
	title := ""
	if info := GetDocInfo(rootID); nil != info {
		title = strings.TrimSpace(info.Name)
	}
	groupLimit := clampAssistantAIToolLimit(getAssistantAIIntValue(args, "limit", 6), 1, 12)
	itemLimit := clampAssistantAIToolLimit(getAssistantAIIntValue(args, "itemLimit", 12), 1, 32)
	op := firstAssistantAINonEmpty(strings.TrimSpace(getAssistantAIStringValue(args, "op", "")), "all")
	createdGroups, pageCount, totalCount := FullTextSearchHistory(rootID, notebook, op, HistoryTypeDocID, 1)
	if len(createdGroups) > groupLimit {
		createdGroups = createdGroups[:groupLimit]
	}
	groups := make([]map[string]interface{}, 0, len(createdGroups))
	for _, created := range createdGroups {
		items := FullTextSearchHistoryItems(created, rootID, notebook, op, HistoryTypeDocID)
		rows := make([]map[string]interface{}, 0, len(items))
		for i, item := range items {
			if nil == item || itemLimit <= i {
				break
			}
			rows = append(rows, map[string]interface{}{
				"title":    strings.TrimSpace(item.Title),
				"path":     strings.TrimSpace(item.Path),
				"op":       strings.TrimSpace(item.Op),
				"notebook": strings.TrimSpace(item.Notebook),
			})
		}
		groups = append(groups, map[string]interface{}{
			"created":   created,
			"itemCount": len(items),
			"items":     rows,
		})
	}
	ret = map[string]interface{}{
		"rootID":     rootID,
		"notebook":   notebook,
		"path":       docPath,
		"title":      title,
		"groupCount": len(groups),
		"pageCount":  pageCount,
		"totalCount": totalCount,
		"groups":     groups,
	}
	return ret, resolvedScope, nil
}

func listAssistantAIRestorePoints(args map[string]interface{}) (ret map[string]interface{}, err error) {
	limit := clampAssistantAIToolLimit(getAssistantAIIntValue(args, "limit", 8), 1, 16)
	ret = map[string]interface{}{
		"limit": limit,
	}
	errs := map[string]interface{}{}

	if stat, statErr := GetSnapshotProtectionStat(); nil == statErr {
		ret["stat"] = stat
	} else {
		errs["stat"] = statErr.Error()
	}

	if snapshots, _, _, snapshotErr := GetRepoSnapshots(1); nil == snapshotErr {
		ret["localSnapshots"] = assistantAIJSONSliceLimit(snapshots, limit)
	} else {
		errs["localSnapshots"] = snapshotErr.Error()
	}
	if tags, tagErr := GetTagSnapshots(); nil == tagErr {
		ret["localTags"] = assistantAIJSONSliceLimit(tags, limit)
	} else {
		errs["localTags"] = tagErr.Error()
	}
	if snapshots, _, _, snapshotErr := GetCloudRepoSnapshots(1); nil == snapshotErr {
		ret["remoteSnapshots"] = assistantAIJSONSliceLimit(snapshots, limit)
	} else {
		errs["remoteSnapshots"] = snapshotErr.Error()
	}
	if tags, tagErr := GetCloudRepoTagSnapshots(); nil == tagErr {
		ret["remoteTags"] = assistantAIJSONSliceLimit(tags, limit)
	} else {
		errs["remoteTags"] = tagErr.Error()
	}

	if 0 < len(errs) {
		ret["errors"] = errs
	}
	if 1 == len(ret) && 0 < len(errs) {
		return nil, fmt.Errorf("读取恢复点失败")
	}
	return ret, nil
}

func searchAssistantAIAssets(query string, limit int) (ret []map[string]interface{}, err error) {
	ret = []map[string]interface{}{}
	types := map[string]bool{}
	for _, ext := range allAssistantAIAssetTypes() {
		types[ext] = true
	}
	results, _, _ := FullTextSearchAssetContent(query, types, 0, 0, 1, limit)
	for _, item := range results {
		if nil == item {
			continue
		}
		ret = append(ret, map[string]interface{}{
			"id":      item.ID,
			"name":    item.Name,
			"ext":     item.Ext,
			"path":    item.Path,
			"updated": item.Updated,
			"size":    item.Size,
			"content": truncateAssistantAIToolText(strings.TrimSpace(item.Content), 320),
		})
	}
	return ret, nil
}

func listAssistantAINoteAssets(args map[string]interface{}, context *AssistantAINoteContext, scope string) (ret map[string]interface{}, resolvedScope string, err error) {
	rootID, notebook, docPath, resolvedScope, err := resolveAssistantAINoteTarget(args, context, scope)
	if nil != err {
		return nil, resolvedScope, err
	}
	title := ""
	if info := GetDocInfo(rootID); nil != info {
		title = strings.TrimSpace(info.Name)
	}
	paths, listErr := DocAssets(rootID)
	if nil != listErr {
		return nil, resolvedScope, listErr
	}
	items := make([]map[string]interface{}, 0, len(paths))
	seen := map[string]bool{}
	for _, assetPath := range paths {
		normalized := normalizeAssistantAINoteAssetPath(assetPath)
		if "" == normalized || seen[normalized] {
			continue
		}
		seen[normalized] = true
		if item := assistantAINoteAssetMeta(normalized); nil != item {
			items = append(items, item)
		}
	}
	ret = map[string]interface{}{
		"rootID":   rootID,
		"notebook": notebook,
		"path":     docPath,
		"title":    title,
		"count":    len(items),
		"items":    items,
	}
	return ret, resolvedScope, nil
}

func readAssistantAINoteAssetFile(args map[string]interface{}, context *AssistantAINoteContext, scope string) (ret map[string]interface{}, resolvedScope string, err error) {
	rootID, notebook, docPath, resolvedScope, err := resolveAssistantAINoteTarget(args, context, scope)
	if nil != err {
		return nil, resolvedScope, err
	}
	assetPath := strings.TrimSpace(firstAssistantAINonEmpty(
		getAssistantAIStringValue(args, "path", ""),
		getAssistantAIStringValue(args, "assetPath", ""),
	))
	if "" == assetPath {
		return nil, resolvedScope, fmt.Errorf("读取附件需要 path")
	}
	allowedPath, resolveErr := resolveAssistantAINoteAssetPath(rootID, assetPath)
	if nil != resolveErr {
		return nil, resolvedScope, resolveErr
	}
	meta := assistantAINoteAssetMeta(allowedPath)
	if nil == meta {
		return nil, resolvedScope, fmt.Errorf("读取附件信息失败")
	}
	ret = map[string]interface{}{
		"rootID":   rootID,
		"notebook": notebook,
		"path":     getAssistantAIStringValue(meta, "path", ""),
		"docPath":  docPath,
		"asset":    meta,
		"name":     getAssistantAIStringValue(meta, "name", ""),
		"kind":     getAssistantAIStringValue(meta, "kind", ""),
		"exists":   meta["exists"],
		"size":     meta["size"],
	}
	absPath := getAssistantAIStringValue(meta, "absPath", "")
	if "" == absPath {
		return ret, resolvedScope, nil
	}
	if assistantAITextAssetKind(getAssistantAIStringValue(meta, "kind", "")) {
		content, truncated, readErr := readAssistantAITextAsset(absPath)
		if nil != readErr {
			ret["readable"] = false
			ret["readError"] = readErr.Error()
			return ret, resolvedScope, nil
		}
		ret["readable"] = true
		ret["content"] = content
		ret["truncated"] = truncated
		return ret, resolvedScope, nil
	}
	ret["readable"] = false
	ret["content"] = ""
	ret["reason"] = "当前 AI 会话通道为文本模式，图片和二进制附件默认返回元信息而不做 OCR"
	return ret, resolvedScope, nil
}

func readAssistantAIAssetContent(assetID string) (ret map[string]interface{}, err error) {
	stmt := "SELECT id, name, ext, path, size, updated, content FROM asset_contents_fts_case_insensitive WHERE id = ? LIMIT 1"
	rows, queryErr := sql.QueryAssetContentRows(stmt, strings.TrimSpace(assetID))
	if nil != queryErr {
		return nil, queryErr
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, fmt.Errorf("未找到附件内容索引")
	}
	var item sql.AssetContent
	if scanErr := rows.Scan(&item.ID, &item.Name, &item.Ext, &item.Path, &item.Size, &item.Updated, &item.Content); nil != scanErr {
		return nil, scanErr
	}
	ret = map[string]interface{}{
		"id":      item.ID,
		"name":    item.Name,
		"ext":     item.Ext,
		"path":    item.Path,
		"updated": item.Updated,
		"size":    item.Size,
		"content": truncateAssistantAIToolText(strings.TrimSpace(item.Content), 16000),
	}
	return ret, nil
}

func appendAssistantAIMarkdown(parentID, markdown string) error {
	if "" == strings.TrimSpace(parentID) {
		return fmt.Errorf("parent block ID is required")
	}
	luteEngine := util.NewLute()
	data, err := dataBlockDOMForAssistant(markdown, luteEngine)
	if nil != err {
		return err
	}
	transactions := []*Transaction{{
		DoOperations: []*Operation{{
			Action:   "appendInsert",
			Data:     data,
			ParentID: strings.TrimSpace(parentID),
		}},
	}}
	PerformTransactions(&transactions)
	FlushTxQueue()
	return nil
}

func replaceAssistantAIBlockMarkdown(blockID, markdown string) error {
	if "" == strings.TrimSpace(blockID) {
		return fmt.Errorf("block ID is required")
	}
	luteEngine := util.NewLute()
	data, err := dataBlockDOMForAssistant(markdown, luteEngine)
	if nil != err {
		return err
	}
	tree := luteEngine.BlockDOM2Tree(data)
	if nil == tree || nil == tree.Root || nil == tree.Root.FirstChild {
		return fmt.Errorf("parse tree failed")
	}
	if "NodeList" == tree.Root.FirstChild.Type.String() && nil != tree.Root.FirstChild.FirstChild {
		tree.Root.AppendChild(tree.Root.FirstChild.FirstChild)
		tree.Root.FirstChild.Unlink()
		tree.Root.FirstChild.Unlink()
	}
	if nil != tree.Root.FirstChild {
		tree.Root.FirstChild.SetIALAttr("id", blockID)
	}
	data = luteEngine.Tree2BlockDOM(tree, luteEngine.RenderOptions, luteEngine.ParseOptions)
	transactions := []*Transaction{{
		DoOperations: []*Operation{{
			Action: "update",
			ID:     strings.TrimSpace(blockID),
			Data:   data,
		}},
	}}
	PerformTransactions(&transactions)
	FlushTxQueue()
	return nil
}

func dataBlockDOMForAssistant(data string, luteEngine *lute.Lute) (ret string, err error) {
	luteEngine.SetHTMLTag2TextMark(true)
	ret, tree := luteEngine.Md2BlockDOMTree(data, true)
	if "" == ret {
		blankParagraph := treenode.NewParagraph("")
		ret = luteEngine.RenderNodeBlockDOM(blankParagraph)
	}

	invalidID := ""
	ast.Walk(tree.Root, func(n *ast.Node, entering bool) ast.WalkStatus {
		if !entering {
			return ast.WalkContinue
		}
		if "" != n.ID && !ast.IsNodeIDPattern(n.ID) {
			invalidID = n.ID
			return ast.WalkStop
		}
		return ast.WalkContinue
	})
	if "" != invalidID {
		return "", errors.New("found invalid ID [" + invalidID + "]")
	}
	return ret, nil
}

func resolveAssistantAINewNoteTarget(args map[string]interface{}, context *AssistantAINoteContext, scope string) (notebook, hPath string, err error) {
	scope = normalizeAssistantAIToolScope(scope, AssistantAIToolScopeCurrentNotebook)
	requestedNotebook := strings.TrimSpace(getAssistantAIStringValue(args, "notebook", ""))
	requestedPath := strings.TrimSpace(getAssistantAIStringValue(args, "path", ""))
	title := sanitizeAssistantAINoteTitle(firstAssistantAINonEmpty(getAssistantAIStringValue(args, "title", ""), "AI 笔记"))

	switch scope {
	case AssistantAIToolScopeCurrentNote, AssistantAIToolScopeCurrentNotebook:
		if nil == context || "" == strings.TrimSpace(context.Notebook) {
			return "", "", fmt.Errorf("当前没有可用的笔记本上下文")
		}
		notebook = strings.TrimSpace(context.Notebook)
		if "" != requestedNotebook && requestedNotebook != notebook {
			return "", "", fmt.Errorf("当前配置只允许在当前笔记本内创建笔记")
		}
	default:
		notebook = firstAssistantAINonEmpty(requestedNotebook, contextNotebook(context))
		if "" == notebook {
			opened := Conf.GetOpenedBoxes()
			if 0 < len(opened) {
				notebook = opened[0].ID
			}
		}
	}
	if "" == notebook {
		return "", "", fmt.Errorf("没有可用的笔记本")
	}
	if "" == requestedPath {
		requestedPath = path.Join("/AI", title)
	}
	if !strings.HasPrefix(requestedPath, "/") {
		requestedPath = "/" + requestedPath
	}
	return notebook, sanitizeAssistantAINotePath(requestedPath, title), nil
}

func createAssistantAIWorkbenchItem(def *AssistantAIToolDefinition, policy *AssistantAIToolPolicy, context *AssistantAINoteContext, args map[string]interface{}) (ret map[string]interface{}, summary, targetID string, err error) {
	typ := normalizeWorkbenchType(getAssistantAIStringValue(args, "type", "note"), "note")
	if "url" == typ || "attachment" == typ || "doc" == typ {
		typ = "note"
	}
	title := sanitizeAssistantAINoteTitle(firstAssistantAINonEmpty(getAssistantAIStringValue(args, "title", ""), "AI "+def.Name))
	notebook, hPath, err := resolveAssistantAINewNoteTarget(args, context, policy.WriteScope)
	if nil != err {
		return nil, "", "", err
	}
	markdown := strings.TrimSpace(getAssistantAIContentValue(args))
	if "" == markdown {
		markdown = "# " + title + "\n"
	}
	traceMode := normalizeAssistantAIToolTraceMode(getAssistantAIStringValue(map[string]interface{}{"traceMode": policy.TraceMode}, "traceMode", AssistantAIToolTraceAuditOnly))
	if AssistantAIToolTraceMarkdown == traceMode {
		markdown = buildAssistantAIToolTrace(def, markdown)
	}
	id, createErr := CreateWithMarkdown("", notebook, hPath, markdown, "", ast.NewNodeID(), false, "")
	if nil != createErr {
		return nil, "", "", createErr
	}

	attrs := map[string]string{
		WorkbenchAttrType:       typ,
		WorkbenchAttrStatus:     strings.TrimSpace(getAssistantAIStringValue(args, "status", "")),
		WorkbenchAttrInbox:      assistantAIBoolStringValue(args, "inbox", ""),
		WorkbenchAttrProject:    strings.TrimSpace(getAssistantAIStringValue(args, "project", "")),
		WorkbenchAttrDueDate:    strings.TrimSpace(getAssistantAIStringValue(args, "dueDate", "")),
		WorkbenchAttrEventTime:  strings.TrimSpace(getAssistantAIStringValue(args, "eventTime", "")),
		WorkbenchAttrLocation:   strings.TrimSpace(getAssistantAIStringValue(args, "location", "")),
		WorkbenchAttrSourceURL:  strings.TrimSpace(getAssistantAIStringValue(args, "sourceURL", "")),
		WorkbenchAttrGoal:       strings.TrimSpace(getAssistantAIStringValue(args, "goal", "")),
		WorkbenchAttrNextStep:   strings.TrimSpace(getAssistantAIStringValue(args, "nextStep", "")),
		WorkbenchAttrCapturedAt: strings.TrimSpace(getAssistantAIStringValue(args, "capturedAt", "")),
		WorkbenchAttrTitle:      title,
	}
	if tags := assistantAIJoinedStringArrayValue(args, "tags"); "" != tags {
		attrs["tags"] = tags
	}
	if saveErr := SaveWorkbenchItem(id, title, attrs); nil != saveErr {
		return nil, "", "", saveErr
	}

	ret = map[string]interface{}{
		"targetID":  id,
		"type":      typ,
		"title":     title,
		"notebook":  notebook,
		"path":      hPath,
		"status":    normalizeWorkbenchStatus(typ, attrs[WorkbenchAttrStatus], ""),
		"project":   attrs[WorkbenchAttrProject],
		"dueDate":   attrs[WorkbenchAttrDueDate],
		"eventTime": attrs[WorkbenchAttrEventTime],
		"location":  attrs[WorkbenchAttrLocation],
	}
	return ret, fmt.Sprintf("已创建%s", assistantAIWorkbenchItemLabel(typ)), id, nil
}

func createAssistantAIChildNote(def *AssistantAIToolDefinition, policy *AssistantAIToolPolicy, context *AssistantAINoteContext, args map[string]interface{}) (ret map[string]interface{}, summary, targetID string, err error) {
	if nil == context || "" == contextID(context) || "" == contextNotebook(context) {
		return nil, "", "", fmt.Errorf("当前没有可用的笔记上下文")
	}
	title := sanitizeAssistantAINoteTitle(firstAssistantAINonEmpty(getAssistantAIStringValue(args, "title", ""), "AI 子文档"))
	parentHPath, hPathErr := GetHPathByID(contextID(context))
	if nil != hPathErr {
		return nil, "", "", hPathErr
	}
	hPath := sanitizeAssistantAINotePath(path.Join(parentHPath, title), title)
	markdown := strings.TrimSpace(getAssistantAIContentValue(args))
	if "" == markdown {
		markdown = "# " + title + "\n"
	}
	traceMode := normalizeAssistantAIToolTraceMode(getAssistantAIStringValue(map[string]interface{}{"traceMode": policy.TraceMode}, "traceMode", AssistantAIToolTraceAuditOnly))
	if AssistantAIToolTraceMarkdown == traceMode {
		markdown = buildAssistantAIToolTrace(def, markdown)
	}
	tags := assistantAIJoinedStringArrayValue(args, "tags")
	id, createErr := CreateWithMarkdown(tags, contextNotebook(context), hPath, markdown, contextID(context), ast.NewNodeID(), false, "")
	if nil != createErr {
		return nil, "", "", createErr
	}
	ret = map[string]interface{}{
		"targetID":     id,
		"title":        title,
		"rootID":       id,
		"parentRootID": contextID(context),
		"notebook":     contextNotebook(context),
		"path":         hPath,
	}
	return ret, "已创建当前笔记子文档", id, nil
}

func insertAssistantAIBlockAfter(policy *AssistantAIToolPolicy, context *AssistantAINoteContext, args map[string]interface{}) (ret map[string]interface{}, summary, targetID string, err error) {
	blockID := strings.TrimSpace(firstAssistantAINonEmpty(getAssistantAIStringValue(args, "id", ""), contextCurrentBlockID(context)))
	markdown := strings.TrimSpace(getAssistantAIContentValue(args))
	if "" == blockID {
		return nil, "", "", fmt.Errorf("当前没有可用的块上下文")
	}
	if "" == markdown {
		return nil, "", "", fmt.Errorf("插入内容不能为空，请在 markdown、content 或 text 字段中提供正文")
	}
	block := sql.GetBlock(blockID)
	if nil == block {
		return nil, "", "", fmt.Errorf("未找到指定块")
	}
	scope := normalizeAssistantAIToolScope(policy.WriteScope, AssistantAIToolScopeCurrentNotebook)
	if !assistantAINoteMatchesScope(scope, context, strings.TrimSpace(block.Box), strings.TrimSpace(block.Path), strings.TrimSpace(block.RootID)) {
		return nil, "", "", fmt.Errorf("当前写入范围不允许修改该块")
	}
	if "d" == strings.TrimSpace(block.Type) {
		return nil, "", "", fmt.Errorf("根文档请使用追加到当前笔记或创建子文档")
	}
	def := getAssistantAIToolDefinition(AssistantAIToolInsertAfterBlock)
	traceMode := normalizeAssistantAIToolTraceMode(getAssistantAIStringValue(map[string]interface{}{"traceMode": policy.TraceMode}, "traceMode", AssistantAIToolTraceAuditOnly))
	if AssistantAIToolTraceMarkdown == traceMode && nil != def {
		markdown = buildAssistantAIToolTrace(def, markdown)
	}
	luteEngine := util.NewLute()
	data, domErr := dataBlockDOMForAssistant(markdown, luteEngine)
	if nil != domErr {
		return nil, "", "", domErr
	}
	parentID, _, nextID, idsErr := GetBlockRelevantIDs(blockID)
	if nil != idsErr {
		return nil, "", "", idsErr
	}
	transactions := []*Transaction{{
		DoOperations: []*Operation{{
			Action:     "insert",
			Data:       data,
			ParentID:   parentID,
			PreviousID: blockID,
			NextID:     nextID,
		}},
	}}
	PerformTransactions(&transactions)
	FlushTxQueue()
	ret = map[string]interface{}{
		"targetID":        blockID,
		"afterBlockID":    blockID,
		"rootID":          strings.TrimSpace(block.RootID),
		"notebook":        strings.TrimSpace(block.Box),
		"path":            strings.TrimSpace(block.Path),
		"insertedLength":  len([]rune(markdown)),
		"insertedPreview": truncateAssistantAIToolText(markdown, 240),
	}
	return ret, "已在指定块后插入内容", blockID, nil
}

func deleteAssistantAIBlock(policy *AssistantAIToolPolicy, context *AssistantAINoteContext, args map[string]interface{}) (ret map[string]interface{}, summary, targetID string, err error) {
	blockID := strings.TrimSpace(firstAssistantAINonEmpty(getAssistantAIStringValue(args, "id", ""), contextCurrentBlockID(context)))
	if "" == blockID {
		return nil, "", "", fmt.Errorf("块 ID 不能为空")
	}
	block := sql.GetBlock(blockID)
	if nil == block {
		return nil, "", "", fmt.Errorf("未找到指定块")
	}
	scope := normalizeAssistantAIToolScope(policy.WriteScope, AssistantAIToolScopeCurrentNotebook)
	if !assistantAINoteMatchesScope(scope, context, strings.TrimSpace(block.Box), strings.TrimSpace(block.Path), strings.TrimSpace(block.RootID)) {
		return nil, "", "", fmt.Errorf("当前写入范围不允许修改该块")
	}
	if "d" == strings.TrimSpace(block.Type) {
		return nil, "", "", fmt.Errorf("根文档请使用恢复、移动或删除文档能力，不能直接通过删块工具删除")
	}
	transactions := []*Transaction{{
		DoOperations: []*Operation{{
			Action: "delete",
			ID:     blockID,
		}},
	}}
	PerformTransactions(&transactions)
	FlushTxQueue()
	ret = map[string]interface{}{
		"targetID": blockID,
		"rootID":   strings.TrimSpace(block.RootID),
		"notebook": strings.TrimSpace(block.Box),
		"path":     strings.TrimSpace(block.Path),
	}
	return ret, "已删除指定块", blockID, nil
}

func replaceAssistantAIBlock(policy *AssistantAIToolPolicy, context *AssistantAINoteContext, args map[string]interface{}) (ret map[string]interface{}, summary, targetID string, err error) {
	blockID := strings.TrimSpace(getAssistantAIStringValue(args, "id", ""))
	markdown := strings.TrimSpace(getAssistantAIContentValue(args))
	if "" == blockID {
		return nil, "", "", fmt.Errorf("块 ID 不能为空")
	}
	if "" == markdown {
		if assistantAIIsDeleteIntent(args) {
			return deleteAssistantAIBlock(policy, context, map[string]interface{}{"id": blockID})
		}
		return nil, "", "", fmt.Errorf("替换内容不能为空；如果要删除块，请改用 delete-block")
	}
	block := sql.GetBlock(blockID)
	if nil == block {
		return nil, "", "", fmt.Errorf("未找到指定块")
	}
	scope := normalizeAssistantAIToolScope(policy.WriteScope, AssistantAIToolScopeCurrentNotebook)
	if !assistantAINoteMatchesScope(scope, context, strings.TrimSpace(block.Box), strings.TrimSpace(block.Path), strings.TrimSpace(block.RootID)) {
		return nil, "", "", fmt.Errorf("当前写入范围不允许修改该块")
	}
	if "d" == strings.TrimSpace(block.Type) {
		return nil, "", "", fmt.Errorf("根文档请使用新建、追加或更细粒度的块修改方式")
	}
	if err = replaceAssistantAIBlockMarkdown(blockID, markdown); nil != err {
		return nil, "", "", err
	}
	ret = map[string]interface{}{
		"targetID":       blockID,
		"rootID":         strings.TrimSpace(block.RootID),
		"notebook":       strings.TrimSpace(block.Box),
		"path":           strings.TrimSpace(block.Path),
		"updatedLength":  len([]rune(markdown)),
		"updatedPreview": truncateAssistantAIToolText(markdown, 240),
	}
	return ret, "已替换指定块内容", blockID, nil
}

func sanitizeAssistantAINoteTitle(value string) string {
	replacer := regexp.MustCompile(`[\\/:*?"<>|\r\n]+`)
	value = replacer.ReplaceAllString(value, " ")
	value = strings.Join(strings.Fields(value), " ")
	if "" == value {
		return "AI 笔记"
	}
	return value
}

func sanitizeAssistantAINotePath(hPath, title string) string {
	baseName := path.Base(hPath)
	dir := path.Dir(hPath)
	baseName = sanitizeAssistantAINoteTitle(baseName)
	if "" == strings.TrimSpace(baseName) {
		baseName = title
	}
	if !strings.HasPrefix(dir, "/") {
		dir = "/" + dir
	}
	return path.Join(dir, baseName)
}

func buildAssistantAIToolTrace(def *AssistantAIToolDefinition, markdown string) string {
	header := strings.Join([]string{
		"> AI 留痕",
		"> 工具：" + def.ID,
		"> 时间：" + time.Now().Format("2006-01-02 15:04:05"),
		"",
	}, "\n")
	return header + strings.TrimSpace(markdown) + "\n"
}

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

func assistantAICompactBlockPreviewByID(blockID string, context *AssistantAINoteContext, scope string) map[string]interface{} {
	blockID = strings.TrimSpace(blockID)
	if "" == blockID {
		return nil
	}
	block, _, err := readAssistantAIBlock(blockID, context, scope)
	if nil != err {
		return nil
	}
	return assistantAICompactBlockPreview(block)
}

func assistantAICompactBlockPreviewNode(node *ast.Node) map[string]interface{} {
	if nil == node || !node.IsBlock() {
		return nil
	}
	ret := map[string]interface{}{
		"id":      strings.TrimSpace(node.ID),
		"type":    strings.TrimSpace(node.Type.String()),
		"content": truncateAssistantAIToolText(getNodeRefText(node), 280),
	}
	if sqlBlock := sql.GetBlock(strings.TrimSpace(node.ID)); nil != sqlBlock {
		ret["rootID"] = strings.TrimSpace(sqlBlock.RootID)
		ret["notebook"] = strings.TrimSpace(sqlBlock.Box)
		ret["path"] = strings.TrimSpace(sqlBlock.Path)
		ret["hPath"] = strings.TrimSpace(sqlBlock.HPath)
		ret["title"] = firstAssistantAINonEmpty(strings.TrimSpace(sqlBlock.Name), strings.TrimSpace(sqlBlock.HPath))
	}
	return ret
}

func assistantAICompactBlockPreview(block map[string]interface{}) map[string]interface{} {
	if nil == block {
		return nil
	}
	return map[string]interface{}{
		"id":       getAssistantAIStringValue(block, "id", ""),
		"rootID":   getAssistantAIStringValue(block, "rootID", ""),
		"type":     getAssistantAIStringValue(block, "type", ""),
		"notebook": getAssistantAIStringValue(block, "notebook", ""),
		"path":     getAssistantAIStringValue(block, "path", ""),
		"hPath":    getAssistantAIStringValue(block, "hPath", ""),
		"title":    getAssistantAIStringValue(block, "title", ""),
		"content":  truncateAssistantAIToolText(getAssistantAIStringValue(block, "content", ""), 280),
		"markdown": truncateAssistantAIToolText(getAssistantAIStringValue(block, "markdown", ""), 800),
	}
}

func assistantAIJSONSliceLimit(value interface{}, limit int) []map[string]interface{} {
	buf, err := json.Marshal(value)
	if nil != err {
		return []map[string]interface{}{}
	}
	rows := []map[string]interface{}{}
	if err = json.Unmarshal(buf, &rows); nil != err {
		return []map[string]interface{}{}
	}
	if len(rows) > limit {
		rows = rows[:limit]
	}
	for _, row := range rows {
		delete(row, "files")
	}
	return rows
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
