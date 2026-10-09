package model

import (
	"fmt"
	"sort"
	"strings"

	"github.com/lonelyor/sourceflow/kernel/util"
)

// 自动化规则系统期一：规则运行 = 前端把「规则 + 目标文档列表」提交为一次运行，
// 后端把动作编译为 patch ops（一个 target 一个 Agent 任务项），复用既有
// storage/assistant_agent_tasks.json 任务队列与 lease，写入全部走 /api/assistant/patch/apply
// 同一安全内核（自动化触发 ≠ 安全豁免）。规则本身仍存于前端 workbench，后端不新增规则存储。

const (
	// AssistantRuleActionSetAttrs 设置属性/标签，编译为 set-attrs（L2）。
	AssistantRuleActionSetAttrs = "set-attrs"
	// AssistantRuleActionMoveNote 移动到笔记本/路径，编译为 move-note（L3，受 Move 能力开关）。
	AssistantRuleActionMoveNote = "move-note"
	// AssistantRuleActionAppendNote 追加内容片段，编译为 append-note（L2）。
	AssistantRuleActionAppendNote = "append-note"
	// AssistantRuleActionPushInbox 推入收件箱，编译为 set-attrs（inbox 属性，L2）。
	AssistantRuleActionPushInbox = "push-inbox"

	// AssistantRuleTriggeredBy 是循环防护标记值：规则运行产生的任务与操作记录带此标记。
	AssistantRuleTriggeredBy = "rule"
	// AssistantRulePatchSource 是规则运行编译 patch 的 source。
	AssistantRulePatchSource = "rule"
)

// assistantRuleActionOrder 固定动作编译顺序，保证同一规则多次编译产物稳定、审计可读。
var assistantRuleActionOrder = []string{
	AssistantRuleActionSetAttrs,
	AssistantRuleActionMoveNote,
	AssistantRuleActionAppendNote,
	AssistantRuleActionPushInbox,
}

// AssistantRuleInput 是一次规则运行的规则快照（字段对齐前端 IWorkbenchRule 匹配字段，
// 后端不做条件匹配——targets 已由前端选定，这里只负责动作编译与安全执行）。
type AssistantRuleInput struct {
	Name             string                               `json:"name,omitempty"`
	MatchKind        string                               `json:"matchKind,omitempty"`
	MatchType        string                               `json:"matchType,omitempty"`
	TitleIncludes    string                               `json:"titleIncludes,omitempty"`
	NotebookIncludes string                               `json:"notebookIncludes,omitempty"`
	TagIncludes      string                               `json:"tagIncludes,omitempty"`
	Actions          map[string]*AssistantRuleActionInput `json:"actions,omitempty"`
}

// AssistantRuleActionInput 是单个动作的参数；不同 actionId 消费不同字段。
type AssistantRuleActionInput struct {
	Attrs    map[string]string `json:"attrs,omitempty"`    // set-attrs：要写入的属性键值
	Notebook string            `json:"notebook,omitempty"` // move-note：目标笔记本（ID 或名称）
	Path     string            `json:"path,omitempty"`     // move-note：目标父路径（空或 "/" 表示笔记本根）
	Content  string            `json:"content,omitempty"`  // append-note：追加的 Markdown 片段
}

// AssistantRuleTarget 是规则运行的一个目标文档。
type AssistantRuleTarget struct {
	ID       string `json:"id"`
	Notebook string `json:"notebook,omitempty"`
	Path     string `json:"path,omitempty"`
	Title    string `json:"title,omitempty"`
}

// AssistantRuleRunRequest 提交一次规则运行（或 dryRun 校验）。
type AssistantRuleRunRequest struct {
	Rule    *AssistantRuleInput    `json:"rule"`
	Targets []*AssistantRuleTarget `json:"targets"`
	Mode    AISecurityMode         `json:"mode,omitempty"`
}

// AssistantRuleActionCountSummary 是运行结果中按动作聚合的数量摘要。
type AssistantRuleActionCountSummary struct {
	ActionID string `json:"actionId"`
	OpType   string `json:"opType"`
	Risk     string `json:"risk"`
	Count    int    `json:"count"`
}

// AssistantRuleRunResult 是规则运行 API 的返回。
type AssistantRuleRunResult struct {
	TaskID         string                             `json:"taskId"`
	RuleRunID      string                             `json:"ruleRunId"`
	ItemCount      int                                `json:"itemCount"`
	ActionsSummary []*AssistantRuleActionCountSummary `json:"actionsSummary"`
	PausedReason   string                             `json:"pausedReason,omitempty"`
	Task           *AssistantAgentTask                `json:"task,omitempty"`
}

// AssistantRuleActionSummary 是单个 target 单个动作将执行内容的摘要（dryRun 预览）。
type AssistantRuleActionSummary struct {
	ActionID string `json:"actionId"`
	OpType   string `json:"opType"`
	Risk     string `json:"risk"`
	Summary  string `json:"summary"`
}

// AssistantRuleTargetPlan 是 dryRun 中单个 target 的执行计划。
type AssistantRuleTargetPlan struct {
	TargetID string                        `json:"targetId"`
	Title    string                        `json:"title,omitempty"`
	Notebook string                        `json:"notebook,omitempty"`
	Path     string                        `json:"path,omitempty"`
	Risk     string                        `json:"risk"`
	Actions  []*AssistantRuleActionSummary `json:"actions"`
}

// AssistantRuleValidateResult 是规则运行 dryRun 校验的返回：只编译不落盘。
type AssistantRuleValidateResult struct {
	ItemCount    int                        `json:"itemCount"`
	Targets      []*AssistantRuleTargetPlan `json:"targets"`
	PausedReason string                     `json:"pausedReason,omitempty"`
}

// assistantRuleCompiledItem 是单个 target 的编译产物。
type assistantRuleCompiledItem struct {
	Target    *AssistantRuleTarget
	Patch     *AssistantEditPatch
	Summaries []*AssistantRuleActionSummary
}

// RunAssistantRule 把「规则 + 目标列表」编译为一个 Agent 任务（复用既有任务队列与 lease）。
// Move 能力关闭等安全拒绝不报错返回，而是任务整批暂停并说明原因（设计 §5.3）。
func RunAssistantRule(req *AssistantRuleRunRequest) (*AssistantRuleRunResult, error) {
	if nil == req || nil == req.Rule {
		return nil, fmt.Errorf("assistant rule run requires a rule")
	}
	now := util.CurrentTimeMillis()
	ruleName := assistantRuleDisplayName(req.Rule)
	ruleRunID := assistantAgentID("rule-run", now)
	compiled, err := compileAssistantRuleTargets(req.Rule, req.Targets, ruleRunID, ruleName, now)
	if nil != err {
		return nil, err
	}
	mode := NormalizeAISecurityMode(req.Mode, GetAISecurityConfig().DefaultMode)
	pausedReason := assistantRuleCapabilityPauseReason(compiled)

	items := make([]*AssistantAgentTaskItemInput, 0, len(compiled))
	for _, item := range compiled {
		items = append(items, &AssistantAgentTaskItemInput{
			Title:    assistantRuleTargetLabel(item.Target),
			TargetID: item.Target.ID,
			Context:  assistantRuleTargetContext(item.Target),
			Patch:    item.Patch,
		})
	}
	task, err := CreateAssistantAgentTask(&AssistantAgentTaskCreateRequest{
		Title: assistantRuleRunTaskTitle(ruleName),
		Items: items,
		Metadata: &AssistantAgentTaskMetadata{
			RuleRunID:    ruleRunID,
			TriggeredBy:  AssistantRuleTriggeredBy,
			RuleName:     ruleName,
			Mode:         string(mode),
			PausedReason: pausedReason,
		},
	})
	if nil != err {
		return nil, err
	}
	if "" != pausedReason {
		// 整批暂停：任务与任务项保持可见（可审计），恢复需用户先解除安全限制。
		task, err = UpdateAssistantAgentTaskStatus(&AssistantAgentTaskStatusRequest{ID: task.ID, Status: AssistantAgentTaskPaused})
		if nil != err {
			return nil, err
		}
	}
	return &AssistantRuleRunResult{
		TaskID:         task.ID,
		RuleRunID:      ruleRunID,
		ItemCount:      len(task.Items),
		ActionsSummary: aggregateAssistantRuleActionSummaries(compiled),
		PausedReason:   pausedReason,
		Task:           task,
	}, nil
}

// ValidateAssistantRule 是规则运行的 dryRun：编译全部动作但不创建任务、不产生任何写入。
func ValidateAssistantRule(req *AssistantRuleRunRequest) (*AssistantRuleValidateResult, error) {
	if nil == req || nil == req.Rule {
		return nil, fmt.Errorf("assistant rule validation requires a rule")
	}
	compiled, err := compileAssistantRuleTargets(req.Rule, req.Targets, "", assistantRuleDisplayName(req.Rule), util.CurrentTimeMillis())
	if nil != err {
		return nil, err
	}
	targets := make([]*AssistantRuleTargetPlan, 0, len(compiled))
	for _, item := range compiled {
		targets = append(targets, &AssistantRuleTargetPlan{
			TargetID: item.Target.ID,
			Title:    item.Target.Title,
			Notebook: item.Target.Notebook,
			Path:     item.Target.Path,
			Risk:     item.Patch.Risk,
			Actions:  item.Summaries,
		})
	}
	return &AssistantRuleValidateResult{
		ItemCount:    len(compiled),
		Targets:      targets,
		PausedReason: assistantRuleCapabilityPauseReason(compiled),
	}, nil
}

// compileAssistantRuleTargets 对每个 target 编译动作序列为一个 patch（一个 target 一个任务项）。
// 任一 target 编译失败都拒绝整批（未知动作、参数缺失、越界路径等在写入前失败关闭）。
func compileAssistantRuleTargets(rule *AssistantRuleInput, targets []*AssistantRuleTarget, ruleRunID, ruleName string, now int64) ([]*assistantRuleCompiledItem, error) {
	if nil == rule {
		return nil, fmt.Errorf("assistant rule run requires a rule")
	}
	if 0 >= len(rule.Actions) {
		return nil, fmt.Errorf("assistant rule requires at least one action")
	}
	for actionID := range rule.Actions {
		switch strings.TrimSpace(actionID) {
		case AssistantRuleActionSetAttrs, AssistantRuleActionMoveNote, AssistantRuleActionAppendNote, AssistantRuleActionPushInbox:
		default:
			return nil, fmt.Errorf("unknown assistant rule action [%s]", strings.TrimSpace(actionID))
		}
	}
	if 0 >= len(targets) {
		return nil, fmt.Errorf("assistant rule run requires at least one target")
	}
	if len(targets) > assistantAgentTaskItemLimit {
		return nil, fmt.Errorf("assistant rule run supports at most %d targets per batch, got %d", assistantAgentTaskItemLimit, len(targets))
	}
	compiled := make([]*assistantRuleCompiledItem, 0, len(targets))
	for _, target := range targets {
		item, err := compileAssistantRuleTarget(rule, target, ruleRunID, ruleName, now)
		if nil != err {
			return nil, err
		}
		compiled = append(compiled, item)
	}
	return compiled, nil
}

func compileAssistantRuleTarget(rule *AssistantRuleInput, target *AssistantRuleTarget, ruleRunID, ruleName string, now int64) (*assistantRuleCompiledItem, error) {
	target = normalizeAssistantRuleTarget(target)
	if "" == target.ID {
		return nil, fmt.Errorf("assistant rule run target ID is required")
	}
	ops := []*AssistantPatchOperation{}
	summaries := []*AssistantRuleActionSummary{}
	for _, actionID := range assistantRuleActionOrder {
		if _, exists := rule.Actions[actionID]; !exists {
			continue
		}
		action := rule.Actions[actionID]
		if nil == action {
			action = &AssistantRuleActionInput{}
		}
		op, summary, err := compileAssistantRuleAction(actionID, action, ruleName, target, now)
		if nil != err {
			return nil, err
		}
		ops = append(ops, op)
		summaries = append(summaries, summary)
	}
	risk := AISecurityRiskL2
	for _, op := range ops {
		if AssistantPatchOperationMoveNote == op.Type {
			risk = AISecurityRiskL3
			break
		}
	}
	patch := &AssistantEditPatch{
		ID:          astHistoryID("rule-patch", now),
		Source:      AssistantRulePatchSource,
		Target:      "note",
		Risk:        string(risk),
		Summary:     fmt.Sprintf("规则「%s」应用于「%s」", ruleName, assistantRuleTargetLabel(target)),
		Operations:  ops,
		CreatedAt:   now,
		RuleRunID:   ruleRunID,
		TriggeredBy: AssistantRuleTriggeredBy,
	}
	return &assistantRuleCompiledItem{Target: target, Patch: patch, Summaries: summaries}, nil
}

// compileAssistantRuleAction 把单个动作编译为 patch op 并生成 dryRun 摘要。
func compileAssistantRuleAction(actionID string, action *AssistantRuleActionInput, ruleName string, target *AssistantRuleTarget, now int64) (*AssistantPatchOperation, *AssistantRuleActionSummary, error) {
	newOp := func(opType string) *AssistantPatchOperation {
		return &AssistantPatchOperation{
			ID:          astHistoryID("rule-op", now),
			Type:        opType,
			TargetID:    target.ID,
			TargetLabel: assistantRuleTargetLabel(target),
			Reason:      fmt.Sprintf("规则「%s」动作 %s", ruleName, actionID),
			Status:      "pending",
		}
	}
	switch actionID {
	case AssistantRuleActionSetAttrs:
		attrs := map[string]interface{}{}
		for key, value := range action.Attrs {
			key = strings.TrimSpace(key)
			if "" == key {
				continue
			}
			attrs[key] = expandAssistantRulePlaceholders(value, target)
		}
		if 0 >= len(attrs) {
			return nil, nil, fmt.Errorf("assistant rule action [%s] requires at least one attribute", actionID)
		}
		op := newOp(AssistantPatchOperationSetAttrs)
		op.Attrs = attrs
		return op, &AssistantRuleActionSummary{
			ActionID: actionID,
			OpType:   op.Type,
			Risk:     string(AISecurityRiskL2),
			Summary:  assistantRuleSetAttrsSummary(attrs),
		}, nil
	case AssistantRuleActionMoveNote:
		toNotebook := expandAssistantRulePlaceholders(action.Notebook, target)
		toPath := expandAssistantRulePlaceholders(action.Path, target)
		// 编译期校验：笔记本必须存在，目标路径走既有笔记本边界归一化（拒绝越界路径）；
		// 目标父文档是否存在留到 apply 时按 target 逐项判定（单篇失败不阻断批次）。
		box := resolveAssistantAIMoveTargetBox(toNotebook)
		if nil == box {
			return nil, nil, fmt.Errorf("assistant rule action [%s] target notebook [%s] was not found", actionID, toNotebook)
		}
		normalizedPath, err := normalizeAssistantAIMoveTargetPath(box, toPath)
		if nil != err {
			return nil, nil, fmt.Errorf("assistant rule action [%s]: %v", actionID, err)
		}
		op := newOp(AssistantPatchOperationMoveNote)
		op.Attrs = map[string]interface{}{"toNotebook": box.ID, "toPath": normalizedPath}
		return op, &AssistantRuleActionSummary{
			ActionID: actionID,
			OpType:   op.Type,
			Risk:     string(AISecurityRiskL3),
			Summary:  fmt.Sprintf("移动到笔记本「%s」路径 %s", box.Name, assistantRuleMovePathLabel(normalizedPath)),
		}, nil
	case AssistantRuleActionAppendNote:
		content := expandAssistantRulePlaceholders(action.Content, target)
		if "" == strings.TrimSpace(content) {
			return nil, nil, fmt.Errorf("assistant rule action [%s] requires content", actionID)
		}
		op := newOp(AssistantPatchOperationAppendNote)
		op.After = content
		op.DataType = "markdown"
		return op, &AssistantRuleActionSummary{
			ActionID: actionID,
			OpType:   op.Type,
			Risk:     string(AISecurityRiskL2),
			Summary:  fmt.Sprintf("追加内容：%s", assistantRuleTruncate(content, 40)),
		}, nil
	case AssistantRuleActionPushInbox:
		op := newOp(AssistantPatchOperationSetAttrs)
		op.Attrs = map[string]interface{}{WorkbenchAttrInbox: "true"}
		return op, &AssistantRuleActionSummary{
			ActionID: actionID,
			OpType:   op.Type,
			Risk:     string(AISecurityRiskL2),
			Summary:  "推入收件箱",
		}, nil
	default:
		return nil, nil, fmt.Errorf("unknown assistant rule action [%s]", actionID)
	}
}

// assistantRuleCapabilityPauseReason 按编译产物的能力动词检查安全配置：
// 任一能力被关闭即返回整批暂停原因（如 Move 关闭时含移动动作的运行整批暂停）。
func assistantRuleCapabilityPauseReason(compiled []*assistantRuleCompiledItem) string {
	cfg := GetAISecurityConfig()
	checked := map[string]bool{}
	for _, item := range compiled {
		if nil == item || nil == item.Patch {
			continue
		}
		for _, op := range item.Patch.Operations {
			capability := assistantPatchOperationCapability(op)
			if checked[capability] {
				continue
			}
			checked[capability] = true
			if reason := checkAISecurityCapability(cfg, capability); "" != reason {
				return fmt.Sprintf("%s，规则运行已整批暂停", reason)
			}
		}
	}
	return ""
}

func aggregateAssistantRuleActionSummaries(compiled []*assistantRuleCompiledItem) []*AssistantRuleActionCountSummary {
	order := []string{}
	counts := map[string]*AssistantRuleActionCountSummary{}
	for _, item := range compiled {
		if nil == item {
			continue
		}
		for _, summary := range item.Summaries {
			entry, exists := counts[summary.ActionID]
			if !exists {
				entry = &AssistantRuleActionCountSummary{ActionID: summary.ActionID, OpType: summary.OpType, Risk: summary.Risk}
				counts[summary.ActionID] = entry
				order = append(order, summary.ActionID)
			}
			entry.Count++
		}
	}
	ret := make([]*AssistantRuleActionCountSummary, 0, len(order))
	for _, actionID := range order {
		ret = append(ret, counts[actionID])
	}
	return ret
}

// expandAssistantRulePlaceholders 在编译时展开动作参数中的匹配上下文占位符（设计 §4）。
func expandAssistantRulePlaceholders(value string, target *AssistantRuleTarget) string {
	if "" == value || nil == target {
		return value
	}
	return strings.NewReplacer(
		"{{title}}", target.Title,
		"{{notebook}}", target.Notebook,
		"{{path}}", target.Path,
	).Replace(value)
}

func normalizeAssistantRuleTarget(target *AssistantRuleTarget) *AssistantRuleTarget {
	if nil == target {
		return &AssistantRuleTarget{}
	}
	target.ID = strings.TrimSpace(target.ID)
	target.Notebook = strings.TrimSpace(target.Notebook)
	target.Path = strings.TrimSpace(target.Path)
	target.Title = strings.TrimSpace(target.Title)
	return target
}

func assistantRuleTargetContext(target *AssistantRuleTarget) *AssistantAINoteContext {
	return &AssistantAINoteContext{
		RootID:   target.ID,
		Notebook: target.Notebook,
		Path:     target.Path,
		Title:    target.Title,
	}
}

func assistantRuleTargetLabel(target *AssistantRuleTarget) string {
	return firstAssistantAINonEmpty(target.Title, target.ID)
}

func assistantRuleDisplayName(rule *AssistantRuleInput) string {
	return firstAssistantAINonEmpty(rule.Name, "未命名规则")
}

func assistantRuleRunTaskTitle(ruleName string) string {
	return fmt.Sprintf("规则运行：%s", ruleName)
}

func assistantRuleSetAttrsSummary(attrs map[string]interface{}) string {
	keys := make([]string, 0, len(attrs))
	for key := range attrs {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	pairs := make([]string, 0, len(keys))
	for _, key := range keys {
		pairs = append(pairs, fmt.Sprintf("%s=%s", key, assistantRuleTruncate(fmt.Sprint(attrs[key]), 20)))
	}
	return "设置属性 " + strings.Join(pairs, ", ")
}

func assistantRuleMovePathLabel(normalizedPath string) string {
	if "/" == normalizedPath || "" == normalizedPath {
		return "（笔记本根目录）"
	}
	return strings.TrimSuffix(strings.TrimPrefix(normalizedPath, "/"), ".sf")
}

func assistantRuleTruncate(text string, limit int) string {
	runes := []rune(strings.TrimSpace(text))
	if len(runes) <= limit {
		return string(runes)
	}
	return string(runes[:limit]) + "…"
}
