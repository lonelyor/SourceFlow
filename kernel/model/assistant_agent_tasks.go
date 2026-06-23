package model

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/filelock"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
)

const (
	assistantAgentTaskLimit       = 20
	assistantAgentTaskItemLimit   = 20
	assistantAgentLeaseDurationMs = int64(15 * 60 * 1000)
)

type AssistantAgentTaskStatus string

const (
	AssistantAgentTaskRunning   AssistantAgentTaskStatus = "running"
	AssistantAgentTaskPaused    AssistantAgentTaskStatus = "paused"
	AssistantAgentTaskReview    AssistantAgentTaskStatus = "review"
	AssistantAgentTaskCompleted AssistantAgentTaskStatus = "completed"
	AssistantAgentTaskCanceled  AssistantAgentTaskStatus = "canceled"
)

type AssistantAgentItemStatus string

const (
	AssistantAgentItemPending  AssistantAgentItemStatus = "pending"
	AssistantAgentItemRunning  AssistantAgentItemStatus = "running"
	AssistantAgentItemReview   AssistantAgentItemStatus = "review"
	AssistantAgentItemDone     AssistantAgentItemStatus = "done"
	AssistantAgentItemFailed   AssistantAgentItemStatus = "failed"
	AssistantAgentItemCanceled AssistantAgentItemStatus = "canceled"
)

type AssistantAgentTaskItem struct {
	ID         string                   `json:"id"`
	Title      string                   `json:"title"`
	TargetID   string                   `json:"targetId,omitempty"`
	Status     AssistantAgentItemStatus `json:"status"`
	PatchID    string                   `json:"patchId,omitempty"`
	Patch      *AssistantEditPatch      `json:"patch,omitempty"`
	Context    *AssistantAINoteContext  `json:"context,omitempty"`
	Error      string                   `json:"error,omitempty"`
	RetryCount int                      `json:"retryCount,omitempty"`
	UpdatedAt  int64                    `json:"updatedAt,omitempty"`
}

type AssistantAgentTask struct {
	ID             string                    `json:"id"`
	Title          string                    `json:"title"`
	Status         AssistantAgentTaskStatus  `json:"status"`
	Items          []*AssistantAgentTaskItem `json:"items"`
	CreatedAt      int64                     `json:"createdAt"`
	UpdatedAt      int64                     `json:"updatedAt"`
	LeaseOwner     string                    `json:"leaseOwner,omitempty"`
	LeaseExpiresAt int64                     `json:"leaseExpiresAt,omitempty"`
	LeaseToken     string                    `json:"leaseToken,omitempty"`
}

type AssistantAgentTaskItemInput struct {
	Title    string                  `json:"title"`
	TargetID string                  `json:"targetId,omitempty"`
	Context  *AssistantAINoteContext `json:"context,omitempty"`
}

type AssistantAgentTaskCreateRequest struct {
	Title string                         `json:"title"`
	Items []*AssistantAgentTaskItemInput `json:"items"`
}

type AssistantAgentTaskListRequest struct {
	Limit int `json:"limit"`
}

type AssistantAgentTaskStatusRequest struct {
	ID     string                   `json:"id"`
	Status AssistantAgentTaskStatus `json:"status"`
}

type AssistantAgentTaskItemUpdateRequest struct {
	TaskID string                  `json:"taskId"`
	ItemID string                  `json:"itemId"`
	Item   *AssistantAgentTaskItem `json:"item"`
}

type AssistantAgentTaskItemsUpdateRequest struct {
	TaskID string                    `json:"taskId"`
	Items  []*AssistantAgentTaskItem `json:"items"`
}

type AssistantAgentTaskIDRequest struct {
	TaskID string `json:"taskId"`
}

type AssistantAgentLeaseRequest struct {
	TaskID     string `json:"taskId"`
	Owner      string `json:"owner,omitempty"`
	LeaseToken string `json:"leaseToken,omitempty"`
}

type AssistantAgentLeaseResult struct {
	Task      *AssistantAgentTask `json:"task,omitempty"`
	Token     string              `json:"token,omitempty"`
	ExpiresAt int64               `json:"expiresAt,omitempty"`
}

var assistantAgentTaskLock sync.Mutex

func assistantAgentTaskPath() string {
	return filepath.Join(util.DataDir, "storage", "assistant_agent_tasks.json")
}

func ListAssistantAgentTasks(limit int) []*AssistantAgentTask {
	assistantAgentTaskLock.Lock()
	defer assistantAgentTaskLock.Unlock()
	items := readAssistantAgentTasksLocked()
	if cleanupExpiredAssistantAgentLeasesLocked(items, util.CurrentTimeMillis()) {
		if err := writeAssistantAgentTasksLocked(items); nil != err {
			logging.LogWarnf("cleanup assistant agent task leases failed: %s", err)
		}
	}
	if limit <= 0 || limit > assistantAgentTaskLimit {
		limit = assistantAgentTaskLimit
	}
	if len(items) > limit {
		items = items[:limit]
	}
	return cloneAssistantAgentTasksForResponse(items)
}

func CreateAssistantAgentTask(req *AssistantAgentTaskCreateRequest) (*AssistantAgentTask, error) {
	if nil == req {
		return nil, fmt.Errorf("assistant agent task request is required")
	}
	now := util.CurrentTimeMillis()
	task := &AssistantAgentTask{
		ID:        assistantAgentID("agent", now),
		Title:     strings.TrimSpace(req.Title),
		Status:    AssistantAgentTaskRunning,
		Items:     normalizeAssistantAgentTaskInputItems(req.Items, now),
		CreatedAt: now,
		UpdatedAt: now,
	}
	if "" == task.Title {
		task.Title = "AI Agent Task"
	}
	if 1 > len(task.Items) {
		return nil, fmt.Errorf("assistant agent task requires at least one item")
	}

	assistantAgentTaskLock.Lock()
	defer assistantAgentTaskLock.Unlock()
	items := append([]*AssistantAgentTask{normalizeAssistantAgentTask(task)}, readAssistantAgentTasksLocked()...)
	if len(items) > assistantAgentTaskLimit {
		items = items[:assistantAgentTaskLimit]
	}
	if err := writeAssistantAgentTasksLocked(items); nil != err {
		return nil, err
	}
	return cloneAssistantAgentTaskForResponse(items[0]), nil
}

func UpdateAssistantAgentTaskStatus(req *AssistantAgentTaskStatusRequest) (*AssistantAgentTask, error) {
	if nil == req || "" == strings.TrimSpace(req.ID) {
		return nil, fmt.Errorf("assistant agent task ID is required")
	}
	status := normalizeAssistantAgentTaskStatus(req.Status)

	assistantAgentTaskLock.Lock()
	defer assistantAgentTaskLock.Unlock()
	items := readAssistantAgentTasksLocked()
	task := findAssistantAgentTask(items, req.ID)
	if nil == task {
		return nil, fmt.Errorf("assistant agent task was not found")
	}
	now := util.CurrentTimeMillis()
	task.Status = status
	task.UpdatedAt = now
	if status == AssistantAgentTaskCanceled {
		for _, item := range task.Items {
			if item.Status == AssistantAgentItemDone || item.Status == AssistantAgentItemReview {
				continue
			}
			item.Status = AssistantAgentItemCanceled
			item.UpdatedAt = now
		}
		clearAssistantAgentTaskLease(task)
	} else if status == AssistantAgentTaskPaused || status == AssistantAgentTaskCompleted || status == AssistantAgentTaskReview {
		clearAssistantAgentTaskLease(task)
	}
	if err := writeAssistantAgentTasksLocked(items); nil != err {
		return nil, err
	}
	return cloneAssistantAgentTaskForResponse(task), nil
}

func UpdateAssistantAgentTaskItem(req *AssistantAgentTaskItemUpdateRequest) (*AssistantAgentTaskItem, error) {
	if nil == req || "" == strings.TrimSpace(req.TaskID) || "" == strings.TrimSpace(req.ItemID) || nil == req.Item {
		return nil, fmt.Errorf("assistant agent task item update is incomplete")
	}

	assistantAgentTaskLock.Lock()
	defer assistantAgentTaskLock.Unlock()
	items := readAssistantAgentTasksLocked()
	task := findAssistantAgentTask(items, req.TaskID)
	if nil == task {
		return nil, fmt.Errorf("assistant agent task was not found")
	}
	now := util.CurrentTimeMillis()
	for index, item := range task.Items {
		if strings.TrimSpace(item.ID) != strings.TrimSpace(req.ItemID) {
			continue
		}
		next := normalizeAssistantAgentTaskItem(req.Item, now)
		next.ID = strings.TrimSpace(req.ItemID)
		task.Items[index] = next
		task.UpdatedAt = now
		if err := writeAssistantAgentTasksLocked(items); nil != err {
			return nil, err
		}
		return cloneAssistantAgentTaskItem(next), nil
	}
	return nil, fmt.Errorf("assistant agent task item was not found")
}

func UpdateAssistantAgentTaskItems(req *AssistantAgentTaskItemsUpdateRequest) (*AssistantAgentTask, error) {
	if nil == req || "" == strings.TrimSpace(req.TaskID) {
		return nil, fmt.Errorf("assistant agent task ID is required")
	}
	assistantAgentTaskLock.Lock()
	defer assistantAgentTaskLock.Unlock()
	items := readAssistantAgentTasksLocked()
	task := findAssistantAgentTask(items, req.TaskID)
	if nil == task {
		return nil, fmt.Errorf("assistant agent task was not found")
	}
	now := util.CurrentTimeMillis()
	nextItems := make([]*AssistantAgentTaskItem, 0, len(req.Items))
	for _, item := range req.Items {
		nextItems = append(nextItems, normalizeAssistantAgentTaskItem(item, now))
		if len(nextItems) >= assistantAgentTaskItemLimit {
			break
		}
	}
	if 1 > len(nextItems) {
		return nil, fmt.Errorf("assistant agent task items are required")
	}
	task.Items = nextItems
	task.UpdatedAt = now
	if err := writeAssistantAgentTasksLocked(items); nil != err {
		return nil, err
	}
	return cloneAssistantAgentTaskForResponse(task), nil
}

func CancelAssistantAgentPendingItems(req *AssistantAgentTaskIDRequest) (*AssistantAgentTask, error) {
	if nil == req || "" == strings.TrimSpace(req.TaskID) {
		return nil, fmt.Errorf("assistant agent task ID is required")
	}
	assistantAgentTaskLock.Lock()
	defer assistantAgentTaskLock.Unlock()
	items := readAssistantAgentTasksLocked()
	task := findAssistantAgentTask(items, req.TaskID)
	if nil == task {
		return nil, fmt.Errorf("assistant agent task was not found")
	}
	now := util.CurrentTimeMillis()
	for _, item := range task.Items {
		if item.Status == AssistantAgentItemDone || item.Status == AssistantAgentItemReview {
			continue
		}
		item.Status = AssistantAgentItemCanceled
		item.UpdatedAt = now
	}
	task.UpdatedAt = now
	if err := writeAssistantAgentTasksLocked(items); nil != err {
		return nil, err
	}
	return cloneAssistantAgentTaskForResponse(task), nil
}

func AcquireAssistantAgentTaskLease(req *AssistantAgentLeaseRequest) (*AssistantAgentLeaseResult, error) {
	if nil == req || "" == strings.TrimSpace(req.TaskID) {
		return nil, fmt.Errorf("assistant agent task ID is required")
	}
	assistantAgentTaskLock.Lock()
	defer assistantAgentTaskLock.Unlock()
	items := readAssistantAgentTasksLocked()
	task := findAssistantAgentTask(items, req.TaskID)
	if nil == task {
		return nil, fmt.Errorf("assistant agent task was not found")
	}
	if task.Status == AssistantAgentTaskCanceled || task.Status == AssistantAgentTaskCompleted {
		return nil, fmt.Errorf("assistant agent task cannot run from status [%s]", task.Status)
	}
	now := util.CurrentTimeMillis()
	if "" != strings.TrimSpace(task.LeaseToken) && task.LeaseExpiresAt > now {
		return nil, fmt.Errorf("assistant agent task is already running")
	}
	token := assistantAgentID("agent-lease", now)
	task.LeaseToken = token
	task.LeaseOwner = strings.TrimSpace(req.Owner)
	task.LeaseExpiresAt = now + assistantAgentLeaseDurationMs
	task.Status = AssistantAgentTaskRunning
	task.UpdatedAt = now
	if err := writeAssistantAgentTasksLocked(items); nil != err {
		return nil, err
	}
	return &AssistantAgentLeaseResult{
		Task:      cloneAssistantAgentTaskForResponse(task),
		Token:     token,
		ExpiresAt: task.LeaseExpiresAt,
	}, nil
}

func ReleaseAssistantAgentTaskLease(req *AssistantAgentLeaseRequest) (*AssistantAgentTask, error) {
	if nil == req || "" == strings.TrimSpace(req.TaskID) {
		return nil, fmt.Errorf("assistant agent task ID is required")
	}
	assistantAgentTaskLock.Lock()
	defer assistantAgentTaskLock.Unlock()
	items := readAssistantAgentTasksLocked()
	task := findAssistantAgentTask(items, req.TaskID)
	if nil == task {
		return nil, fmt.Errorf("assistant agent task was not found")
	}
	token := strings.TrimSpace(req.LeaseToken)
	if "" != strings.TrimSpace(task.LeaseToken) && strings.TrimSpace(task.LeaseToken) != token {
		return nil, fmt.Errorf("assistant agent task lease token is invalid")
	}
	clearAssistantAgentTaskLease(task)
	task.UpdatedAt = util.CurrentTimeMillis()
	if err := writeAssistantAgentTasksLocked(items); nil != err {
		return nil, err
	}
	return cloneAssistantAgentTaskForResponse(task), nil
}

func readAssistantAgentTasksLocked() []*AssistantAgentTask {
	data, err := os.ReadFile(assistantAgentTaskPath())
	if nil != err {
		if !os.IsNotExist(err) {
			logging.LogWarnf("read assistant agent tasks failed: %s", err)
		}
		return []*AssistantAgentTask{}
	}
	items := []*AssistantAgentTask{}
	if err = json.Unmarshal(data, &items); nil != err {
		logging.LogWarnf("parse assistant agent tasks failed: %s", err)
		return []*AssistantAgentTask{}
	}
	normalized := make([]*AssistantAgentTask, 0, len(items))
	for _, item := range items {
		if normalizedItem := normalizeAssistantAgentTask(item); nil != normalizedItem {
			normalized = append(normalized, normalizedItem)
		}
		if len(normalized) >= assistantAgentTaskLimit {
			break
		}
	}
	return normalized
}

func writeAssistantAgentTasksLocked(items []*AssistantAgentTask) error {
	if err := os.MkdirAll(filepath.Dir(assistantAgentTaskPath()), 0755); nil != err {
		return fmt.Errorf("create assistant agent task dir: %w", err)
	}
	data, err := json.MarshalIndent(items, "", "  ")
	if nil != err {
		return fmt.Errorf("marshal assistant agent tasks: %w", err)
	}
	if err = filelock.WriteFile(assistantAgentTaskPath(), data); nil != err {
		return fmt.Errorf("write assistant agent tasks: %w", err)
	}
	return nil
}

func normalizeAssistantAgentTask(task *AssistantAgentTask) *AssistantAgentTask {
	if nil == task || "" == strings.TrimSpace(task.ID) {
		return nil
	}
	now := util.CurrentTimeMillis()
	task.ID = strings.TrimSpace(task.ID)
	task.Title = strings.TrimSpace(task.Title)
	if "" == task.Title {
		task.Title = "AI Agent Task"
	}
	task.Status = normalizeAssistantAgentTaskStatus(task.Status)
	if task.CreatedAt <= 0 {
		task.CreatedAt = now
	}
	if task.UpdatedAt <= 0 {
		task.UpdatedAt = task.CreatedAt
	}
	normalizedItems := make([]*AssistantAgentTaskItem, 0, len(task.Items))
	for _, item := range task.Items {
		if normalizedItem := normalizeAssistantAgentTaskItem(item, task.UpdatedAt); nil != normalizedItem {
			normalizedItems = append(normalizedItems, normalizedItem)
		}
		if len(normalizedItems) >= assistantAgentTaskItemLimit {
			break
		}
	}
	task.Items = normalizedItems
	task.LeaseOwner = strings.TrimSpace(task.LeaseOwner)
	task.LeaseToken = strings.TrimSpace(task.LeaseToken)
	if "" == task.LeaseToken {
		task.LeaseOwner = ""
		task.LeaseExpiresAt = 0
	}
	return task
}

func normalizeAssistantAgentTaskInputItems(items []*AssistantAgentTaskItemInput, now int64) []*AssistantAgentTaskItem {
	ret := make([]*AssistantAgentTaskItem, 0, len(items))
	for _, item := range items {
		if nil == item {
			continue
		}
		ret = append(ret, normalizeAssistantAgentTaskItem(&AssistantAgentTaskItem{
			ID:        assistantAgentID("item", now),
			Title:     item.Title,
			TargetID:  item.TargetID,
			Status:    AssistantAgentItemPending,
			Context:   cloneAssistantAINoteContext(item.Context),
			UpdatedAt: now,
		}, now))
		if len(ret) >= assistantAgentTaskItemLimit {
			break
		}
	}
	return ret
}

func normalizeAssistantAgentTaskItem(item *AssistantAgentTaskItem, now int64) *AssistantAgentTaskItem {
	if nil == item {
		return nil
	}
	item.ID = strings.TrimSpace(item.ID)
	if "" == item.ID {
		item.ID = assistantAgentID("item", now)
	}
	item.Title = strings.TrimSpace(item.Title)
	if "" == item.Title {
		item.Title = "Task item"
	}
	item.TargetID = strings.TrimSpace(item.TargetID)
	item.Status = normalizeAssistantAgentItemStatus(item.Status)
	item.PatchID = strings.TrimSpace(firstAssistantAINonEmpty(item.PatchID, assistantAgentPatchID(item.Patch)))
	item.Context = cloneAssistantAINoteContext(item.Context)
	item.Error = strings.TrimSpace(item.Error)
	if item.RetryCount < 0 {
		item.RetryCount = 0
	}
	if item.UpdatedAt <= 0 {
		item.UpdatedAt = now
	}
	return item
}

func normalizeAssistantAgentTaskStatus(status AssistantAgentTaskStatus) AssistantAgentTaskStatus {
	switch status {
	case AssistantAgentTaskRunning, AssistantAgentTaskPaused, AssistantAgentTaskReview, AssistantAgentTaskCompleted, AssistantAgentTaskCanceled:
		return status
	default:
		return AssistantAgentTaskPaused
	}
}

func normalizeAssistantAgentItemStatus(status AssistantAgentItemStatus) AssistantAgentItemStatus {
	switch status {
	case AssistantAgentItemPending, AssistantAgentItemRunning, AssistantAgentItemReview, AssistantAgentItemDone, AssistantAgentItemFailed, AssistantAgentItemCanceled:
		return status
	default:
		return AssistantAgentItemPending
	}
}

func assistantAgentPatchID(patch *AssistantEditPatch) string {
	if nil == patch {
		return ""
	}
	return strings.TrimSpace(patch.ID)
}

func findAssistantAgentTask(items []*AssistantAgentTask, id string) *AssistantAgentTask {
	id = strings.TrimSpace(id)
	for _, item := range items {
		if nil != item && strings.TrimSpace(item.ID) == id {
			return item
		}
	}
	return nil
}

func cleanupExpiredAssistantAgentLeasesLocked(items []*AssistantAgentTask, now int64) bool {
	changed := false
	for _, task := range items {
		if nil == task || "" == strings.TrimSpace(task.LeaseToken) || task.LeaseExpiresAt > now {
			continue
		}
		clearAssistantAgentTaskLease(task)
		changed = true
	}
	return changed
}

func clearAssistantAgentTaskLease(task *AssistantAgentTask) {
	if nil == task {
		return
	}
	task.LeaseOwner = ""
	task.LeaseToken = ""
	task.LeaseExpiresAt = 0
}

func cloneAssistantAgentTasksForResponse(items []*AssistantAgentTask) []*AssistantAgentTask {
	ret := make([]*AssistantAgentTask, 0, len(items))
	for _, item := range items {
		if cloned := cloneAssistantAgentTaskForResponse(item); nil != cloned {
			ret = append(ret, cloned)
		}
	}
	return ret
}

func cloneAssistantAgentTaskForResponse(task *AssistantAgentTask) *AssistantAgentTask {
	cloned := cloneAssistantAgentTask(task)
	if nil == cloned {
		return nil
	}
	cloned.LeaseToken = ""
	return cloned
}

func cloneAssistantAgentTask(task *AssistantAgentTask) *AssistantAgentTask {
	if nil == task {
		return nil
	}
	data, err := json.Marshal(task)
	if nil != err {
		return nil
	}
	cloned := &AssistantAgentTask{}
	if err = json.Unmarshal(data, cloned); nil != err {
		return nil
	}
	return cloned
}

func cloneAssistantAgentTaskItem(item *AssistantAgentTaskItem) *AssistantAgentTaskItem {
	if nil == item {
		return nil
	}
	data, err := json.Marshal(item)
	if nil != err {
		return nil
	}
	cloned := &AssistantAgentTaskItem{}
	if err = json.Unmarshal(data, cloned); nil != err {
		return nil
	}
	return cloned
}

func assistantAgentID(prefix string, now int64) string {
	return fmt.Sprintf("%s-%d-%s", strings.TrimSpace(prefix), now, util.RandString(6))
}
