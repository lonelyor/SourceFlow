package model

import (
	"fmt"
	"path"
	"strings"

	sql "github.com/lonelyor/sourceflow/kernel/sql"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
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
	Attrs           map[string]interface{} `json:"attrs,omitempty"`
	Reason          string                 `json:"reason,omitempty"`
	Status          string                 `json:"status,omitempty"`
	AppliedTargetID string                 `json:"appliedTargetId,omitempty"`
}

type AssistantPatchApplyRequest struct {
	Patch        *AssistantEditPatch      `json:"patch"`
	Operation    *AssistantPatchOperation `json:"operation"`
	Context      *AssistantAINoteContext  `json:"context"`
	SecurityMode AISecurityMode           `json:"securityMode"`
	AllowOnce    bool                     `json:"allowOnce"`
}

type AssistantPatchApplyResult struct {
	AppliedTargetID string                      `json:"appliedTargetId,omitempty"`
	RequiresConfirm bool                        `json:"requiresConfirm,omitempty"`
	Security        *AISecurityPermissionResult `json:"security,omitempty"`
	Summary         string                      `json:"summary,omitempty"`
	Transactions    []*Transaction              `json:"transactions,omitempty"`
	CreatedDoc      bool                        `json:"createdDoc,omitempty"`
	Notebook        string                      `json:"notebook,omitempty"`
	Path            string                      `json:"path,omitempty"`
}

func ApplyAssistantPatchOperation(req *AssistantPatchApplyRequest) (*AssistantPatchApplyResult, error) {
	if nil == req || nil == req.Patch || nil == req.Operation {
		return nil, fmt.Errorf("assistant patch and operation are required")
	}
	context := cloneAssistantAINoteContext(req.Context)
	if nil == context || "" == contextID(context) {
		return nil, fmt.Errorf("current note context is unavailable")
	}
	operation := normalizeAssistantPatchOperation(req.Operation)
	if "" == operation.Type {
		return nil, fmt.Errorf("assistant patch operation type is required")
	}

	security := CheckAISecurityPermissionForRequest(&AISecurityPermissionRequest{
		Mode:              req.SecurityMode,
		Risk:              assistantPatchSecurityRisk(req.Patch, operation),
		TargetType:        "note",
		TargetIDs:         []string{contextID(context)},
		SessionBatchCount: assistantPatchPendingOperationCount(req.Patch),
		Capability:        assistantPatchOperationCapability(operation),
	})
	if nil == security {
		return nil, fmt.Errorf("AI security decision is unavailable")
	}
	if security.Decision == AISecurityDeny && (!security.Escalatable || !req.AllowOnce) {
		return &AssistantPatchApplyResult{RequiresConfirm: security.Escalatable, Security: security}, nil
	}
	if security.Decision == AISecurityConfirm && !req.AllowOnce {
		return &AssistantPatchApplyResult{RequiresConfirm: true, Security: security}, nil
	}

	switch operation.Type {
	case AssistantPatchOperationInsertAfterBlock:
		return applyAssistantPatchInsertAfterBlock(context, operation)
	case AssistantPatchOperationAppendNote:
		return applyAssistantPatchAppendNote(context, operation)
	case AssistantPatchOperationReplaceSelection:
		return applyAssistantPatchReplaceSelection(context, operation)
	case AssistantPatchOperationReplaceBlock:
		return applyAssistantPatchReplaceBlock(context, operation)
	case AssistantPatchOperationCreateNote:
		return applyAssistantPatchCreateNote(context, operation, false)
	case AssistantPatchOperationCreateChildNote:
		return applyAssistantPatchCreateNote(context, operation, true)
	case AssistantPatchOperationDeleteBlock:
		return applyAssistantPatchDeleteBlock(context, operation)
	case AssistantPatchOperationRenameNote:
		return applyAssistantPatchRenameNote(context, operation)
	case AssistantPatchOperationSetAttrs:
		return applyAssistantPatchSetAttrs(context, operation)
	default:
		return nil, fmt.Errorf("unsupported assistant patch operation [%s]", operation.Type)
	}
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
		Attrs:           operation.Attrs,
		Reason:          strings.TrimSpace(operation.Reason),
		Status:          strings.TrimSpace(operation.Status),
		AppliedTargetID: strings.TrimSpace(operation.AppliedTargetID),
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
	markdown := strings.TrimSpace(operation.After)
	if "" == markdown {
		return nil, fmt.Errorf("append-note patch content is required")
	}
	transactions, blockID, err := performAssistantPatchAppendMarkdown(contextID(context), markdown)
	if nil != err {
		return nil, err
	}
	return &AssistantPatchApplyResult{AppliedTargetID: firstAssistantAINonEmpty(blockID, contextID(context)), Transactions: transactions, Summary: "applied append-note"}, nil
}

func applyAssistantPatchInsertAfterBlock(context *AssistantAINoteContext, operation *AssistantPatchOperation) (*AssistantPatchApplyResult, error) {
	markdown := strings.TrimSpace(operation.After)
	targetID := strings.TrimSpace(firstAssistantAINonEmpty(operation.TargetID, contextCurrentBlockID(context), contextID(context)))
	if "" == targetID || "" == markdown {
		return nil, fmt.Errorf("insert-after-block patch target and content are required")
	}
	if targetID == contextID(context) {
		return applyAssistantPatchAppendNote(context, operation)
	}
	block, err := ensureAssistantPatchTargetBlock(context, targetID, false)
	if nil != err {
		return nil, err
	}
	transactions, blockID, err := performAssistantPatchInsertAfter(targetID, markdown)
	if nil != err {
		return nil, err
	}
	return &AssistantPatchApplyResult{
		AppliedTargetID: firstAssistantAINonEmpty(blockID, targetID),
		Transactions:    transactions,
		Summary:         "applied insert-after-block",
		Notebook:        strings.TrimSpace(block.Box),
		Path:            strings.TrimSpace(block.Path),
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
	return &AssistantPatchApplyResult{AppliedTargetID: targetID, Transactions: transactions, Summary: "applied replace-selection"}, nil
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
	return &AssistantPatchApplyResult{AppliedTargetID: targetID, Transactions: transactions, Summary: "applied replace-block"}, nil
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
	transactions := []*Transaction{{
		DoOperations: []*Operation{{
			Action: "delete",
			ID:     targetID,
		}},
	}}
	PerformTransactions(&transactions)
	FlushTxQueue()
	return &AssistantPatchApplyResult{AppliedTargetID: targetID, Transactions: transactions, Summary: "applied delete-block"}, nil
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
	if err = RenameDoc(tree.Box, tree.Path, title); nil != err {
		return nil, err
	}
	return &AssistantPatchApplyResult{AppliedTargetID: targetID, Notebook: tree.Box, Path: tree.Path, Summary: "applied rename-note"}, nil
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
	if err := SetBlockAttrs(targetID, attrs); nil != err {
		return nil, err
	}
	return &AssistantPatchApplyResult{AppliedTargetID: targetID, Summary: "applied set-attrs"}, nil
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

func performAssistantPatchAppendMarkdown(parentID, markdown string) ([]*Transaction, string, error) {
	luteEngine := util.NewLute()
	data, err := dataBlockDOMForAssistant(markdown, luteEngine)
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

func performAssistantPatchInsertAfter(blockID, markdown string) ([]*Transaction, string, error) {
	luteEngine := util.NewLute()
	data, err := dataBlockDOMForAssistant(markdown, luteEngine)
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
