package model

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"path"
	"strings"

	sql "github.com/lonelyor/sourceflow/kernel/sql"
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
	case AssistantPatchOperationReplaceSelection, AssistantPatchOperationReplaceBlock, AssistantPatchOperationDeleteBlock, AssistantPatchOperationRenameNote:
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
	nextMarkdown := strings.Replace(liveMarkdown, before, after, 1)
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

func assistantPatchTextOccurrences(text, needle string) int {
	if "" == needle {
		return 0
	}
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
