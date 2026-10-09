package model

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
)

// setupAssistantRulesBox 在隔离环境中建一个打开的笔记本，返回笔记本 ID。
func setupAssistantRulesBox(t *testing.T) string {
	t.Helper()
	boxID, err := CreateBox("RulesBox")
	if nil != err {
		t.Fatalf("create rules box: %v", err)
	}
	openAssistantMoveBox(t, boxID)
	return boxID
}

// createAssistantRulesNote 创建一篇真实文档，返回文档 ID。
func createAssistantRulesNote(t *testing.T, boxID, hPath, markdown string) string {
	t.Helper()
	id, err := CreateWithMarkdownSanitized("", boxID, hPath, markdown, "", ast.NewNodeID(), false, "")
	if nil != err {
		t.Fatalf("create note [%s]: %v", hPath, err)
	}
	FlushTxQueue()
	return id
}

func assistantRulesStorageFile(name string) string {
	return filepath.Join(util.DataDir, "storage", name)
}

func TestAssistantRuleRunExpandsPlaceholdersAndCreatesTask(t *testing.T) {
	withAssistantMoveNoteTestEnv(t)
	boxID := setupAssistantRulesBox(t)
	noteID := createAssistantRulesNote(t, boxID, "/周会纪要", "周会纪要正文")
	setAssistantMoveCapability(t, true)

	result, err := RunAssistantRule(&AssistantRuleRunRequest{
		Rule: &AssistantRuleInput{
			Name:          "会议归档",
			MatchKind:     "doc",
			TitleIncludes: "会议",
			Actions: map[string]*AssistantRuleActionInput{
				AssistantRuleActionSetAttrs: {Attrs: map[string]string{
					"tags": "{{title}}-tag",
				}},
				AssistantRuleActionMoveNote: {Notebook: boxID, Path: "/"},
				AssistantRuleActionAppendNote: {
					Content: "来自 {{notebook}} 的 {{path}}，标题 {{title}}",
				},
				AssistantRuleActionPushInbox: {},
			},
		},
		Targets: []*AssistantRuleTarget{{
			ID:       noteID,
			Notebook: boxID,
			Path:     "/周会纪要",
			Title:    "周会纪要",
		}},
		Mode: AISecurityModeDefault,
	})
	if nil != err {
		t.Fatalf("RunAssistantRule: %v", err)
	}
	if "" != result.PausedReason {
		t.Fatalf("run should not pause when move enabled: %s", result.PausedReason)
	}
	if !strings.HasPrefix(result.RuleRunID, "rule-run-") {
		t.Fatalf("ruleRunId = %s, want rule-run-* prefix", result.RuleRunID)
	}
	if result.ItemCount != 1 || "" == result.TaskID {
		t.Fatalf("run result invalid: %+v", result)
	}
	// 动作摘要：4 个动作各命中 1 个 target，move 为 L3
	if 4 != len(result.ActionsSummary) {
		t.Fatalf("actionsSummary = %+v, want 4 entries", result.ActionsSummary)
	}
	if "move-note" != result.ActionsSummary[1].ActionID || "L3" != result.ActionsSummary[1].Risk || 1 != result.ActionsSummary[1].Count {
		t.Fatalf("move summary invalid: %+v", result.ActionsSummary[1])
	}

	tasks := ListAssistantAgentTasks(10)
	if 1 != len(tasks) {
		t.Fatalf("task list = %d tasks, want 1", len(tasks))
	}
	task := tasks[0]
	if task.ID != result.TaskID {
		t.Fatalf("task ID mismatch: %s vs %s", task.ID, result.TaskID)
	}
	if AssistantAgentTaskRunning != task.Status {
		t.Fatalf("task status = %s, want running", task.Status)
	}
	if nil == task.Metadata || task.Metadata.RuleRunID != result.RuleRunID || AssistantRuleTriggeredBy != task.Metadata.TriggeredBy {
		t.Fatalf("task metadata missing loop-suppression marks: %+v", task.Metadata)
	}
	if "会议归档" != task.Metadata.RuleName || string(AISecurityModeDefault) != task.Metadata.Mode {
		t.Fatalf("task metadata invalid: %+v", task.Metadata)
	}
	if !strings.HasPrefix(task.Title, "规则运行：") {
		t.Fatalf("task title = %s, want 规则运行 prefix", task.Title)
	}

	item := task.Items[0]
	if item.TargetID != noteID || nil == item.Patch {
		t.Fatalf("task item invalid: %+v", item)
	}
	if item.Patch.RuleRunID != result.RuleRunID || AssistantRuleTriggeredBy != item.Patch.TriggeredBy {
		t.Fatalf("item patch missing loop-suppression marks: %+v", item.Patch)
	}
	if "L3" != item.Patch.Risk {
		t.Fatalf("patch risk = %s, want L3 when move action present", item.Patch.Risk)
	}
	ops := item.Patch.Operations
	if 4 != len(ops) {
		t.Fatalf("compiled ops = %d, want 4", len(ops))
	}
	// 固定编译顺序：set-attrs → move-note → append-note → push-inbox
	wantOrder := []string{AssistantPatchOperationSetAttrs, AssistantPatchOperationMoveNote, AssistantPatchOperationAppendNote, AssistantPatchOperationSetAttrs}
	for i, wantType := range wantOrder {
		if ops[i].Type != wantType {
			t.Fatalf("op[%d] type = %s, want %s", i, ops[i].Type, wantType)
		}
		if "pending" != ops[i].Status {
			t.Fatalf("op[%d] status = %s, want pending", i, ops[i].Status)
		}
	}
	if got := ops[0].Attrs["tags"]; "周会纪要-tag" != got {
		t.Fatalf("set-attrs tags = %v, want expanded title placeholder", got)
	}
	if got := ops[1].Attrs["toNotebook"]; boxID != got {
		t.Fatalf("move toNotebook = %v, want %s", got, boxID)
	}
	if got := ops[1].Attrs["toPath"]; "/" != got {
		t.Fatalf("move toPath = %v, want notebook root", got)
	}
	appendContent := ops[2].After
	if "" == appendContent {
		t.Fatalf("append-note op missing content: %+v", ops[2])
	}
	if !strings.Contains(appendContent, "来自 "+boxID) || !strings.Contains(appendContent, "/周会纪要") || !strings.Contains(appendContent, "标题 周会纪要") {
		t.Fatalf("append content placeholders not expanded: %s", appendContent)
	}
	if got := ops[3].Attrs[WorkbenchAttrInbox]; "true" != got {
		t.Fatalf("push-inbox attr = %v, want true", got)
	}

	// 任务可被既有 lease 语义接管
	lease, err := AcquireAssistantAgentTaskLease(&AssistantAgentLeaseRequest{TaskID: task.ID, Owner: "rules-window"})
	if nil != err {
		t.Fatalf("AcquireAssistantAgentTaskLease: %v", err)
	}
	if _, err = AcquireAssistantAgentTaskLease(&AssistantAgentLeaseRequest{TaskID: task.ID, Owner: "other-window"}); nil == err {
		t.Fatal("second active lease should fail")
	}
	if _, err = ReleaseAssistantAgentTaskLease(&AssistantAgentLeaseRequest{TaskID: task.ID, LeaseToken: lease.Token}); nil != err {
		t.Fatalf("ReleaseAssistantAgentTaskLease: %v", err)
	}
}

func TestAssistantRuleUnknownActionRejected(t *testing.T) {
	withAssistantMoveNoteTestEnv(t)
	setupAssistantRulesBox(t)
	req := &AssistantRuleRunRequest{
		Rule: &AssistantRuleInput{
			Name:    "坏规则",
			Actions: map[string]*AssistantRuleActionInput{"frobnicate": {}},
		},
		Targets: []*AssistantRuleTarget{{ID: "doc-1", Title: "A"}},
	}
	if _, err := RunAssistantRule(req); nil == err || !strings.Contains(err.Error(), "unknown assistant rule action [frobnicate]") {
		t.Fatalf("RunAssistantRule err = %v, want unknown action rejection", err)
	}
	if _, err := ValidateAssistantRule(req); nil == err || !strings.Contains(err.Error(), "unknown assistant rule action [frobnicate]") {
		t.Fatalf("ValidateAssistantRule err = %v, want unknown action rejection", err)
	}
	if tasks := ListAssistantAgentTasks(10); 0 != len(tasks) {
		t.Fatalf("rejected run must not create tasks, got %d", len(tasks))
	}
}

func TestAssistantRuleRejectsMovePathOutsideNotebook(t *testing.T) {
	withAssistantMoveNoteTestEnv(t)
	boxID := setupAssistantRulesBox(t)
	req := &AssistantRuleRunRequest{
		Rule: &AssistantRuleInput{
			Name: "越界移动",
			Actions: map[string]*AssistantRuleActionInput{
				AssistantRuleActionMoveNote: {Notebook: boxID, Path: "/../../escape"},
			},
		},
		Targets: []*AssistantRuleTarget{{ID: "doc-1", Title: "A"}},
	}
	if _, err := RunAssistantRule(req); nil == err || !strings.Contains(err.Error(), "unsafe target path") {
		t.Fatalf("RunAssistantRule err = %v, want unsafe target path rejection", err)
	}
	if _, err := ValidateAssistantRule(req); nil == err || !strings.Contains(err.Error(), "unsafe target path") {
		t.Fatalf("ValidateAssistantRule err = %v, want unsafe target path rejection", err)
	}
	if tasks := ListAssistantAgentTasks(10); 0 != len(tasks) {
		t.Fatalf("rejected run must not create tasks, got %d", len(tasks))
	}

	// 目标笔记本不存在同样拒绝整批
	missing := &AssistantRuleRunRequest{
		Rule: &AssistantRuleInput{
			Name:    "未知笔记本",
			Actions: map[string]*AssistantRuleActionInput{AssistantRuleActionMoveNote: {Notebook: "no-such-box", Path: "/"}},
		},
		Targets: []*AssistantRuleTarget{{ID: "doc-1", Title: "A"}},
	}
	if _, err := RunAssistantRule(missing); nil == err || !strings.Contains(err.Error(), "was not found") {
		t.Fatalf("RunAssistantRule err = %v, want missing notebook rejection", err)
	}
}

func TestAssistantRuleRunPausesWhenMoveCapabilityDisabled(t *testing.T) {
	withAssistantMoveNoteTestEnv(t)
	boxID := setupAssistantRulesBox(t)
	setAssistantMoveCapability(t, false)

	req := &AssistantRuleRunRequest{
		Rule: &AssistantRuleInput{
			Name: "归档",
			Actions: map[string]*AssistantRuleActionInput{
				AssistantRuleActionSetAttrs: {Attrs: map[string]string{"tags": "archived"}},
				AssistantRuleActionMoveNote: {Notebook: boxID, Path: "/"},
			},
		},
		Targets: []*AssistantRuleTarget{{ID: "doc-1", Title: "A"}},
		Mode:    AISecurityModeDefault,
	}
	result, err := RunAssistantRule(req)
	if nil != err {
		t.Fatalf("RunAssistantRule: %v", err)
	}
	if !strings.Contains(result.PausedReason, "禁止 AI 移动笔记") || !strings.Contains(result.PausedReason, "整批暂停") {
		t.Fatalf("pausedReason = %s, want move capability denial with batch pause", result.PausedReason)
	}
	tasks := ListAssistantAgentTasks(10)
	if 1 != len(tasks) || AssistantAgentTaskPaused != tasks[0].Status {
		t.Fatalf("task should be created paused, got %+v", tasks)
	}
	if nil == tasks[0].Metadata || tasks[0].Metadata.PausedReason != result.PausedReason {
		t.Fatalf("task metadata pausedReason missing: %+v", tasks[0].Metadata)
	}

	// dryRun 预览同样要提示暂停原因
	preview, err := ValidateAssistantRule(req)
	if nil != err {
		t.Fatalf("ValidateAssistantRule: %v", err)
	}
	if !strings.Contains(preview.PausedReason, "禁止 AI 移动笔记") {
		t.Fatalf("preview pausedReason = %s, want move capability warning", preview.PausedReason)
	}

	// 开启 Move 能力后同一规则可正常运行
	setAssistantMoveCapability(t, true)
	enabled, err := RunAssistantRule(req)
	if nil != err {
		t.Fatalf("RunAssistantRule after enabling move: %v", err)
	}
	if "" != enabled.PausedReason {
		t.Fatalf("run should not pause after enabling move: %s", enabled.PausedReason)
	}
	tasks = ListAssistantAgentTasks(10)
	if 2 != len(tasks) || AssistantAgentTaskRunning != tasks[0].Status {
		t.Fatalf("second run task should be running, got %+v", tasks)
	}
}

func TestAssistantRuleValidateDryRunProducesNoWrites(t *testing.T) {
	withAssistantMoveNoteTestEnv(t)
	boxID := setupAssistantRulesBox(t)

	preview, err := ValidateAssistantRule(&AssistantRuleRunRequest{
		Rule: &AssistantRuleInput{
			Name: "dryRun",
			Actions: map[string]*AssistantRuleActionInput{
				AssistantRuleActionSetAttrs:   {Attrs: map[string]string{"tags": "{{title}}-tag"}},
				AssistantRuleActionAppendNote: {Content: "来自 {{path}}"},
				AssistantRuleActionPushInbox:  {},
			},
		},
		Targets: []*AssistantRuleTarget{{ID: "doc-1", Notebook: boxID, Path: "/会议/纪要", Title: "周会"}},
	})
	if nil != err {
		t.Fatalf("ValidateAssistantRule: %v", err)
	}
	if 1 != preview.ItemCount || "" != preview.PausedReason {
		t.Fatalf("preview invalid: %+v", preview)
	}
	plan := preview.Targets[0]
	if "doc-1" != plan.TargetID || "L2" != plan.Risk {
		t.Fatalf("target plan invalid: %+v", plan)
	}
	if 3 != len(plan.Actions) {
		t.Fatalf("plan actions = %d, want 3", len(plan.Actions))
	}
	if !strings.Contains(plan.Actions[0].Summary, "tags=周会-tag") {
		t.Fatalf("set-attrs summary = %s, want expanded placeholder", plan.Actions[0].Summary)
	}
	if !strings.Contains(plan.Actions[1].Summary, "/会议/纪要") {
		t.Fatalf("append summary = %s, want expanded path", plan.Actions[1].Summary)
	}
	if "推入收件箱" != plan.Actions[2].Summary {
		t.Fatalf("push-inbox summary = %s", plan.Actions[2].Summary)
	}

	// dryRun 语义：不创建任务、不写操作历史
	if _, err = os.Stat(assistantRulesStorageFile("assistant_agent_tasks.json")); !os.IsNotExist(err) {
		t.Fatalf("dryRun must not write agent tasks (stat err = %v)", err)
	}
	if _, err = os.Stat(assistantRulesStorageFile("assistant_operation_history.json")); !os.IsNotExist(err) {
		t.Fatalf("dryRun must not write operation history (stat err = %v)", err)
	}
}

func TestAssistantRuleInvalidRequestsRejected(t *testing.T) {
	withAssistantMoveNoteTestEnv(t)
	setupAssistantRulesBox(t)

	cases := []struct {
		name    string
		req     *AssistantRuleRunRequest
		wantErr string
	}{
		{name: "missing rule", req: &AssistantRuleRunRequest{}, wantErr: "requires a rule"},
		{name: "no actions", req: &AssistantRuleRunRequest{
			Rule:    &AssistantRuleInput{Name: "空规则"},
			Targets: []*AssistantRuleTarget{{ID: "doc-1"}},
		}, wantErr: "requires at least one action"},
		{name: "no targets", req: &AssistantRuleRunRequest{
			Rule:    &AssistantRuleInput{Name: "无目标", Actions: map[string]*AssistantRuleActionInput{AssistantRuleActionPushInbox: {}}},
			Targets: []*AssistantRuleTarget{},
		}, wantErr: "requires at least one target"},
		{name: "empty target id", req: &AssistantRuleRunRequest{
			Rule:    &AssistantRuleInput{Name: "空目标", Actions: map[string]*AssistantRuleActionInput{AssistantRuleActionPushInbox: {}}},
			Targets: []*AssistantRuleTarget{{Title: "只有标题"}},
		}, wantErr: "target ID is required"},
		{name: "set-attrs without attrs", req: &AssistantRuleRunRequest{
			Rule: &AssistantRuleInput{Name: "空属性", Actions: map[string]*AssistantRuleActionInput{
				AssistantRuleActionSetAttrs: {Attrs: map[string]string{"  ": "x"}},
			}},
			Targets: []*AssistantRuleTarget{{ID: "doc-1"}},
		}, wantErr: "requires at least one attribute"},
		{name: "append-note without content", req: &AssistantRuleRunRequest{
			Rule: &AssistantRuleInput{Name: "空内容", Actions: map[string]*AssistantRuleActionInput{
				AssistantRuleActionAppendNote: {Content: "  "},
			}},
			Targets: []*AssistantRuleTarget{{ID: "doc-1"}},
		}, wantErr: "requires content"},
		{name: "too many targets", req: func() *AssistantRuleRunRequest {
			targets := make([]*AssistantRuleTarget, 0, assistantAgentTaskItemLimit+1)
			for i := 0; i <= assistantAgentTaskItemLimit; i++ {
				targets = append(targets, &AssistantRuleTarget{ID: "doc-" + string(rune('a'+i%26)) + string(rune(i))})
			}
			return &AssistantRuleRunRequest{
				Rule:    &AssistantRuleInput{Name: "超批", Actions: map[string]*AssistantRuleActionInput{AssistantRuleActionPushInbox: {}}},
				Targets: targets,
			}
		}(), wantErr: "at most 20 targets"},
	}
	for _, testCase := range cases {
		if _, err := RunAssistantRule(testCase.req); nil == err || !strings.Contains(err.Error(), testCase.wantErr) {
			t.Fatalf("[%s] RunAssistantRule err = %v, want %s", testCase.name, err, testCase.wantErr)
		}
		if _, err := ValidateAssistantRule(testCase.req); nil == err || !strings.Contains(err.Error(), testCase.wantErr) {
			t.Fatalf("[%s] ValidateAssistantRule err = %v, want %s", testCase.name, err, testCase.wantErr)
		}
	}
	if tasks := ListAssistantAgentTasks(10); 0 != len(tasks) {
		t.Fatalf("rejected requests must not create tasks, got %d", len(tasks))
	}
}

// TestAssistantRuleMarksOperationHistoryForLoopSuppression 验证循环防护标记链路：
// patch 上的 ruleRunId/triggeredBy 随 patch apply 写入 AI 操作记录，前端据此抑制再触发。
func TestAssistantRuleMarksOperationHistoryForLoopSuppression(t *testing.T) {
	withAssistantMoveNoteTestEnv(t)

	patch := &AssistantEditPatch{
		ID:          "rule-patch-loop",
		Source:      AssistantRulePatchSource,
		Target:      "note",
		Risk:        "L2",
		Summary:     "规则「会议」应用于「周会」",
		RuleRunID:   "rule-run-42",
		TriggeredBy: AssistantRuleTriggeredBy,
		Operations: []*AssistantPatchOperation{{
			ID:       "rule-op-loop",
			Type:     AssistantPatchOperationSetAttrs,
			TargetID: "doc-1",
			Attrs:    map[string]interface{}{"tags": "meetings"},
			Status:   "pending",
		}},
	}
	operation := patch.Operations[0]
	result := &AssistantPatchApplyResult{
		AppliedTargetID: "doc-1",
		Summary:         "applied set-attrs",
		HistorySnapshot: &AssistantOperationSnapshot{
			OperationType:   AssistantPatchOperationSetAttrs,
			TargetID:        "doc-1",
			AppliedTargetID: "doc-1",
			AttrsAfter:      map[string]string{"tags": "meetings"},
		},
	}
	req := &AssistantPatchApplyRequest{
		Patch:        patch,
		Operation:    operation,
		Context:      &AssistantAINoteContext{RootID: "doc-1"},
		SecurityMode: AISecurityModeFullAccess,
	}
	if _, err := RecordAssistantPatchOperationHistory(req, operation, result); nil != err {
		t.Fatalf("RecordAssistantPatchOperationHistory: %v", err)
	}
	items := ListAssistantOperationHistory(10)
	if 1 != len(items) {
		t.Fatalf("history items = %d, want 1", len(items))
	}
	if "rule-run-42" != items[0].RuleRunID || AssistantRuleTriggeredBy != items[0].TriggeredBy {
		t.Fatalf("history item missing loop-suppression marks: ruleRunId=%s triggeredBy=%s", items[0].RuleRunID, items[0].TriggeredBy)
	}
	if nil == items[0].Patch || "rule-run-42" != items[0].Patch.RuleRunID {
		t.Fatalf("history patch missing ruleRunId: %+v", items[0].Patch)
	}
}
