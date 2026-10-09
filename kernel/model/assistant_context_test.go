package model

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/lonelyor/sourceflow/kernel/conf"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/go-humanize"
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

// withAssistantContextAssetTestEnv 提供临时 DataDir 与最小 Conf，隔离资产枚举测试的文件系统副作用。
func withAssistantContextAssetTestEnv(t *testing.T) {
	t.Helper()
	oldDataDir := util.DataDir
	oldConf := Conf

	aiSecurityConfigLock.Lock()
	oldSecurityCache := aiSecurityConfigCache
	aiSecurityConfigCache = nil
	aiSecurityConfigLock.Unlock()

	util.DataDir = filepath.Join(t.TempDir(), "data")
	if err := os.MkdirAll(util.DataDir, 0755); err != nil {
		t.Fatalf("create temp data dir failed: %v", err)
	}
	Conf = NewAppConf()
	Conf.FileTree = conf.NewFileTree()
	Conf.Search = conf.NewSearch()

	t.Cleanup(func() {
		aiSecurityConfigLock.Lock()
		aiSecurityConfigCache = oldSecurityCache
		aiSecurityConfigLock.Unlock()
		Conf = oldConf
		util.DataDir = oldDataDir
	})
}

// createAssistantContextAssetNotebook 在临时 DataDir 下创建带 conf.json 的笔记本目录。
func createAssistantContextAssetNotebook(t *testing.T, boxID, name string, closed bool) string {
	t.Helper()
	boxDir := filepath.Join(util.DataDir, boxID)
	confPath := util.HiddenDataPath(boxDir, "conf.json")
	if err := os.MkdirAll(filepath.Dir(confPath), 0755); err != nil {
		t.Fatalf("create notebook hidden dir failed: %v", err)
	}
	data := fmt.Sprintf(`{"name":%q,"closed":%t}`, name, closed)
	if err := os.WriteFile(confPath, []byte(data), 0644); err != nil {
		t.Fatalf("write notebook conf failed: %v", err)
	}
	return boxDir
}

func writeAssistantContextAssetFile(t *testing.T, absPath, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(absPath), 0755); err != nil {
		t.Fatalf("create asset dir failed: %v", err)
	}
	if err := os.WriteFile(absPath, []byte(content), 0644); err != nil {
		t.Fatalf("write asset file failed: %v", err)
	}
}

func TestAssistantAssetSearchLimit(t *testing.T) {
	tests := []struct {
		limit    int
		docCount int
		want     int
	}{
		{limit: 10, docCount: 10, want: 0},
		{limit: 10, docCount: 6, want: 4},
		{limit: 10, docCount: 5, want: 5},
		{limit: 10, docCount: 4, want: 6},
		{limit: 10, docCount: 2, want: 8},
		{limit: 10, docCount: 0, want: 10},
		{limit: 8, docCount: 4, want: 4},
		{limit: 8, docCount: 3, want: 5},
		{limit: 0, docCount: 0, want: 0},
	}
	for _, tt := range tests {
		if got := assistantAssetSearchLimit(tt.limit, tt.docCount); got != tt.want {
			t.Errorf("assistantAssetSearchLimit(%d, %d) = %d, want %d", tt.limit, tt.docCount, got, tt.want)
		}
	}
}

func TestSearchAssistantAssetItems(t *testing.T) {
	withAssistantContextAssetTestEnv(t)

	// 全局资产
	assetsDir := filepath.Join(util.DataDir, "assets")
	writeAssistantContextAssetFile(t, filepath.Join(assetsDir, "arch.png"), "PNG")
	writeAssistantContextAssetFile(t, filepath.Join(assetsDir, "arch-overlay.jpg"), "JPG")
	writeAssistantContextAssetFile(t, filepath.Join(assetsDir, "my-arch.png"), "NONPREFIX")
	writeAssistantContextAssetFile(t, filepath.Join(assetsDir, "notes.txt"), "text")
	writeAssistantContextAssetFile(t, filepath.Join(assetsDir, "sub", "deep.pdf"), "PDF")
	writeAssistantContextAssetFile(t, filepath.Join(assetsDir, "tool.exe"), "exe")

	// 笔记本资产（含与全局同名的 arch.png，全局优先）
	boxDir := createAssistantContextAssetNotebook(t, "20260915100000-asset01", "测试笔记本", false)
	writeAssistantContextAssetFile(t, filepath.Join(boxDir, "assets", "arch.png"), "BOXPNG")
	writeAssistantContextAssetFile(t, filepath.Join(boxDir, "assets", "diagram.pdf"), "PDF")

	// 已关闭笔记本的资产不应出现
	closedBoxDir := createAssistantContextAssetNotebook(t, "20260915110000-asset02", "关闭笔记本", true)
	writeAssistantContextAssetFile(t, filepath.Join(closedBoxDir, "assets", "closed.png"), "PNG")

	// 命中：包含匹配 + 不区分大小写；arch.png 与 arch-overlay.jpg 均为前缀命中，按字母序在前，my-arch.png 为包含命中殿后
	results := searchAssistantAssetItems("arch", 10, AISecurityModeDefault)
	var ids []string
	for _, r := range results {
		if r.Type != AssistantContextAsset {
			t.Errorf("result %s type = %s, want asset", r.ID, r.Type)
		}
		ids = append(ids, r.ID)
	}
	wantIDs := []string{"assets/arch-overlay.jpg", "assets/arch.png", "assets/my-arch.png"}
	if strings.Join(ids, ",") != strings.Join(wantIDs, ",") {
		t.Errorf("asset ids = %v, want %v", ids, wantIDs)
	}
	for _, r := range results {
		if r.HPath != "assets" {
			t.Errorf("global asset %s hPath = %q, want assets", r.ID, r.HPath)
		}
		if r.Title != filepath.Base(r.ID) {
			t.Errorf("asset title = %q, want file name of %s", r.Title, r.ID)
		}
	}

	// 同名时全局优先，笔记本同名文件不重复出现
	count := 0
	for _, id := range ids {
		if id == "assets/arch.png" {
			count++
		}
	}
	if count != 1 {
		t.Errorf("arch.png occurred %d times, want 1 (global first)", count)
	}

	// 嵌套目录资产
	results = searchAssistantAssetItems("deep", 10, AISecurityModeDefault)
	if len(results) != 1 || results[0].ID != "assets/sub/deep.pdf" {
		t.Errorf("nested asset search = %v, want [assets/sub/deep.pdf]", resultIDs(results))
	}

	// 笔记本资产 hPath 标注所属笔记本
	results = searchAssistantAssetItems("diagram", 10, AISecurityModeDefault)
	if len(results) != 1 {
		t.Fatalf("notebook asset search returned %d results, want 1", len(results))
	}
	if results[0].ID != "assets/diagram.pdf" {
		t.Errorf("notebook asset id = %q, want assets/diagram.pdf", results[0].ID)
	}
	if results[0].HPath != "测试笔记本/assets" {
		t.Errorf("notebook asset hPath = %q, want 测试笔记本/assets", results[0].HPath)
	}

	// 不命中
	if results := searchAssistantAssetItems("zzz", 10, AISecurityModeDefault); len(results) != 0 {
		t.Errorf("miss query returned %d results, want 0", len(results))
	}

	// 白名单之外的扩展名不参与搜索
	if results := searchAssistantAssetItems("tool", 10, AISecurityModeDefault); len(results) != 0 {
		t.Errorf("non-whitelisted asset returned %d results, want 0", len(results))
	}

	// 已关闭笔记本不可见
	if results := searchAssistantAssetItems("closed", 10, AISecurityModeDefault); len(results) != 0 {
		t.Errorf("closed notebook asset returned %d results, want 0", len(results))
	}

	// 查询大写同样命中（不区分大小写）
	if results := searchAssistantAssetItems("DIAGRAM", 10, AISecurityModeDefault); len(results) != 1 {
		t.Errorf("uppercase query returned %d results, want 1", len(results))
	}
}

// TestSearchAssistantAssetItemsPrefixPriority 验证前缀命中优先于字母序，且 limit 截断后保留前缀命中。
func TestSearchAssistantAssetItemsPrefixPriority(t *testing.T) {
	withAssistantContextAssetTestEnv(t)

	assetsDir := filepath.Join(util.DataDir, "assets")
	writeAssistantContextAssetFile(t, filepath.Join(assetsDir, "a-report.png"), "1")
	writeAssistantContextAssetFile(t, filepath.Join(assetsDir, "report.png"), "2")
	writeAssistantContextAssetFile(t, filepath.Join(assetsDir, "report-a.png"), "3")
	writeAssistantContextAssetFile(t, filepath.Join(assetsDir, "report-b.png"), "4")

	// limit=2 时只保留前缀命中的前两个；a-report.png 虽字母序最靠前但只是包含命中，被前缀命中挤出
	results := searchAssistantAssetItems("report", 2, AISecurityModeDefault)
	wantIDs := []string{"assets/report-a.png", "assets/report-b.png"}
	if strings.Join(resultIDs(results), ",") != strings.Join(wantIDs, ",") {
		t.Errorf("prefix priority ids = %v, want %v", resultIDs(results), wantIDs)
	}

	// limit 覆盖全部命中时，前缀命中仍整体排在包含命中之前（a-report.png 殿后）
	results = searchAssistantAssetItems("report", 10, AISecurityModeDefault)
	ids := resultIDs(results)
	if len(ids) != 4 || ids[3] != "assets/a-report.png" {
		t.Errorf("full ids = %v, want prefix hits first and a-report.png last", ids)
	}
}

// TestSearchAssistantContextItemsAssetAllocation 集成验证：无文档命中时资产放宽填满 limit。
func TestSearchAssistantContextItemsAssetAllocation(t *testing.T) {
	withAssistantContextAssetTestEnv(t)

	assetsDir := filepath.Join(util.DataDir, "assets")
	for i := 0; i < 6; i++ {
		writeAssistantContextAssetFile(t, filepath.Join(assetsDir, fmt.Sprintf("report-%d.png", i)), "PNG")
	}

	results := SearchAssistantContextItems("report", 4, AISecurityModeDefault)
	if len(results) != 4 {
		t.Fatalf("SearchAssistantContextItems returned %d results, want 4", len(results))
	}
	for _, r := range results {
		if r.Type != AssistantContextAsset {
			t.Errorf("result %s type = %s, want asset (no docs available)", r.ID, r.Type)
		}
	}

	// 空 limit 不返回结果
	if results := SearchAssistantContextItems("report", 0, AISecurityModeDefault); len(results) != 0 {
		t.Errorf("limit=0 returned %d results, want 0", len(results))
	}
}

func TestBuildAssistantContextPackAssetMetadata(t *testing.T) {
	withAssistantContextAssetTestEnv(t)

	// 全局图片资产
	writeAssistantContextAssetFile(t, filepath.Join(util.DataDir, "assets", "shot.png"), "123456789")
	// 笔记本文档资产
	boxDir := createAssistantContextAssetNotebook(t, "20260915100000-asset01", "测试笔记本", false)
	writeAssistantContextAssetFile(t, filepath.Join(boxDir, "assets", "spec.pdf"), "PDFDATA")

	items := []AssistantContextPackItem{
		{Type: AssistantContextAsset, ID: "assets/shot.png"},
		{Type: AssistantContextAsset, ID: "assets/spec.pdf"},
	}
	pack, err := BuildAssistantContextPack(items, AISecurityModeDefault)
	if err != nil {
		t.Fatalf("BuildAssistantContextPack error: %v", err)
	}
	if len(pack.Items) != 2 {
		t.Fatalf("pack items = %d, want 2", len(pack.Items))
	}
	if len(pack.Dropped) != 0 {
		t.Fatalf("pack dropped = %d, want 0", len(pack.Dropped))
	}

	shot := pack.Items[0]
	if shot.Type != AssistantContextAsset {
		t.Errorf("item type = %s, want asset", shot.Type)
	}
	if shot.Title != "shot.png" {
		t.Errorf("item title = %q, want shot.png", shot.Title)
	}
	if shot.HPath != "assets" {
		t.Errorf("item hPath = %q, want assets", shot.HPath)
	}
	wantSize := humanize.BytesCustomCeil(uint64(len("123456789")), 2)
	for _, want := range []string{"附件：shot.png", "类型：图片（.png）", "大小：" + wantSize, "修改时间：", "位置：assets"} {
		if !strings.Contains(shot.Summary, want) {
			t.Errorf("asset summary %q missing %q", shot.Summary, want)
		}
	}

	spec := pack.Items[1]
	if spec.HPath != "测试笔记本/assets" {
		t.Errorf("notebook asset hPath = %q, want 测试笔记本/assets", spec.HPath)
	}
	if !strings.Contains(spec.Summary, "类型：文档（.pdf）") {
		t.Errorf("pdf asset summary %q missing doc type", spec.Summary)
	}
	if !strings.Contains(spec.Summary, "位置：测试笔记本/assets") {
		t.Errorf("pdf asset summary %q missing notebook location", spec.Summary)
	}
}

func TestBuildAssistantContextPackAssetMissingDropped(t *testing.T) {
	withAssistantContextAssetTestEnv(t)

	items := []AssistantContextPackItem{
		{Type: AssistantContextAsset, ID: "assets/ghost.png"},
	}
	pack, err := BuildAssistantContextPack(items, AISecurityModeDefault)
	if err != nil {
		t.Fatalf("BuildAssistantContextPack error: %v", err)
	}
	if len(pack.Items) != 0 {
		t.Errorf("pack items = %d, want 0 for missing asset", len(pack.Items))
	}
	if len(pack.Dropped) != 1 {
		t.Fatalf("pack dropped = %d, want 1", len(pack.Dropped))
	}
	dropped := pack.Dropped[0]
	if dropped.Type != AssistantContextAsset {
		t.Errorf("dropped type = %s, want asset", dropped.Type)
	}
	if dropped.ID != "assets/ghost.png" {
		t.Errorf("dropped id = %q, want assets/ghost.png", dropped.ID)
	}
	if dropped.Title != "ghost.png" {
		t.Errorf("dropped title = %q, want ghost.png", dropped.Title)
	}
	if strings.TrimSpace(dropped.Reason) == "" {
		t.Error("dropped reason should not be empty")
	}

	// 路径穿越形式同样只按枚举索引查找，不会读到文件内容
	items = []AssistantContextPackItem{
		{Type: AssistantContextAsset, ID: "../../../etc/passwd"},
		{Type: AssistantContextAsset, ID: filepath.Join(util.DataDir, "assets", "shot.png")},
	}
	writeAssistantContextAssetFile(t, filepath.Join(util.DataDir, "assets", "shot.png"), "PNG")
	pack, err = BuildAssistantContextPack(items, AISecurityModeDefault)
	if err != nil {
		t.Fatalf("BuildAssistantContextPack error: %v", err)
	}
	if len(pack.Items) != 0 {
		t.Errorf("pack items = %d, want 0 for traversal/absolute ids", len(pack.Items))
	}
	if len(pack.Dropped) != 2 {
		t.Errorf("pack dropped = %d, want 2", len(pack.Dropped))
	}
}

func resultIDs(results []*AssistantContextSearchResult) []string {
	var ids []string
	for _, r := range results {
		ids = append(ids, r.ID)
	}
	return ids
}
