package model

import "testing"

func TestAssistantPatchTextOccurrences(t *testing.T) {
	if got := assistantPatchTextOccurrences("aaaaaa", "aa"); got != 3 {
		t.Fatalf("assistantPatchTextOccurrences repeated matches = %d, want 3", got)
	}
	if got := assistantPatchTextOccurrences("abc", "x"); got != 0 {
		t.Fatalf("assistantPatchTextOccurrences missing match = %d, want 0", got)
	}
}

func TestAssistantPatchEscalationTokenSingleUseAndBound(t *testing.T) {
	req := &AssistantPatchApplyRequest{
		Patch: &AssistantEditPatch{
			ID:      "patch-1",
			Source:  "skill",
			Target:  "selection",
			Risk:    "L3",
			Summary: "replace",
			Operations: []*AssistantPatchOperation{{
				ID:       "op-1",
				Type:     AssistantPatchOperationReplaceSelection,
				TargetID: "note-1",
				Before:   "old",
				After:    "new",
				Status:   "pending",
			}},
		},
		Operation: &AssistantPatchOperation{
			ID:       "op-1",
			Type:     AssistantPatchOperationReplaceSelection,
			TargetID: "note-1",
			Before:   "old",
			After:    "new",
			Status:   "pending",
		},
		Context: &AssistantAINoteContext{
			RootID: "note-1",
		},
		SecurityMode: AISecurityModeDefault,
	}

	_, _, security, scope, err := prepareAssistantPatchSecurity(req)
	if nil != err {
		t.Fatalf("prepareAssistantPatchSecurity: %v", err)
	}
	if security.Decision != AISecurityDeny || !security.Escalatable {
		t.Fatalf("default L3 should require escalatable denial, got %+v", security)
	}

	token, _, err := issueAISecurityEscalationToken(scope)
	if nil != err {
		t.Fatalf("issueAISecurityEscalationToken: %v", err)
	}
	if !consumeAISecurityEscalationToken(token, scope) {
		t.Fatal("issued escalation token should be consumed once")
	}
	if consumeAISecurityEscalationToken(token, scope) {
		t.Fatal("escalation token must not be reusable")
	}

	token, _, err = issueAISecurityEscalationToken(scope)
	if nil != err {
		t.Fatalf("issueAISecurityEscalationToken: %v", err)
	}
	changedReq := *req
	changedOperation := *req.Operation
	changedOperation.After = "changed"
	changedReq.Operation = &changedOperation
	_, _, _, changedScope, err := prepareAssistantPatchSecurity(&changedReq)
	if nil != err {
		t.Fatalf("prepare changed security scope: %v", err)
	}
	if consumeAISecurityEscalationToken(token, changedScope) {
		t.Fatal("escalation token must be bound to the original operation digest")
	}
	if !consumeAISecurityEscalationToken(token, scope) {
		t.Fatal("failed mismatched consume must not burn the original token")
	}
}

func TestAssistantPatchTextOccurrencesToleratesZeroWidthChars(t *testing.T) {
	live := "This is a plain sentence for the smoke test."
	needle := "This is a plain sentence for the smoke test.\u200B"
	if got := assistantPatchTextOccurrences(live, needle); 1 != got {
		t.Fatalf("expected 1 occurrence after zero-width normalization, got %d", got)
	}
	if got := assistantPatchTextOccurrences(live+"\u200B", needle); 1 != got {
		t.Fatalf("expected 1 occurrence when live text carries zero-width char, got %d", got)
	}
	if got := assistantPatchTextOccurrences(live, assistantPatchNormalizeSourceText(needle)+"x"); 0 != got {
		t.Fatalf("expected 0 occurrences for mismatched text, got %d", got)
	}
}
