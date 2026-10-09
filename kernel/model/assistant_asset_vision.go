package model

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"

	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/filelock"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
)

const (
	// assistantAssetVisionMaxBytes 单张资产图片体积上限：5MB。
	assistantAssetVisionMaxBytes = 5 * 1024 * 1024
	// assistantAssetVisionMaxCount 单次请求最多携带的资产图片数。
	assistantAssetVisionMaxCount = 4
)

// AssistantAssetAttachmentSkip 描述一个未能进入对话的资产图片及原因，随消息 metadata 返回供前端展示。
type AssistantAssetAttachmentSkip struct {
	ID     string `json:"id"`
	Reason string `json:"reason"`
}

// assistantAssetImageMimeTypes 资产图片扩展名到 MIME 的固定映射，不依赖运行环境 mime 表。
var assistantAssetImageMimeTypes = map[string]string{
	".apng":  "image/apng",
	".ico":   "image/x-icon",
	".cur":   "image/x-icon",
	".jpg":   "image/jpeg",
	".jpe":   "image/jpeg",
	".jpeg":  "image/jpeg",
	".jfif":  "image/jpeg",
	".pjp":   "image/jpeg",
	".pjpeg": "image/jpeg",
	".png":   "image/png",
	".gif":   "image/gif",
	".webp":  "image/webp",
	".bmp":   "image/bmp",
	".svg":   "image/svg+xml",
	".avif":  "image/avif",
}

// resolveAssistantAssetImageAttachments 将用户请求中的资产相对引用路径解析为消息图像附件。
// 安全口径与 context pack 一致：用户输入仅作为资产枚举索引的 key 查找，绝不拼接路径。
// 任一资产校验失败只跳过并记录原因，不影响其余资产与整个请求。
func resolveAssistantAssetImageAttachments(relPaths []string, mode AISecurityMode) (ret []AssistantAIInputAttachment, skipped []AssistantAssetAttachmentSkip) {
	if 0 >= len(relPaths) {
		return nil, nil
	}
	mode = NormalizeAISecurityMode(mode, GetAISecurityConfig().DefaultMode)

	var assetIndex map[string]assistantContextAssetInfo
	seen := map[string]struct{}{}
	for _, relPath := range relPaths {
		relPath = strings.TrimSpace(relPath)
		if "" == relPath {
			continue
		}
		if _, exists := seen[relPath]; exists {
			continue
		}
		seen[relPath] = struct{}{}

		ext := strings.ToLower(path.Ext(relPath))
		if !isAssistantContextImageExt(ext) {
			skipped = append(skipped, AssistantAssetAttachmentSkip{ID: relPath, Reason: "仅支持图片资产"})
			continue
		}
		if assistantAssetVisionMaxCount <= len(ret) {
			skipped = append(skipped, AssistantAssetAttachmentSkip{ID: relPath, Reason: fmt.Sprintf("最多支持 %d 张图片资产", assistantAssetVisionMaxCount)})
			continue
		}
		if ok, reason := canReadAssistantContext(mode, "asset", []string{relPath}); !ok {
			logging.LogWarnf("skip assistant asset attachment %s: %s", relPath, reason)
			skipped = append(skipped, AssistantAssetAttachmentSkip{ID: relPath, Reason: reason})
			continue
		}
		if nil == assetIndex {
			assetIndex = collectAssistantContextAssets()
		}
		info, ok := assetIndex[relPath]
		if !ok {
			logging.LogWarnf("skip assistant asset attachment %s: asset not found", relPath)
			skipped = append(skipped, AssistantAssetAttachmentSkip{ID: relPath, Reason: "资产未找到"})
			continue
		}
		fi, err := os.Stat(info.AbsPath)
		if nil != err {
			logging.LogWarnf("skip assistant asset attachment %s: stat failed: %s", relPath, err)
			skipped = append(skipped, AssistantAssetAttachmentSkip{ID: relPath, Reason: "读取资产信息失败"})
			continue
		}
		if assistantAssetVisionMaxBytes < fi.Size() {
			logging.LogWarnf("skip assistant asset attachment %s: size %d exceeds limit", relPath, fi.Size())
			skipped = append(skipped, AssistantAssetAttachmentSkip{ID: relPath, Reason: fmt.Sprintf("图片超过 %dMB 上限", assistantAssetVisionMaxBytes/(1024*1024))})
			continue
		}
		data, err := os.ReadFile(info.AbsPath)
		if nil != err {
			logging.LogWarnf("skip assistant asset attachment %s: read failed: %s", relPath, err)
			skipped = append(skipped, AssistantAssetAttachmentSkip{ID: relPath, Reason: "读取资产内容失败"})
			continue
		}
		mimeType := assistantAssetImageMimeTypes[ext]
		if "" == mimeType {
			mimeType = "application/octet-stream"
		}
		ret = append(ret, AssistantAIInputAttachment{
			ID:       relPath,
			Name:     path.Base(relPath),
			MimeType: mimeType,
			Data:     base64.StdEncoding.EncodeToString(data),
		})
	}
	return ret, skipped
}

// assistantAssetSkipsToMetadata 将跳过原因转为可持久化的消息 metadata。
func assistantAssetSkipsToMetadata(skips []AssistantAssetAttachmentSkip) []map[string]string {
	if 0 >= len(skips) {
		return nil
	}
	ret := make([]map[string]string, 0, len(skips))
	for _, item := range skips {
		ret = append(ret, map[string]string{
			"id":     item.ID,
			"reason": item.Reason,
		})
	}
	return ret
}

// AssistantAssetOCRRecord 资产图片 OCR 转录缓存条目，mtime 为缓存对应的资产修改时间。
type AssistantAssetOCRRecord struct {
	Transcript string `json:"transcript"`
	Mtime      int64  `json:"mtime"`
}

// AssistantAssetOCRMtimeMismatchError 资产在读取后被修改，保存被拒绝时返回最新 mtime 供调用方重试。
type AssistantAssetOCRMtimeMismatchError struct {
	LatestMtime int64
}

func (e *AssistantAssetOCRMtimeMismatchError) Error() string {
	return fmt.Sprintf("asset modified since read, latest mtime: %d", e.LatestMtime)
}

var assistantAssetOCRLock sync.Mutex

func assistantAssetOCRPath() string {
	return filepath.Join(util.DataDir, "storage", "assistant_asset_ocr.json")
}

func readAssistantAssetOCRLocked() map[string]AssistantAssetOCRRecord {
	ret := map[string]AssistantAssetOCRRecord{}
	data, err := os.ReadFile(assistantAssetOCRPath())
	if nil != err {
		if !os.IsNotExist(err) {
			logging.LogWarnf("read assistant asset OCR cache failed: %s", err)
		}
		return ret
	}
	if err = json.Unmarshal(data, &ret); nil != err {
		logging.LogWarnf("parse assistant asset OCR cache failed: %s", err)
		return map[string]AssistantAssetOCRRecord{}
	}
	return ret
}

func writeAssistantAssetOCRLocked(records map[string]AssistantAssetOCRRecord) error {
	if err := os.MkdirAll(filepath.Dir(assistantAssetOCRPath()), 0755); nil != err {
		return fmt.Errorf("create assistant asset OCR cache dir: %w", err)
	}
	data, err := json.MarshalIndent(records, "", "  ")
	if nil != err {
		return fmt.Errorf("marshal assistant asset OCR cache: %w", err)
	}
	if err = filelock.WriteFile(assistantAssetOCRPath(), data); nil != err {
		return fmt.Errorf("write assistant asset OCR cache: %w", err)
	}
	return nil
}

// GetAssistantAssetOCR 读取资产图片的 OCR 转录缓存，无缓存返回 nil 记录。
func GetAssistantAssetOCR(id string) (*AssistantAssetOCRRecord, error) {
	id = strings.TrimSpace(id)
	if "" == id {
		return nil, fmt.Errorf("assistant asset OCR ID is required")
	}
	assistantAssetOCRLock.Lock()
	defer assistantAssetOCRLock.Unlock()
	record, ok := readAssistantAssetOCRLocked()[id]
	if !ok {
		return nil, nil
	}
	return &record, nil
}

// SaveAssistantAssetOCR 保存资产图片的 OCR 转录缓存。保存时重新 stat 资产校验 mtime，
// 不一致则拒绝保存并返回最新 mtime（AssistantAssetOCRMtimeMismatchError）。
func SaveAssistantAssetOCR(id, transcript string, mtime int64) (saved *AssistantAssetOCRRecord, err error) {
	id = strings.TrimSpace(id)
	if "" == id {
		return nil, fmt.Errorf("assistant asset OCR ID is required")
	}

	// 与 context pack 相同的安全口径：仅按枚举索引精确匹配资产，用户输入绝不参与路径拼接
	assetIndex := collectAssistantContextAssets()
	info, ok := assetIndex[id]
	if !ok {
		return nil, fmt.Errorf("asset not found: %s", id)
	}
	ext := strings.ToLower(path.Ext(id))
	if !isAssistantContextImageExt(ext) {
		return nil, fmt.Errorf("assistant asset OCR only supports image assets: %s", id)
	}
	fi, err := os.Stat(info.AbsPath)
	if nil != err {
		return nil, fmt.Errorf("stat asset [%s] failed: %s", id, err)
	}
	latestMtime := fi.ModTime().UnixMilli()
	// mtime 缺省（0）表示调用方刚拿到模型转录、接受当前文件状态；仅在显式提供且不一致时拒绝。
	if 0 != mtime && latestMtime != mtime {
		return nil, &AssistantAssetOCRMtimeMismatchError{LatestMtime: latestMtime}
	}

	assistantAssetOCRLock.Lock()
	defer assistantAssetOCRLock.Unlock()
	records := readAssistantAssetOCRLocked()
	record := AssistantAssetOCRRecord{Transcript: transcript, Mtime: latestMtime}
	records[id] = record
	if err = writeAssistantAssetOCRLocked(records); nil != err {
		return nil, err
	}
	return &record, nil
}

// IsAssistantAssetOCRMtimeMismatch 判断错误是否为 mtime 不匹配拒绝，并取出最新 mtime。
func IsAssistantAssetOCRMtimeMismatch(err error) (int64, bool) {
	var mismatch *AssistantAssetOCRMtimeMismatchError
	if errors.As(err, &mismatch) {
		return mismatch.LatestMtime, true
	}
	return 0, false
}
