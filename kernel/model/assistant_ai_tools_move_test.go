package model

import (
	dbsql "database/sql"
	"os"
	"path"
	"path/filepath"
	"strings"
	"testing"

	"github.com/lonelyor/sourceflow/kernel/conf"
	"github.com/lonelyor/sourceflow/kernel/sql"
	"github.com/lonelyor/sourceflow/kernel/treenode"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
)

// withAssistantMoveNoteTestEnv 提供完全隔离的临时工作区：独立的数据目录、blocks/blocktree
// 数据库、笔记本存储、AI 安全配置与 assistant AI 数据库，测试结束后逐项还原。
func withAssistantMoveNoteTestEnv(t *testing.T) {
	t.Helper()

	oldDataDir := util.DataDir
	oldTempDir := util.TempDir
	oldConfDir := util.ConfDir
	oldDBPath := util.DBPath
	oldBlockTreeDBPath := util.BlockTreeDBPath
	oldConf := Conf
	oldLangs := util.Langs
	oldTimeLangs := util.TimeLangs

	tmp := t.TempDir()
	util.DataDir = tmp + "/data"
	util.TempDir = tmp + "/temp"
	util.ConfDir = tmp + "/conf"
	if err := os.MkdirAll(util.TempDir, 0755); nil != err {
		t.Fatalf("create isolated temp dir failed: %v", err)
	}
	// 提供最小语言包，保证内核错误路径与文档信息刷新能给出可读文案（HumanizeTime 依赖 TimeLangs）
	util.Langs = map[string]map[int]string{
		"en_US": {
			0:   "notebook not found",
			1:   "document file already exists",
			5:   "failed to move document",
			13:  "file name cannot start with a dot",
			16:  "Untitled document",
			70:  "Moving [%s]",
			105: "Untitled notebook",
			106: "The name is too long",
			118: "The document depth exceeds the limit",
		},
	}
	util.TimeLangs = map[string]map[string]interface{}{
		"en_US": {
			"albl": "ago", "blbl": "from now",
			"now": "now", "1s": "1 second %s", "xs": "%d seconds %s",
			"1m": "1 minute %s", "xm": "%d minutes %s",
			"1h": "1 hour %s", "xh": "%d hours %s",
			"1d": "1 day %s", "xd": "%d days %s",
			"1w": "1 week %s", "xw": "%d weeks %s",
			"1M": "1 month %s", "xM": "%d months %s",
			"1y": "1 year %s", "2y": "2 years %s", "xy": "%d years %s", "max": "a long time %s",
		},
	}
	util.DBPath = filepath.Join(util.TempDir, "blocks.db")
	util.BlockTreeDBPath = filepath.Join(util.TempDir, "blocktree.db")
	// 先建 blocktree 库（移动校验依赖 GetBlockTree/LoadTreeByBlockID）
	treenode.InitBlockTree(true)
	// 再预建不含 fts5 虚拟表的最小 blocks 库并写入匹配版本号，
	// 让 sql.InitDatabase(false) 命中“版本一致”分支直接复用既有库，
	// 避免普通 `go test`（未带 fts5 构建标签）下重建库触发致命错误。
	initAssistantMoveBlocksDBForTest(t)
	sql.InitDatabase(false)
	Conf = NewAppConf()
	Conf.FileTree = conf.NewFileTree()
	Conf.Sync = &conf.Sync{}
	Conf.Editor = conf.NewEditor()
	Conf.Search = conf.NewSearch()
	Conf.Lang = "en_US"

	aiSecurityConfigLock.Lock()
	oldSecurityCache := aiSecurityConfigCache
	aiSecurityConfigCache = nil
	aiSecurityConfigLock.Unlock()

	assistantAIDBLock.Lock()
	oldAssistantDB := assistantAIDB
	assistantAIDB = nil
	assistantAIDBLock.Unlock()

	t.Cleanup(func() {
		assistantAIDBLock.Lock()
		if nil != assistantAIDB {
			_ = assistantAIDB.Close()
		}
		assistantAIDB = oldAssistantDB
		assistantAIDBLock.Unlock()

		aiSecurityConfigLock.Lock()
		aiSecurityConfigCache = oldSecurityCache
		aiSecurityConfigLock.Unlock()

		util.DataDir = oldDataDir
		util.TempDir = oldTempDir
		util.ConfDir = oldConfDir
		util.DBPath = oldDBPath
		util.BlockTreeDBPath = oldBlockTreeDBPath
		util.Langs = oldLangs
		util.TimeLangs = oldTimeLangs
		Conf = oldConf
	})
}

// initAssistantMoveBlocksDBForTest 预建最小 blocks 库 schema（不含 fts5 虚拟表）。
func initAssistantMoveBlocksDBForTest(t *testing.T) {
	t.Helper()
	db, err := dbsql.Open("sqlite3_extended", util.DBPath)
	if nil != err {
		t.Fatalf("open blocks db: %v", err)
	}
	defer db.Close()
	statements := []string{
		`CREATE TABLE IF NOT EXISTS stat (key, value)`,
		`INSERT INTO stat (key, value) VALUES ('sourceflow_database_ver', '` + util.DatabaseVer + `')`,
		`CREATE TABLE IF NOT EXISTS blocks (id, parent_id, root_id, hash, box, path, hpath, name, alias, memo, tag, content, fcontent, markdown, length, type, subtype, ial, sort, created, updated)`,
		`CREATE INDEX IF NOT EXISTS idx_blocks_id ON blocks(id)`,
		`CREATE INDEX IF NOT EXISTS idx_blocks_parent_id ON blocks(parent_id)`,
		`CREATE INDEX IF NOT EXISTS idx_blocks_root_id ON blocks(root_id)`,
		`CREATE INDEX IF NOT EXISTS idx_blocks_root_id_id_hash ON blocks(root_id, id, hash)`,
		`CREATE TABLE IF NOT EXISTS spans (id, block_id, root_id, box, path, content, markdown, type, ial)`,
		`CREATE INDEX IF NOT EXISTS idx_spans_root_id ON spans(root_id)`,
		`CREATE TABLE IF NOT EXISTS assets (id, block_id, root_id, box, docpath, path, name, title, hash)`,
		`CREATE INDEX IF NOT EXISTS idx_assets_root_id ON assets(root_id)`,
		`CREATE TABLE IF NOT EXISTS attributes (id, name, value, type, block_id, root_id, box, path)`,
		`CREATE INDEX IF NOT EXISTS idx_attributes_block_id ON attributes(block_id)`,
		`CREATE INDEX IF NOT EXISTS idx_attributes_root_id ON attributes(root_id)`,
		`CREATE TABLE IF NOT EXISTS refs (id, def_block_id, def_block_parent_id, def_block_root_id, def_block_path, block_id, root_id, box, path, content, markdown, type)`,
		`CREATE INDEX IF NOT EXISTS idx_refs_def_block_id ON refs(def_block_id)`,
		`CREATE INDEX IF NOT EXISTS idx_refs_def_block_root_id ON refs(def_block_root_id)`,
		`CREATE INDEX IF NOT EXISTS idx_refs_block_id ON refs(block_id)`,
		`CREATE INDEX IF NOT EXISTS idx_refs_root_id ON refs(root_id)`,
		`CREATE TABLE IF NOT EXISTS file_annotation_refs (id, file_path, annotation_id, block_id, root_id, box, path, content, type)`,
	}
	for _, stmt := range statements {
		if _, err = db.Exec(stmt); nil != err {
			t.Fatalf("init blocks db schema failed: %v (stmt: %s)", err, stmt)
		}
	}
}

// setAssistantMoveCapability 直接开关安全配置中的 move 能力（默认 false）。
func setAssistantMoveCapability(t *testing.T, enabled bool) {
	t.Helper()
	cfg := NewAISecurityConfig()
	cfg.Capabilities.Move = enabled
	if err := SetAISecurityConfig(cfg); nil != err {
		t.Fatalf("set AI security config failed: %v", err)
	}
}

// openAssistantMoveBox 将新建笔记本置为打开状态（NewBoxConf 默认 Closed=true）。
func openAssistantMoveBox(t *testing.T, boxID string) {
	t.Helper()
	box := &Box{ID: boxID}
	boxConf := box.GetConf()
	boxConf.Closed = false
	box.Name = boxConf.Name
	box.SaveConf(boxConf)
}

// createAssistantMoveNoteFixture 建两个笔记本：
// boxA：/源笔记、/同名、/归档/同名、/归档/目标父文档
// boxB：/B根文档
func createAssistantMoveNoteFixture(t *testing.T) (boxAID, boxBID, noteID, sameNameID, archiveParentID, boxBRootID string) {
	t.Helper()
	var err error
	if boxAID, err = CreateBox("BoxA"); nil != err {
		t.Fatalf("create box A: %v", err)
	}
	openAssistantMoveBox(t, boxAID)
	if boxBID, err = CreateBox("BoxB"); nil != err {
		t.Fatalf("create box B: %v", err)
	}
	openAssistantMoveBox(t, boxBID)
	if noteID, err = CreateWithMarkdownSanitized("", boxAID, "/源笔记", "源笔记正文", "", ast.NewNodeID(), false, ""); nil != err {
		t.Fatalf("create source note: %v", err)
	}
	if sameNameID, err = CreateWithMarkdownSanitized("", boxAID, "/同名", "同名根文档", "", ast.NewNodeID(), false, ""); nil != err {
		t.Fatalf("create duplicate-title note: %v", err)
	}
	if archiveParentID, err = CreateWithMarkdownSanitized("", boxAID, "/归档/同名", "归档内同名文档", "", ast.NewNodeID(), false, ""); nil != err {
		t.Fatalf("create archive duplicate doc: %v", err)
	}
	if _, err = CreateWithMarkdownSanitized("", boxAID, "/归档/目标父文档", "目标父文档", "", ast.NewNodeID(), false, ""); nil != err {
		t.Fatalf("create archive parent doc: %v", err)
	}
	if boxBRootID, err = CreateWithMarkdownSanitized("", boxBID, "/B根文档", "B 根文档内容", "", ast.NewNodeID(), false, ""); nil != err {
		t.Fatalf("create box B root doc: %v", err)
	}
	FlushTxQueue()
	return
}

func assistantMoveBlockTree(t *testing.T, noteID string) *treenode.BlockTree {
	t.Helper()
	bt := treenode.GetBlockTree(noteID)
	if nil == bt {
		t.Fatalf("block tree of note [%s] is missing", noteID)
	}
	return bt
}

func TestAssistantAIMoveNoteToPathCatalogAndSchema(t *testing.T) {
	def := getAssistantAIToolDefinition(AssistantAIToolMoveNoteToPath)
	if nil == def {
		t.Fatal("move-note-to-path tool is missing from catalog")
	}
	if def.Risk != AssistantAIToolRiskMediumWrite {
		t.Fatalf("risk = %q, want %q", def.Risk, AssistantAIToolRiskMediumWrite)
	}
	if def.Category != "write" {
		t.Fatalf("category = %q, want write", def.Category)
	}
	if def.Target != AssistantAIToolScopeWorkspace {
		t.Fatalf("target = %q, want %q", def.Target, AssistantAIToolScopeWorkspace)
	}
	if def.DefaultMode != AssistantAIToolModeConfirm {
		t.Fatalf("default mode = %q, want %q", def.DefaultMode, AssistantAIToolModeConfirm)
	}
	if got := toolSecurityCapability(def); got != AISecurityCapabilityMove {
		t.Fatalf("tool security capability = %q, want %q", got, AISecurityCapabilityMove)
	}
	if got := toolRiskToSecurityRisk(def.Risk); got != AISecurityRiskL3 {
		t.Fatalf("security risk = %q, want L3", got)
	}

	policy := getAssistantAIToolPolicy(nil)
	if got := policy.ToolModes[AssistantAIToolMoveNoteToPath]; got != AssistantAIToolModeConfirm {
		t.Fatalf("default policy mode = %q, want %q", got, AssistantAIToolModeConfirm)
	}

	schema, ok := buildAssistantAIToolParameterSchema(def).(map[string]interface{})
	if !ok {
		t.Fatal("schema should be an object map")
	}
	properties, ok := schema["properties"].(map[string]interface{})
	if !ok {
		t.Fatal("schema properties should be a map")
	}
	for _, key := range []string{"noteID", "toNotebook", "toPath", "dryRun"} {
		if nil == properties[key] {
			t.Fatalf("schema property %q is missing", key)
		}
	}
	required, ok := schema["required"].([]string)
	if !ok {
		t.Fatal("schema required should be a string list")
	}
	for _, key := range []string{"noteID", "toNotebook", "toPath"} {
		found := false
		for _, item := range required {
			if item == key {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("required key %q is missing from schema", key)
		}
	}
}

func TestAssistantAIMoveNoteToPathDryRunGeneratesPreviewWithoutMoving(t *testing.T) {
	withAssistantMoveNoteTestEnv(t)
	boxAID, boxBID, noteID, _, _, _ := createAssistantMoveNoteFixture(t)
	setAssistantMoveCapability(t, true)
	profile, err := SaveAssistantAIProfile(&AssistantAIProfile{
		Name:     "Fake",
		Provider: AssistantAIProviderFake,
		BaseURL:  "sourceflow://fake",
		Model:    "sourceflow-fake-chat",
	})
	if nil != err {
		t.Fatalf("save profile: %v", err)
	}

	before := assistantMoveBlockTree(t, noteID)
	result, err := ExecuteAssistantAITool(&AssistantAIToolRequest{
		ProfileID:    profile.ID,
		SessionID:    "move-dry-run-session",
		SecurityMode: AISecurityModeFullAccess,
		Context:      &AssistantAINoteContext{RootID: noteID, Notebook: boxAID},
		ToolID:       AssistantAIToolMoveNoteToPath,
		Args: map[string]interface{}{
			"noteID":     noteID,
			"toNotebook": boxBID,
			"toPath":     "",
			"dryRun":     true,
		},
	})
	if nil != err {
		t.Fatalf("execute move-note-to-path dry run: %v", err)
	}
	if result.Executed {
		t.Fatal("dry run must not execute a real move")
	}
	previewRaw, ok := result.Data["previewPatch"]
	if !ok {
		t.Fatalf("dry run result missing previewPatch: %+v", result.Data)
	}
	preview, ok := previewRaw.(map[string]interface{})
	if !ok {
		t.Fatalf("previewPatch has unexpected type: %T", previewRaw)
	}
	ops, ok := preview["operations"].([]map[string]interface{})
	if !ok || 1 != len(ops) {
		t.Fatalf("preview operations = %#v, want exactly one operation", preview["operations"])
	}
	if got := getAssistantAIStringValue(ops[0], "type", ""); got != AssistantPatchOperationMoveNote {
		t.Fatalf("preview operation type = %q, want %q", got, AssistantPatchOperationMoveNote)
	}
	if got := getAssistantAIStringValue(ops[0], "targetId", ""); got != noteID {
		t.Fatalf("preview operation targetId = %q, want %q", got, noteID)
	}
	beforeText := getAssistantAIStringValue(ops[0], "before", "")
	afterText := getAssistantAIStringValue(ops[0], "after", "")
	if !strings.Contains(beforeText, before.Path) || !strings.Contains(beforeText, "BoxA") {
		t.Fatalf("preview before = %q, want source path and BoxA", beforeText)
	}
	if !strings.Contains(afterText, "BoxB") {
		t.Fatalf("preview after = %q, want target BoxB", afterText)
	}
	attrs, ok := ops[0]["attrs"].(map[string]interface{})
	if !ok {
		t.Fatalf("preview operation attrs = %#v, want map", ops[0]["attrs"])
	}
	if got := getAssistantAIStringValue(attrs, "toNotebook", ""); got != boxBID {
		t.Fatalf("preview attrs toNotebook = %q, want %q", got, boxBID)
	}

	// dryRun 绝不能产生真实移动
	after := assistantMoveBlockTree(t, noteID)
	if after.BoxID != boxAID || after.Path != before.Path {
		t.Fatalf("dry run moved the note: before=%+v after=%+v", before, after)
	}
}

func TestAssistantAIMoveNoteToPathDirectExecutionAfterConfirm(t *testing.T) {
	withAssistantMoveNoteTestEnv(t)
	boxAID, boxBID, noteID, _, _, _ := createAssistantMoveNoteFixture(t)
	setAssistantMoveCapability(t, true)
	profile, err := SaveAssistantAIProfile(&AssistantAIProfile{
		Name:     "Fake",
		Provider: AssistantAIProviderFake,
		BaseURL:  "sourceflow://fake",
		Model:    "sourceflow-fake-chat",
	})
	if nil != err {
		t.Fatalf("save profile: %v", err)
	}

	db, err := getAssistantAIDB()
	if nil != err {
		t.Fatalf("open assistant AI db: %v", err)
	}
	before := assistantMoveBlockTree(t, noteID)
	result, err := confirmAssistantAITool(db, profile, "move-confirm-session",
		&AssistantAINoteContext{RootID: noteID, Notebook: boxAID},
		AssistantAIToolMoveNoteToPath,
		map[string]interface{}{
			"noteID":       noteID,
			"toNotebook":   boxBID,
			"toPath":       "",
			"executeWrite": true,
		}, "确认移动", AISecurityModeFullAccess)
	if nil != err {
		t.Fatalf("confirm move-note-to-path: %v", err)
	}
	if !result.Executed {
		t.Fatalf("confirmed move should execute, got: %+v", result)
	}
	if !assistantAIToolDirectWriteRequested(result.Args) {
		t.Fatalf("direct write flag lost in result args: %+v", result.Args)
	}

	after := assistantMoveBlockTree(t, noteID)
	if after.BoxID != boxBID {
		t.Fatalf("note should be in box B after move, got box %q", after.BoxID)
	}
	boxB := Conf.Box(boxBID)
	if nil == boxB || !boxB.Exist(after.Path) {
		t.Fatalf("target file missing in box B: %q", after.Path)
	}
	boxA := Conf.Box(boxAID)
	if nil == boxA || boxA.Exist(before.Path) {
		t.Fatalf("source file still exists in box A: %q", before.Path)
	}
}

func TestAssistantPatchApplyMoveNoteIntoParentDocPath(t *testing.T) {
	withAssistantMoveNoteTestEnv(t)
	boxAID, _, noteID, _, archiveParentID, _ := createAssistantMoveNoteFixture(t)
	setAssistantMoveCapability(t, true)

	before := assistantMoveBlockTree(t, noteID)
	parentTree := assistantMoveBlockTree(t, archiveParentID)
	result, err := ApplyAssistantPatchOperation(&AssistantPatchApplyRequest{
		Patch: &AssistantEditPatch{
			ID:     "patch-move-note",
			Source: "tool",
			Target: "notebook",
			Risk:   "L3",
			Summary: "移动笔记",
			Operations: []*AssistantPatchOperation{{
				ID:       "op-move-note",
				Type:     AssistantPatchOperationMoveNote,
				TargetID: noteID,
				Attrs: map[string]interface{}{
					"toNotebook": boxAID,
					"toPath":     parentTree.Path,
				},
			}},
		},
		Operation: &AssistantPatchOperation{
			ID:       "op-move-note",
			Type:     AssistantPatchOperationMoveNote,
			TargetID: noteID,
			Attrs: map[string]interface{}{
				"toNotebook": boxAID,
				"toPath":     parentTree.Path,
			},
		},
		Context:      &AssistantAINoteContext{RootID: noteID, Notebook: boxAID},
		SecurityMode: AISecurityModeFullAccess,
	})
	if nil != err {
		t.Fatalf("apply move-note patch: %v", err)
	}
	if result.RequiresConfirm {
		t.Fatalf("move-note patch should be applied directly in full access mode: %+v", result)
	}
	if got := result.AppliedTargetID; got != noteID {
		t.Fatalf("appliedTargetId = %q, want %q", got, noteID)
	}

	after := assistantMoveBlockTree(t, noteID)
	if after.BoxID != boxAID {
		t.Fatalf("note should stay in box A, got %q", after.BoxID)
	}
	if want := strings.TrimSuffix(parentTree.Path, ".sf") + "/" + noteID + ".sf"; after.Path != want {
		t.Fatalf("new path = %q, want %q", after.Path, want)
	}
	boxA := Conf.Box(boxAID)
	if nil == boxA || !boxA.Exist(after.Path) {
		t.Fatalf("moved file missing in box A: %q", after.Path)
	}
	if boxA.Exist(before.Path) {
		t.Fatalf("source file still exists after move: %q", before.Path)
	}
}

func TestAssistantAIMoveNoteFailClosedOnInvalidTargets(t *testing.T) {
	withAssistantMoveNoteTestEnv(t)
	boxAID, boxBID, noteID, sameNameID, archiveParentID, _ := createAssistantMoveNoteFixture(t)
	setAssistantMoveCapability(t, true)

	// 越界路径必须被拒绝
	if _, err := resolveAssistantAIMoveNotePlan(noteID, boxAID, "/../../outside"); nil == err {
		t.Fatal("parent traversal target must be rejected")
	}
	// 不存在的目标父文档必须失败关闭
	if _, err := resolveAssistantAIMoveNotePlan(noteID, boxAID, "/20260101000000-missing.sf"); nil == err {
		t.Fatal("missing target parent must be rejected")
	}
	// 不存在的目标笔记本必须失败关闭
	if _, err := resolveAssistantAIMoveNotePlan(noteID, "20260101000000-missing", ""); nil == err {
		t.Fatal("missing target notebook must be rejected")
	}
	// 非根块 ID 不能作为移动目标
	if _, err := resolveAssistantAIMoveNotePlan("not-a-root-id", boxBID, ""); nil == err {
		t.Fatal("non-root note ID must be rejected")
	}
	// 移入自身必须被拒绝
	if _, err := resolveAssistantAIMoveNotePlan(noteID, boxAID, "/"+noteID+".sf"); nil == err {
		t.Fatal("moving a note into itself must be rejected")
	}
	// 目标位置已有同名文档必须失败关闭，不允许静默改名：
	// 把根下的“同名”移动到“归档”文档下，而“归档/同名”已存在
	archiveDocPath := assistantMoveBlockTree(t, archiveParentID).Path
	archiveDirDocID := strings.TrimPrefix(path.Dir(archiveDocPath), "/")
	if _, err := resolveAssistantAIMoveNotePlan(sameNameID, boxAID, "/"+archiveDirDocID+".sf"); nil == err {
		t.Fatal("duplicate title at target must be rejected")
	} else if !strings.Contains(err.Error(), "already exists") {
		t.Fatalf("duplicate-title error should mention the conflict, got: %v", err)
	}

	// patch apply 层同样失败关闭：目标缺失时返回错误且不产生移动
	before := assistantMoveBlockTree(t, noteID)
	_, err := ApplyAssistantPatchOperation(&AssistantPatchApplyRequest{
		Patch: &AssistantEditPatch{
			ID:     "patch-move-bad",
			Source: "tool",
			Target: "notebook",
			Risk:   "L3",
			Operations: []*AssistantPatchOperation{{
				ID:       "op-move-bad",
				Type:     AssistantPatchOperationMoveNote,
				TargetID: noteID,
				Attrs: map[string]interface{}{
					"toNotebook": boxAID,
					"toPath":     "/20260101000000-missing.sf",
				},
			}},
		},
		Operation: &AssistantPatchOperation{
			ID:       "op-move-bad",
			Type:     AssistantPatchOperationMoveNote,
			TargetID: noteID,
			Attrs: map[string]interface{}{
				"toNotebook": boxAID,
				"toPath":     "/20260101000000-missing.sf",
			},
		},
		Context:      &AssistantAINoteContext{RootID: noteID, Notebook: boxAID},
		SecurityMode: AISecurityModeFullAccess,
	})
	if nil == err {
		t.Fatal("apply move-note patch with missing target must fail")
	}
	after := assistantMoveBlockTree(t, noteID)
	if after.Path != before.Path || after.BoxID != boxAID {
		t.Fatalf("failed patch apply must not move the note: before=%+v after=%+v", before, after)
	}
}

func TestAssistantAIMoveNoteCapabilityGateDeniesByDefault(t *testing.T) {
	withAssistantMoveNoteTestEnv(t)
	boxAID, boxBID, noteID, _, _, _ := createAssistantMoveNoteFixture(t)
	// 不开启 move 能力：默认配置 Move=false
	profile, err := SaveAssistantAIProfile(&AssistantAIProfile{
		Name:     "Fake",
		Provider: AssistantAIProviderFake,
		BaseURL:  "sourceflow://fake",
		Model:    "sourceflow-fake-chat",
	})
	if nil != err {
		t.Fatalf("save profile: %v", err)
	}

	// 工具入口：即使 fullAccess 模式也应被能力开关拒绝
	result, err := ExecuteAssistantAITool(&AssistantAIToolRequest{
		ProfileID:    profile.ID,
		SessionID:    "move-deny-session",
		SecurityMode: AISecurityModeFullAccess,
		Context:      &AssistantAINoteContext{RootID: noteID, Notebook: boxAID},
		ToolID:       AssistantAIToolMoveNoteToPath,
		Args: map[string]interface{}{
			"noteID":     noteID,
			"toNotebook": boxBID,
			"toPath":     "",
		},
	})
	if nil != err {
		t.Fatalf("execute move tool: %v", err)
	}
	if result.Executed {
		t.Fatal("move tool must not execute while the move capability is off")
	}
	if !strings.Contains(result.Error, "移动") {
		t.Fatalf("denial reason should mention moving, got: %q", result.Error)
	}
	if escalatable, ok := result.Data["securityEscalatable"].(bool); ok && escalatable {
		t.Fatal("capability denial must not be escalatable")
	}

	// patch 入口：能力开关关闭时要求确认且不可升级放行
	patchResult, err := ApplyAssistantPatchOperation(&AssistantPatchApplyRequest{
		Patch: &AssistantEditPatch{
			ID:     "patch-move-denied",
			Source: "tool",
			Target: "notebook",
			Risk:   "L3",
			Operations: []*AssistantPatchOperation{{
				ID:       "op-move-denied",
				Type:     AssistantPatchOperationMoveNote,
				TargetID: noteID,
				Attrs: map[string]interface{}{
					"toNotebook": boxBID,
					"toPath":     "",
				},
			}},
		},
		Operation: &AssistantPatchOperation{
			ID:       "op-move-denied",
			Type:     AssistantPatchOperationMoveNote,
			TargetID: noteID,
			Attrs: map[string]interface{}{
				"toNotebook": boxBID,
				"toPath":     "",
			},
		},
		Context:      &AssistantAINoteContext{RootID: noteID, Notebook: boxAID},
		SecurityMode: AISecurityModeFullAccess,
	})
	if nil != err {
		t.Fatalf("apply move patch with capability off: %v", err)
	}
	if !patchResult.RequiresConfirm {
		t.Fatal("move patch must require confirm while the move capability is off")
	}
	if nil == patchResult.Security || patchResult.Security.Decision != AISecurityDeny || patchResult.Security.Escalatable {
		t.Fatalf("security decision should be a non-escalatable denial, got: %+v", patchResult.Security)
	}
	if after := assistantMoveBlockTree(t, noteID); after.BoxID != boxAID {
		t.Fatalf("denied move must not change the note location, got box %q", after.BoxID)
	}
}

func TestAssistantAIMoveNoteWriteScopeGuardsSourceNotebook(t *testing.T) {
	withAssistantMoveNoteTestEnv(t)
	_, boxBID, noteID, _, _, _ := createAssistantMoveNoteFixture(t)
	setAssistantMoveCapability(t, true)

	// 默认写入范围为当前笔记本：上下文在 boxB 时，不允许移动 boxA 内的笔记
	if _, err := resolveAssistantAIMoveNotePlan(noteID, boxBID, ""); nil != err {
		t.Fatalf("plan-level resolution should stay scope agnostic: %v", err)
	}
	policy := getAssistantAIToolPolicy(nil)
	if got := normalizeAssistantAIToolScope(policy.WriteScope, AssistantAIToolScopeCurrentNotebook); got != AssistantAIToolScopeCurrentNotebook {
		t.Fatalf("default write scope = %q, want current-notebook", got)
	}
	_, _, _, err := moveAssistantAINoteToPath(policy,
		&AssistantAINoteContext{RootID: boxBRootIDForScopeTest(t, boxBID), Notebook: boxBID},
		map[string]interface{}{
			"noteID":     noteID,
			"toNotebook": boxBID,
			"toPath":     "",
		})
	if nil == err || !strings.Contains(err.Error(), "写入范围") {
		t.Fatalf("out-of-scope move must be rejected with write scope error, got: %v", err)
	}
}

// boxBRootIDForScopeTest 返回 boxB 的根文档 ID，用于构造“当前笔记在另一个笔记本”的上下文。
func boxBRootIDForScopeTest(t *testing.T, boxBID string) string {
	t.Helper()
	roots := treenode.GetBlockTreesByBoxID(boxBID)
	for _, bt := range roots {
		if "d" == bt.Type && bt.ID == bt.RootID {
			return bt.ID
		}
	}
	t.Fatalf("box %s has no root doc", boxBID)
	return ""
}
