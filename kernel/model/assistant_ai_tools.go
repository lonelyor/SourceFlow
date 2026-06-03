package model

import (
	dbsql "database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
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
	ProfileID    string                  `json:"profileId"`
	SessionID    string                  `json:"sessionId"`
	SecurityMode AISecurityMode          `json:"securityMode"`
	Context      *AssistantAINoteContext `json:"context"`
	ToolID       string                  `json:"toolId"`
	Args         map[string]interface{}  `json:"args"`
}

type AssistantAIToolResult struct {
	ToolID          string                  `json:"toolId"`
	Name            string                  `json:"name"`
	Risk            string                  `json:"risk"`
	Decision        string                  `json:"decision"`
	Executed        bool                    `json:"executed"`
	Rejected        bool                    `json:"rejected"`
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
	return executeAssistantAITool(db, profile, strings.TrimSpace(req.SessionID), req.Context, strings.TrimSpace(req.ToolID), req.Args, req.SecurityMode)
}

func executeAssistantAITool(db *dbsql.DB, profile *AssistantAIProfile, sessionID string, context *AssistantAINoteContext, toolID string, args map[string]interface{}, securityMode AISecurityMode) (ret *AssistantAIToolResult, err error) {
	return executeAssistantAITool0(db, profile, sessionID, context, toolID, args, false, securityMode)
}

func confirmAssistantAITool(db *dbsql.DB, profile *AssistantAIProfile, sessionID string, context *AssistantAINoteContext, toolID string, args map[string]interface{}, userPrompt string, securityMode AISecurityMode) (ret *AssistantAIToolResult, err error) {
	return executeAssistantAITool0(db, profile, sessionID, context, toolID, normalizeAssistantAIToolArgs(toolID, args, "", userPrompt), true, securityMode)
}

func rejectAssistantAITool(db *dbsql.DB, profile *AssistantAIProfile, sessionID string, toolID string) (*AssistantAIToolResult, error) {
	def := getAssistantAIToolDefinition(toolID)
	if nil == def {
		return nil, fmt.Errorf("unsupported assistant AI tool [%s]", toolID)
	}
	ret := &AssistantAIToolResult{
		ToolID:   def.ID,
		Name:     def.Name,
		Risk:     def.Risk,
		Decision: AssistantAIToolModeConfirm,
		Executed: false,
		Rejected: true,
		Error:    "用户已拒绝执行该工具",
		Summary:  "用户已拒绝执行该工具",
		Data:     map[string]interface{}{},
	}
	audit := &assistantAIToolAuditRecord{
		ID:        ast.NewNodeID(),
		SessionID: strings.TrimSpace(sessionID),
		ProfileID: firstAssistantAINonEmpty(profile.ID),
		ToolID:    def.ID,
		Risk:      def.Risk,
		Decision:  AssistantAIToolModeConfirm,
		Executed:  false,
		Status:    "rejected",
		Result:    map[string]interface{}{"error": ret.Error},
		CreatedAt: time.Now().UnixMilli(),
	}
	if persistErr := insertAssistantAIToolAudit(db, audit); nil == persistErr {
		ret.AuditID = audit.ID
	}
	return ret, nil
}

func executeAssistantAITool0(db *dbsql.DB, profile *AssistantAIProfile, sessionID string, context *AssistantAINoteContext, toolID string, args map[string]interface{}, allowConfirm bool, securityMode AISecurityMode) (ret *AssistantAIToolResult, err error) {
	def := getAssistantAIToolDefinition(toolID)
	if nil == def {
		return nil, fmt.Errorf("unsupported assistant AI tool [%s]", toolID)
	}
	securityMode = NormalizeAISecurityMode(securityMode, GetAISecurityConfig().DefaultMode)
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

	targetType, targetIDs := resolveToolSecurityTarget(def, context, args)
	sessionBatchCount := countAssistantAIToolSessionBatch(db, strings.TrimSpace(sessionID), def, targetIDs)
	securityResult := checkToolSecurity(def, context, args, securityMode, sessionBatchCount)
	if securityResult.Decision == AISecurityDeny {
		if securityResult.Escalatable && allowConfirm {
			ret.RequiresConfirm = false
		} else {
			if securityResult.AffectedItems != nil {
				ret.Data["securityAffectedItems"] = securityResult.AffectedItems
			}
			ret.Data["securityEscalatable"] = securityResult.Escalatable
			ret.Data["securityTargetType"] = targetType
			ret.Data["securityTargetIDs"] = targetIDs
			if preview := buildAssistantAIToolPreviewPatch(def, context, args); nil != preview {
				ret.Data["previewPatch"] = preview
			}
			ret.Error = securityResult.Reason
			ret.Summary = ret.Error
			audit.Status = "blocked_security"
			return ret, nil
		}
	}
	if securityResult.Decision == AISecurityConfirm && !allowConfirm {
		if securityResult.AffectedItems != nil {
			ret.Data["securityAffectedItems"] = securityResult.AffectedItems
		}
		ret.Data["securityEscalatable"] = securityResult.Escalatable
		ret.Data["securityTargetType"] = targetType
		ret.Data["securityTargetIDs"] = targetIDs
		if preview := buildAssistantAIToolPreviewPatch(def, context, args); nil != preview {
			ret.Data["previewPatch"] = preview
		}
		ret.Error = securityResult.Reason
		ret.Summary = ret.Error
		audit.Status = "blocked_security"
		return ret, nil
	}

	if assistantAIToolDryRunRequested(args) {
		if preview := buildAssistantAIToolPreviewPatch(def, context, args); nil != preview {
			ret.Data["previewPatch"] = preview
		}
		ret.Summary = "已生成工具预览，未执行真实写入"
		audit.Status = "preview"
		return ret, nil
	}

	if assistantAIToolIsWrite(def) && !assistantAIToolDirectWriteRequested(args) {
		if preview := buildAssistantAIToolPreviewPatch(def, context, args); nil != preview {
			ret.Data["previewPatch"] = preview
			ret.Decision = AssistantAIToolModeConfirm
			ret.RequiresConfirm = false
			ret.Summary = "已生成修改预览，请审阅补丁后应用"
			audit.Status = "preview"
			return ret, nil
		}
	}

	switch decision {
	case AssistantAIToolModeDeny:
		ret.Error = "该工具已被当前配置禁止"
		ret.Summary = ret.Error
		return ret, nil
	case AssistantAIToolModeConfirm:
		if !allowConfirm {
			if preview := buildAssistantAIToolPreviewPatch(def, context, args); nil != preview {
				ret.Data["previewPatch"] = preview
			}
			ret.Summary = "该工具需要确认后才能执行，已生成修改预览"
			audit.Status = "preview"
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

func assistantAIToolIsWrite(def *AssistantAIToolDefinition) bool {
	return nil != def && "write" == strings.TrimSpace(def.Category)
}

func assistantAIToolDirectWriteRequested(args map[string]interface{}) bool {
	if nil == args {
		return false
	}
	for _, key := range []string{"executeWrite", "directWrite"} {
		raw, ok := args[key]
		if !ok || nil == raw {
			continue
		}
		switch value := raw.(type) {
		case bool:
			if value {
				return true
			}
		case string:
			normalized := strings.ToLower(strings.TrimSpace(value))
			if "true" == normalized || "1" == normalized || "yes" == normalized {
				return true
			}
		}
	}
	return false
}

func countAssistantAIToolSessionBatch(db *dbsql.DB, sessionID string, def *AssistantAIToolDefinition, targetIDs []string) int {
	count := len(normalizeAISecurityTargetIDs(targetIDs))
	if nil == db || nil == def || "" == strings.TrimSpace(sessionID) || !isWriteRisk(toolRiskToSecurityRisk(def.Risk)) {
		return count
	}

	var existing int
	err := db.QueryRow(`SELECT COUNT(DISTINCT target_id)
        FROM ai_tool_audits
        WHERE session_id = ?
          AND target_id != ''
          AND risk IN (?, ?, ?, ?, ?)`,
		strings.TrimSpace(sessionID),
		AssistantAIToolRiskLowWrite,
		AssistantAIToolRiskMediumWrite,
		string(AISecurityRiskL4),
		string(AISecurityRiskL5),
		string(AISecurityRiskL6)).Scan(&existing)
	if nil != err {
		return count
	}
	return count + existing
}

func assistantAIToolDryRunRequested(args map[string]interface{}) bool {
	if nil == args {
		return false
	}
	raw, ok := args["dryRun"]
	if !ok || nil == raw {
		raw, ok = args["preview"]
	}
	if !ok || nil == raw {
		return false
	}
	switch value := raw.(type) {
	case bool:
		return value
	case string:
		normalized := strings.ToLower(strings.TrimSpace(value))
		return "true" == normalized || "1" == normalized || "yes" == normalized
	default:
		return false
	}
}

func buildAssistantAIToolPreviewPatch(def *AssistantAIToolDefinition, context *AssistantAINoteContext, args map[string]interface{}) map[string]interface{} {
	if nil == def || "write" != strings.TrimSpace(def.Category) {
		return nil
	}
	operation := buildAssistantAIToolPreviewOperation(def, context, args)
	if nil == operation {
		return nil
	}
	return map[string]interface{}{
		"id":         ast.NewNodeID(),
		"toolId":     def.ID,
		"source":     "tool",
		"target":     assistantAIToolPatchTarget(def),
		"risk":       def.Risk,
		"summary":    def.Name + " · 预览",
		"operations": []map[string]interface{}{operation},
		"createdAt":  time.Now().UnixMilli(),
	}
}

func buildAssistantAIToolPreviewOperation(def *AssistantAIToolDefinition, context *AssistantAINoteContext, args map[string]interface{}) map[string]interface{} {
	markdown := strings.TrimSpace(getAssistantAIContentValue(args))
	targetID := strings.TrimSpace(firstAssistantAINonEmpty(getAssistantAIStringValue(args, "id", ""), contextCurrentBlockID(context), contextID(context)))
	operation := map[string]interface{}{
		"id":     ast.NewNodeID(),
		"reason": def.Description,
		"status": "pending",
	}
	switch def.ID {
	case AssistantAIToolAppendCurrentNote:
		if "" == markdown || "" == contextID(context) {
			return nil
		}
		operation["type"] = "append-note"
		operation["targetId"] = contextID(context)
		operation["targetLabel"] = firstAssistantAINonEmpty(contextTitle(context), "当前笔记")
		operation["after"] = markdown
	case AssistantAIToolCreateNote, AssistantAIToolCreateWorkbench:
		if "" == markdown {
			return nil
		}
		operation["type"] = "create-note"
		operation["targetLabel"] = firstAssistantAINonEmpty(getAssistantAIStringValue(args, "title", ""), "AI 笔记")
		operation["after"] = markdown
	case AssistantAIToolCreateChildNote:
		if "" == markdown || "" == contextID(context) {
			return nil
		}
		operation["type"] = "create-child-note"
		operation["targetId"] = contextID(context)
		operation["targetLabel"] = firstAssistantAINonEmpty(getAssistantAIStringValue(args, "title", ""), "AI 子文档")
		operation["after"] = markdown
	case AssistantAIToolInsertAfterBlock:
		if "" == markdown || "" == targetID {
			return nil
		}
		operation["type"] = "insert-after-block"
		operation["targetId"] = targetID
		operation["targetLabel"] = "目标块"
		operation["after"] = markdown
	case AssistantAIToolReplaceBlock:
		if "" == markdown || "" == targetID {
			return nil
		}
		operation["type"] = "replace-block"
		operation["targetId"] = targetID
		operation["targetLabel"] = "目标块"
		operation["before"] = truncateAssistantAIToolText(strings.TrimSpace(GetBlockKramdown(targetID, "")), 4000)
		operation["after"] = markdown
	case AssistantAIToolDeleteBlock:
		if "" == targetID {
			return nil
		}
		operation["type"] = "delete-block"
		operation["targetId"] = targetID
		operation["targetLabel"] = "目标块"
		operation["before"] = truncateAssistantAIToolText(strings.TrimSpace(GetBlockKramdown(targetID, "")), 4000)
	default:
		return nil
	}
	return operation
}

func assistantAIToolPatchTarget(def *AssistantAIToolDefinition) string {
	if nil == def {
		return "workspace"
	}
	switch def.ID {
	case AssistantAIToolAppendCurrentNote:
		return "note"
	case AssistantAIToolInsertAfterBlock, AssistantAIToolReplaceBlock, AssistantAIToolDeleteBlock:
		return "block"
	case AssistantAIToolCreateNote, AssistantAIToolCreateChildNote, AssistantAIToolCreateWorkbench:
		return "notebook"
	default:
		return "workspace"
	}
}
