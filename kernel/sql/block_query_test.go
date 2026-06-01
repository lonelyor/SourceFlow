package sql

import (
	"strings"
	"testing"
)

func TestBuildRootBlockDocSearchConditionUsesPlaceholders(t *testing.T) {
	payload := "x%' OR 1=1 --"
	excludePayload := "y%' OR path LIKE '%"

	condition, args := buildRootBlockDocSearchCondition([]string{payload}, true, true, true, []string{excludePayload})
	if condition == "" {
		t.Fatal("condition must not be empty")
	}
	if strings.Contains(condition, payload) || strings.Contains(condition, excludePayload) {
		t.Fatalf("condition contains raw user input: %s", condition)
	}
	if got := strings.Count(condition, "?"); got != len(args) {
		t.Fatalf("placeholder count = %d, args = %d", got, len(args))
	}
}

func TestBuildRootBlockDocSearchConditionSkipsEmptyKeywords(t *testing.T) {
	condition, args := buildRootBlockDocSearchCondition([]string{"", "   "}, true, true, true, nil)
	if condition != "" {
		t.Fatalf("condition = %q, want empty", condition)
	}
	if len(args) != 0 {
		t.Fatalf("args = %d, want 0", len(args))
	}
}
