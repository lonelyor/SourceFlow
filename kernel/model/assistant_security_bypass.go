package model

import (
	"fmt"
	"strings"
)

func detectAISecurityBypassAttempt(cfg *AISecurityConfig, risk AISecurityRiskLevel, targetType string, targetIDs []string, sessionBatchCount int) *AISecurityPermissionResult {
	if nil == cfg || !isWriteRisk(risk) {
		return nil
	}
	if hasAmbiguousAISecurityTarget(targetType, targetIDs) {
		return &AISecurityPermissionResult{
			Decision:    AISecurityConfirm,
			Reason:      "AI 写入目标范围不明确，需要人工确认影响范围",
			Escalatable: true,
		}
	}
	if isNearAISecurityBatchThreshold(cfg.BatchThreshold, sessionBatchCount) {
		return &AISecurityPermissionResult{
			Decision:      AISecurityConfirm,
			Reason:        fmt.Sprintf("本次操作累计影响 %d 篇笔记，接近批量阈值 %d，疑似分批规避，需要人工确认", sessionBatchCount, cfg.BatchThreshold),
			Escalatable:   true,
			AffectedItems: buildAffectedItems(targetIDs, targetType),
		}
	}
	if isLowRiskAISecurityCombinationWrite(risk, sessionBatchCount) {
		return &AISecurityPermissionResult{
			Decision:      AISecurityConfirm,
			Reason:        fmt.Sprintf("同一会话内低风险写入已累计影响 %d 个目标，疑似组合规避高风险操作，需要人工确认", sessionBatchCount),
			Escalatable:   true,
			AffectedItems: buildAffectedItems(targetIDs, targetType),
		}
	}
	return nil
}

func detectAISecurityEntryBypass(req *AISecurityPermissionRequest, risk AISecurityRiskLevel) *AISecurityPermissionResult {
	if nil == req || !isWriteRisk(risk) {
		return nil
	}
	capability := strings.TrimSpace(req.Capability)
	if "" == capability || capability == AISecurityCapabilityRead {
		return nil
	}
	source := strings.TrimSpace(req.Source)
	switch source {
	case AISecuritySourceAssistantTool, AISecuritySourceAssistantPatch, AISecuritySourceAssistantHistory, AISecuritySourceManualCheck:
		return nil
	default:
		return &AISecurityPermissionResult{
			Decision:    AISecurityDeny,
			Reason:      "AI 写入请求未标记可信安全入口，疑似绕过 assistant patch/tool 边界",
			Escalatable: false,
		}
	}
}

func hasAmbiguousAISecurityTarget(targetType string, targetIDs []string) bool {
	if 0 < len(targetIDs) {
		return false
	}
	switch strings.TrimSpace(targetType) {
	case "note", "folder", "notebook":
		return true
	default:
		return false
	}
}

func isNearAISecurityBatchThreshold(threshold int, sessionBatchCount int) bool {
	if threshold <= 1 || sessionBatchCount <= 1 || sessionBatchCount >= threshold {
		return false
	}
	return threshold-sessionBatchCount <= AISecurityBypassNearBatchMargin
}

func isLowRiskAISecurityCombinationWrite(risk AISecurityRiskLevel, sessionBatchCount int) bool {
	return risk == AISecurityRiskL2 && sessionBatchCount >= AISecurityLowRiskComboThreshold
}
