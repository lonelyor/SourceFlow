package model

import (
	"strings"
	"testing"

	"github.com/lonelyor/sourceflow/kernel/util"
)

func withTempAssistantOperationHistory(t *testing.T) {
	t.Helper()
	oldDataDir := util.DataDir
	aiSecurityConfigLock.Lock()
	oldCache := aiSecurityConfigCache
	aiSecurityConfigCache = nil
	aiSecurityConfigLock.Unlock()
	util.DataDir = t.TempDir()
	t.Cleanup(func() {
		aiSecurityConfigLock.Lock()
		aiSecurityConfigCache = oldCache
		aiSecurityConfigLock.Unlock()
		util.DataDir = oldDataDir
	})
}

func addAssistantOperationHistoryForTest(t *testing.T, status AssistantOperationHistoryStatus, snapshot *AssistantOperationSnapshot) *AssistantOperationHistoryItem {
	t.Helper()
	operationType := "test-transaction"
	if nil != snapshot && "" != strings.TrimSpace(snapshot.OperationType) {
		operationType = strings.TrimSpace(snapshot.OperationType)
	}
	item, err := addAssistantOperationHistoryItem(&AssistantOperationHistoryItem{
		ID:            "aihist-test-" + strings.TrimSpace(string(status)),
		PatchID:       "patch-test",
		OperationID:   "op-test",
		OperationType: operationType,
		Patch: &AssistantEditPatch{
			ID:      "patch-test",
			Source:  "test",
			Target:  "note",
			Risk:    "L1",
			Summary: "test operation",
			Operations: []*AssistantPatchOperation{{
				ID:       "op-test",
				Type:     operationType,
				TargetID: "doc-test",
				Status:   "accepted",
			}},
			CreatedAt: 1,
		},
		Status:   status,
		Source:   "test",
		Risk:     "L1",
		TargetID: "doc-test",
		Snapshot: snapshot,
	})
	if err != nil {
		t.Fatalf("addAssistantOperationHistoryItem: %v", err)
	}
	return item
}

func TestRecordAssistantPatchOperationHistoryPersistsAuditAndSnapshot(t *testing.T) {
	withTempAssistantOperationHistory(t)
	operation := &AssistantPatchOperation{
		ID:       "op-1",
		Type:     AssistantPatchOperationReplaceBlock,
		TargetID: "block-1",
		Before:   "old",
		After:    "new",
	}
	req := &AssistantPatchApplyRequest{
		Patch: &AssistantEditPatch{
			ID:         "patch-1",
			Source:     "dock",
			Target:     "block",
			Risk:       "L3",
			Summary:    "replace block",
			Operations: []*AssistantPatchOperation{operation},
			CreatedAt:  1,
		},
		Operation: operation,
		Audit: &AssistantPatchAudit{
			SessionID:   "session-1",
			ProfileID:   "profile-1",
			TargetLabel: "目标笔记",
		},
	}
	item, err := RecordAssistantPatchOperationHistory(req, operation, &AssistantPatchApplyResult{
		AppliedTargetID: "block-1",
		HistorySnapshot: &AssistantOperationSnapshot{
			OperationType:   AssistantPatchOperationReplaceBlock,
			TargetID:        "block-1",
			AppliedTargetID: "block-1",
			Before:          "old",
			After:           "new",
		},
	})
	if err != nil {
		t.Fatalf("RecordAssistantPatchOperationHistory: %v", err)
	}
	if item.ID == "" {
		t.Fatal("history ID should be set")
	}
	items := ListAssistantOperationHistory(10)
	if len(items) != 1 {
		t.Fatalf("history length = %d, want 1", len(items))
	}
	got := items[0]
	if got.SessionID != "session-1" || got.ProfileID != "profile-1" || got.TargetLabel != "目标笔记" {
		t.Fatalf("audit metadata not persisted: %+v", got)
	}
	if got.Snapshot == nil || got.Snapshot.Before != "old" || got.Snapshot.After != "new" {
		t.Fatalf("snapshot not persisted: %+v", got.Snapshot)
	}
	if len(got.Patch.Operations) != 1 || got.Patch.Operations[0].ID != "op-1" {
		t.Fatalf("history patch should contain only applied operation: %+v", got.Patch.Operations)
	}
}

func TestRecordAssistantExplicitSaveHistoryPersistsForwardSnapshot(t *testing.T) {
	withTempAssistantOperationHistory(t)
	item, err := RecordAssistantExplicitSaveHistory(&AssistantExplicitSaveHistoryRequest{
		Source:      "dock",
		Summary:     "对话记录",
		NoteID:      "doc-1",
		TargetLabel: "对话记录",
		SessionID:   "session-2",
		ProfileID:   "profile-2",
		Markdown:    "# 对话记录\n\n正文",
		Notebook:    "box",
		Path:        "/AI/对话记录",
	})
	if err != nil {
		t.Fatalf("RecordAssistantExplicitSaveHistory: %v", err)
	}
	if item.Status != AssistantOperationHistoryApplied {
		t.Fatalf("status = %s, want applied", item.Status)
	}
	items := ListAssistantOperationHistory(10)
	if len(items) != 1 {
		t.Fatalf("history length = %d, want 1", len(items))
	}
	got := items[0]
	if got.Snapshot == nil || got.Snapshot.After != "# 对话记录\n\n正文" {
		t.Fatalf("explicit save forward snapshot missing: %+v", got.Snapshot)
	}
	if got.Snapshot.Notebook != "box" || got.Snapshot.Path != "/AI/对话记录" {
		t.Fatalf("explicit save target missing: %+v", got.Snapshot)
	}
}

func TestCountAssistantOperationHistorySessionWriteTargets(t *testing.T) {
	withTempAssistantOperationHistory(t)
	for _, noteID := range []string{"doc-1", "doc-2"} {
		if _, err := RecordAssistantExplicitSaveHistory(&AssistantExplicitSaveHistoryRequest{
			Source:    "dock",
			Summary:   "AI save",
			NoteID:    noteID,
			SessionID: "session-cross-write",
			Risk:      "L2",
			Markdown:  "content",
		}); nil != err {
			t.Fatalf("RecordAssistantExplicitSaveHistory: %v", err)
		}
	}
	if _, err := RecordAssistantExplicitSaveHistory(&AssistantExplicitSaveHistoryRequest{
		Source:    "dock",
		Summary:   "other session",
		NoteID:    "doc-other",
		SessionID: "session-other",
		Risk:      "L2",
		Markdown:  "content",
	}); nil != err {
		t.Fatalf("RecordAssistantExplicitSaveHistory other: %v", err)
	}

	count := CountAssistantOperationHistorySessionWriteTargets("session-cross-write", []string{"doc-3"})
	if count != 3 {
		t.Fatalf("session write target count = %d, want 3", count)
	}
	duplicateCount := CountAssistantOperationHistorySessionWriteTargets("session-cross-write", []string{"doc-2"})
	if duplicateCount != 2 {
		t.Fatalf("duplicate target count = %d, want 2", duplicateCount)
	}
}

func TestAssistantOperationHistoryRejectsInvalidStatusTransitions(t *testing.T) {
	withTempAssistantOperationHistory(t)
	reverted := addAssistantOperationHistoryForTest(t, AssistantOperationHistoryReverted, nil)
	if _, err := RevertAssistantOperationHistory(reverted.ID); err == nil || !strings.Contains(err.Error(), "cannot be reverted") {
		t.Fatalf("RevertAssistantOperationHistory error = %v, want invalid status error", err)
	}

	applied := addAssistantOperationHistoryForTest(t, AssistantOperationHistoryApplied, nil)
	if _, err := ReapplyAssistantOperationHistory(applied.ID); err == nil || !strings.Contains(err.Error(), "cannot be reapplied") {
		t.Fatalf("ReapplyAssistantOperationHistory error = %v, want invalid status error", err)
	}

	items := ListAssistantOperationHistory(10)
	if len(items) != 2 {
		t.Fatalf("history length = %d, want 2", len(items))
	}
	if items[0].Status != AssistantOperationHistoryApplied || items[0].Error != "" {
		t.Fatalf("invalid reapply should not mutate applied item: %+v", items[0])
	}
	if items[1].Status != AssistantOperationHistoryReverted || items[1].Error != "" {
		t.Fatalf("invalid revert should not mutate reverted item: %+v", items[1])
	}
}

func TestAssistantOperationHistoryPersistsRevertFailureStatus(t *testing.T) {
	withTempAssistantOperationHistory(t)
	item := addAssistantOperationHistoryForTest(t, AssistantOperationHistoryApplied, &AssistantOperationSnapshot{
		OperationType: "test-transaction",
		TargetID:      "doc-test",
	})

	if _, err := RevertAssistantOperationHistory(item.ID); err == nil || !strings.Contains(err.Error(), "transaction snapshot is missing") {
		t.Fatalf("RevertAssistantOperationHistory error = %v, want transaction snapshot error", err)
	}
	items := ListAssistantOperationHistory(10)
	if len(items) != 1 {
		t.Fatalf("history length = %d, want 1", len(items))
	}
	if items[0].Status != AssistantOperationHistoryRevertFailed {
		t.Fatalf("status = %s, want revert-failed", items[0].Status)
	}
	if !strings.Contains(items[0].Error, "transaction snapshot is missing") {
		t.Fatalf("error not persisted: %+v", items[0])
	}
}

func TestAssistantOperationHistoryPersistsReapplyFailureStatus(t *testing.T) {
	withTempAssistantOperationHistory(t)
	item := addAssistantOperationHistoryForTest(t, AssistantOperationHistoryReverted, &AssistantOperationSnapshot{
		OperationType: "test-transaction",
		TargetID:      "doc-test",
	})

	if _, err := ReapplyAssistantOperationHistory(item.ID); err == nil || !strings.Contains(err.Error(), "transaction snapshot is missing") {
		t.Fatalf("ReapplyAssistantOperationHistory error = %v, want transaction snapshot error", err)
	}
	items := ListAssistantOperationHistory(10)
	if len(items) != 1 {
		t.Fatalf("history length = %d, want 1", len(items))
	}
	if items[0].Status != AssistantOperationHistoryReapplyFailed {
		t.Fatalf("status = %s, want reapply-failed", items[0].Status)
	}
	if !strings.Contains(items[0].Error, "transaction snapshot is missing") {
		t.Fatalf("error not persisted: %+v", items[0])
	}
}
