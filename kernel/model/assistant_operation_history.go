package model

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	sql "github.com/lonelyor/sourceflow/kernel/sql"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/filelock"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
)

const assistantOperationHistoryLimit = 200

type AssistantOperationHistoryStatus string

const (
	AssistantOperationHistoryApplied       AssistantOperationHistoryStatus = "applied"
	AssistantOperationHistoryReverted      AssistantOperationHistoryStatus = "reverted"
	AssistantOperationHistoryReapplied     AssistantOperationHistoryStatus = "reapplied"
	AssistantOperationHistoryFailed        AssistantOperationHistoryStatus = "failed"
	AssistantOperationHistoryRevertFailed  AssistantOperationHistoryStatus = "revert-failed"
	AssistantOperationHistoryReapplyFailed AssistantOperationHistoryStatus = "reapply-failed"
)

type AssistantPatchAudit struct {
	SessionID   string `json:"sessionId,omitempty"`
	ProfileID   string `json:"profileId,omitempty"`
	TargetLabel string `json:"targetLabel,omitempty"`
}

type AssistantOperationSnapshot struct {
	OperationType   string            `json:"operationType"`
	TargetID        string            `json:"targetId,omitempty"`
	AppliedTargetID string            `json:"appliedTargetId,omitempty"`
	Before          string            `json:"before,omitempty"`
	After           string            `json:"after,omitempty"`
	DataType        string            `json:"dataType,omitempty"`
	AttrsBefore     map[string]string `json:"attrsBefore,omitempty"`
	AttrsAfter      map[string]string `json:"attrsAfter,omitempty"`
	Notebook        string            `json:"notebook,omitempty"`
	Path            string            `json:"path,omitempty"`
	ParentID        string            `json:"parentId,omitempty"`
	TitleBefore     string            `json:"titleBefore,omitempty"`
	TitleAfter      string            `json:"titleAfter,omitempty"`
	CreatedDoc      bool              `json:"createdDoc,omitempty"`
	DoOperations    []*Operation      `json:"doOperations,omitempty"`
	UndoOperations  []*Operation      `json:"undoOperations,omitempty"`
}

type AssistantOperationHistoryResult struct {
	OperationID     string `json:"operationId"`
	Type            string `json:"type"`
	Status          string `json:"status"`
	TargetID        string `json:"targetId,omitempty"`
	AppliedTargetID string `json:"appliedTargetId,omitempty"`
}

type AssistantOperationHistoryItem struct {
	ID            string                             `json:"id"`
	PatchID       string                             `json:"patchId,omitempty"`
	OperationID   string                             `json:"operationId,omitempty"`
	OperationType string                             `json:"operationType,omitempty"`
	Patch         *AssistantEditPatch                `json:"patch"`
	Status        AssistantOperationHistoryStatus    `json:"status"`
	Source        string                             `json:"source"`
	Risk          string                             `json:"risk"`
	SessionID     string                             `json:"sessionId,omitempty"`
	ProfileID     string                             `json:"profileId,omitempty"`
	TargetID      string                             `json:"targetId,omitempty"`
	TargetLabel   string                             `json:"targetLabel,omitempty"`
	Notebook      string                             `json:"notebook,omitempty"`
	Path          string                             `json:"path,omitempty"`
	Snapshot      *AssistantOperationSnapshot        `json:"snapshot,omitempty"`
	Results       []*AssistantOperationHistoryResult `json:"results"`
	Error         string                             `json:"error,omitempty"`
	CreatedAt     int64                              `json:"createdAt"`
	UpdatedAt     int64                              `json:"updatedAt"`
}

type AssistantHistoryListRequest struct {
	Limit int `json:"limit"`
}

type AssistantHistoryIDRequest struct {
	ID string `json:"id"`
}

type AssistantExplicitSaveHistoryRequest struct {
	Source      string `json:"source"`
	Summary     string `json:"summary"`
	NoteID      string `json:"noteId"`
	TargetLabel string `json:"targetLabel,omitempty"`
	SessionID   string `json:"sessionId,omitempty"`
	ProfileID   string `json:"profileId,omitempty"`
	Risk        string `json:"risk,omitempty"`
	Markdown    string `json:"markdown,omitempty"`
	Notebook    string `json:"notebook,omitempty"`
	Path        string `json:"path,omitempty"`
}

type AssistantOperationHistoryApplyResult struct {
	Item         *AssistantOperationHistoryItem `json:"item,omitempty"`
	Transactions []*Transaction                 `json:"transactions,omitempty"`
	CreatedDoc   bool                           `json:"createdDoc,omitempty"`
	Notebook     string                         `json:"notebook,omitempty"`
	Path         string                         `json:"path,omitempty"`
}

var assistantOperationHistoryLock sync.Mutex

func assistantOperationHistoryPath() string {
	return filepath.Join(util.DataDir, "storage", "assistant_operation_history.json")
}

func ListAssistantOperationHistory(limit int) []*AssistantOperationHistoryItem {
	assistantOperationHistoryLock.Lock()
	defer assistantOperationHistoryLock.Unlock()
	items := readAssistantOperationHistoryLocked()
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if len(items) > limit {
		items = items[:limit]
	}
	return cloneAssistantOperationHistoryItems(items)
}

func RecordAssistantPatchOperationHistory(req *AssistantPatchApplyRequest, operation *AssistantPatchOperation, result *AssistantPatchApplyResult) (*AssistantOperationHistoryItem, error) {
	if nil == req || nil == req.Patch || nil == operation || nil == result || nil == result.HistorySnapshot {
		return nil, nil
	}
	snapshot := normalizeAssistantOperationSnapshot(result.HistorySnapshot, operation, result)
	patch := cloneAssistantHistoryPatch(req.Patch, operation)
	now := util.CurrentTimeMillis()
	item := &AssistantOperationHistoryItem{
		ID:            astHistoryID("aihist", now),
		PatchID:       strings.TrimSpace(req.Patch.ID),
		OperationID:   strings.TrimSpace(operation.ID),
		OperationType: strings.TrimSpace(operation.Type),
		Patch:         patch,
		Status:        AssistantOperationHistoryApplied,
		Source:        strings.TrimSpace(req.Patch.Source),
		Risk:          strings.TrimSpace(req.Patch.Risk),
		SessionID:     strings.TrimSpace(req.AuditSessionID()),
		ProfileID:     strings.TrimSpace(req.AuditProfileID()),
		TargetID:      firstAssistantAINonEmpty(snapshot.AppliedTargetID, snapshot.TargetID, operation.TargetID),
		TargetLabel:   firstAssistantAINonEmpty(req.AuditTargetLabel(), operation.TargetLabel, req.Patch.Summary),
		Notebook:      firstAssistantAINonEmpty(snapshot.Notebook, result.Notebook),
		Path:          firstAssistantAINonEmpty(snapshot.Path, result.Path),
		Snapshot:      snapshot,
		Results: []*AssistantOperationHistoryResult{{
			OperationID:     strings.TrimSpace(operation.ID),
			Type:            strings.TrimSpace(operation.Type),
			Status:          "accepted",
			TargetID:        strings.TrimSpace(operation.TargetID),
			AppliedTargetID: strings.TrimSpace(result.AppliedTargetID),
		}},
		CreatedAt: now,
		UpdatedAt: now,
	}
	return addAssistantOperationHistoryItem(item)
}

func RecordAssistantExplicitSaveHistory(req *AssistantExplicitSaveHistoryRequest) (*AssistantOperationHistoryItem, error) {
	if nil == req || "" == strings.TrimSpace(req.NoteID) {
		return nil, fmt.Errorf("assistant explicit save note ID is required")
	}
	now := util.CurrentTimeMillis()
	summary := firstAssistantAINonEmpty(req.Summary, "AI 保存内容")
	operation := &AssistantPatchOperation{
		ID:              astHistoryID("explicit-op", now),
		Type:            AssistantPatchOperationCreateNote,
		TargetID:        strings.TrimSpace(req.NoteID),
		TargetLabel:     firstAssistantAINonEmpty(req.TargetLabel, summary),
		After:           req.Markdown,
		Status:          "accepted",
		AppliedTargetID: strings.TrimSpace(req.NoteID),
	}
	patch := &AssistantEditPatch{
		ID:         astHistoryID("explicit-save", now),
		Source:     firstAssistantAINonEmpty(req.Source, "dock"),
		Target:     "note",
		Risk:       firstAssistantAINonEmpty(req.Risk, "L2"),
		Summary:    summary,
		Operations: []*AssistantPatchOperation{operation},
		CreatedAt:  now,
	}
	snapshot := &AssistantOperationSnapshot{
		OperationType:   operation.Type,
		TargetID:        strings.TrimSpace(req.NoteID),
		AppliedTargetID: strings.TrimSpace(req.NoteID),
		After:           req.Markdown,
		DataType:        "markdown",
		Notebook:        strings.TrimSpace(req.Notebook),
		Path:            strings.TrimSpace(req.Path),
		TitleAfter:      firstAssistantAINonEmpty(req.TargetLabel, summary),
		CreatedDoc:      true,
	}
	if block := sql.GetBlock(strings.TrimSpace(req.NoteID)); nil != block {
		snapshot.Notebook = firstAssistantAINonEmpty(snapshot.Notebook, block.Box)
		snapshot.Path = firstAssistantAINonEmpty(snapshot.Path, block.Path)
	}
	item := &AssistantOperationHistoryItem{
		ID:            astHistoryID("aihist", now),
		PatchID:       patch.ID,
		OperationID:   operation.ID,
		OperationType: operation.Type,
		Patch:         patch,
		Status:        AssistantOperationHistoryApplied,
		Source:        patch.Source,
		Risk:          patch.Risk,
		SessionID:     strings.TrimSpace(req.SessionID),
		ProfileID:     strings.TrimSpace(req.ProfileID),
		TargetID:      strings.TrimSpace(req.NoteID),
		TargetLabel:   firstAssistantAINonEmpty(req.TargetLabel, summary),
		Notebook:      snapshot.Notebook,
		Path:          snapshot.Path,
		Snapshot:      snapshot,
		Results: []*AssistantOperationHistoryResult{{
			OperationID:     operation.ID,
			Type:            operation.Type,
			Status:          "accepted",
			TargetID:        strings.TrimSpace(req.NoteID),
			AppliedTargetID: strings.TrimSpace(req.NoteID),
		}},
		CreatedAt: now,
		UpdatedAt: now,
	}
	return addAssistantOperationHistoryItem(item)
}

func RevertAssistantOperationHistory(id string) (*AssistantOperationHistoryApplyResult, error) {
	return applyAssistantOperationHistory(id, true)
}

func ReapplyAssistantOperationHistory(id string) (*AssistantOperationHistoryApplyResult, error) {
	return applyAssistantOperationHistory(id, false)
}

func applyAssistantOperationHistory(id string, revert bool) (*AssistantOperationHistoryApplyResult, error) {
	assistantOperationHistoryLock.Lock()
	defer assistantOperationHistoryLock.Unlock()
	items := readAssistantOperationHistoryLocked()
	index := assistantOperationHistoryIndex(items, id)
	if index < 0 {
		return nil, fmt.Errorf("assistant operation history was not found")
	}
	item := items[index]
	if revert {
		if item.Status != AssistantOperationHistoryApplied && item.Status != AssistantOperationHistoryReapplied {
			return nil, fmt.Errorf("assistant operation cannot be reverted from status [%s]", item.Status)
		}
	} else if item.Status != AssistantOperationHistoryReverted {
		return nil, fmt.Errorf("assistant operation cannot be reapplied from status [%s]", item.Status)
	}
	if err := checkAssistantOperationHistorySecurity(item); nil != err {
		return nil, err
	}
	result, err := applyAssistantOperationSnapshot(item, revert)
	now := util.CurrentTimeMillis()
	if nil != err {
		if revert {
			item.Status = AssistantOperationHistoryRevertFailed
		} else {
			item.Status = AssistantOperationHistoryReapplyFailed
		}
		item.Error = err.Error()
		item.UpdatedAt = now
		if writeErr := writeAssistantOperationHistoryLocked(items); nil != writeErr {
			return nil, fmt.Errorf("%w; record assistant operation failure status failed: %v", err, writeErr)
		}
		return nil, err
	}
	if revert {
		item.Status = AssistantOperationHistoryReverted
	} else {
		item.Status = AssistantOperationHistoryReapplied
	}
	item.Error = ""
	item.UpdatedAt = now
	if nil != result && nil != result.Item && nil != result.Item.Snapshot {
		item.Snapshot = result.Item.Snapshot
	}
	if err = writeAssistantOperationHistoryLocked(items); nil != err {
		return nil, err
	}
	result.Item = cloneAssistantOperationHistoryItem(item)
	return result, nil
}

func checkAssistantOperationHistorySecurity(item *AssistantOperationHistoryItem) error {
	if nil == item {
		return fmt.Errorf("assistant operation history is unavailable")
	}
	risk := normalizeAISecurityRiskLevel(AISecurityRiskLevel(strings.TrimSpace(item.Risk)))
	targetIDs := []string{firstAssistantAINonEmpty(item.TargetID, item.SnapshotTargetID())}
	targetIDs = normalizeAISecurityTargetIDs(resolveAssistantHistorySecurityTargets(targetIDs))
	result := CheckAISecurityPermissionForRequest(&AISecurityPermissionRequest{
		Mode:              AISecurityModeFullAccess,
		Risk:              risk,
		TargetType:        "note",
		TargetIDs:         targetIDs,
		SessionBatchCount: 1,
		Capability:        AISecurityCapabilityWrite,
		Source:            AISecuritySourceAssistantHistory,
		SessionID:         strings.TrimSpace(item.SessionID),
		OperationType:     strings.TrimSpace(item.OperationType),
	})
	if result.Decision != AISecurityAllow {
		return fmt.Errorf("%s", firstAssistantAINonEmpty(result.Reason, "assistant operation history is blocked by AI security"))
	}
	return nil
}

func CountAssistantOperationHistorySessionWriteTargets(sessionID string, targetIDs []string) int {
	sessionID = strings.TrimSpace(sessionID)
	normalizedTargets := normalizeAISecurityTargetIDs(resolveAssistantHistorySecurityTargets(targetIDs))
	seen := map[string]struct{}{}
	for _, id := range normalizedTargets {
		seen[id] = struct{}{}
	}
	if "" == sessionID {
		return len(seen)
	}

	assistantOperationHistoryLock.Lock()
	defer assistantOperationHistoryLock.Unlock()
	for _, item := range readAssistantOperationHistoryLocked() {
		if nil == item || strings.TrimSpace(item.SessionID) != sessionID || !isWriteRisk(normalizeAISecurityRiskLevel(AISecurityRiskLevel(item.Risk))) {
			continue
		}
		for _, id := range resolveAssistantHistorySecurityTargets([]string{firstAssistantAINonEmpty(item.TargetID, item.SnapshotTargetID())}) {
			id = strings.TrimSpace(id)
			if "" == id {
				continue
			}
			seen[id] = struct{}{}
		}
	}
	return len(seen)
}

func resolveAssistantHistorySecurityTargets(ids []string) []string {
	ret := []string{}
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if "" == id {
			continue
		}
		if block := sql.GetBlock(id); nil != block && "" != strings.TrimSpace(block.RootID) {
			ret = append(ret, strings.TrimSpace(block.RootID))
			continue
		}
		ret = append(ret, id)
	}
	return ret
}

func applyAssistantOperationSnapshot(item *AssistantOperationHistoryItem, revert bool) (*AssistantOperationHistoryApplyResult, error) {
	snapshot := item.Snapshot
	if nil == snapshot {
		return nil, fmt.Errorf("assistant operation history snapshot is missing")
	}
	switch snapshot.OperationType {
	case AssistantPatchOperationCreateNote, AssistantPatchOperationCreateChildNote:
		return applyAssistantOperationCreateNoteSnapshot(snapshot, revert)
	case AssistantPatchOperationRenameNote:
		return applyAssistantOperationRenameSnapshot(snapshot, revert)
	case AssistantPatchOperationSetAttrs:
		return applyAssistantOperationAttrsSnapshot(snapshot, revert)
	default:
		return applyAssistantOperationTransactionSnapshot(snapshot, revert)
	}
}

func applyAssistantOperationTransactionSnapshot(snapshot *AssistantOperationSnapshot, revert bool) (*AssistantOperationHistoryApplyResult, error) {
	if err := validateAssistantOperationTransactionSnapshot(snapshot, revert); nil != err {
		return nil, err
	}
	ops := snapshot.DoOperations
	if revert {
		ops = snapshot.UndoOperations
	}
	if 1 > len(ops) {
		return nil, fmt.Errorf("assistant operation transaction snapshot is missing")
	}
	transactions := []*Transaction{{DoOperations: cloneAssistantHistoryOperations(ops)}}
	PerformTransactions(&transactions)
	FlushTxQueue()
	return &AssistantOperationHistoryApplyResult{Transactions: transactions}, nil
}

func validateAssistantOperationTransactionSnapshot(snapshot *AssistantOperationSnapshot, revert bool) error {
	targetID := firstAssistantAINonEmpty(snapshot.AppliedTargetID, snapshot.TargetID)
	switch snapshot.OperationType {
	case AssistantPatchOperationReplaceSelection, AssistantPatchOperationReplaceBlock:
		expected := snapshot.After
		if !revert {
			expected = snapshot.Before
		}
		if strings.TrimSpace(GetBlockKramdown(targetID, "")) != strings.TrimSpace(expected) {
			return fmt.Errorf("assistant operation target changed; stop reversible write")
		}
	case AssistantPatchOperationAppendNote, AssistantPatchOperationInsertAfterBlock:
		exists := nil != sql.GetBlock(targetID)
		if revert && !exists {
			return fmt.Errorf("assistant inserted block no longer exists")
		}
		if !revert && exists {
			return fmt.Errorf("assistant inserted block already exists")
		}
	case AssistantPatchOperationDeleteBlock:
		exists := nil != sql.GetBlock(targetID)
		if revert && exists {
			return fmt.Errorf("assistant deleted block already exists")
		}
		if !revert && !exists {
			return fmt.Errorf("assistant deleted block is already absent")
		}
	}
	return nil
}

func applyAssistantOperationCreateNoteSnapshot(snapshot *AssistantOperationSnapshot, revert bool) (*AssistantOperationHistoryApplyResult, error) {
	targetID := firstAssistantAINonEmpty(snapshot.AppliedTargetID, snapshot.TargetID)
	if "" == targetID {
		return nil, fmt.Errorf("assistant created note ID is missing")
	}
	if revert {
		tree, err := LoadTreeByBlockID(targetID)
		if nil != err {
			return nil, err
		}
		if err = RemoveDoc(tree.Box, tree.Path); nil != err {
			return nil, fmt.Errorf("remove assistant created note failed: %w", err)
		}
		return &AssistantOperationHistoryApplyResult{}, nil
	}
	if nil != sql.GetBlock(targetID) {
		return nil, fmt.Errorf("assistant created note already exists")
	}
	if "" == strings.TrimSpace(snapshot.Notebook) || "" == strings.TrimSpace(snapshot.Path) || "" == strings.TrimSpace(snapshot.After) {
		return nil, fmt.Errorf("assistant created note snapshot is incomplete")
	}
	id, err := CreateWithMarkdownSanitized("", snapshot.Notebook, snapshot.Path, snapshot.After, snapshot.ParentID, targetID, false, "")
	if nil != err {
		return nil, err
	}
	FlushTxQueue()
	snapshot.AppliedTargetID = id
	return &AssistantOperationHistoryApplyResult{
		Item:       &AssistantOperationHistoryItem{Snapshot: snapshot},
		CreatedDoc: true,
		Notebook:   snapshot.Notebook,
		Path:       snapshot.Path,
	}, nil
}

func applyAssistantOperationRenameSnapshot(snapshot *AssistantOperationSnapshot, revert bool) (*AssistantOperationHistoryApplyResult, error) {
	targetID := firstAssistantAINonEmpty(snapshot.AppliedTargetID, snapshot.TargetID)
	expected := snapshot.TitleAfter
	next := snapshot.TitleBefore
	if !revert {
		expected = snapshot.TitleBefore
		next = snapshot.TitleAfter
	}
	if "" == targetID || "" == strings.TrimSpace(next) {
		return nil, fmt.Errorf("assistant rename snapshot is incomplete")
	}
	tree, err := LoadTreeByBlockID(targetID)
	if nil != err {
		return nil, err
	}
	if strings.TrimSpace(tree.Root.IALAttr("title")) != strings.TrimSpace(expected) {
		return nil, fmt.Errorf("assistant renamed note changed; stop reversible write")
	}
	if err = RenameDoc(tree.Box, tree.Path, next); nil != err {
		return nil, err
	}
	return &AssistantOperationHistoryApplyResult{}, nil
}

func applyAssistantOperationAttrsSnapshot(snapshot *AssistantOperationSnapshot, revert bool) (*AssistantOperationHistoryApplyResult, error) {
	targetID := firstAssistantAINonEmpty(snapshot.AppliedTargetID, snapshot.TargetID)
	if "" == targetID {
		return nil, fmt.Errorf("assistant attrs target is missing")
	}
	current := sql.GetBlockAttrs(targetID)
	expected := snapshot.AttrsAfter
	next := snapshot.AttrsBefore
	if !revert {
		expected = snapshot.AttrsBefore
		next = snapshot.AttrsAfter
	}
	if !assistantOperationAttrsMatch(current, expected) {
		return nil, fmt.Errorf("assistant attrs target changed; stop reversible write")
	}
	if err := SetBlockAttrs(targetID, next); nil != err {
		return nil, err
	}
	return &AssistantOperationHistoryApplyResult{}, nil
}

func addAssistantOperationHistoryItem(item *AssistantOperationHistoryItem) (*AssistantOperationHistoryItem, error) {
	assistantOperationHistoryLock.Lock()
	defer assistantOperationHistoryLock.Unlock()
	items := append([]*AssistantOperationHistoryItem{normalizeAssistantOperationHistoryItem(item)}, readAssistantOperationHistoryLocked()...)
	if len(items) > assistantOperationHistoryLimit {
		items = items[:assistantOperationHistoryLimit]
	}
	if err := writeAssistantOperationHistoryLocked(items); nil != err {
		return nil, err
	}
	return cloneAssistantOperationHistoryItem(items[0]), nil
}

func readAssistantOperationHistoryLocked() []*AssistantOperationHistoryItem {
	data, err := os.ReadFile(assistantOperationHistoryPath())
	if nil != err {
		if !os.IsNotExist(err) {
			logging.LogWarnf("read assistant operation history failed: %s", err)
		}
		return []*AssistantOperationHistoryItem{}
	}
	items := []*AssistantOperationHistoryItem{}
	if err = json.Unmarshal(data, &items); nil != err {
		logging.LogWarnf("parse assistant operation history failed: %s", err)
		return []*AssistantOperationHistoryItem{}
	}
	normalized := make([]*AssistantOperationHistoryItem, 0, len(items))
	for _, item := range items {
		if normalizedItem := normalizeAssistantOperationHistoryItem(item); nil != normalizedItem {
			normalized = append(normalized, normalizedItem)
		}
	}
	return normalized
}

func writeAssistantOperationHistoryLocked(items []*AssistantOperationHistoryItem) error {
	if err := os.MkdirAll(filepath.Dir(assistantOperationHistoryPath()), 0755); nil != err {
		return fmt.Errorf("create assistant operation history dir: %w", err)
	}
	data, err := json.MarshalIndent(items, "", "  ")
	if nil != err {
		return fmt.Errorf("marshal assistant operation history: %w", err)
	}
	if err = filelock.WriteFile(assistantOperationHistoryPath(), data); nil != err {
		return fmt.Errorf("write assistant operation history: %w", err)
	}
	return nil
}

func assistantOperationHistoryIndex(items []*AssistantOperationHistoryItem, id string) int {
	id = strings.TrimSpace(id)
	for index, item := range items {
		if nil != item && strings.TrimSpace(item.ID) == id {
			return index
		}
	}
	return -1
}

func normalizeAssistantOperationHistoryItem(item *AssistantOperationHistoryItem) *AssistantOperationHistoryItem {
	if nil == item || "" == strings.TrimSpace(item.ID) || nil == item.Patch {
		return nil
	}
	item.ID = strings.TrimSpace(item.ID)
	item.PatchID = strings.TrimSpace(firstAssistantAINonEmpty(item.PatchID, item.Patch.ID))
	item.OperationType = strings.TrimSpace(firstAssistantAINonEmpty(item.OperationType, item.SnapshotOperationType()))
	item.Status = normalizeAssistantOperationHistoryStatus(item.Status)
	item.Source = strings.TrimSpace(firstAssistantAINonEmpty(item.Source, item.Patch.Source))
	item.Risk = strings.TrimSpace(firstAssistantAINonEmpty(item.Risk, item.Patch.Risk))
	if nil == item.Results {
		item.Results = []*AssistantOperationHistoryResult{}
	}
	return item
}

func normalizeAssistantOperationHistoryStatus(status AssistantOperationHistoryStatus) AssistantOperationHistoryStatus {
	switch status {
	case AssistantOperationHistoryApplied, AssistantOperationHistoryReverted, AssistantOperationHistoryReapplied,
		AssistantOperationHistoryFailed, AssistantOperationHistoryRevertFailed, AssistantOperationHistoryReapplyFailed:
		return status
	default:
		return AssistantOperationHistoryApplied
	}
}

func normalizeAssistantOperationSnapshot(snapshot *AssistantOperationSnapshot, operation *AssistantPatchOperation, result *AssistantPatchApplyResult) *AssistantOperationSnapshot {
	if nil == snapshot {
		snapshot = &AssistantOperationSnapshot{}
	}
	snapshot.OperationType = firstAssistantAINonEmpty(snapshot.OperationType, operation.Type)
	snapshot.TargetID = firstAssistantAINonEmpty(snapshot.TargetID, operation.TargetID)
	snapshot.AppliedTargetID = firstAssistantAINonEmpty(snapshot.AppliedTargetID, result.AppliedTargetID, operation.AppliedTargetID)
	snapshot.DataType = normalizeAssistantPatchDataType(firstAssistantAINonEmpty(snapshot.DataType, operation.DataType))
	snapshot.Notebook = firstAssistantAINonEmpty(snapshot.Notebook, result.Notebook)
	snapshot.Path = firstAssistantAINonEmpty(snapshot.Path, result.Path)
	return snapshot
}

func assistantOperationSnapshotFromTransactions(operation *AssistantPatchOperation, transactions []*Transaction, base *AssistantOperationSnapshot) *AssistantOperationSnapshot {
	if nil == base {
		base = &AssistantOperationSnapshot{}
	}
	base.OperationType = strings.TrimSpace(operation.Type)
	base.DataType = normalizeAssistantPatchDataType(operation.DataType)
	for _, transaction := range transactions {
		base.DoOperations = append(base.DoOperations, cloneAssistantHistoryOperations(transaction.DoOperations)...)
		base.UndoOperations = append(base.UndoOperations, cloneAssistantHistoryOperations(transaction.UndoOperations)...)
	}
	return base
}

func assistantOperationTransactionSnapshot(operation *AssistantPatchOperation, transactions []*Transaction, targetID, appliedID, before, after, notebook, p string) *AssistantOperationSnapshot {
	return assistantOperationSnapshotFromTransactions(operation, transactions, &AssistantOperationSnapshot{
		TargetID:        strings.TrimSpace(targetID),
		AppliedTargetID: strings.TrimSpace(appliedID),
		Before:          before,
		After:           after,
		Notebook:        strings.TrimSpace(notebook),
		Path:            strings.TrimSpace(p),
	})
}

func assistantOperationPickAttrs(current map[string]string, changed map[string]string) map[string]string {
	ret := map[string]string{}
	for key := range changed {
		normalizedKey := strings.ToLower(strings.TrimSpace(key))
		if "" == normalizedKey {
			continue
		}
		ret[normalizedKey] = strings.TrimSpace(current[normalizedKey])
	}
	return ret
}

func assistantOperationAttrsMatch(current map[string]string, expected map[string]string) bool {
	for key, value := range expected {
		normalizedKey := strings.ToLower(strings.TrimSpace(key))
		if "" == normalizedKey {
			continue
		}
		if strings.TrimSpace(current[normalizedKey]) != strings.TrimSpace(value) {
			return false
		}
	}
	return true
}

func cloneAssistantHistoryPatch(patch *AssistantEditPatch, operation *AssistantPatchOperation) *AssistantEditPatch {
	if nil == patch {
		return nil
	}
	cloned := *patch
	cloned.Operations = []*AssistantPatchOperation{normalizeAssistantPatchOperation(operation)}
	return &cloned
}

func cloneAssistantHistoryOperations(ops []*Operation) []*Operation {
	if 1 > len(ops) {
		return []*Operation{}
	}
	data, err := json.Marshal(ops)
	if nil != err {
		return []*Operation{}
	}
	cloned := []*Operation{}
	if err = json.Unmarshal(data, &cloned); nil != err {
		return []*Operation{}
	}
	return cloned
}

func cloneAssistantOperationHistoryItems(items []*AssistantOperationHistoryItem) []*AssistantOperationHistoryItem {
	ret := make([]*AssistantOperationHistoryItem, 0, len(items))
	for _, item := range items {
		if cloned := cloneAssistantOperationHistoryItem(item); nil != cloned {
			ret = append(ret, cloned)
		}
	}
	return ret
}

func cloneAssistantOperationHistoryItem(item *AssistantOperationHistoryItem) *AssistantOperationHistoryItem {
	if nil == item {
		return nil
	}
	data, err := json.Marshal(item)
	if nil != err {
		return nil
	}
	cloned := &AssistantOperationHistoryItem{}
	if err = json.Unmarshal(data, cloned); nil != err {
		return nil
	}
	return cloned
}

func astHistoryID(prefix string, now int64) string {
	return fmt.Sprintf("%s-%d-%s", strings.TrimSpace(prefix), now, util.RandString(6))
}

func (req *AssistantPatchApplyRequest) AuditSessionID() string {
	if nil == req || nil == req.Audit {
		return ""
	}
	return req.Audit.SessionID
}

func (req *AssistantPatchApplyRequest) AuditProfileID() string {
	if nil == req || nil == req.Audit {
		return ""
	}
	return req.Audit.ProfileID
}

func (req *AssistantPatchApplyRequest) AuditTargetLabel() string {
	if nil == req || nil == req.Audit {
		return ""
	}
	return req.Audit.TargetLabel
}

func (item *AssistantOperationHistoryItem) SnapshotOperationType() string {
	if nil == item || nil == item.Snapshot {
		return ""
	}
	return item.Snapshot.OperationType
}

func (item *AssistantOperationHistoryItem) SnapshotTargetID() string {
	if nil == item || nil == item.Snapshot {
		return ""
	}
	return firstAssistantAINonEmpty(item.Snapshot.AppliedTargetID, item.Snapshot.TargetID)
}
