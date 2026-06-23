package model

import (
	"strings"
	"testing"
)

func TestAssistantAIContentValueFallbacks(t *testing.T) {
	cases := []struct {
		name string
		args map[string]interface{}
		want string
	}{
		{
			name: "markdown wins",
			args: map[string]interface{}{
				"markdown": "markdown body",
				"content":  "content body",
				"text":     "text body",
			},
			want: "markdown body",
		},
		{
			name: "content fallback",
			args: map[string]interface{}{
				"content": "content body",
				"text":    "text body",
			},
			want: "content body",
		},
		{
			name: "text fallback",
			args: map[string]interface{}{
				"text": "text body",
			},
			want: "text body",
		},
		{
			name: "replacement fallback",
			args: map[string]interface{}{
				"replacement": "replacement body",
			},
			want: "replacement body",
		},
		{
			name: "value fallback",
			args: map[string]interface{}{
				"value": "value body",
			},
			want: "value body",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := getAssistantAIContentValue(tc.args); got != tc.want {
				t.Fatalf("getAssistantAIContentValue() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestAssistantAIIsDeleteIntent(t *testing.T) {
	cases := []struct {
		name string
		args map[string]interface{}
		want bool
	}{
		{name: "nil", args: nil, want: false},
		{name: "explicit delete bool", args: map[string]interface{}{"delete": true}, want: true},
		{name: "action delete", args: map[string]interface{}{"action": "delete"}, want: true},
		{name: "mode remove", args: map[string]interface{}{"mode": "remove"}, want: true},
		{name: "op delete uppercase", args: map[string]interface{}{"op": "DELETE"}, want: true},
		{name: "intent remove spaced", args: map[string]interface{}{"intent": " remove "}, want: true},
		{name: "unrelated", args: map[string]interface{}{"action": "rewrite"}, want: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := assistantAIIsDeleteIntent(tc.args); got != tc.want {
				t.Fatalf("assistantAIIsDeleteIntent() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestAssistantAIToolCatalogDeleteBlockAndPolicy(t *testing.T) {
	catalog := cloneAssistantAIToolCatalog()
	var deleteTool *AssistantAIToolDefinition
	for _, tool := range catalog {
		if nil != tool && tool.ID == AssistantAIToolDeleteBlock {
			deleteTool = tool
			break
		}
	}
	if nil == deleteTool {
		t.Fatal("delete-block tool is missing from catalog")
	}
	if got := deleteTool.Risk; got != AssistantAIToolRiskMediumWrite {
		t.Fatalf("delete-block risk = %q, want %q", got, AssistantAIToolRiskMediumWrite)
	}
	if got := deleteTool.DefaultMode; got != AssistantAIToolModeConfirm {
		t.Fatalf("delete-block default mode = %q, want %q", got, AssistantAIToolModeConfirm)
	}

	policy := getAssistantAIToolPolicy(nil)
	if got := policy.ToolModes[AssistantAIToolDeleteBlock]; got != AssistantAIToolModeConfirm {
		t.Fatalf("default delete-block policy = %q, want %q", got, AssistantAIToolModeConfirm)
	}
	if got := policy.ToolModes[AssistantAIToolInsertAfterBlock]; got != AssistantAIToolModeConfirm {
		t.Fatalf("default insert-after-block policy = %q, want %q", got, AssistantAIToolModeConfirm)
	}
	if got := policy.ToolModes[AssistantAIToolReplaceBlock]; got != AssistantAIToolModeConfirm {
		t.Fatalf("default replace-block policy = %q, want %q", got, AssistantAIToolModeConfirm)
	}
}

func TestAssistantAIToolCatalogContainsCoreNativeCapabilities(t *testing.T) {
	catalog := cloneAssistantAIToolCatalog()
	tools := map[string]*AssistantAIToolDefinition{}
	for _, tool := range catalog {
		if nil != tool {
			tools[tool.ID] = tool
		}
	}

	requiredReadTools := []string{
		AssistantAIToolReadCurrentNote,
		AssistantAIToolReadCurrentBlock,
		AssistantAIToolSearchNotes,
		AssistantAIToolReadNote,
		AssistantAIToolReadNoteBacklinks,
		AssistantAIToolReadNoteOutline,
		AssistantAIToolSearchBlocks,
		AssistantAIToolReadBlock,
		AssistantAIToolReadCurrentBlockContext,
		AssistantAIToolReadBlockReferences,
		AssistantAIToolListNoteHistory,
		AssistantAIToolListRestorePoints,
		AssistantAIToolListNoteAssets,
		AssistantAIToolReadNoteAsset,
	}
	for _, id := range requiredReadTools {
		tool := tools[id]
		if nil == tool {
			t.Fatalf("required read tool %q is missing", id)
		}
		if tool.Risk != AssistantAIToolRiskRead {
			t.Fatalf("tool %q risk = %q, want %q", id, tool.Risk, AssistantAIToolRiskRead)
		}
	}

	requiredWriteTools := map[string]string{
		AssistantAIToolAppendCurrentNote: AssistantAIToolRiskLowWrite,
		AssistantAIToolCreateNote:        AssistantAIToolRiskLowWrite,
		AssistantAIToolCreateChildNote:   AssistantAIToolRiskLowWrite,
		AssistantAIToolCreateWorkbench:   AssistantAIToolRiskLowWrite,
		AssistantAIToolInsertAfterBlock:  AssistantAIToolRiskLowWrite,
		AssistantAIToolDeleteBlock:       AssistantAIToolRiskMediumWrite,
		AssistantAIToolReplaceBlock:      AssistantAIToolRiskMediumWrite,
	}
	for id, wantRisk := range requiredWriteTools {
		tool := tools[id]
		if nil == tool {
			t.Fatalf("required write tool %q is missing", id)
		}
		if tool.Risk != wantRisk {
			t.Fatalf("tool %q risk = %q, want %q", id, tool.Risk, wantRisk)
		}
		if tool.DefaultMode != AssistantAIToolModeConfirm {
			t.Fatalf("tool %q default mode = %q, want %q", id, tool.DefaultMode, AssistantAIToolModeConfirm)
		}
	}
}

func TestBuildAssistantAIToolPromptContainsDeleteAndContentGuards(t *testing.T) {
	prompt := buildAssistantAIToolPrompt(nil, nil)
	required := []string{
		"Use delete-block when the user clearly wants a non-root block removed or deleted.",
		"Use replace-block only when the user clearly wants an existing block to be rewritten, corrected, or normalized; never use it to delete a block.",
		"For insert-after-block and replace-block, always provide non-empty content in args.markdown, args.content, or args.text.",
		"For write tools, set args.dryRun=true when the user asks to preview, review, or inspect the impact before applying.",
	}
	for _, item := range required {
		if !strings.Contains(prompt, item) {
			t.Fatalf("tool prompt is missing required guidance: %q", item)
		}
	}
}

func TestNormalizeAssistantAIToolInvocationUsesReplyAsWriteContentFallback(t *testing.T) {
	toolID, args := normalizeAssistantAIToolInvocation(AssistantAIToolInsertAfterBlock, map[string]interface{}{"id": "20260407-test"}, "补充正文", "请续写当前块")
	if toolID != AssistantAIToolInsertAfterBlock {
		t.Fatalf("toolID = %q, want %q", toolID, AssistantAIToolInsertAfterBlock)
	}
	if got := getAssistantAIContentValue(args); got != "补充正文" {
		t.Fatalf("fallback content = %q, want %q", got, "补充正文")
	}
}

func TestNormalizeAssistantAIToolInvocationPromotesDeleteFallback(t *testing.T) {
	toolID, args := normalizeAssistantAIToolInvocation(AssistantAIToolReplaceBlock, map[string]interface{}{"id": "20260407-test"}, "", "请删除当前块")
	if toolID != AssistantAIToolDeleteBlock {
		t.Fatalf("toolID = %q, want %q", toolID, AssistantAIToolDeleteBlock)
	}
	if got := getAssistantAIStringValue(args, "id", ""); got != "20260407-test" {
		t.Fatalf("target id = %q, want %q", got, "20260407-test")
	}
}

func TestAssistantAIToolPreviewPatchForAppend(t *testing.T) {
	def := getAssistantAIToolDefinition(AssistantAIToolAppendCurrentNote)
	context := &AssistantAINoteContext{RootID: "20260525000000-test", Title: "测试笔记"}
	preview := buildAssistantAIToolPreviewPatch(def, context, map[string]interface{}{"markdown": "补充内容", "dryRun": true})
	if nil == preview {
		t.Fatal("preview patch is nil")
	}
	if got := getAssistantAIStringValue(preview, "source", ""); got != "tool" {
		t.Fatalf("preview source = %q, want tool", got)
	}
	ops, ok := preview["operations"].([]map[string]interface{})
	if !ok || len(ops) != 1 {
		t.Fatalf("preview operations = %#v, want one operation", preview["operations"])
	}
	if got := getAssistantAIStringValue(ops[0], "type", ""); got != "append-note" {
		t.Fatalf("operation type = %q, want append-note", got)
	}
	if got := getAssistantAIStringValue(ops[0], "after", ""); got != "补充内容" {
		t.Fatalf("operation after = %q, want 补充内容", got)
	}
}

func TestAssistantAIToolDryRunSchemaForWriteTool(t *testing.T) {
	schema, ok := buildAssistantAIToolParameterSchema(getAssistantAIToolDefinition(AssistantAIToolInsertAfterBlock)).(map[string]interface{})
	if !ok {
		t.Fatal("schema should be an object map")
	}
	properties, ok := schema["properties"].(map[string]interface{})
	if !ok {
		t.Fatal("schema properties should be a map")
	}
	if nil == properties["dryRun"] {
		t.Fatal("dryRun property is missing from write tool schema")
	}
}
