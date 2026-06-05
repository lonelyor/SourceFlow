package model

import (
	"testing"

	"github.com/lonelyor/sourceflow/kernel/util"
)

func withTempAssistantOperationHistory(t *testing.T) {
	t.Helper()
	oldDataDir := util.DataDir
	util.DataDir = t.TempDir()
	t.Cleanup(func() {
		util.DataDir = oldDataDir
	})
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
