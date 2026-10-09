package model

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/lonelyor/sourceflow/kernel/util"
)

func TestResolveAssistantAssetImageAttachments(t *testing.T) {
	withAssistantContextAssetTestEnv(t)

	assetsDir := filepath.Join(util.DataDir, "assets")
	writeAssistantContextAssetFile(t, filepath.Join(assetsDir, "shot.png"), "PNGDATA")
	writeAssistantContextAssetFile(t, filepath.Join(assetsDir, "notes.txt"), "text")
	writeAssistantContextAssetFile(t, filepath.Join(assetsDir, "arch.jpeg"), "JPEGDATA")

	paths := []string{
		"assets/shot.png",    // 命中
		"assets/ghost.png",   // 索引未命中
		"assets/notes.txt",   // 非图片
		"../../etc/evil.png", // 路径穿越（仅作 key 查找，未命中）
		filepath.Join(util.DataDir, "assets", "arch.jpeg"), // 绝对路径不是合法 key，未命中
		"",                 // 空条目
		"assets/shot.png",  // 重复条目去重
		"assets/arch.jpeg", // 命中（jpeg 的 mime 映射）
	}
	attachments, skipped := resolveAssistantAssetImageAttachments(paths, AISecurityModeDefault)
	if len(attachments) != 2 {
		t.Fatalf("attachments = %d, want 2 (%v)", len(attachments), attachments)
	}
	if attachments[0].ID != "assets/shot.png" {
		t.Errorf("first attachment id = %q, want assets/shot.png", attachments[0].ID)
	}
	if attachments[0].MimeType != "image/png" {
		t.Errorf("first attachment mime = %q, want image/png", attachments[0].MimeType)
	}
	if attachments[0].Name != "shot.png" {
		t.Errorf("first attachment name = %q, want shot.png", attachments[0].Name)
	}
	if want := base64.StdEncoding.EncodeToString([]byte("PNGDATA")); attachments[0].Data != want {
		t.Errorf("first attachment data mismatch, want base64 of PNGDATA")
	}
	if attachments[1].ID != "assets/arch.jpeg" {
		t.Errorf("second attachment id = %q, want assets/arch.jpeg", attachments[1].ID)
	}
	if attachments[1].MimeType != "image/jpeg" {
		t.Errorf("second attachment mime = %q, want image/jpeg", attachments[1].MimeType)
	}

	if len(skipped) != 4 {
		t.Fatalf("skipped = %d, want 4 (%v)", len(skipped), skipped)
	}
	skipByID := map[string]string{}
	for _, item := range skipped {
		skipByID[item.ID] = item.Reason
	}
	if reason := skipByID["assets/ghost.png"]; strings.TrimSpace(reason) == "" {
		t.Error("missing asset should be skipped with a reason")
	}
	if reason := skipByID["assets/notes.txt"]; !strings.Contains(reason, "图片") {
		t.Errorf("non-image asset reason = %q, want mention 图片", reason)
	}
	if reason := skipByID["../../etc/evil.png"]; strings.TrimSpace(reason) == "" {
		t.Error("traversal path should be skipped with a reason")
	}
}

func TestResolveAssistantAssetImageAttachmentsTooLarge(t *testing.T) {
	withAssistantContextAssetTestEnv(t)

	assetsDir := filepath.Join(util.DataDir, "assets")
	writeAssistantContextAssetFile(t, filepath.Join(assetsDir, "big.png"), string(bytes.Repeat([]byte("B"), assistantAssetVisionMaxBytes+1)))
	writeAssistantContextAssetFile(t, filepath.Join(assetsDir, "ok.png"), "ok")

	attachments, skipped := resolveAssistantAssetImageAttachments([]string{"assets/big.png", "assets/ok.png"}, AISecurityModeDefault)
	if len(attachments) != 1 || attachments[0].ID != "assets/ok.png" {
		t.Fatalf("attachments = %v, want only assets/ok.png", attachments)
	}
	if len(skipped) != 1 || skipped[0].ID != "assets/big.png" {
		t.Fatalf("skipped = %v, want assets/big.png", skipped)
	}
	if !strings.Contains(skipped[0].Reason, "上限") {
		t.Errorf("oversize reason = %q, want mention 上限", skipped[0].Reason)
	}
}

func TestResolveAssistantAssetImageAttachmentsMaxCount(t *testing.T) {
	withAssistantContextAssetTestEnv(t)

	assetsDir := filepath.Join(util.DataDir, "assets")
	for i := 0; i < 6; i++ {
		writeAssistantContextAssetFile(t, filepath.Join(assetsDir, "img"+string(rune('a'+i))+".png"), "PNG")
	}

	attachments, skipped := resolveAssistantAssetImageAttachments([]string{
		"assets/imga.png", "assets/imgb.png", "assets/imgc.png", "assets/imgd.png", "assets/imge.png", "assets/imgf.png",
	}, AISecurityModeDefault)
	if len(attachments) != assistantAssetVisionMaxCount {
		t.Fatalf("attachments = %d, want %d", len(attachments), assistantAssetVisionMaxCount)
	}
	if len(skipped) != 2 {
		t.Fatalf("skipped = %d, want 2 (%v)", len(skipped), skipped)
	}
	for _, item := range skipped {
		if !strings.Contains(item.Reason, "最多支持") {
			t.Errorf("overflow reason = %q, want mention 最多支持", item.Reason)
		}
	}

	// 空列表直接返回空
	attachments, skipped = resolveAssistantAssetImageAttachments(nil, AISecurityModeDefault)
	if len(attachments) != 0 || len(skipped) != 0 {
		t.Errorf("empty input should return empty, got %d attachments %d skipped", len(attachments), len(skipped))
	}
}

func TestAssistantAssetOCRCache(t *testing.T) {
	withAssistantContextAssetTestEnv(t)

	assetsDir := filepath.Join(util.DataDir, "assets")
	assetPath := filepath.Join(assetsDir, "shot.png")
	writeAssistantContextAssetFile(t, assetPath, "PNGDATA")
	fi, err := os.Stat(assetPath)
	if err != nil {
		t.Fatalf("stat asset: %s", err)
	}
	currentMtime := fi.ModTime().UnixMilli()

	// 无缓存返回空
	record, err := GetAssistantAssetOCR("assets/shot.png")
	if err != nil {
		t.Fatalf("get OCR before save: %s", err)
	}
	if record != nil {
		t.Fatalf("expected no cache before save, got %+v", record)
	}

	// 空参数拒绝
	if _, err = GetAssistantAssetOCR(""); err == nil {
		t.Error("empty id should be rejected")
	}
	if _, err = SaveAssistantAssetOCR("", "text", currentMtime); err == nil {
		t.Error("empty id save should be rejected")
	}

	// 索引未命中拒绝（含路径穿越形式，不失败为 mismatch）
	if _, err = SaveAssistantAssetOCR("assets/ghost.png", "text", currentMtime); err == nil {
		t.Error("missing asset save should be rejected")
	} else if _, mismatch := IsAssistantAssetOCRMtimeMismatch(err); mismatch {
		t.Errorf("missing asset should not be a mtime mismatch: %v", err)
	}
	if _, err = SaveAssistantAssetOCR("../../etc/evil.png", "text", currentMtime); err == nil {
		t.Error("traversal id save should be rejected")
	}

	// 非图片资产拒绝
	writeAssistantContextAssetFile(t, filepath.Join(assetsDir, "spec.pdf"), "PDF")
	if _, err = SaveAssistantAssetOCR("assets/spec.pdf", "text", currentMtime); err == nil {
		t.Error("non-image asset save should be rejected")
	}

	// mtime 不一致拒绝并返回最新 mtime
	if _, err = SaveAssistantAssetOCR("assets/shot.png", "stale transcript", currentMtime+12345); err == nil {
		t.Fatal("stale mtime save should be rejected")
	}
	latestMtime, mismatch := IsAssistantAssetOCRMtimeMismatch(err)
	if !mismatch {
		t.Fatalf("expected mtime mismatch error, got %v", err)
	}
	if latestMtime != currentMtime {
		t.Errorf("latest mtime = %d, want %d", latestMtime, currentMtime)
	}

	// mtime 一致保存成功并持久化
	record, err = SaveAssistantAssetOCR("assets/shot.png", "图中文字转录", currentMtime)
	if err != nil {
		t.Fatalf("save OCR: %s", err)
	}
	if record.Transcript != "图中文字转录" || record.Mtime != currentMtime {
		t.Errorf("saved record = %+v, want transcript 图中文字转录 with mtime %d", record, currentMtime)
	}
	record, err = GetAssistantAssetOCR("assets/shot.png")
	if err != nil || nil == record {
		t.Fatalf("get OCR after save: record=%+v err=%v", record, err)
	}
	if record.Transcript != "图中文字转录" || record.Mtime != currentMtime {
		t.Errorf("cached record = %+v, want transcript 图中文字转录 with mtime %d", record, currentMtime)
	}
	data, err := os.ReadFile(assistantAssetOCRPath())
	if err != nil {
		t.Fatalf("read OCR cache file: %s", err)
	}
	persisted := map[string]AssistantAssetOCRRecord{}
	if err = json.Unmarshal(data, &persisted); err != nil {
		t.Fatalf("parse OCR cache file: %s", err)
	}
	if len(persisted) != 1 {
		t.Errorf("persisted entries = %d, want 1", len(persisted))
	}

	// 资产修改后用新 mtime 覆盖保存（缓存失效重写）
	newTime := time.Now().Add(2 * time.Second)
	if err = os.Chtimes(assetPath, newTime, newTime); err != nil {
		t.Fatalf("touch asset: %s", err)
	}
	fi, err = os.Stat(assetPath)
	if err != nil {
		t.Fatalf("restat asset: %s", err)
	}
	newMtime := fi.ModTime().UnixMilli()
	record, err = SaveAssistantAssetOCR("assets/shot.png", "新转录", newMtime)
	if err != nil {
		t.Fatalf("save OCR after modify: %s", err)
	}
	if record.Mtime != newMtime || record.Transcript != "新转录" {
		t.Errorf("updated record = %+v, want mtime %d transcript 新转录", record, newMtime)
	}
	record, err = GetAssistantAssetOCR("assets/shot.png")
	if err != nil || nil == record || record.Transcript != "新转录" {
		t.Fatalf("cached record after update = %+v err=%v, want 新转录", record, err)
	}
}

// TestAssistantAIChatResolvesAssetAttachments 端到端：chat 请求的 assetAttachments 经索引解析
// 挂到当前用户消息，未通过的资产以原因记录在消息 metadata。
func TestAssistantAIChatResolvesAssetAttachments(t *testing.T) {
	withAssistantContextAssetTestEnv(t)
	withAssistantAISessionTestDB(t)

	assetsDir := filepath.Join(util.DataDir, "assets")
	writeAssistantContextAssetFile(t, filepath.Join(assetsDir, "shot.png"), "PNGDATA")
	writeAssistantContextAssetFile(t, filepath.Join(assetsDir, "notes.txt"), "text")

	profile, err := SaveAssistantAIProfile(&AssistantAIProfile{
		Name:     "Fake",
		Provider: AssistantAIProviderFake,
		BaseURL:  "sourceflow://fake",
		Model:    "sourceflow-fake-chat",
	})
	if err != nil {
		t.Fatalf("save fake profile: %s", err)
	}

	result, err := ChatAssistantAI(&AssistantAIChatRequest{
		ProfileID:        profile.ID,
		Message:          "看看这张截图",
		AssetAttachments: []string{"assets/shot.png", "assets/notes.txt", "assets/ghost.png"},
	})
	if err != nil {
		t.Fatalf("chat with asset attachments: %s", err)
	}
	if nil == result.UserMessage {
		t.Fatal("chat result missing user message")
	}

	// metadata 可能是内存类型或 JSON 回读类型，统一走一次 JSON 往返再断言
	metadataBytes, err := json.Marshal(result.UserMessage.Metadata)
	if err != nil {
		t.Fatalf("marshal user message metadata: %s", err)
	}
	metadata := map[string]interface{}{}
	if err = json.Unmarshal(metadataBytes, &metadata); err != nil {
		t.Fatalf("unmarshal user message metadata: %s", err)
	}

	assetIDs, ok := metadata["assetAttachmentIds"].([]interface{})
	if !ok || 1 != len(assetIDs) || "assets/shot.png" != assetIDs[0] {
		t.Fatalf("assetAttachmentIds = %#v, want [assets/shot.png]", metadata["assetAttachmentIds"])
	}
	rawAttachments, ok := metadata["attachments"].([]interface{})
	if !ok || 1 != len(rawAttachments) {
		t.Fatalf("attachments metadata = %#v, want 1 entry", metadata["attachments"])
	}
	attachmentRow, ok := rawAttachments[0].(map[string]interface{})
	if !ok {
		t.Fatalf("attachment row = %#v, want map", rawAttachments[0])
	}
	if want := base64.StdEncoding.EncodeToString([]byte("PNGDATA")); attachmentRow["data"] != want {
		t.Errorf("attachment data = %v, want base64 of PNGDATA", attachmentRow["data"])
	}

	skipped, ok := metadata["skippedAssetAttachments"].([]interface{})
	if !ok || 2 != len(skipped) {
		t.Fatalf("skippedAssetAttachments = %#v, want 2 entries", result.UserMessage.Metadata["skippedAssetAttachments"])
	}
	skipIDs := map[string]bool{}
	for _, raw := range skipped {
		row, rowOK := raw.(map[string]interface{})
		if !rowOK {
			t.Fatalf("skip row = %#v, want map", raw)
		}
		reason, _ := row["reason"].(string)
		if strings.TrimSpace(reason) == "" {
			t.Errorf("skip row %v missing reason", row)
		}
		skipIDs[trimToString(row["id"])] = true
	}
	if !skipIDs["assets/notes.txt"] || !skipIDs["assets/ghost.png"] {
		t.Errorf("skipped ids = %v, want assets/notes.txt and assets/ghost.png", skipIDs)
	}

	if nil == result.AssistantMessage || !strings.Contains(result.AssistantMessage.Content, "Fake Reply") {
		t.Fatalf("expected fake reply, got %#v", result.AssistantMessage)
	}
}

func trimToString(v interface{}) string {
	if nil == v {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}
