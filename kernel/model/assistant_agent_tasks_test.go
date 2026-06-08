package model

import (
	"testing"

	"github.com/lonelyor/sourceflow/kernel/util"
)

func withTempAssistantAgentTasks(t *testing.T) {
	t.Helper()
	oldDataDir := util.DataDir
	util.DataDir = t.TempDir()
	t.Cleanup(func() {
		util.DataDir = oldDataDir
	})
}

func TestAssistantAgentTaskPersistsAndUpdatesItems(t *testing.T) {
	withTempAssistantAgentTasks(t)

	task, err := CreateAssistantAgentTask(&AssistantAgentTaskCreateRequest{
		Title: "批量审查",
		Items: []*AssistantAgentTaskItemInput{
			{Title: "A", TargetID: "doc-a", Context: &AssistantAINoteContext{RootID: "doc-a", Title: "Doc A"}},
			{Title: "B", TargetID: "doc-b"},
		},
	})
	if nil != err {
		t.Fatalf("CreateAssistantAgentTask: %v", err)
	}
	if task.ID == "" || len(task.Items) != 2 {
		t.Fatalf("created task invalid: %+v", task)
	}
	if task.LeaseToken != "" {
		t.Fatal("lease token must not be exposed in task response")
	}

	item := *task.Items[0]
	item.Status = AssistantAgentItemReview
	item.PatchID = "patch-1"
	item.Patch = &AssistantEditPatch{ID: "patch-1", Source: "agent", Target: "note", Risk: "L2", Summary: "patch"}
	updated, err := UpdateAssistantAgentTaskItem(&AssistantAgentTaskItemUpdateRequest{
		TaskID: task.ID,
		ItemID: item.ID,
		Item:   &item,
	})
	if nil != err {
		t.Fatalf("UpdateAssistantAgentTaskItem: %v", err)
	}
	if updated.Status != AssistantAgentItemReview || updated.PatchID != "patch-1" {
		t.Fatalf("updated item invalid: %+v", updated)
	}

	items := ListAssistantAgentTasks(10)
	if len(items) != 1 || items[0].Items[0].PatchID != "patch-1" {
		t.Fatalf("persisted task missing updated item: %+v", items)
	}
}

func TestAssistantAgentTaskLeasePreventsDuplicateRuns(t *testing.T) {
	withTempAssistantAgentTasks(t)

	task, err := CreateAssistantAgentTask(&AssistantAgentTaskCreateRequest{
		Title: "执行",
		Items: []*AssistantAgentTaskItemInput{{Title: "A"}},
	})
	if nil != err {
		t.Fatalf("CreateAssistantAgentTask: %v", err)
	}

	lease, err := AcquireAssistantAgentTaskLease(&AssistantAgentLeaseRequest{TaskID: task.ID, Owner: "window-1"})
	if nil != err {
		t.Fatalf("AcquireAssistantAgentTaskLease: %v", err)
	}
	if lease.Token == "" || lease.ExpiresAt <= 0 {
		t.Fatalf("lease result invalid: %+v", lease)
	}
	if lease.Task.LeaseToken != "" {
		t.Fatal("lease token must not be exposed in lease task response")
	}
	if _, err = AcquireAssistantAgentTaskLease(&AssistantAgentLeaseRequest{TaskID: task.ID, Owner: "window-2"}); err == nil {
		t.Fatal("second active lease should fail")
	}
	if _, err = ReleaseAssistantAgentTaskLease(&AssistantAgentLeaseRequest{TaskID: task.ID, LeaseToken: "bad-token"}); err == nil {
		t.Fatal("invalid release token should fail")
	}
	released, err := ReleaseAssistantAgentTaskLease(&AssistantAgentLeaseRequest{TaskID: task.ID, LeaseToken: lease.Token})
	if nil != err {
		t.Fatalf("ReleaseAssistantAgentTaskLease: %v", err)
	}
	if released.LeaseExpiresAt != 0 {
		t.Fatalf("lease should be cleared: %+v", released)
	}
	if _, err = AcquireAssistantAgentTaskLease(&AssistantAgentLeaseRequest{TaskID: task.ID, Owner: "window-2"}); nil != err {
		t.Fatalf("lease should be acquirable after release: %v", err)
	}
}

func TestCancelAssistantAgentPendingItemsKeepsReviewAndDone(t *testing.T) {
	withTempAssistantAgentTasks(t)

	task, err := CreateAssistantAgentTask(&AssistantAgentTaskCreateRequest{
		Title: "取消",
		Items: []*AssistantAgentTaskItemInput{{Title: "A"}, {Title: "B"}, {Title: "C"}},
	})
	if nil != err {
		t.Fatalf("CreateAssistantAgentTask: %v", err)
	}
	items := task.Items
	items[0].Status = AssistantAgentItemDone
	items[1].Status = AssistantAgentItemReview
	if _, err = UpdateAssistantAgentTaskItems(&AssistantAgentTaskItemsUpdateRequest{TaskID: task.ID, Items: items}); nil != err {
		t.Fatalf("UpdateAssistantAgentTaskItems: %v", err)
	}
	canceled, err := CancelAssistantAgentPendingItems(&AssistantAgentTaskIDRequest{TaskID: task.ID})
	if nil != err {
		t.Fatalf("CancelAssistantAgentPendingItems: %v", err)
	}
	if canceled.Items[0].Status != AssistantAgentItemDone || canceled.Items[1].Status != AssistantAgentItemReview || canceled.Items[2].Status != AssistantAgentItemCanceled {
		t.Fatalf("cancel pending mutated wrong items: %+v", canceled.Items)
	}
}
