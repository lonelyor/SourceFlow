package model

import (
	dbsql "database/sql"
	"strings"
	"testing"
	"time"

	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
)

func TestResolveAssistantAIHistoryBudgetReservesCurrentMessage(t *testing.T) {
	profile := &AssistantAIProfile{
		Provider: AssistantAIProviderFake,
		Settings: map[string]interface{}{
			"contextWindow": 10000,
			"maxTokens":     1000,
		},
	}
	systemPrompt := strings.Repeat("系统提示", 50)
	currentMessage := &AssistantAIMessage{Role: "user", Content: strings.Repeat("当前正文", 50)}

	budget := resolveAssistantAIHistoryBudget(profile, systemPrompt, currentMessage)
	want := 10000 - 1000 - estimateAssistantAITextTokens(systemPrompt) - estimateAssistantAIMessageTokens(currentMessage)
	if want <= 0 {
		t.Fatalf("test setup should leave a positive budget, got %d", want)
	}
	if budget != want {
		t.Fatalf("history budget = %d, want %d", budget, want)
	}

	// 历史预算 = 旧口径（窗口 − 输出 − system）再减去当前用户消息
	legacy := 10000 - 1000 - estimateAssistantAITextTokens(systemPrompt)
	if budget != legacy-estimateAssistantAIMessageTokens(currentMessage) {
		t.Fatalf("budget should reserve room for the current message: budget = %d, legacy = %d, current = %d",
			budget, legacy, estimateAssistantAIMessageTokens(currentMessage))
	}

	// 窗口过小时预算下限钳到 0
	tight := &AssistantAIProfile{Provider: AssistantAIProviderFake, Settings: map[string]interface{}{
		"contextWindow": 100,
		"maxTokens":     4096,
	}}
	if got := resolveAssistantAIHistoryBudget(tight, systemPrompt, currentMessage); 0 != got {
		t.Fatalf("expected tight window budget clamped to 0, got %d", got)
	}

	// 无 maxTokens 设置时按 4096 预留输出
	noReserve := &AssistantAIProfile{Provider: AssistantAIProviderFake, Settings: map[string]interface{}{
		"contextWindow": 100000,
	}}
	wantNoReserve := 100000 - 4096 - estimateAssistantAITextTokens(systemPrompt) - estimateAssistantAIMessageTokens(currentMessage)
	if got := resolveAssistantAIHistoryBudget(noReserve, systemPrompt, currentMessage); wantNoReserve != got {
		t.Fatalf("default output reserve budget = %d, want %d", got, wantNoReserve)
	}
}

func TestResolveAssistantAIEffectiveContextWindowOverridePriority(t *testing.T) {
	// override 为正且小于解析出的窗口 → 生效
	effective := &AssistantAIProfile{Provider: AssistantAIProviderFake, Settings: map[string]interface{}{
		"contextWindow":         131072,
		"contextWindowOverride": 32768,
	}}
	if got := resolveAssistantAIEffectiveContextWindow(effective); 32768 != got {
		t.Fatalf("expected override to win, got %d", got)
	}

	// override 等于窗口 → 忽略（要求严格小于）
	equal := &AssistantAIProfile{Provider: AssistantAIProviderFake, Settings: map[string]interface{}{
		"contextWindow":         131072,
		"contextWindowOverride": 131072,
	}}
	if got := resolveAssistantAIEffectiveContextWindow(equal); 131072 != got {
		t.Fatalf("expected equal override to be ignored, got %d", got)
	}

	// override 大于窗口 → 忽略
	bigger := &AssistantAIProfile{Provider: AssistantAIProviderFake, Settings: map[string]interface{}{
		"contextWindow":         131072,
		"contextWindowOverride": 200000,
	}}
	if got := resolveAssistantAIEffectiveContextWindow(bigger); 131072 != got {
		t.Fatalf("expected bigger override to be ignored, got %d", got)
	}

	// 无 contextWindow 时回落 maxContextTokens，override 依旧生效
	fallback := &AssistantAIProfile{Provider: AssistantAIProviderFake, Settings: map[string]interface{}{
		"maxContextTokens":      65536,
		"contextWindowOverride": 16384,
	}}
	if got := resolveAssistantAIEffectiveContextWindow(fallback); 16384 != got {
		t.Fatalf("expected override on maxContextTokens fallback, got %d", got)
	}

	// 无 override 时保持原口径
	if got := resolveAssistantAIEffectiveContextWindow(&AssistantAIProfile{Provider: AssistantAIProviderFake}); assistantAIDefaultContextTokens != got {
		t.Fatalf("expected default window, got %d", got)
	}
	plain := &AssistantAIProfile{Provider: AssistantAIProviderFake, Settings: map[string]interface{}{"contextWindow": 131072}}
	if got := resolveAssistantAIEffectiveContextWindow(plain); 131072 != got {
		t.Fatalf("expected plain contextWindow, got %d", got)
	}
}

func TestNormalizeAssistantAIProfileSettingsContextWindowOverride(t *testing.T) {
	cases := []struct {
		name string
		raw  interface{}
		want int
		keep bool
	}{
		{name: "positive int", raw: 32768, want: 32768, keep: true},
		{name: "numeric string", raw: "8192", want: 8192, keep: true},
		{name: "integral float", raw: float64(4096), want: 4096, keep: true},
		{name: "zero", raw: 0, keep: false},
		{name: "negative", raw: -5, keep: false},
		{name: "non numeric string", raw: "abc", keep: false},
		{name: "empty string", raw: "", keep: false},
		{name: "nil", raw: nil, keep: false},
		{name: "bool", raw: true, keep: false},
		{name: "fractional float", raw: 4096.5, keep: false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			profile := &AssistantAIProfile{
				Provider: AssistantAIProviderFake,
				Settings: map[string]interface{}{"contextWindowOverride": c.raw},
			}
			normalizeAssistantAIProfileSettings(profile)
			got, ok := profile.Settings["contextWindowOverride"]
			if !c.keep {
				if ok {
					t.Fatalf("expected illegal override %v to be removed, got %v", c.raw, got)
				}
				return
			}
			if !ok {
				t.Fatalf("expected legal override %v to be kept", c.raw)
			}
			if intGot := getAssistantAIIntSetting(profile.Settings, "contextWindowOverride", 0); intGot != c.want {
				t.Fatalf("override = %d, want %d", intGot, c.want)
			}
		})
	}

	// 旧数据无该键：归一化不得凭空补键
	profile := &AssistantAIProfile{Provider: AssistantAIProviderFake, Settings: map[string]interface{}{}}
	normalizeAssistantAIProfileSettings(profile)
	if _, ok := profile.Settings["contextWindowOverride"]; ok {
		t.Fatal("normalize should not inject contextWindowOverride when absent")
	}
}

func TestTrimAssistantAIContextMessagesKeepsNewestMessage(t *testing.T) {
	oldest := &AssistantAIMessage{Content: strings.Repeat("旧", 400)}
	mid := &AssistantAIMessage{Content: strings.Repeat("中", 400)}
	newest := &AssistantAIMessage{Content: strings.Repeat("新", 400)}
	messages := []*AssistantAIMessage{oldest, mid, newest}

	// 预算恰好容纳两条 → 从最旧开始裁，最新两条保留
	budget := estimateAssistantAIMessageTokens(mid) + estimateAssistantAIMessageTokens(newest)
	trimmed := trimAssistantAIContextMessages(messages, budget)
	if 2 != len(trimmed) || trimmed[0] != mid || trimmed[1] != newest {
		t.Fatalf("expected [mid newest] to remain, got %d messages", len(trimmed))
	}

	// 预算为 0 / 负数 → 仅保留最新一条（当前用户消息永不裁掉）
	for _, zero := range []int{0, -1} {
		trimmed = trimAssistantAIContextMessages(messages, zero)
		if 1 != len(trimmed) || trimmed[0] != newest {
			t.Fatalf("expected only newest to remain for budget %d, got %d messages", zero, len(trimmed))
		}
	}

	// 最新一条自身超预算 → 仍保留最新一条
	huge := &AssistantAIMessage{Content: strings.Repeat("巨", 5000)}
	trimmed = trimAssistantAIContextMessages([]*AssistantAIMessage{oldest, huge}, 100)
	if 1 != len(trimmed) || trimmed[0] != huge {
		t.Fatalf("expected newest oversized message to be kept, got %d messages", len(trimmed))
	}

	// 空列表与单条消息
	if got := trimAssistantAIContextMessages(nil, 100); 0 != len(got) {
		t.Fatalf("expected empty input to stay empty, got %d", len(got))
	}
	if got := trimAssistantAIContextMessages([]*AssistantAIMessage{newest}, 0); 1 != len(got) || got[0] != newest {
		t.Fatalf("expected single message to survive budget 0")
	}
}

func TestEstimateAssistantAIMessageTokensCountsImageAttachments(t *testing.T) {
	plain := &AssistantAIMessage{Role: "user", Content: "看这张图"}
	image := map[string]interface{}{"id": "a1", "name": "shot", "mimeType": "image/png", "data": "aGVsbG8="}
	withOne := &AssistantAIMessage{Role: "user", Content: "看这张图", Metadata: map[string]interface{}{
		"attachments": []interface{}{image},
	}}
	withTwo := &AssistantAIMessage{Role: "user", Content: "看这张图", Metadata: map[string]interface{}{
		"attachments": []interface{}{image, map[string]interface{}{"id": "a2", "name": "shot2", "mimeType": "image/jpeg", "data": "aGVsbG8="}},
	}}
	nonImage := &AssistantAIMessage{Role: "user", Content: "看这张图", Metadata: map[string]interface{}{
		"attachments": []interface{}{map[string]interface{}{"id": "a3", "name": "file", "mimeType": "text/plain", "data": "aGVsbG8="}},
	}}

	base := estimateAssistantAIMessageTokens(plain)
	if got := estimateAssistantAIMessageTokens(withOne) - base; assistantAIImageTokenEstimate != got {
		t.Fatalf("one image should add %d tokens, got %d", assistantAIImageTokenEstimate, got)
	}
	if got := estimateAssistantAIMessageTokens(withTwo) - base; 2*assistantAIImageTokenEstimate != got {
		t.Fatalf("two images should add %d tokens, got %d", 2*assistantAIImageTokenEstimate, got)
	}
	if got := estimateAssistantAIMessageTokens(nonImage); base != got {
		t.Fatalf("non-image attachments should not be counted, got %d want %d", got, base)
	}
}

func seedAssistantAIBudgetMessage(t *testing.T, tx *dbsql.Tx, sessionID, role, content string, createdAt int64) *AssistantAIMessage {
	t.Helper()
	msg := &AssistantAIMessage{
		ID:        ast.NewNodeID(),
		SessionID: sessionID,
		Role:      role,
		Content:   content,
		CreatedAt: createdAt,
	}
	if err := insertAssistantAIMessageTx(tx, msg); err != nil {
		t.Fatalf("seed %s message: %s", role, err)
	}
	return msg
}

// 复现 chat 路径的「列出 → 算预算 → 裁剪」组合：当前用户消息（列表最后一条）
// 必须在裁剪结果中，且预算按统一公式预留当前消息。
func TestAssistantAIChatBudgetTrimsOldestKeepsCurrent(t *testing.T) {
	withAssistantAISessionTestDB(t)

	profile, err := SaveAssistantAIProfile(&AssistantAIProfile{
		Name:     "Fake",
		Provider: AssistantAIProviderFake,
		BaseURL:  "sourceflow://fake",
		Model:    "sourceflow-fake-chat",
		Settings: map[string]interface{}{
			"contextWindow": 5000,
			"maxTokens":     1000,
		},
	})
	if err != nil {
		t.Fatalf("save fake profile: %s", err)
	}
	session, err := CreateAssistantAISession(profile.ID, "chat", "Budget")
	if err != nil {
		t.Fatalf("create session: %s", err)
	}

	now := time.Now().UnixMilli()
	db, err := getAssistantAIDB()
	if err != nil {
		t.Fatalf("open assistant AI db: %s", err)
	}
	tx, err := db.Begin()
	if err != nil {
		t.Fatalf("begin tx: %s", err)
	}
	defer rollbackAssistantAITx(tx)
	seedAssistantAIBudgetMessage(t, tx, session.ID, "user", strings.Repeat("历", 1200), now-40)
	seedAssistantAIBudgetMessage(t, tx, session.ID, "assistant", strings.Repeat("答", 1200), now-30)
	seedAssistantAIBudgetMessage(t, tx, session.ID, "user", strings.Repeat("问", 1200), now-20)
	currentMessage := seedAssistantAIBudgetMessage(t, tx, session.ID, "user", strings.Repeat("当前消息", 20), now-10)
	if err = tx.Commit(); err != nil {
		t.Fatalf("commit seed: %s", err)
	}

	reloaded, err := getAssistantAIProfile0(db, profile.ID)
	if err != nil {
		t.Fatalf("reload profile: %s", err)
	}
	systemPrompt := strings.Repeat("系统", 100)
	contextMessages, err := listAssistantAISessionMessages(db, session.ID, 0)
	if err != nil {
		t.Fatalf("list messages: %s", err)
	}
	if 4 != len(contextMessages) {
		t.Fatalf("seeded messages = %d, want 4", len(contextMessages))
	}

	budget := resolveAssistantAIHistoryBudget(reloaded, systemPrompt, currentMessage)
	want := 5000 - 1000 - estimateAssistantAITextTokens(systemPrompt) - estimateAssistantAIMessageTokens(currentMessage)
	if budget != want {
		t.Fatalf("history budget = %d, want %d", budget, want)
	}

	trimmed := trimAssistantAIContextMessages(contextMessages, budget)
	if len(trimmed) >= len(contextMessages) {
		t.Fatalf("expected oldest history to be trimmed, got %d of %d", len(trimmed), len(contextMessages))
	}
	if trimmed[len(trimmed)-1].ID != currentMessage.ID {
		t.Fatal("current user message must never be trimmed")
	}
	kept := 0
	for _, msg := range trimmed {
		kept += estimateAssistantAIMessageTokens(msg)
	}
	if kept > budget {
		t.Fatalf("kept history tokens %d exceed budget %d", kept, budget)
	}
}

// 端到端冒烟：极小窗口下 chat 不出错，fake 回复回显当前消息，证明循环输入
// 里当前消息未被裁掉。
func TestAssistantAIChatWithTinyWindowStillAnswersCurrentMessage(t *testing.T) {
	withAssistantAISessionTestDB(t)

	profile, err := SaveAssistantAIProfile(&AssistantAIProfile{
		Name:     "Fake",
		Provider: AssistantAIProviderFake,
		BaseURL:  "sourceflow://fake",
		Model:    "sourceflow-fake-chat",
		Settings: map[string]interface{}{
			"contextWindow": 2048,
			"maxTokens":     512,
		},
	})
	if err != nil {
		t.Fatalf("save fake profile: %s", err)
	}
	session, err := CreateAssistantAISession(profile.ID, "chat", "Tiny Window")
	if err != nil {
		t.Fatalf("create session: %s", err)
	}

	now := time.Now().UnixMilli()
	db, err := getAssistantAIDB()
	if err != nil {
		t.Fatalf("open assistant AI db: %s", err)
	}
	tx, err := db.Begin()
	if err != nil {
		t.Fatalf("begin tx: %s", err)
	}
	defer rollbackAssistantAITx(tx)
	seedAssistantAIBudgetMessage(t, tx, session.ID, "user", strings.Repeat("久远的历史", 300), now-20)
	seedAssistantAIBudgetMessage(t, tx, session.ID, "assistant", strings.Repeat("久远的回答", 300), now-10)
	if err = tx.Commit(); err != nil {
		t.Fatalf("commit seed: %s", err)
	}

	currentMessage := "当前这条消息必须存活"
	result, err := ChatAssistantAI(&AssistantAIChatRequest{SessionID: session.ID, Message: currentMessage})
	if err != nil {
		t.Fatalf("chat with tiny window: %s", err)
	}
	if nil == result.AssistantMessage || !strings.Contains(result.AssistantMessage.Content, "Fake Reply") {
		t.Fatalf("expected fake reply, got %#v", result.AssistantMessage)
	}
	if !strings.Contains(result.AssistantMessage.Content, "当前这条消息必须存活") {
		t.Fatalf("fake reply should echo the current (untrimmed) user message, got %q", result.AssistantMessage.Content)
	}
	if nil == result.UserMessage || result.UserMessage.Content != currentMessage {
		t.Fatalf("unexpected user message %#v", result.UserMessage)
	}
}
