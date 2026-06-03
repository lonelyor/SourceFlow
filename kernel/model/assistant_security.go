package model

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

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

var (
	aiSecurityConfigCache *AISecurityConfig
	aiSecurityConfigLock  sync.Mutex
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
		BatchThreshold: 10,
	}
}

func cloneAISecurityConfig(cfg *AISecurityConfig) *AISecurityConfig {
	if cfg == nil {
		return NewAISecurityConfig()
	}
	clone := *cfg
	if clone.Blacklist == nil {
		clone.Blacklist = []AISecurityRule{}
	}
	if clone.Whitelist == nil {
		clone.Whitelist = []AISecurityRule{}
	}
	return &clone
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
	if cfg.BatchThreshold <= 0 {
		cfg.BatchThreshold = 10
	}
	aiSecurityConfigCache = cfg
	return cfg
}

func SetAISecurityConfig(cfg *AISecurityConfig) error {
	aiSecurityConfigLock.Lock()
	defer aiSecurityConfigLock.Unlock()
	if cfg == nil {
		cfg = NewAISecurityConfig()
	}
	cfg = cloneAISecurityConfig(cfg)
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
	Decision      AISecurityDecision    `json:"decision"`
	Reason        string                `json:"reason,omitempty"`
	AffectedItems []AISecurityAffectedItem `json:"affectedItems,omitempty"`
}

func CheckAISecurityPermission(mode AISecurityMode, risk AISecurityRiskLevel, targetType string, targetIDs []string, sessionBatchCount int) *AISecurityPermissionResult {
	cfg := GetAISecurityConfig()

	if isHardBannedOperation(risk, targetType) {
		return &AISecurityPermissionResult{
			Decision: AISecurityDeny,
			Reason:   "此操作被硬禁止：不允许删除工作空间、笔记本或清空全部笔记",
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

	if sessionBatchCount >= cfg.BatchThreshold && isWriteRisk(risk) {
		return &AISecurityPermissionResult{
			Decision:      AISecurityConfirm,
			Reason:        fmt.Sprintf("本次操作累计影响 %d 篇笔记，达到批量阈值 %d，需要人工确认", sessionBatchCount, cfg.BatchThreshold),
			AffectedItems: buildAffectedItems(targetIDs, targetType),
		}
	}

	decision := permissionByModeAndRisk(mode, risk)
	if decision == AISecurityDeny {
		return &AISecurityPermissionResult{
			Decision: AISecurityDeny,
			Reason:   fmt.Sprintf("当前权限模式 [%s] 不允许执行 %s 风险操作", mode, risk),
		}
	}
	if decision == AISecurityConfirm {
		return &AISecurityPermissionResult{
			Decision: AISecurityConfirm,
			Reason:   fmt.Sprintf("%s 风险操作 [%s] 需要确认", risk, targetType),
		}
	}

	return &AISecurityPermissionResult{
		Decision: AISecurityAllow,
	}
}

func checkToolSecurity(def *AssistantAIToolDefinition, args map[string]interface{}) *AISecurityPermissionResult {
	if def == nil {
		return &AISecurityPermissionResult{Decision: AISecurityAllow}
	}
	cfg := GetAISecurityConfig()
	risk := toolRiskToSecurityRisk(def.Risk)
	targetType := "note"
	targetIDs := extractToolTargetIDs(args)
	return CheckAISecurityPermission(cfg.DefaultMode, risk, targetType, targetIDs, 0)
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

func extractToolTargetIDs(args map[string]interface{}) []string {
	ids := []string{}
	if id, ok := args["rootID"].(string); ok && id != "" {
		ids = append(ids, id)
	}
	if id, ok := args["blockID"].(string); ok && id != "" {
		ids = append(ids, id)
	}
	if id, ok := args["notebook"].(string); ok && id != "" {
		ids = append(ids, id)
	}
	return ids
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

func isWriteRisk(risk AISecurityRiskLevel) bool {
	return risk == AISecurityRiskL3 || risk == AISecurityRiskL4 || risk == AISecurityRiskL5 || risk == AISecurityRiskL6
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

func getBlockTreeRecover(id string) *treenode.BlockTree {
	defer func() { recover() }()
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
		func() {
			defer func() { recover() }()
			bt := treenode.GetBlockTree(id)
			if bt != nil {
				title = bt.HPath
				path = bt.Path
			}
		}()
		items = append(items, AISecurityAffectedItem{
			ID:    id,
			Title: title,
			Path:  path,
			Risk:  targetType,
		})
	}
	return items
}
