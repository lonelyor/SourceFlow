package model

import (
	"testing"

	"github.com/lonelyor/sourceflow/kernel/util"
)

func withTempAISecurityConfig(t *testing.T) {
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

func TestNewAISecurityConfigDefaults(t *testing.T) {
	cfg := NewAISecurityConfig()
	if cfg.DefaultMode != AISecurityModeDefault {
		t.Errorf("DefaultMode = %s, want default", cfg.DefaultMode)
	}
	if cfg.BatchThreshold != 10 {
		t.Errorf("BatchThreshold = %d, want 10", cfg.BatchThreshold)
	}
	if !cfg.Capabilities.Read {
		t.Error("Capabilities.Read should be true")
	}
	if !cfg.Capabilities.Write {
		t.Error("Capabilities.Write should be true")
	}
	if cfg.Capabilities.Execute {
		t.Error("Capabilities.Execute should be false")
	}
	if cfg.Capabilities.DeleteNote {
		t.Error("Capabilities.DeleteNote should be false")
	}
	if cfg.Capabilities.Move {
		t.Error("Capabilities.Move should be false")
	}
}

func TestCheckAISecurityHardBanned(t *testing.T) {
	result := CheckAISecurityPermission(AISecurityModeFullAccess, AISecurityRiskL6, "note", []string{"id1"}, 0)
	if result.Decision != AISecurityDeny {
		t.Errorf("L6 should always be denied, got %s", result.Decision)
	}
}

func TestCheckAISecurityWorkspaceWrite(t *testing.T) {
	result := CheckAISecurityPermission(AISecurityModeFullAccess, AISecurityRiskL3, "workspace", []string{"ws"}, 0)
	if result.Decision != AISecurityDeny {
		t.Errorf("write on workspace should be denied, got %s", result.Decision)
	}
}

func TestCheckAISecurityDefaultMode(t *testing.T) {
	l1 := CheckAISecurityPermission(AISecurityModeDefault, AISecurityRiskL1, "note", []string{"id1"}, 0)
	if l1.Decision != AISecurityAllow {
		t.Errorf("default mode L1 should allow, got %s", l1.Decision)
	}

	l3 := CheckAISecurityPermission(AISecurityModeDefault, AISecurityRiskL3, "note", []string{"id1"}, 0)
	if l3.Decision != AISecurityDeny {
		t.Errorf("default mode L3 should deny, got %s", l3.Decision)
	}
	if !l3.Escalatable {
		t.Error("default mode L3 denial should be escalatable")
	}
}

func TestCheckAISecurityAutoReviewMode(t *testing.T) {
	l3 := CheckAISecurityPermission(AISecurityModeAutoReview, AISecurityRiskL3, "note", []string{"id1"}, 0)
	if l3.Decision != AISecurityConfirm {
		t.Errorf("autoReview L3 should confirm, got %s", l3.Decision)
	}

	l5 := CheckAISecurityPermission(AISecurityModeAutoReview, AISecurityRiskL5, "note", []string{"id1"}, 0)
	if l5.Decision != AISecurityConfirm {
		t.Errorf("autoReview L5 should confirm, got %s", l5.Decision)
	}
}

func TestCheckAISecurityFullAccessMode(t *testing.T) {
	l4 := CheckAISecurityPermission(AISecurityModeFullAccess, AISecurityRiskL4, "note", []string{"id1"}, 0)
	if l4.Decision != AISecurityAllow {
		t.Errorf("fullAccess L4 should allow, got %s", l4.Decision)
	}

	l5 := CheckAISecurityPermission(AISecurityModeFullAccess, AISecurityRiskL5, "note", []string{"id1"}, 0)
	if l5.Decision != AISecurityConfirm {
		t.Errorf("fullAccess L5 should confirm, got %s", l5.Decision)
	}
}

func TestCheckAISecurityBatchThreshold(t *testing.T) {
	ids := make([]string, 12)
	for i := range ids {
		ids[i] = "id"
	}
	result := CheckAISecurityPermission(AISecurityModeAutoReview, AISecurityRiskL3, "note", ids, 12)
	if result.Decision != AISecurityConfirm {
		t.Errorf("batch >= 10 should confirm, got %s", result.Decision)
	}
	if result.Reason == "" {
		t.Error("batch confirm should have reason")
	}
}

func TestCheckAISecurityAmbiguousWriteTargetConfirms(t *testing.T) {
	withTempAISecurityConfig(t)

	result := CheckAISecurityPermissionForRequest(&AISecurityPermissionRequest{
		Mode:       AISecurityModeFullAccess,
		Risk:       AISecurityRiskL2,
		TargetType: "note",
		TargetIDs:  []string{},
		Capability: AISecurityCapabilityWrite,
		Source:     AISecuritySourceAssistantPatch,
	})
	if result.Decision != AISecurityConfirm {
		t.Errorf("ambiguous write target should confirm, got %s", result.Decision)
	}
	if !result.Escalatable {
		t.Error("ambiguous write confirmation should be escalatable")
	}
	if result.Reason == "" {
		t.Error("ambiguous write confirmation should explain the reason")
	}
}

func TestCheckAISecurityNearBatchThresholdConfirms(t *testing.T) {
	withTempAISecurityConfig(t)

	result := CheckAISecurityPermissionForRequest(&AISecurityPermissionRequest{
		Mode:              AISecurityModeFullAccess,
		Risk:              AISecurityRiskL2,
		TargetType:        "note",
		TargetIDs:         []string{"note-1", "note-2"},
		SessionBatchCount: AISecurityDefaultBatchThreshold - AISecurityBypassNearBatchMargin,
		Capability:        AISecurityCapabilityWrite,
		Source:            AISecuritySourceAssistantPatch,
	})
	if result.Decision != AISecurityConfirm {
		t.Errorf("near-threshold batched write should confirm, got %s", result.Decision)
	}
	if !result.Escalatable {
		t.Error("near-threshold confirmation should be escalatable")
	}
	if result.Reason == "" {
		t.Error("near-threshold confirmation should explain the reason")
	}
}

func TestCheckAISecurityDirectWriteWithoutTrustedSourceDenied(t *testing.T) {
	withTempAISecurityConfig(t)

	result := CheckAISecurityPermissionForRequest(&AISecurityPermissionRequest{
		Mode:       AISecurityModeFullAccess,
		Risk:       AISecurityRiskL2,
		TargetType: "note",
		TargetIDs:  []string{"note-1"},
		Capability: AISecurityCapabilityWrite,
	})
	if result.Decision != AISecurityDeny {
		t.Errorf("untrusted write entry should deny, got %s", result.Decision)
	}
	if result.Escalatable {
		t.Error("untrusted write entry must not be escalatable")
	}
	if result.Reason == "" {
		t.Error("untrusted write entry denial should explain the reason")
	}
}

func TestCheckAISecurityLowRiskCombinationConfirms(t *testing.T) {
	withTempAISecurityConfig(t)

	result := CheckAISecurityPermissionForRequest(&AISecurityPermissionRequest{
		Mode:              AISecurityModeFullAccess,
		Risk:              AISecurityRiskL2,
		TargetType:        "note",
		TargetIDs:         []string{"note-1", "note-2", "note-3"},
		SessionBatchCount: AISecurityLowRiskComboThreshold,
		Capability:        AISecurityCapabilityWrite,
		Source:            AISecuritySourceAssistantPatch,
	})
	if result.Decision != AISecurityConfirm {
		t.Errorf("combined low-risk writes should confirm, got %s", result.Decision)
	}
	if !result.Escalatable {
		t.Error("combined low-risk confirmation should be escalatable")
	}
	if len(result.AffectedItems) != 3 {
		t.Fatalf("affected items length = %d, want 3", len(result.AffectedItems))
	}
}

func TestCheckAISecurityBlacklist(t *testing.T) {
	withTempAISecurityConfig(t)

	cfg := NewAISecurityConfig()
	cfg.Blacklist = []AISecurityRule{{Type: AISecurityRuleNotebook, ID: "blocked-notebook"}}
	if err := SetAISecurityConfig(cfg); nil != err {
		t.Fatalf("SetAISecurityConfig error: %v", err)
	}

	result := CheckAISecurityPermission(AISecurityModeFullAccess, AISecurityRiskL1, "note", []string{"blocked-notebook"}, 0)
	if result.Decision != AISecurityDeny {
		t.Errorf("blacklisted target should be denied, got %s", result.Decision)
	}
}

func TestNormalizeAISecurityConfig(t *testing.T) {
	cfg := NormalizeAISecurityConfig(&AISecurityConfig{
		DefaultMode:    "invalid",
		BatchThreshold: 1000,
		Blacklist: []AISecurityRule{
			{Type: AISecurityRuleNote, ID: " note-1 ", Name: " Note "},
			{Type: AISecurityRuleNote, ID: "note-1"},
			{Type: "bad-type", ID: "tag-1"},
			{Type: AISecurityRuleFolder, ID: ""},
		},
	})
	if cfg.DefaultMode != AISecurityModeDefault {
		t.Errorf("DefaultMode = %s, want default", cfg.DefaultMode)
	}
	if cfg.BatchThreshold != AISecurityMaxBatchThreshold {
		t.Errorf("BatchThreshold = %d, want %d", cfg.BatchThreshold, AISecurityMaxBatchThreshold)
	}
	if len(cfg.Blacklist) != 2 {
		t.Fatalf("Blacklist length = %d, want 2", len(cfg.Blacklist))
	}
	if cfg.Blacklist[0].ID != "note-1" || cfg.Blacklist[0].Name != "Note" {
		t.Errorf("first blacklist entry not normalized: %+v", cfg.Blacklist[0])
	}
	if cfg.Blacklist[1].Type != AISecurityRuleNote {
		t.Errorf("invalid rule type should normalize to note, got %s", cfg.Blacklist[1].Type)
	}
}

func TestCheckAISecurityCapabilityReadDenied(t *testing.T) {
	withTempAISecurityConfig(t)

	cfg := NewAISecurityConfig()
	cfg.Capabilities.Read = false
	if err := SetAISecurityConfig(cfg); nil != err {
		t.Fatalf("SetAISecurityConfig error: %v", err)
	}

	result := CheckAISecurityPermissionForRequest(&AISecurityPermissionRequest{
		Mode:       AISecurityModeFullAccess,
		Risk:       AISecurityRiskL1,
		TargetType: "note",
		TargetIDs:  []string{"id1"},
		Capability: AISecurityCapabilityRead,
	})
	if result.Decision != AISecurityDeny {
		t.Errorf("read disabled should deny, got %s", result.Decision)
	}
	if result.Escalatable {
		t.Error("capability denial must not be escalatable")
	}
}

func TestAISecurityCapabilitiesAllFalsePersists(t *testing.T) {
	withTempAISecurityConfig(t)

	cfg := NewAISecurityConfig()
	cfg.Capabilities = AISecurityCapabilities{}
	if err := SetAISecurityConfig(cfg); nil != err {
		t.Fatalf("SetAISecurityConfig error: %v", err)
	}

	saved := GetAISecurityConfig()
	if saved.Capabilities.Read || saved.Capabilities.Write || saved.Capabilities.Execute || saved.Capabilities.Create || saved.Capabilities.DeleteBlock || saved.Capabilities.DeleteNote || saved.Capabilities.Move {
		t.Fatalf("expected explicit all-false capabilities to persist, got %+v", saved.Capabilities)
	}

	result := CheckAISecurityPermissionForRequest(&AISecurityPermissionRequest{
		Mode:       AISecurityModeFullAccess,
		Risk:       AISecurityRiskL1,
		TargetType: "note",
		TargetIDs:  []string{"id1"},
		Capability: AISecurityCapabilityRead,
	})
	if result.Decision != AISecurityDeny {
		t.Errorf("read disabled should deny, got %s", result.Decision)
	}
}

func TestPermissionByModeAndRiskMatrix(t *testing.T) {
	tests := []struct {
		mode     AISecurityMode
		risk     AISecurityRiskLevel
		expected AISecurityDecision
	}{
		{AISecurityModeDefault, AISecurityRiskL1, AISecurityAllow},
		{AISecurityModeDefault, AISecurityRiskL2, AISecurityAllow},
		{AISecurityModeDefault, AISecurityRiskL3, AISecurityDeny},
		{AISecurityModeDefault, AISecurityRiskL4, AISecurityDeny},
		{AISecurityModeDefault, AISecurityRiskL5, AISecurityDeny},
		{AISecurityModeAutoReview, AISecurityRiskL1, AISecurityAllow},
		{AISecurityModeAutoReview, AISecurityRiskL2, AISecurityAllow},
		{AISecurityModeAutoReview, AISecurityRiskL3, AISecurityConfirm},
		{AISecurityModeAutoReview, AISecurityRiskL4, AISecurityConfirm},
		{AISecurityModeAutoReview, AISecurityRiskL5, AISecurityConfirm},
		{AISecurityModeFullAccess, AISecurityRiskL1, AISecurityAllow},
		{AISecurityModeFullAccess, AISecurityRiskL2, AISecurityAllow},
		{AISecurityModeFullAccess, AISecurityRiskL3, AISecurityAllow},
		{AISecurityModeFullAccess, AISecurityRiskL4, AISecurityAllow},
		{AISecurityModeFullAccess, AISecurityRiskL5, AISecurityConfirm},
	}
	for _, tt := range tests {
		result := permissionByModeAndRisk(tt.mode, tt.risk)
		if result != tt.expected {
			t.Errorf("permissionByModeAndRisk(%s, %s) = %s, want %s", tt.mode, tt.risk, result, tt.expected)
		}
	}
}
