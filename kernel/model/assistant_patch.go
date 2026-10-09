package model

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"path"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/lonelyor/sourceflow/kernel/filesys"
	sql "github.com/lonelyor/sourceflow/kernel/sql"
	"github.com/lonelyor/sourceflow/kernel/treenode"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
	"github.com/lonelyor/sourceflow/third_party/go/lute"
	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
)

const (
	AssistantPatchOperationInsertAfterBlock = "insert-after-block"
	AssistantPatchOperationReplaceSelection = "replace-selection"
	AssistantPatchOperationReplaceBlock     = "replace-block"
	AssistantPatchOperationAppendNote       = "append-note"
	AssistantPatchOperationCreateNote       = "create-note"
	AssistantPatchOperationCreateChildNote  = "create-child-note"
	AssistantPatchOperationMoveNote         = "move-note"
	AssistantPatchOperationRenameNote       = "rename-note"
	AssistantPatchOperationSetAttrs         = "set-attrs"
	AssistantPatchOperationDeleteBlock      = "delete-block"
)

type AssistantEditPatch struct {
	ID         string                     `json:"id"`
	SkillID    string                     `json:"skillId,omitempty"`
	ToolID     string                     `json:"toolId,omitempty"`
	Source     string                     `json:"source"`
	Target     string                     `json:"target"`
	Risk       string                     `json:"risk"`
	Summary    string                     `json:"summary"`
	Operations []*AssistantPatchOperation `json:"operations"`
	CreatedAt  int64                      `json:"createdAt"`
	// RuleRunID/TriggeredBy 是自动化循环防护标记：规则运行编译出的 patch 携带运行 ID，
	// 随 patch apply 写入 AI 操作历史，前端事件触发器据此抑制再触发。
	RuleRunID   string `json:"ruleRunId,omitempty"`
	TriggeredBy string `json:"triggeredBy,omitempty"`
}

type AssistantPatchOperation struct {
	ID              string                 `json:"id"`
	Type            string                 `json:"type"`
	TargetID        string                 `json:"targetId,omitempty"`
	TargetLabel     string                 `json:"targetLabel,omitempty"`
	Before          string                 `json:"before,omitempty"`
	After           string                 `json:"after,omitempty"`
	DataType        string                 `json:"dataType,omitempty"`
	Attrs           map[string]interface{} `json:"attrs,omitempty"`
	Reason          string                 `json:"reason,omitempty"`
	Status          string                 `json:"status,omitempty"`
	AppliedTargetID string                 `json:"appliedTargetId,omitempty"`
}

type AssistantPatchApplyRequest struct {
	Patch           *AssistantEditPatch      `json:"patch"`
	Operation       *AssistantPatchOperation `json:"operation"`
	Context         *AssistantAINoteContext  `json:"context"`
	SecurityMode    AISecurityMode           `json:"securityMode"`
	EscalationToken string                   `json:"escalationToken,omitempty"`
	Audit           *AssistantPatchAudit     `json:"audit,omitempty"`
}

type AssistantPatchApplyResult struct {
	AppliedTargetID string                      `json:"appliedTargetId,omitempty"`
	HistoryID       string                      `json:"historyId,omitempty"`
	RequiresConfirm bool                        `json:"requiresConfirm,omitempty"`
	Security        *AISecurityPermissionResult `json:"security,omitempty"`
	Summary         string                      `json:"summary,omitempty"`
	Transactions    []*Transaction              `json:"transactions,omitempty"`
	CreatedDoc      bool                        `json:"createdDoc,omitempty"`
	Notebook        string                      `json:"notebook,omitempty"`
	Path            string                      `json:"path,omitempty"`
	HistoryError    string                      `json:"historyError,omitempty"`
	HistorySnapshot *AssistantOperationSnapshot `json:"-"`
}

type AssistantPatchEscalationIssueResult struct {
	Token     string                      `json:"token,omitempty"`
	ExpiresAt int64                       `json:"expiresAt,omitempty"`
	Security  *AISecurityPermissionResult `json:"security,omitempty"`
}

func ApplyAssistantPatchOperation(req *AssistantPatchApplyRequest) (*AssistantPatchApplyResult, error) {
	context, operation, security, scope, err := prepareAssistantPatchSecurity(req)
	if nil != err {
		return nil, err
	}
	if nil == security {
		return nil, fmt.Errorf("AI security decision is unavailable")
	}
	if security.Decision != AISecurityAllow {
		if !security.Escalatable {
			return &AssistantPatchApplyResult{RequiresConfirm: true, Security: security}, nil
		}
		if !consumeAISecurityEscalationToken(req.EscalationToken, scope) {
			if "" != strings.TrimSpace(req.EscalationToken) && "" == strings.TrimSpace(security.Reason) {
				security.Reason = "本次允许凭证无效或已过期，请重新确认"
			} else if "" != strings.TrimSpace(req.EscalationToken) && "" != strings.TrimSpace(security.Reason) {
				security.Reason = strings.TrimSpace(security.Reason) + "；本次允许凭证无效或已过期，请重新确认"
			}
			return &AssistantPatchApplyResult{RequiresConfirm: true, Security: security}, nil
		}
	}

	var result *AssistantPatchApplyResult
	switch operation.Type {
	case AssistantPatchOperationInsertAfterBlock:
		result, err = applyAssistantPatchInsertAfterBlock(context, operation)
	case AssistantPatchOperationAppendNote:
		result, err = applyAssistantPatchAppendNote(context, operation)
	case AssistantPatchOperationReplaceSelection:
		result, err = applyAssistantPatchReplaceSelection(context, operation)
	case AssistantPatchOperationReplaceBlock:
		result, err = applyAssistantPatchReplaceBlock(context, operation)
	case AssistantPatchOperationCreateNote:
		result, err = applyAssistantPatchCreateNote(context, operation, false)
	case AssistantPatchOperationCreateChildNote:
		result, err = applyAssistantPatchCreateNote(context, operation, true)
	case AssistantPatchOperationDeleteBlock:
		result, err = applyAssistantPatchDeleteBlock(context, operation)
	case AssistantPatchOperationRenameNote:
		result, err = applyAssistantPatchRenameNote(context, operation)
	case AssistantPatchOperationMoveNote:
		result, err = applyAssistantPatchMoveNote(context, operation)
	case AssistantPatchOperationSetAttrs:
		result, err = applyAssistantPatchSetAttrs(context, operation)
	default:
		return nil, fmt.Errorf("unsupported assistant patch operation [%s]", operation.Type)
	}
	if nil != err {
		return nil, err
	}
	if nil != result {
		item, recordErr := RecordAssistantPatchOperationHistory(req, operation, result)
		if nil != recordErr {
			result.HistoryError = recordErr.Error()
			logging.LogErrorf("assistant patch applied but history recording failed: %s", recordErr)
			return result, nil
		}
		if nil != item {
			result.HistoryID = item.ID
		}
	}
	return result, nil
}

func IssueAssistantPatchEscalationToken(req *AssistantPatchApplyRequest) (*AssistantPatchEscalationIssueResult, error) {
	_, _, security, scope, err := prepareAssistantPatchSecurity(req)
	if nil != err {
		return nil, err
	}
	if nil == security {
		return nil, fmt.Errorf("AI security decision is unavailable")
	}
	if security.Decision == AISecurityAllow {
		return &AssistantPatchEscalationIssueResult{Security: security}, nil
	}
	if !security.Escalatable {
		return &AssistantPatchEscalationIssueResult{Security: security}, nil
	}
	token, expiresAt, err := issueAISecurityEscalationToken(scope)
	if nil != err {
		return nil, err
	}
	return &AssistantPatchEscalationIssueResult{Token: token, ExpiresAt: expiresAt, Security: security}, nil
}

func prepareAssistantPatchSecurity(req *AssistantPatchApplyRequest) (*AssistantAINoteContext, *AssistantPatchOperation, *AISecurityPermissionResult, *AISecurityEscalationScope, error) {
	if nil == req || nil == req.Patch || nil == req.Operation {
		return nil, nil, nil, nil, fmt.Errorf("assistant patch and operation are required")
	}
	context := cloneAssistantAINoteContext(req.Context)
	if nil == context || "" == contextID(context) {
		return nil, nil, nil, nil, fmt.Errorf("current note context is unavailable")
	}
	operation := normalizeAssistantPatchOperation(req.Operation)
	if "" == operation.Type {
		return nil, nil, nil, nil, fmt.Errorf("assistant patch operation type is required")
	}
	risk := assistantPatchSecurityRisk(req.Patch, operation)
	targetType := "note"
	targetIDs := assistantPatchSecurityTargetIDs(context, operation)
	batchCount := assistantPatchPendingOperationCount(req.Patch)
	if sessionCount := CountAssistantOperationHistorySessionWriteTargets(req.AuditSessionID(), targetIDs); sessionCount > batchCount {
		batchCount = sessionCount
	}
	capability := assistantPatchOperationCapability(operation)
	security := CheckAISecurityPermissionForRequest(&AISecurityPermissionRequest{
		Mode:              req.SecurityMode,
		Risk:              risk,
		TargetType:        targetType,
		TargetIDs:         targetIDs,
		SessionBatchCount: batchCount,
		Capability:        capability,
		ToolID:            strings.TrimSpace(req.Patch.ToolID),
		Source:            AISecuritySourceAssistantPatch,
		SessionID:         req.AuditSessionID(),
		OperationType:     strings.TrimSpace(operation.Type),
	})
	scope := &AISecurityEscalationScope{
		Kind:              "assistant-patch",
		Mode:              NormalizeAISecurityMode(req.SecurityMode, GetAISecurityConfig().DefaultMode),
		Risk:              risk,
		TargetType:        targetType,
		TargetIDs:         targetIDs,
		SessionBatchCount: batchCount,
		Capability:        capability,
		ToolID:            strings.TrimSpace(req.Patch.ToolID),
		PatchID:           strings.TrimSpace(req.Patch.ID),
		OperationID:       strings.TrimSpace(operation.ID),
		OperationType:     strings.TrimSpace(operation.Type),
		OperationDigest:   assistantPatchOperationDigest(operation),
	}
	return context, operation, security, scope, nil
}

func assistantPatchSecurityTargetIDs(context *AssistantAINoteContext, operation *AssistantPatchOperation) []string {
	ids := []string{}
	addID := func(id string) {
		id = strings.TrimSpace(id)
		if "" == id {
			return
		}
		if block := sql.GetBlock(id); nil != block && "" != strings.TrimSpace(block.RootID) {
			ids = append(ids, strings.TrimSpace(block.RootID))
			return
		}
		ids = append(ids, id)
	}
	addID(operation.TargetID)
	if 1 > len(ids) {
		addID(contextID(context))
	}
	return normalizeAISecurityTargetIDs(ids)
}

func assistantPatchOperationDigest(operation *AssistantPatchOperation) string {
	payload := struct {
		Type     string                 `json:"type"`
		TargetID string                 `json:"targetId"`
		Before   string                 `json:"before"`
		After    string                 `json:"after"`
		DataType string                 `json:"dataType"`
		Attrs    map[string]interface{} `json:"attrs,omitempty"`
	}{
		Type:     strings.TrimSpace(operation.Type),
		TargetID: strings.TrimSpace(operation.TargetID),
		Before:   operation.Before,
		After:    operation.After,
		DataType: strings.TrimSpace(operation.DataType),
		Attrs:    operation.Attrs,
	}
	data, err := json.Marshal(payload)
	if nil != err {
		sum := sha256.Sum256([]byte(strings.TrimSpace(operation.Type) + "\x00" + strings.TrimSpace(operation.TargetID)))
		return hex.EncodeToString(sum[:])
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func normalizeAssistantPatchOperation(operation *AssistantPatchOperation) *AssistantPatchOperation {
	if nil == operation {
		return &AssistantPatchOperation{}
	}
	return &AssistantPatchOperation{
		ID:              strings.TrimSpace(operation.ID),
		Type:            strings.TrimSpace(operation.Type),
		TargetID:        strings.TrimSpace(operation.TargetID),
		TargetLabel:     strings.TrimSpace(operation.TargetLabel),
		Before:          operation.Before,
		After:           operation.After,
		DataType:        normalizeAssistantPatchDataType(operation.DataType),
		Attrs:           operation.Attrs,
		Reason:          strings.TrimSpace(operation.Reason),
		Status:          strings.TrimSpace(operation.Status),
		AppliedTargetID: strings.TrimSpace(operation.AppliedTargetID),
	}
}

func normalizeAssistantPatchDataType(dataType string) string {
	switch strings.TrimSpace(dataType) {
	case "dom":
		return "dom"
	default:
		return "markdown"
	}
}

func assistantPatchPendingOperationCount(patch *AssistantEditPatch) int {
	if nil == patch || 1 > len(patch.Operations) {
		return 1
	}
	count := 0
	for _, operation := range patch.Operations {
		if nil == operation || "" == strings.TrimSpace(operation.Status) || "pending" == strings.TrimSpace(operation.Status) {
			count++
		}
	}
	if count < 1 {
		return 1
	}
	return count
}

func assistantPatchSecurityRisk(patch *AssistantEditPatch, operation *AssistantPatchOperation) AISecurityRiskLevel {
	operationRisk := AISecurityRiskL2
	switch operation.Type {
	case AssistantPatchOperationReplaceSelection, AssistantPatchOperationReplaceBlock, AssistantPatchOperationDeleteBlock, AssistantPatchOperationRenameNote, AssistantPatchOperationMoveNote:
		operationRisk = AISecurityRiskL3
	}
	patchRisk := normalizeAISecurityRiskLevel(AISecurityRiskLevel(strings.TrimSpace(patch.Risk)))
	if assistantPatchRiskOrder(patchRisk) > assistantPatchRiskOrder(operationRisk) {
		return patchRisk
	}
	return operationRisk
}

func assistantPatchRiskOrder(risk AISecurityRiskLevel) int {
	switch risk {
	case AISecurityRiskL1:
		return 1
	case AISecurityRiskL2:
		return 2
	case AISecurityRiskL3:
		return 3
	case AISecurityRiskL4:
		return 4
	case AISecurityRiskL5:
		return 5
	case AISecurityRiskL6:
		return 6
	default:
		return 3
	}
}

func assistantPatchOperationCapability(operation *AssistantPatchOperation) string {
	switch operation.Type {
	case AssistantPatchOperationCreateNote, AssistantPatchOperationCreateChildNote:
		return AISecurityCapabilityCreate
	case AssistantPatchOperationDeleteBlock:
		return AISecurityCapabilityDeleteBlock
	case AssistantPatchOperationMoveNote:
		return AISecurityCapabilityMove
	default:
		return AISecurityCapabilityWrite
	}
}

func applyAssistantPatchAppendNote(context *AssistantAINoteContext, operation *AssistantPatchOperation) (*AssistantPatchApplyResult, error) {
	content := strings.TrimSpace(operation.After)
	targetID := strings.TrimSpace(firstAssistantAINonEmpty(operation.TargetID, contextID(context)))
	if "" == targetID || "" == content {
		return nil, fmt.Errorf("append-note patch content is required")
	}
	targetBlock, err := ensureAssistantPatchNoteRootTarget(context, targetID)
	if nil != err {
		return nil, err
	}
	transactions, blockID, err := performAssistantPatchAppendContent(targetID, content, operation.DataType)
	if nil != err {
		return nil, err
	}
	appliedID := firstAssistantAINonEmpty(blockID, targetID)
	return &AssistantPatchApplyResult{
		AppliedTargetID: appliedID,
		Transactions:    transactions,
		Summary:         "applied append-note",
		Notebook:        strings.TrimSpace(targetBlock.Box),
		Path:            strings.TrimSpace(targetBlock.Path),
		HistorySnapshot: assistantOperationTransactionSnapshot(operation, transactions, targetID, appliedID, "", content, targetBlock.Box, targetBlock.Path),
	}, nil
}

func applyAssistantPatchInsertAfterBlock(context *AssistantAINoteContext, operation *AssistantPatchOperation) (*AssistantPatchApplyResult, error) {
	content := strings.TrimSpace(operation.After)
	targetID := strings.TrimSpace(firstAssistantAINonEmpty(operation.TargetID, contextCurrentBlockID(context), contextID(context)))
	if "" == targetID || "" == content {
		return nil, fmt.Errorf("insert-after-block patch target and content are required")
	}
	if targetID == contextID(context) {
		return applyAssistantPatchAppendNote(context, operation)
	}
	block, err := ensureAssistantPatchTargetBlock(context, targetID, false)
	if nil != err {
		return nil, err
	}
	transactions, blockID, err := performAssistantPatchInsertAfter(targetID, content, operation.DataType)
	if nil != err {
		return nil, err
	}
	appliedID := firstAssistantAINonEmpty(blockID, targetID)
	return &AssistantPatchApplyResult{
		AppliedTargetID: appliedID,
		Transactions:    transactions,
		Summary:         "applied insert-after-block",
		Notebook:        strings.TrimSpace(block.Box),
		Path:            strings.TrimSpace(block.Path),
		HistorySnapshot: assistantOperationTransactionSnapshot(operation, transactions, targetID, appliedID, "", content, block.Box, block.Path),
	}, nil
}

func applyAssistantPatchReplaceSelection(context *AssistantAINoteContext, operation *AssistantPatchOperation) (*AssistantPatchApplyResult, error) {
	targetID := strings.TrimSpace(firstAssistantAINonEmpty(operation.TargetID, contextCurrentBlockID(context)))
	before := operation.Before
	after := strings.TrimSpace(operation.After)
	if "" == targetID || "" == strings.TrimSpace(before) || "" == after {
		return nil, fmt.Errorf("replace-selection patch target, before and after are required")
	}
	if _, err := ensureAssistantPatchTargetBlock(context, targetID, false); nil != err {
		return nil, err
	}
	liveMarkdown := GetBlockKramdown(targetID, "")
	occurrences := assistantPatchTextOccurrences(liveMarkdown, before)
	if 1 != occurrences {
		if 1 < occurrences {
			return nil, fmt.Errorf("selected source appears multiple times in the target block")
		}
		return nil, fmt.Errorf("selected source no longer exists in the target block")
	}
	nextMarkdown := strings.Replace(assistantPatchNormalizeSourceText(liveMarkdown), assistantPatchNormalizeSourceText(before), after, 1)
	transactions, err := performAssistantPatchReplaceMarkdown(targetID, nextMarkdown)
	if nil != err {
		return nil, err
	}
	return &AssistantPatchApplyResult{
		AppliedTargetID: targetID,
		Transactions:    transactions,
		Summary:         "applied replace-selection",
		HistorySnapshot: assistantOperationTransactionSnapshot(operation, transactions, targetID, targetID, liveMarkdown, nextMarkdown, "", ""),
	}, nil
}

func applyAssistantPatchReplaceBlock(context *AssistantAINoteContext, operation *AssistantPatchOperation) (*AssistantPatchApplyResult, error) {
	targetID := strings.TrimSpace(firstAssistantAINonEmpty(operation.TargetID, contextCurrentBlockID(context)))
	before := strings.TrimSpace(operation.Before)
	after := strings.TrimSpace(operation.After)
	if "" == targetID || "" == before || "" == after {
		return nil, fmt.Errorf("replace-block patch target, before and after are required")
	}
	if _, err := ensureAssistantPatchTargetBlock(context, targetID, false); nil != err {
		return nil, err
	}
	if strings.TrimSpace(GetBlockKramdown(targetID, "")) != before {
		return nil, fmt.Errorf("target block changed; replacement was stopped")
	}
	transactions, err := performAssistantPatchReplaceMarkdown(targetID, after)
	if nil != err {
		return nil, err
	}
	return &AssistantPatchApplyResult{
		AppliedTargetID: targetID,
		Transactions:    transactions,
		Summary:         "applied replace-block",
		HistorySnapshot: assistantOperationTransactionSnapshot(operation, transactions, targetID, targetID, before, after, "", ""),
	}, nil
}

func applyAssistantPatchCreateNote(context *AssistantAINoteContext, operation *AssistantPatchOperation, child bool) (*AssistantPatchApplyResult, error) {
	markdown := strings.TrimSpace(operation.After)
	title := sanitizeAssistantAINoteTitle(firstAssistantAINonEmpty(operation.TargetLabel, operation.Reason, "AI Note"))
	if "" == contextNotebook(context) || "" == markdown {
		return nil, fmt.Errorf("create-note patch notebook and content are required")
	}
	parentID := ""
	hPath := path.Join("/AI", title)
	if child {
		parentID = strings.TrimSpace(firstAssistantAINonEmpty(operation.TargetID, contextID(context)))
		if parentID != contextID(context) {
			return nil, fmt.Errorf("create-child-note patch can only target the current note")
		}
		parentHPath, err := GetHPathByID(contextID(context))
		if nil != err {
			return nil, err
		}
		hPath = path.Join(parentHPath, title)
	}
	hPath = sanitizeAssistantAINotePath(hPath, title)
	id, err := CreateWithMarkdownSanitized("", contextNotebook(context), hPath, markdown, parentID, ast.NewNodeID(), false, "")
	if nil != err {
		return nil, err
	}
	FlushTxQueue()
	block := sql.GetBlock(id)
	resolvedPath := hPath
	if nil != block {
		resolvedPath = strings.TrimSpace(block.Path)
	}
	return &AssistantPatchApplyResult{
		AppliedTargetID: id,
		CreatedDoc:      true,
		Notebook:        contextNotebook(context),
		Path:            resolvedPath,
		Summary:         "applied create-note",
		HistorySnapshot: &AssistantOperationSnapshot{
			OperationType:   operation.Type,
			TargetID:        strings.TrimSpace(operation.TargetID),
			AppliedTargetID: id,
			After:           markdown,
			DataType:        normalizeAssistantPatchDataType(operation.DataType),
			Notebook:        contextNotebook(context),
			Path:            hPath,
			ParentID:        parentID,
			TitleAfter:      title,
			CreatedDoc:      true,
		},
	}, nil
}

func applyAssistantPatchDeleteBlock(context *AssistantAINoteContext, operation *AssistantPatchOperation) (*AssistantPatchApplyResult, error) {
	targetID := strings.TrimSpace(firstAssistantAINonEmpty(operation.TargetID, contextCurrentBlockID(context)))
	if "" == targetID {
		return nil, fmt.Errorf("delete-block patch target is required")
	}
	if _, err := ensureAssistantPatchTargetBlock(context, targetID, false); nil != err {
		return nil, err
	}
	before := GetBlockKramdown(targetID, "")
	transactions := []*Transaction{{
		DoOperations: []*Operation{{
			Action: "delete",
			ID:     targetID,
		}},
	}}
	PerformTransactions(&transactions)
	FlushTxQueue()
	return &AssistantPatchApplyResult{
		AppliedTargetID: targetID,
		Transactions:    transactions,
		Summary:         "applied delete-block",
		HistorySnapshot: assistantOperationTransactionSnapshot(operation, transactions, targetID, targetID, before, "", "", ""),
	}, nil
}

func applyAssistantPatchRenameNote(context *AssistantAINoteContext, operation *AssistantPatchOperation) (*AssistantPatchApplyResult, error) {
	targetID := strings.TrimSpace(firstAssistantAINonEmpty(operation.TargetID, contextID(context)))
	title := sanitizeAssistantAINoteTitle(firstAssistantAINonEmpty(operation.After, operation.TargetLabel))
	if "" == targetID || "" == title || targetID != contextID(context) {
		return nil, fmt.Errorf("rename-note patch can only target the current note")
	}
	tree, err := LoadTreeByBlockID(targetID)
	if nil != err {
		return nil, err
	}
	oldTitle := strings.TrimSpace(tree.Root.IALAttr("title"))
	if err = RenameDoc(tree.Box, tree.Path, title); nil != err {
		return nil, err
	}
	return &AssistantPatchApplyResult{
		AppliedTargetID: targetID,
		Notebook:        tree.Box,
		Path:            tree.Path,
		Summary:         "applied rename-note",
		HistorySnapshot: &AssistantOperationSnapshot{
			OperationType:   operation.Type,
			TargetID:        targetID,
			AppliedTargetID: targetID,
			Notebook:        tree.Box,
			Path:            tree.Path,
			TitleBefore:     oldTitle,
			TitleAfter:      title,
		},
	}, nil
}

func applyAssistantPatchMoveNote(context *AssistantAINoteContext, operation *AssistantPatchOperation) (*AssistantPatchApplyResult, error) {
	noteID := strings.TrimSpace(firstAssistantAINonEmpty(operation.TargetID, contextID(context)))
	toNotebook := getAssistantAIStringValue(operation.Attrs, "toNotebook", "")
	toPath := getAssistantAIStringValue(operation.Attrs, "toPath", "")
	if "" == noteID || "" == toNotebook {
		return nil, fmt.Errorf("move-note patch needs a note root ID plus toNotebook/toPath attrs")
	}
	plan, err := resolveAssistantAIMoveNotePlan(noteID, toNotebook, toPath)
	if nil != err {
		return nil, err
	}
	newPath, err := performAssistantAIMoveNote(plan)
	if nil != err {
		return nil, err
	}
	return &AssistantPatchApplyResult{
		AppliedTargetID: plan.NoteID,
		Notebook:        plan.ToBox,
		Path:            newPath,
		Summary:         "applied move-note",
		HistorySnapshot: &AssistantOperationSnapshot{
			OperationType:   operation.Type,
			TargetID:        plan.NoteID,
			AppliedTargetID: plan.NoteID,
			Before:          assistantAIMoveNotePlanLabel(plan.FromBoxName, plan.FromHPath, plan.FromPath),
			After:           assistantAIMoveNotePlanLabel(plan.ToBoxName, plan.ToHPath, newPath),
			Notebook:        plan.ToBox,
			Path:            newPath,
			TitleBefore:     plan.Title,
			TitleAfter:      plan.Title,
		},
	}, nil
}

// assistantAIMoveNotePlan 是一次笔记移动的已校验计划，工具执行与 patch apply 共用，
// 保证“移动到目标路径”只有一套校验与落盘语义。
type assistantAIMoveNotePlan struct {
	NoteID        string
	Title         string
	FromBox       string
	FromBoxName   string
	FromPath      string // 源文档 .sf 存储路径
	FromHPath     string
	ToBox         string
	ToBoxName     string
	ToParentPath  string // 目标父文档存储路径，根目录为 "/"
	ToParentHPath string
	ToHPath       string // 移动后文档的完整可读路径
}

// resolveAssistantAIMoveNotePlan 校验并归一化一次移动：noteID 必须是有效笔记根，
// 目标笔记本与路径必须存在，禁止移入自身/子文档，目标存在同名文档时失败关闭。
func resolveAssistantAIMoveNotePlan(noteID, toNotebook, toPath string) (*assistantAIMoveNotePlan, error) {
	noteID = strings.TrimSpace(noteID)
	toNotebook = strings.TrimSpace(toNotebook)
	if "" == noteID || "" == toNotebook {
		return nil, fmt.Errorf("moving a note needs both the note ID and the target notebook")
	}
	tree, err := LoadTreeByBlockID(noteID)
	if nil != err {
		return nil, fmt.Errorf("note to move [%s] was not found", noteID)
	}
	if tree.ID != noteID {
		return nil, fmt.Errorf("[%s] is not a note root; moving requires the note root ID", noteID)
	}
	fromBox := Conf.Box(tree.Box)
	if nil == fromBox {
		return nil, fmt.Errorf("notebook [%s] of the note to move was not found", tree.Box)
	}
	toBox := resolveAssistantAIMoveTargetBox(toNotebook)
	if nil == toBox {
		return nil, fmt.Errorf("target notebook [%s] was not found", toNotebook)
	}
	toParentPath, err := normalizeAssistantAIMoveTargetPath(toBox, toPath)
	if nil != err {
		return nil, err
	}
	// MoveDocs 对“移入自身子文档”会静默跳过，这里必须提前显式拒绝，保持失败关闭
	fromDir := strings.TrimSuffix(tree.Path, ".sf")
	if "" == fromDir || "/" == fromDir {
		return nil, fmt.Errorf("cannot move the notebook root")
	}
	toParentDir := strings.TrimSuffix(toParentPath, ".sf")
	if toParentPath == tree.Path || toParentDir == fromDir || strings.HasPrefix(toParentDir, fromDir+"/") {
		return nil, fmt.Errorf("cannot move a note into itself or its own subdocuments")
	}
	toParentHPath := ""
	if "/" != toParentPath {
		if !toBox.Exist(toParentPath) {
			return nil, fmt.Errorf("target path [%s] does not exist in notebook [%s]", toParentPath, toBox.Name)
		}
		toParentTree, loadErr := filesys.LoadTree(toBox.ID, toParentPath, util.NewLute())
		if nil != loadErr || nil == toParentTree {
			return nil, fmt.Errorf("target path [%s] in notebook [%s] is not a readable document", toParentPath, toBox.Name)
		}
		toParentHPath = toParentTree.HPath
	}
	title := strings.TrimSpace(tree.Root.IALAttr("title"))
	if "" == title {
		title = util.GetTreeID(tree.Path)
	}
	toHPath := path.Join(toParentHPath, title)
	// 目标已有同名文档时明确失败，不静默改名
	for _, bt := range treenode.GetBlockTreeRootsByHPath(toBox.ID, toHPath) {
		if nil != bt && bt.ID != tree.ID {
			return nil, fmt.Errorf("a document named [%s] already exists at the target location", toHPath)
		}
	}
	return &assistantAIMoveNotePlan{
		NoteID:        noteID,
		Title:         title,
		FromBox:       fromBox.ID,
		FromBoxName:   fromBox.Name,
		FromPath:      tree.Path,
		FromHPath:     tree.HPath,
		ToBox:         toBox.ID,
		ToBoxName:     toBox.Name,
		ToParentPath:  toParentPath,
		ToParentHPath: toParentHPath,
		ToHPath:       toHPath,
	}, nil
}

// performAssistantAIMoveNote 是移动笔记的唯一底层落盘函数，内部走既有 MoveDocs 文件树安全实现。
func performAssistantAIMoveNote(plan *assistantAIMoveNotePlan) (newPath string, err error) {
	if nil == plan || "" == plan.NoteID || "" == plan.FromPath || "" == plan.ToBox {
		return "", fmt.Errorf("move-note plan is incomplete")
	}
	if err = MoveDocs([]string{plan.FromPath}, plan.ToBox, plan.ToParentPath, nil); nil != err {
		return "", err
	}
	FlushTxQueue()
	bt := treenode.GetBlockTree(plan.NoteID)
	if nil == bt || "" == strings.TrimSpace(bt.Path) {
		return "", fmt.Errorf("moved note [%s] cannot be located after the move", plan.NoteID)
	}
	return bt.Path, nil
}

// normalizeAssistantAIMoveTargetPath 把 AI 给出的目标父路径归一化为笔记本内的 .sf 存储路径，
// 空字符串与 "/" 都表示笔记本根目录；拒绝越界路径并要求目标必须是已存在的文档。
func normalizeAssistantAIMoveTargetPath(toBox *Box, toPath string) (string, error) {
	toPath = strings.TrimSpace(strings.ReplaceAll(toPath, "\\", "/"))
	if "" == toPath || "/" == toPath {
		return "/", nil
	}
	toPath = strings.TrimSuffix(toPath, "/")
	rel, err := util.CleanRelativePath(toPath)
	if nil != err {
		return "", fmt.Errorf("unsafe target path [%s]: %v", toPath, err)
	}
	if "" == rel {
		return "/", nil
	}
	if !strings.HasSuffix(rel, ".sf") {
		rel += ".sf"
	}
	// 笔记本边界校验：归一化后的路径必须仍然落在目标笔记本目录内
	if _, err = util.ResolvePathUnder(filepath.Join(util.DataDir, toBox.ID), rel); nil != err {
		return "", fmt.Errorf("unsafe target path [%s]: %v", toPath, err)
	}
	return "/" + rel, nil
}

// resolveAssistantAIMoveTargetBox 支持按笔记本 ID 或名称指定目标笔记本。
func resolveAssistantAIMoveTargetBox(toNotebook string) *Box {
	if box := Conf.Box(toNotebook); nil != box {
		return box
	}
	for _, box := range Conf.GetOpenedBoxes() {
		if box.Name == toNotebook {
			return box
		}
	}
	return nil
}

func assistantAIMoveNotePlanLabel(boxName, hPath, docPath string) string {
	label := strings.TrimSpace(boxName + " " + hPath)
	if "" != strings.TrimSpace(docPath) {
		label += " (" + strings.TrimSpace(docPath) + ")"
	}
	return label
}

func applyAssistantPatchSetAttrs(context *AssistantAINoteContext, operation *AssistantPatchOperation) (*AssistantPatchApplyResult, error) {
	targetID := strings.TrimSpace(firstAssistantAINonEmpty(operation.TargetID, contextCurrentBlockID(context), contextID(context)))
	if "" == targetID {
		return nil, fmt.Errorf("set-attrs patch target is required")
	}
	if _, err := ensureAssistantPatchTargetBlock(context, targetID, true); nil != err {
		return nil, err
	}
	attrs := normalizeAssistantPatchAttrs(operation.Attrs, operation.After)
	if 1 > len(attrs) {
		return nil, fmt.Errorf("set-attrs patch attrs are required")
	}
	oldAttrs := assistantOperationPickAttrs(sql.GetBlockAttrs(targetID), attrs)
	if err := SetBlockAttrs(targetID, attrs); nil != err {
		return nil, err
	}
	return &AssistantPatchApplyResult{
		AppliedTargetID: targetID,
		Summary:         "applied set-attrs",
		HistorySnapshot: &AssistantOperationSnapshot{
			OperationType:   operation.Type,
			TargetID:        targetID,
			AppliedTargetID: targetID,
			AttrsBefore:     oldAttrs,
			AttrsAfter:      attrs,
		},
	}, nil
}

func normalizeAssistantPatchAttrs(attrs map[string]interface{}, fallback string) map[string]string {
	ret := map[string]string{}
	for key, value := range attrs {
		key = strings.TrimSpace(key)
		if "" == key {
			continue
		}
		if nil == value {
			ret[key] = ""
			continue
		}
		ret[key] = strings.TrimSpace(fmt.Sprint(value))
	}
	if 0 < len(ret) || "" == strings.TrimSpace(fallback) {
		return ret
	}
	parsed := map[string]interface{}{}
	if err := gulu.JSON.UnmarshalJSON([]byte(fallback), &parsed); nil != err {
		return ret
	}
	for key, value := range parsed {
		key = strings.TrimSpace(key)
		if "" == key {
			continue
		}
		if nil == value {
			ret[key] = ""
			continue
		}
		ret[key] = strings.TrimSpace(fmt.Sprint(value))
	}
	return ret
}

func ensureAssistantPatchTargetBlock(context *AssistantAINoteContext, blockID string, allowRoot bool) (*sql.Block, error) {
	blockID = strings.TrimSpace(blockID)
	if "" == blockID {
		return nil, fmt.Errorf("patch target block ID is required")
	}
	block := sql.GetBlock(blockID)
	if nil == block {
		return nil, fmt.Errorf("patch target block was not found")
	}
	if strings.TrimSpace(block.RootID) != contextID(context) {
		return nil, fmt.Errorf("patch target is outside the current note")
	}
	if "" != contextNotebook(context) && "" != strings.TrimSpace(block.Box) && strings.TrimSpace(block.Box) != contextNotebook(context) {
		return nil, fmt.Errorf("patch target is outside the current notebook")
	}
	if !allowRoot && strings.TrimSpace(block.ID) == strings.TrimSpace(block.RootID) {
		return nil, fmt.Errorf("patch operation cannot modify the whole note root")
	}
	return block, nil
}

func ensureAssistantPatchNoteRootTarget(context *AssistantAINoteContext, blockID string) (*sql.Block, error) {
	blockID = strings.TrimSpace(blockID)
	if "" == blockID {
		return nil, fmt.Errorf("append-note patch target note ID is required")
	}
	block := sql.GetBlock(blockID)
	if nil == block {
		return nil, fmt.Errorf("append-note patch target note was not found")
	}
	if strings.TrimSpace(block.ID) != strings.TrimSpace(block.RootID) {
		return nil, fmt.Errorf("append-note patch target must be a note root")
	}
	if "" != contextNotebook(context) && "" != strings.TrimSpace(block.Box) && strings.TrimSpace(block.Box) != contextNotebook(context) {
		return nil, fmt.Errorf("append-note patch target is outside the current notebook")
	}
	return block, nil
}

func performAssistantPatchAppendContent(parentID, content string, dataType string) ([]*Transaction, string, error) {
	luteEngine := util.NewLute()
	data, err := assistantPatchBlockDOM(content, dataType, luteEngine)
	if nil != err {
		return nil, "", err
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
	return transactions, firstAssistantPatchOperationID(transactions), nil
}

func performAssistantPatchInsertAfter(blockID, content string, dataType string) ([]*Transaction, string, error) {
	luteEngine := util.NewLute()
	data, err := assistantPatchBlockDOM(content, dataType, luteEngine)
	if nil != err {
		return nil, "", err
	}
	parentID, _, nextID, idsErr := GetBlockRelevantIDs(blockID)
	if nil != idsErr {
		return nil, "", idsErr
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
	return transactions, firstAssistantPatchOperationID(transactions), nil
}

func assistantPatchBlockDOM(content string, dataType string, luteEngine *lute.Lute) (string, error) {
	if strings.TrimSpace(dataType) == "dom" {
		data := strings.TrimSpace(content)
		if "" == data {
			return "", fmt.Errorf("assistant patch DOM content is required")
		}
		return data, nil
	}
	return dataBlockDOMForAssistant(content, luteEngine)
}

func performAssistantPatchReplaceMarkdown(blockID, markdown string) ([]*Transaction, error) {
	luteEngine := util.NewLute()
	data, err := dataBlockDOMForAssistant(markdown, luteEngine)
	if nil != err {
		return nil, err
	}
	tree := luteEngine.BlockDOM2Tree(data)
	if nil == tree || nil == tree.Root || nil == tree.Root.FirstChild {
		return nil, fmt.Errorf("parse tree failed")
	}
	if "NodeList" == tree.Root.FirstChild.Type.String() && nil != tree.Root.FirstChild.FirstChild {
		tree.Root.AppendChild(tree.Root.FirstChild.FirstChild)
		tree.Root.FirstChild.Unlink()
		tree.Root.FirstChild.Unlink()
	}
	if nil != tree.Root.FirstChild {
		tree.Root.FirstChild.SetIALAttr("id", strings.TrimSpace(blockID))
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
	return transactions, nil
}

func firstAssistantPatchOperationID(transactions []*Transaction) string {
	for _, transaction := range transactions {
		for _, operation := range transaction.DoOperations {
			if "" != strings.TrimSpace(operation.ID) {
				return strings.TrimSpace(operation.ID)
			}
			if "" != strings.TrimSpace(operation.BlockID) {
				return strings.TrimSpace(operation.BlockID)
			}
		}
	}
	return ""
}

// assistantPatchZeroWidthPattern 匹配选区文本中常见的零宽字符（DOM 渲染产物），
// 计数与替换前必须双端归一化，否则内联改写永远无法命中实时原文。
var assistantPatchZeroWidthPattern = regexp.MustCompile(`[\x{200B}\x{200C}\x{200D}\x{FEFF}]`)

func assistantPatchNormalizeSourceText(text string) string {
	return assistantPatchZeroWidthPattern.ReplaceAllString(text, "")
}

func assistantPatchTextOccurrences(text, needle string) int {
	if "" == needle {
		return 0
	}
	text = assistantPatchNormalizeSourceText(text)
	needle = assistantPatchNormalizeSourceText(needle)
	count := 0
	start := 0
	for {
		index := strings.Index(text[start:], needle)
		if index < 0 {
			break
		}
		count++
		start += index + len(needle)
	}
	return count
}
