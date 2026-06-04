package model

import (
	"strings"
	"testing"
)

func TestExtractTitleFromHPath(t *testing.T) {
	tests := []struct {
		hPath    string
		expected string
	}{
		{"笔记本/项目计划", "项目计划"},
		{"笔记本/文件夹/子文档", "子文档"},
		{"笔记本", "笔记本"},
		{"", ""},
		{"笔记本/", "笔记本"},
	}

	for _, tt := range tests {
		result := extractTitleFromHPath(tt.hPath)
		if result != tt.expected {
			t.Errorf("extractTitleFromHPath(%q) = %q, want %q", tt.hPath, result, tt.expected)
		}
	}
}

func TestTruncateText(t *testing.T) {
	tests := []struct {
		text    string
		maxLen  int
		wantEnd string
		exact   bool
	}{
		{"short text", 100, "short text", true},
		{"", 10, "", true},
		{"这是一段测试文本用于截断", 5, "这是一段测…", false},
	}

	for _, tt := range tests {
		result := truncateText(tt.text, tt.maxLen)
		if tt.exact && result != tt.wantEnd {
			t.Errorf("truncateText(%q, %d) = %q, want %q", tt.text, tt.maxLen, result, tt.wantEnd)
		}
		if !tt.exact && len(result) > 0 && result[len(result)-3:] != "…" {
			t.Errorf("truncateText(%q, %d) should end with …", tt.text, tt.maxLen)
		}
	}
}

func TestSearchAssistantContextItemsEmptyQuery(t *testing.T) {
	results := SearchAssistantContextItems("", 10, AISecurityModeDefault)
	if results == nil {
		results = []*AssistantContextSearchResult{}
	}
	if len(results) > 0 {
		t.Logf("SearchAssistantContextItems('') returned %d results (expected 0 or empty)", len(results))
	}
}

func TestBuildAssistantContextPackEmptyItems(t *testing.T) {
	pack, err := BuildAssistantContextPack(nil, AISecurityModeDefault)
	if err != nil {
		t.Fatalf("BuildAssistantContextPack(nil) error: %v", err)
	}
	if pack == nil {
		t.Fatal("BuildAssistantContextPack(nil) returned nil pack")
	}
	if len(pack.Items) != 0 {
		t.Errorf("BuildAssistantContextPack(nil) items = %d, want 0", len(pack.Items))
	}
}

func TestBuildAssistantContextPackSelection(t *testing.T) {
	items := []AssistantContextPackItem{
		{
			Type:    AssistantContextSelection,
			ID:      "sel-1",
			Content: "这是选中的文本内容",
		},
	}
	pack, err := BuildAssistantContextPack(items, AISecurityModeDefault)
	if err != nil {
		t.Fatalf("BuildAssistantContextPack error: %v", err)
	}
	if len(pack.Items) != 1 {
		t.Fatalf("pack items = %d, want 1", len(pack.Items))
	}
	if pack.Items[0].Type != AssistantContextSelection {
		t.Errorf("item type = %s, want selection", pack.Items[0].Type)
	}
	if pack.Items[0].Summary != "这是选中的文本内容" {
		t.Errorf("item summary = %q, want original content", pack.Items[0].Summary)
	}
}

func TestBuildAssistantContextPackSelectionTruncation(t *testing.T) {
	longText := ""
	for i := 0; i < 3000; i++ {
		longText += "A"
	}
	items := []AssistantContextPackItem{
		{
			Type:    AssistantContextSelection,
			ID:      "sel-long",
			Content: longText,
		},
	}
	pack, _ := BuildAssistantContextPack(items, AISecurityModeDefault)
	if len(pack.Items) != 1 {
		t.Fatal("expected 1 item")
	}
	summary := pack.Items[0].Summary
	if len(summary) > 2004 {
		t.Errorf("summary too long: %d bytes", len(summary))
	}
	if summary[len(summary)-3:] != "\xe2\x80\xa6" {
		t.Errorf("summary should end with …")
	}
}

func TestBuildAssistantContextPackInvalidNote(t *testing.T) {
	items := []AssistantContextPackItem{
		{
			Type: AssistantContextNote,
			ID:   "nonexistent-id-12345",
		},
	}
	pack, err := BuildAssistantContextPack(items, AISecurityModeDefault)
	if err != nil {
		t.Fatalf("BuildAssistantContextPack error: %v", err)
	}
	if len(pack.Items) != 0 {
		t.Errorf("expected 0 items for invalid note, got %d", len(pack.Items))
	}
	if len(pack.Dropped) != 1 {
		t.Fatalf("expected 1 dropped item for invalid note, got %d", len(pack.Dropped))
	}
	if pack.Dropped[0].ID != "nonexistent-id-12345" {
		t.Fatalf("dropped id = %q, want nonexistent-id-12345", pack.Dropped[0].ID)
	}
}

func TestBuildAssistantContextPackGlobalBudget(t *testing.T) {
	items := []AssistantContextPackItem{}
	for i := 0; i < 40; i++ {
		items = append(items, AssistantContextPackItem{
			Type:    AssistantContextSelection,
			ID:      "sel-budget",
			Content: strings.Repeat("A", contextSummaryMaxLen),
		})
	}
	pack, err := BuildAssistantContextPack(items, AISecurityModeDefault)
	if err != nil {
		t.Fatalf("BuildAssistantContextPack error: %v", err)
	}
	if !pack.Truncated {
		t.Fatal("expected context pack to be truncated")
	}
	if len(pack.Dropped) == 0 {
		t.Fatal("expected dropped items after budget exceeded")
	}
	total := 0
	for _, item := range pack.Items {
		total += assistantContextEntrySummaryChars(item)
	}
	if total > contextPackMaxSummaryChars {
		t.Fatalf("summary chars = %d, want <= %d", total, contextPackMaxSummaryChars)
	}
}
