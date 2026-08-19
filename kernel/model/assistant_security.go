package model

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/lonelyor/sourceflow/kernel/sql"
	"github.com/lonelyor/sourceflow/kernel/treenode"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/filelock"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
)

type AISecurityMode string

const (
	AISecurityModeDefault    AISecurityMode = "default"
	AISecurityModeAutoReview AISecurityMode = "autoReview"
	AISecurityModeFullAccess AISecurityMode = "fullAccess"
)

type AISecurityRuleType string

const (
	AISecurityRuleNotebook  AISecurityRuleType = "notebook"
	AISecurityRuleFolder    AISecurityRuleType = "folder"
	AISecurityRuleNote      AISecurityRuleType = "note"
	AISecurityRuleTag       AISecurityRuleType = "tag"
	AISecurityRuleAssetType AISecurityRuleType = "assetType"
	AISecurityRuleToolType  AISecurityRuleType = "toolType"
)

type AISecurityRule struct {
	Type AISecurityRuleType `json:"type"`
	ID   string             `json:"id"`
	Name string             `json:"name,omitempty"`
}

type AISecurityCapabilities struct {
	Read        bool `json:"read"`
	Write       bool `json:"write"`
	Execute     bool `json:"execute"`
	Create      bool `json:"create"`
	DeleteBlock bool `json:"deleteBlock"`
	DeleteNote  bool `json:"deleteNote"`
	Move        bool `json:"move"`
}

type AISecurityConfig struct {
	DefaultMode    AISecurityMode         `json:"defaultMode"`
	Blacklist      []AISecurityRule       `json:"blacklist"`
	Whitelist      []AISecurityRule       `json:"whitelist"`
	Capabilities   AISecurityCapabilities `json:"capabilities"`
	BatchThreshold int                    `json:"batchThreshold"`
}

type AISecurityPermissionRequest struct {
	Mode              AISecurityMode
	Risk              AISecurityRiskLevel
	TargetType        string
	TargetIDs         []string
	SessionBatchCount int
	Capability        string
	ToolID            string
	Source            string
	SessionID         string
	AgentTaskID       string
	OperationType     string
}

var (
	aiSecurityConfigCache *AISecurityConfig
	aiSecurityConfigLock  sync.Mutex
)

const (
	AISecurityDefaultBatchThreshold = 10
	AISecurityMaxBatchThreshold     = 100
	AISecurityBypassNearBatchMargin = 1
	AISecurityLowRiskComboThreshold = 3

	AISecurityCapabilityRead        = "read"
	AISecurityCapabilityWrite       = "write"
	AISecurityCapabilityCreate      = "create"
	AISecurityCapabilityDeleteBlock = "deleteBlock"
	AISecurityCapabilityDeleteNote  = "deleteNote"
	AISecurityCapabilityMove        = "move"
	AISecurityCapabilityExecute     = "execute"

	AISecuritySourceAssistantTool    = "assistant-tool"
	AISecuritySourceAssistantPatch   = "assistant-patch"
	AISecuritySourceAssistantHistory = "assistant-history"
	AISecuritySourceManualCheck      = "manual-check"
)

func aiSecurityConfigPath() string {
	return filepath.Join(util.DataDir, "storage", "ai_security.json")
}

func NewAISecurityConfig() *AISecurityConfig {
	return &AISecurityConfig{
		DefaultMode: AISecurityModeDefault,
		Blacklist:   []AISecurityRule{},
		Whitelist:   []AISecurityRule{},
		Capabilities: AISecurityCapabilities{
			Read:        true,
			Write:       true,
			Execute:     false,
			Create:      true,
			DeleteBlock: true,
			DeleteNote:  false,
			Move:        false,
		},
		BatchThreshold: AISecurityDefaultBatchThreshold,
	}
}

func cloneAISecurityConfig(cfg *AISecurityConfig) *AISecurityConfig {
	return normalizeAISecurityConfig(cfg, true)
}

func NormalizeAISecurityConfig(cfg *AISecurityConfig) *AISecurityConfig {
	return normalizeAISecurityConfig(cfg, false)
}

func normalizeAISecurityConfig(cfg *AISecurityConfig, preserveZeroCapabilities bool) *AISecurityConfig {
	defaults := NewAISecurityConfig()
	if cfg == nil {
		return defaults
	}
	normalized := *defaults
	normalized.DefaultMode = NormalizeAISecurityMode(cfg.DefaultMode, defaults.DefaultMode)
	normalized.Blacklist = normalizeAISecurityRules(cfg.Blacklist)
	normalized.Whitelist = normalizeAISecurityRules(cfg.Whitelist)
	normalized.Capabilities = normalizeAISecurityCapabilities(cfg.Capabilities, defaults.Capabilities, preserveZeroCapabilities)
	normalized.BatchThreshold = cfg.BatchThreshold
	if normalized.BatchThreshold <= 0 {
		normalized.BatchThreshold = AISecurityDefaultBatchThreshold
	} else if normalized.BatchThreshold > AISecurityMaxBatchThreshold {
		normalized.BatchThreshold = AISecurityMaxBatchThreshold
	}
	return &normalized
}

func normalizeAISecurityCapabilities(capabilities AISecurityCapabilities, defaults AISecurityCapabilities, preserveZero bool) AISecurityCapabilities {
	if !capabilities.Read && !capabilities.Write && !capabilities.Execute && !capabilities.Create && !capabilities.DeleteBlock && !capabilities.DeleteNote && !capabilities.Move {
		if preserveZero {
			return capabilities
		}
		return defaults
	}
	return capabilities
}

func NormalizeAISecurityMode(mode AISecurityMode, fallback AISecurityMode) AISecurityMode {
	switch AISecurityMode(strings.TrimSpace(string(mode))) {
	case AISecurityModeDefault:
		return AISecurityModeDefault
	case AISecurityModeAutoReview:
		return AISecurityModeAutoReview
	case AISecurityModeFullAccess:
		return AISecurityModeFullAccess
	default:
		switch fallback {
		case AISecurityModeDefault, AISecurityModeAutoReview, AISecurityModeFullAccess:
			return fallback
		default:
			return AISecurityModeDefault
		}
	}
}

func normalizeAISecurityRules(rules []AISecurityRule) []AISecurityRule {
	if nil == rules {
		return []AISecurityRule{}
	}
	seen := map[string]struct{}{}
	normalized := make([]AISecurityRule, 0, len(rules))
	for _, rule := range rules {
		ruleType := normalizeAISecurityRuleType(rule.Type)
		id := strings.TrimSpace(rule.ID)
		if "" == id {
			continue
		}
		key := string(ruleType) + "\x00" + id
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		normalized = append(normalized, AISecurityRule{
			Type: ruleType,
			ID:   id,
			Name: strings.TrimSpace(rule.Name),
		})
	}
	return normalized
}

func normalizeAISecurityRuleType(ruleType AISecurityRuleType) AISecurityRuleType {
	switch AISecurityRuleType(strings.TrimSpace(string(ruleType))) {
	case AISecurityRuleNotebook:
		return AISecurityRuleNotebook
	case AISecurityRuleFolder:
		return AISecurityRuleFolder
	case AISecurityRuleTag:
		return AISecurityRuleTag
	case AISecurityRuleAssetType:
		return AISecurityRuleAssetType
	case AISecurityRuleToolType:
		return AISecurityRuleToolType
	default:
		return AISecurityRuleNote
	}
}

func GetAISecurityConfig() *AISecurityConfig {
	aiSecurityConfigLock.Lock()
	defer aiSecurityConfigLock.Unlock()
	return cloneAISecurityConfig(getAISecurityConfigLocked())
}

func getAISecurityConfigLocked() *AISecurityConfig {
	if aiSecurityConfigCache != nil {
		return aiSecurityConfigCache
	}
	cfg := NewAISecurityConfig()
	p := aiSecurityConfigPath()
	data, err := os.ReadFile(p)
	if err != nil {
		aiSecurityConfigCache = cfg
		return cfg
	}
	if err = json.Unmarshal(data, cfg); err != nil {
		logging.LogWarnf("parse AI security config [%s] failed: %s", p, err)
		cfg = NewAISecurityConfig()
	}
	cfg = normalizeAISecurityConfig(cfg, strings.Contains(string(data), `"capabilities"`))
	aiSecurityConfigCache = cfg
	return cfg
}

func SetAISecurityConfig(cfg *AISecurityConfig) error {
	aiSecurityConfigLock.Lock()
	defer aiSecurityConfigLock.Unlock()
	if cfg == nil {
		cfg = NewAISecurityConfig()
	}
	cfg = normalizeAISecurityConfig(cfg, true)
	dir := filepath.Dir(aiSecurityConfigPath())
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("create AI security config dir: %w", err)
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal AI security config: %w", err)
	}
	if err := filelock.WriteFile(aiSecurityConfigPath(), data); err != nil {
		return fmt.Errorf("write AI security config: %w", err)
	}
	aiSecurityConfigCache = cfg
	return nil
}

type AISecurityRiskLevel string

const (
	AISecurityRiskL1 AISecurityRiskLevel = "L1"
	AISecurityRiskL2 AISecurityRiskLevel = "L2"
	AISecurityRiskL3 AISecurityRiskLevel = "L3"
	AISecurityRiskL4 AISecurityRiskLevel = "L4"
	AISecurityRiskL5 AISecurityRiskLevel = "L5"
	AISecurityRiskL6 AISecurityRiskLevel = "L6"
)

type AISecurityDecision string

const (
	AISecurityAllow   AISecurityDecision = "allow"
	AISecurityConfirm AISecurityDecision = "confirm"
	AISecurityDeny    AISecurityDecision = "deny"
)

type AISecurityAffectedItem struct {
	ID    string `json:"id"`
	Title string `json:"title,omitempty"`
	Path  string `json:"path,omitempty"`
	Risk  string `json:"risk"`
}

type AISecurityPermissionResult struct {
	Decision      AISecurityDecision       `json:"decision"`
	Reason        string                   `json:"reason,omitempty"`
	Escalatable   bool                     `json:"escalatable,omitempty"`
	AffectedItems []AISecurityAffectedItem `json:"affectedItems,omitempty"`
}

func CheckAISecurityPermission(mode AISecurityMode, risk AISecurityRiskLevel, targetType string, targetIDs []string, sessionBatchCount int) *AISecurityPermissionResult {
	return CheckAISecurityPermissionForRequest(&AISecurityPermissionRequest{
		Mode:              mode,
		Risk:              risk,
		TargetType:        targetType,
		TargetIDs:         targetIDs,
		SessionBatchCount: sessionBatchCount,
	})
}

func CheckAISecurityPermissionForRequest(req *AISecurityPermissionRequest) *AISecurityPermissionResult {
	cfg := GetAISecurityConfig()
	if nil == req {
		req = &AISecurityPermissionRequest{}
	}
	mode := NormalizeAISecurityMode(req.Mode, cfg.DefaultMode)
	risk := normalizeAISecurityRiskLevel(req.Risk)
	targetType := strings.TrimSpace(req.TargetType)
	if "" == targetType {
		targetType = "note"
	}
	targetIDs := normalizeAISecurityTargetIDs(req.TargetIDs)
	sessionBatchCount := req.SessionBatchCount
	if sessionBatchCount < len(targetIDs) {
		sessionBatchCount = len(targetIDs)
	}

	if isHardBannedOperation(risk, targetType) {
		return &AISecurityPermissionResult{
			Decision: AISecurityDeny,
			Reason:   "此操作被硬禁止：不允许删除工作空间、笔记本或清空全部笔记",
		}
	}

	if deniedReason := checkAISecurityCapability(cfg, strings.TrimSpace(req.Capability)); "" != deniedReason {
		return &AISecurityPermissionResult{
			Decision: AISecurityDeny,
			Reason:   deniedReason,
		}
	}

	if "" != strings.TrimSpace(req.ToolID) && isInBlacklist(cfg.Blacklist, "toolType", strings.TrimSpace(req.ToolID)) {
		return &AISecurityPermissionResult{
			Decision: AISecurityDeny,
			Reason:   fmt.Sprintf("工具 %s 在黑名单中，AI 无法调用", strings.TrimSpace(req.ToolID)),
		}
	}

	for _, id := range targetIDs {
		if isInBlacklist(cfg.Blacklist, targetType, id) {
			return &AISecurityPermissionResult{
				Decision: AISecurityDeny,
				Reason:   fmt.Sprintf("目标 %s 在黑名单中，AI 无法操作", id),
			}
		}
	}

	if result := detectAISecurityBypassAttempt(cfg, risk, targetType, targetIDs, sessionBatchCount); nil != result {
		return result
	}

	if result := detectAISecurityEntryBypass(req, risk); nil != result {
		return result
	}

	if sessionBatchCount >= cfg.BatchThreshold && isWriteRisk(risk) {
		return &AISecurityPermissionResult{
			Decision:      AISecurityConfirm,
			Reason:        fmt.Sprintf("本次操作累计影响 %d 篇笔记，达到批量阈值 %d，需要人工确认", sessionBatchCount, cfg.BatchThreshold),
			Escalatable:   true,
			AffectedItems: buildAffectedItems(targetIDs, targetType),
		}
	}

	decision := permissionByModeAndRisk(mode, risk)
	if decision == AISecurityDeny {
		return &AISecurityPermissionResult{
			Decision:    AISecurityDeny,
			Reason:      fmt.Sprintf("当前权限模式 [%s] 不允许执行 %s 风险操作", mode, risk),
			Escalatable: isWriteRisk(risk),
		}
	}
	if decision == AISecurityConfirm {
		if AISecurityModeAutoReview == mode && isLowRiskWhitelistMatch(cfg.Whitelist, targetType, targetIDs, risk) {
			return &AISecurityPermissionResult{
				Decision: AISecurityAllow,
			}
		}
		return &AISecurityPermissionResult{
			Decision:      AISecurityConfirm,
			Reason:        fmt.Sprintf("%s 风险操作 [%s] 需要确认", risk, targetType),
			Escalatable:   true,
			AffectedItems: buildAffectedItems(targetIDs, targetType),
		}
	}

	return &AISecurityPermissionResult{
		Decision: AISecurityAllow,
	}
}

func checkToolSecurity(def *AssistantAIToolDefinition, context *AssistantAINoteContext, args map[string]interface{}, mode AISecurityMode, sessionBatchCount int) *AISecurityPermissionResult {
	if def == nil {
		return &AISecurityPermissionResult{Decision: AISecurityAllow}
	}
	risk := toolRiskToSecurityRisk(def.Risk)
	targetType, targetIDs := resolveToolSecurityTarget(def, context, args)
	return CheckAISecurityPermissionForRequest(&AISecurityPermissionRequest{
		Mode:              mode,
		Risk:              risk,
		TargetType:        targetType,
		TargetIDs:         targetIDs,
		SessionBatchCount: sessionBatchCount,
		Capability:        toolSecurityCapability(def),
		ToolID:            def.ID,
		Source:            AISecuritySourceAssistantTool,
	})
}

func toolRiskToSecurityRisk(risk string) AISecurityRiskLevel {
	switch risk {
	case "L1":
		return AISecurityRiskL1
	case "L2":
		return AISecurityRiskL2
	case "L3":
		return AISecurityRiskL3
	case "L4":
		return AISecurityRiskL4
	case "L5":
		return AISecurityRiskL5
	case "L6":
		return AISecurityRiskL6
	default:
		return AISecurityRiskL3
	}
}

func normalizeAISecurityRiskLevel(risk AISecurityRiskLevel) AISecurityRiskLevel {
	switch AISecurityRiskLevel(strings.TrimSpace(string(risk))) {
	case AISecurityRiskL1:
		return AISecurityRiskL1
	case AISecurityRiskL2:
		return AISecurityRiskL2
	case AISecurityRiskL3:
		return AISecurityRiskL3
	case AISecurityRiskL4:
		return AISecurityRiskL4
	case AISecurityRiskL5:
		return AISecurityRiskL5
	case AISecurityRiskL6:
		return AISecurityRiskL6
	default:
		return AISecurityRiskL3
	}
}

func resolveToolSecurityTarget(def *AssistantAIToolDefinition, context *AssistantAINoteContext, args map[string]interface{}) (string, []string) {
	targetIDs := extractToolTargetIDs(args, context)
	if 0 < len(targetIDs) {
		return "note", targetIDs
	}
	if nil != def && AssistantAIToolScopeWorkspace == def.Target {
		return "workspace", []string{}
	}
	if nil != context && "" != strings.TrimSpace(context.Notebook) {
		return "notebook", []string{strings.TrimSpace(context.Notebook)}
	}
	return "note", []string{}
}

func extractToolTargetIDs(args map[string]interface{}, context *AssistantAINoteContext) []string {
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
	if nil != context {
		addID(context.RootID)
		addID(context.CurrentBlockID)
	}
	if nil != args {
		if id, ok := args["rootID"].(string); ok {
			addID(id)
		}
		if id, ok := args["blockID"].(string); ok {
			addID(id)
		}
		if id, ok := args["targetID"].(string); ok {
			addID(id)
		}
	}
	return normalizeAISecurityTargetIDs(ids)
}

func normalizeAISecurityTargetIDs(ids []string) []string {
	if nil == ids {
		return []string{}
	}
	seen := map[string]struct{}{}
	ret := make([]string, 0, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if "" == id {
			continue
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		ret = append(ret, id)
	}
	return ret
}

func toolSecurityCapability(def *AssistantAIToolDefinition) string {
	if nil == def {
		return ""
	}
	switch def.ID {
	case AssistantAIToolCreateNote, AssistantAIToolCreateChildNote, AssistantAIToolCreateWorkbench:
		return AISecurityCapabilityCreate
	case AssistantAIToolDeleteBlock:
		return AISecurityCapabilityDeleteBlock
	case AssistantAIToolReplaceBlock, AssistantAIToolAppendCurrentNote, AssistantAIToolInsertAfterBlock:
		return AISecurityCapabilityWrite
	default:
		if "write" == strings.TrimSpace(def.Category) {
			return AISecurityCapabilityWrite
		}
		return AISecurityCapabilityRead
	}
}

func checkAISecurityCapability(cfg *AISecurityConfig, capability string) string {
	if nil == cfg || "" == capability {
		return ""
	}
	capabilities := cfg.Capabilities
	switch capability {
	case AISecurityCapabilityRead:
		if !capabilities.Read {
			return "当前安全配置禁止 AI 读取内容"
		}
	case AISecurityCapabilityWrite:
		if !capabilities.Write {
			return "当前安全配置禁止 AI 写入内容"
		}
	case AISecurityCapabilityCreate:
		if !capabilities.Write || !capabilities.Create {
			return "当前安全配置禁止 AI 创建笔记"
		}
	case AISecurityCapabilityDeleteBlock:
		if !capabilities.Write || !capabilities.DeleteBlock {
			return "当前安全配置禁止 AI 删除块"
		}
	case AISecurityCapabilityDeleteNote:
		if !capabilities.Write || !capabilities.DeleteNote {
			return "当前安全配置禁止 AI 删除笔记"
		}
	case AISecurityCapabilityMove:
		if !capabilities.Write || !capabilities.Move {
			return "当前安全配置禁止 AI 移动笔记"
		}
	case AISecurityCapabilityExecute:
		if !capabilities.Execute {
			return "当前安全配置禁止 AI 执行命令"
		}
	}
	return ""
}

func isHardBannedOperation(risk AISecurityRiskLevel, targetType string) bool {
	if risk == AISecurityRiskL6 {
		return true
	}
	if targetType == "workspace" && isWriteRisk(risk) {
		return true
	}
	return false
}

func isLowRiskWhitelistMatch(whitelist []AISecurityRule, targetType string, targetIDs []string, risk AISecurityRiskLevel) bool {
	if risk != AISecurityRiskL3 {
		return false
	}
	if 1 > len(targetIDs) {
		return false
	}
	for _, id := range targetIDs {
		if !isInWhitelist(whitelist, targetType, id) {
			return false
		}
	}
	return true
}

func isInWhitelist(whitelist []AISecurityRule, targetType string, id string) bool {
	for _, rule := range whitelist {
		if rule.ID == id {
			return true
		}
		ruleType := string(rule.Type)
		if targetType == "note" && (ruleType == "notebook" || ruleType == "folder") {
			if matchesScope(rule.ID, ruleType, id) {
				return true
			}
		}
	}
	return false
}

func isWriteRisk(risk AISecurityRiskLevel) bool {
	return risk == AISecurityRiskL2 || risk == AISecurityRiskL3 || risk == AISecurityRiskL4 || risk == AISecurityRiskL5 || risk == AISecurityRiskL6
}

func isInBlacklist(blacklist []AISecurityRule, targetType string, id string) bool {
	for _, rule := range blacklist {
		if rule.ID == id {
			return true
		}
		ruleType := string(rule.Type)
		if targetType == "note" && (ruleType == "notebook" || ruleType == "folder") {
			if matchesScope(rule.ID, ruleType, id) {
				return true
			}
		}
	}
	return false
}

func matchesScope(ruleID string, ruleType string, targetID string) bool {
	if ruleType == "notebook" {
		bt := getBlockTreeRecover(targetID)
		if bt != nil && bt.BoxID == ruleID {
			return true
		}
		return false
	}
	if ruleType == "folder" {
		targetBT := getBlockTreeRecover(targetID)
		ruleBT := getBlockTreeRecover(ruleID)
		if targetBT == nil || ruleBT == nil {
			return false
		}
		if targetBT.BoxID != ruleBT.BoxID {
			return false
		}
		rulePath := strings.TrimSuffix(ruleBT.Path, ".sf")
		return strings.HasPrefix(targetBT.Path, rulePath+"/")
	}
	return false
}

func getBlockTreeRecover(id string) (ret *treenode.BlockTree) {
	defer func() {
		if recover() != nil {
			ret = nil
		}
	}()
	return treenode.GetBlockTree(id)
}

func permissionByModeAndRisk(mode AISecurityMode, risk AISecurityRiskLevel) AISecurityDecision {
	switch mode {
	case AISecurityModeDefault:
		switch risk {
		case AISecurityRiskL1, AISecurityRiskL2:
			return AISecurityAllow
		default:
			return AISecurityDeny
		}
	case AISecurityModeAutoReview:
		switch risk {
		case AISecurityRiskL1, AISecurityRiskL2:
			return AISecurityAllow
		case AISecurityRiskL3:
			return AISecurityConfirm
		default:
			return AISecurityConfirm
		}
	case AISecurityModeFullAccess:
		switch risk {
		case AISecurityRiskL1, AISecurityRiskL2, AISecurityRiskL3, AISecurityRiskL4:
			return AISecurityAllow
		case AISecurityRiskL5:
			return AISecurityConfirm
		default:
			return AISecurityDeny
		}
	default:
		return AISecurityDeny
	}
}

func buildAffectedItems(ids []string, targetType string) []AISecurityAffectedItem {
	items := make([]AISecurityAffectedItem, 0, len(ids))
	for _, id := range ids {
		title := id
		path := ""
		bt := getBlockTreeRecover(id)
		if bt != nil {
			title = bt.HPath
			path = bt.Path
		}
		items = append(items, AISecurityAffectedItem{
			ID:    id,
			Title: title,
			Path:  path,
			Risk:  targetType,
		})
	}
	return items
}
