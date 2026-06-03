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
