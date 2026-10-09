package model

import (
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/lonelyor/sourceflow/kernel/treenode"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/filelock"
	"github.com/lonelyor/sourceflow/third_party/go/go-humanize"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
)

type AssistantContextItemType string

const (
	AssistantContextNote      AssistantContextItemType = "note"
	AssistantContextFolder    AssistantContextItemType = "folder"
	AssistantContextAsset     AssistantContextItemType = "asset"
	AssistantContextSelection AssistantContextItemType = "selection"
)

type AssistantContextSearchResult struct {
	ID       string                   `json:"id"`
	Type     AssistantContextItemType `json:"type"`
	Title    string                   `json:"title"`
	Subtitle string                   `json:"subtitle,omitempty"`
	Notebook string                   `json:"notebook,omitempty"`
	Path     string                   `json:"path,omitempty"`
	Icon     string                   `json:"icon,omitempty"`
	HPath    string                   `json:"hPath,omitempty"`
}

type AssistantContextPackItem struct {
	Type     AssistantContextItemType `json:"type"`
	ID       string                   `json:"id"`
	Notebook string                   `json:"notebook,omitempty"`
	Path     string                   `json:"path,omitempty"`
	Content  string                   `json:"content,omitempty"`
}

type AssistantContextPack struct {
	Items     []AssistantContextPackEntry       `json:"items"`
	Dropped   []AssistantContextPackDroppedItem `json:"dropped,omitempty"`
	Truncated bool                              `json:"truncated,omitempty"`
	MaxChars  int                               `json:"maxChars,omitempty"`
}

type AssistantContextPackEntry struct {
	Type     AssistantContextItemType    `json:"type"`
	ID       string                      `json:"id"`
	Title    string                      `json:"title"`
	Notebook string                      `json:"notebook,omitempty"`
	Path     string                      `json:"path,omitempty"`
	HPath    string                      `json:"hPath,omitempty"`
	Summary  string                      `json:"summary,omitempty"`
	Children []AssistantContextPackEntry `json:"children,omitempty"`
}

type AssistantContextPackDroppedItem struct {
	Type   AssistantContextItemType `json:"type"`
	ID     string                   `json:"id,omitempty"`
	Title  string                   `json:"title,omitempty"`
	Reason string                   `json:"reason"`
}

const contextSummaryMaxLen = 2000
const contextFolderChildSummaryMaxLen = 200
const contextPackMaxChildren = 100
const contextPackMaxSummaryChars = 60000

func SearchAssistantContextItems(query string, limit int, mode AISecurityMode) []*AssistantContextSearchResult {
	var results []*AssistantContextSearchResult
	query = strings.TrimSpace(query)
	if "" == query || limit <= 0 {
		return results
	}
	mode = NormalizeAISecurityMode(mode, GetAISecurityConfig().DefaultMode)

	docs := SearchDocs(query, false, nil)
	for _, doc := range docs {
		if len(results) >= limit {
			break
		}
		rootID := doc["rootID"]
		if rootID == "" {
			if doc["path"] == "/" {
				if ok, reason := canReadAssistantContext(mode, "notebook", []string{doc["box"]}); !ok {
					logging.LogWarnf("skip assistant context notebook %s: %s", doc["box"], reason)
					continue
				}
				box := Conf.Box(doc["box"])
				boxName := ""
				if box != nil {
					boxName = box.Name
				}
				results = append(results, &AssistantContextSearchResult{
					ID:       doc["box"],
					Type:     AssistantContextFolder,
					Title:    boxName,
					Notebook: doc["box"],
					Path:     "/",
					Icon:     doc["boxIcon"],
					HPath:    boxName,
				})
			}
			continue
		}
		if ok, reason := canReadAssistantContext(mode, "note", []string{rootID}); !ok {
			logging.LogWarnf("skip assistant context item %s: %s", rootID, reason)
			continue
		}

		var bt *treenode.BlockTree
		func() {
			defer func() {
				if r := recover(); r != nil {
					bt = nil
				}
			}()
			bt = treenode.GetBlockTree(rootID)
		}()
		itemType := AssistantContextNote
		subtitle := ""
		if bt != nil {
			children := listDirectChildren(bt.BoxID, bt.Path)
			if len(children) > 0 {
				itemType = AssistantContextFolder
				subtitle = fmt.Sprintf("%d 子文档", len(children))
			}
		}

		hPath := doc["hPath"]
		title := extractTitleFromHPath(hPath)

		results = append(results, &AssistantContextSearchResult{
			ID:       rootID,
			Type:     itemType,
			Title:    title,
			Subtitle: subtitle,
			Notebook: doc["box"],
			Path:     doc["path"],
			HPath:    hPath,
		})
	}

	// 资产并入 limit 分配：默认最多占一半，避免淹没文档结果；文档不足时放宽为剩余名额
	if assetLimit := assistantAssetSearchLimit(limit, len(results)); assetLimit > 0 {
		results = append(results, searchAssistantAssetItems(query, assetLimit, mode)...)
	}

	return results
}

// assistantContextAssetDocExts 资产搜索白名单中除图片外的常见文档扩展名。
var assistantContextAssetDocExts = []string{".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".md", ".csv"}

type assistantContextAssetInfo struct {
	RelPath string // 相对引用路径，如 assets/foo.png，与笔记内引用语法一致
	AbsPath string
	HPath   string // 所属位置：全局资产为 "assets"，笔记本资产为 "<笔记本名>/assets"
}

// searchAssistantAssetItems 按文件名不区分大小写包含匹配资产；文件名前缀命中优先，其次字母序。
func searchAssistantAssetItems(query string, limit int, mode AISecurityMode) []*AssistantContextSearchResult {
	var results []*AssistantContextSearchResult
	query = strings.TrimSpace(query)
	if "" == query || limit <= 0 {
		return results
	}

	lowerQuery := strings.ToLower(query)
	type assetHit struct {
		info   assistantContextAssetInfo
		title  string
		prefix bool
	}
	var hits []assetHit
	for _, info := range collectAssistantContextAssets() {
		title := path.Base(info.RelPath)
		ext := strings.ToLower(path.Ext(title))
		if !isAssistantContextAssetExt(ext) {
			continue
		}
		lowerTitle := strings.ToLower(title)
		if !strings.Contains(lowerTitle, lowerQuery) {
			continue
		}
		hits = append(hits, assetHit{info: info, title: title, prefix: strings.HasPrefix(lowerTitle, lowerQuery)})
	}
	// 前缀命中优先，其次按文件名字母序，再以相对路径兜底保证结果稳定
	sort.SliceStable(hits, func(i, j int) bool {
		if hits[i].prefix != hits[j].prefix {
			return hits[i].prefix
		}
		if hits[i].title != hits[j].title {
			return hits[i].title < hits[j].title
		}
		return hits[i].info.RelPath < hits[j].info.RelPath
	})

	for _, hit := range hits {
		if len(results) >= limit {
			break
		}
		if ok, reason := canReadAssistantContext(mode, "asset", []string{hit.info.RelPath}); !ok {
			logging.LogWarnf("skip assistant context asset %s: %s", hit.info.RelPath, reason)
			continue
		}
		results = append(results, &AssistantContextSearchResult{
			ID:    hit.info.RelPath,
			Type:  AssistantContextAsset,
			Title: hit.title,
			HPath: hit.info.HPath,
		})
	}
	return results
}

// assistantAssetSearchLimit 计算资产搜索名额：默认最多占 limit 的一半，避免淹没文档结果；文档不足一半时放宽为剩余名额。
func assistantAssetSearchLimit(limit, docCount int) int {
	remaining := limit - docCount
	if remaining <= 0 {
		return 0
	}
	assetLimit := limit / 2
	if docCount < assetLimit {
		// 文档不足，放宽资产名额填满剩余位
		return remaining
	}
	if assetLimit > remaining {
		return remaining
	}
	return assetLimit
}

// collectAssistantContextAssets 枚举全局与已打开笔记本的资产文件，key 为相对引用路径（assets/xxx）。
// 全局资产与笔记本资产同名时以全局优先。
func collectAssistantContextAssets() map[string]assistantContextAssetInfo {
	ret := map[string]assistantContextAssetInfo{}
	add := func(absPath, hPath string) {
		p := filepath.ToSlash(absPath)
		idx := strings.Index(p, "assets/")
		if idx < 0 {
			return
		}
		relPath := p[idx:]
		if _, ok := ret[relPath]; ok {
			return
		}
		ret[relPath] = assistantContextAssetInfo{RelPath: relPath, AbsPath: absPath, HPath: hPath}
	}

	// 全局 assets
	dataAssetsAbsPath := util.GetDataAssetsAbsPath()
	filelock.Walk(dataAssetsAbsPath, func(p string, d fs.DirEntry, err error) error {
		if nil != err || dataAssetsAbsPath == p || nil == d {
			return nil
		}
		if isSkipFile(d.Name()) {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if filelock.IsHidden(p) {
			return nil
		}
		if !d.IsDir() {
			add(p, "assets")
		}
		return nil
	})

	// 已打开笔记本内的 assets 目录（含文档同级 assets）
	notebooks, err := ListNotebooks()
	if err != nil {
		return ret
	}
	for _, notebook := range notebooks {
		if notebook.Closed {
			continue
		}
		notebookAbsPath := filepath.Join(util.DataDir, notebook.ID)
		hPath := notebook.Name + "/assets"
		filelock.Walk(notebookAbsPath, func(p string, d fs.DirEntry, err error) error {
			if nil != err || notebookAbsPath == p || nil == d {
				return nil
			}
			if isSkipFile(d.Name()) {
				if d.IsDir() {
					return filepath.SkipDir
				}
				return nil
			}
			if filelock.IsHidden(p) {
				return nil
			}
			if d.IsDir() && "assets" == d.Name() {
				filelock.Walk(p, func(assetPath string, ad fs.DirEntry, aerr error) error {
					if nil != aerr || p == assetPath || nil == ad {
						return nil
					}
					if isSkipFile(ad.Name()) {
						if ad.IsDir() {
							return filepath.SkipDir
						}
						return nil
					}
					if filelock.IsHidden(assetPath) {
						return nil
					}
					if !ad.IsDir() {
						add(assetPath, hPath)
					}
					return nil
				})
				return filepath.SkipDir
			}
			return nil
		})
	}
	return ret
}

func isAssistantContextAssetExt(ext string) bool {
	if "" == ext {
		return false
	}
	for _, e := range util.SourceFlowAssetsImage {
		if e == ext {
			return true
		}
	}
	for _, e := range assistantContextAssetDocExts {
		if e == ext {
			return true
		}
	}
	return false
}

func isAssistantContextImageExt(ext string) bool {
	for _, e := range util.SourceFlowAssetsImage {
		if e == ext {
			return true
		}
	}
	return false
}

func BuildAssistantContextPack(items []AssistantContextPackItem, mode AISecurityMode) (*AssistantContextPack, error) {
	pack := &AssistantContextPack{MaxChars: contextPackMaxSummaryChars}
	mode = NormalizeAISecurityMode(mode, GetAISecurityConfig().DefaultMode)
	remainingChars := contextPackMaxSummaryChars
	var assetIndex map[string]assistantContextAssetInfo

	for _, item := range items {
		switch item.Type {
		case AssistantContextNote:
			if ok, reason := canReadAssistantContext(mode, "note", []string{item.ID}); !ok {
				logging.LogWarnf("skip context note %s: %s", item.ID, reason)
				addAssistantContextDropped(pack, item.Type, item.ID, "", reason)
				continue
			}
			entry, err := buildNoteContextEntry(item.ID, item.Notebook, item.Path)
			if err != nil {
				logging.LogWarnf("skip context item %s: %s", item.ID, err)
				addAssistantContextDropped(pack, item.Type, item.ID, "", err.Error())
				continue
			}
			appendAssistantContextPackEntry(pack, *entry, &remainingChars, item)

		case AssistantContextFolder:
			if ok, reason := canReadAssistantFolderContext(mode, item); !ok {
				logging.LogWarnf("skip context folder %s: %s", firstAssistantAINonEmpty(item.ID, item.Notebook), reason)
				addAssistantContextDropped(pack, item.Type, firstAssistantAINonEmpty(item.ID, item.Notebook), "", reason)
				continue
			}
			entries := buildFolderContextEntries(item.ID, item.Notebook, item.Path, mode, pack)
			if len(entries) > 0 {
				for _, entry := range entries {
					appendAssistantContextPackEntry(pack, entry, &remainingChars, item)
				}
			}

		case AssistantContextSelection:
			appendAssistantContextPackEntry(pack, AssistantContextPackEntry{
				Type:    AssistantContextSelection,
				ID:      item.ID,
				Title:   "选区",
				Summary: truncateText(item.Content, contextSummaryMaxLen),
			}, &remainingChars, item)

		case AssistantContextAsset:
			if ok, reason := canReadAssistantContext(mode, "asset", []string{item.ID}); !ok {
				logging.LogWarnf("skip context asset %s: %s", item.ID, reason)
				addAssistantContextDropped(pack, item.Type, item.ID, "", reason)
				continue
			}
			if nil == assetIndex {
				assetIndex = collectAssistantContextAssets()
			}
			entry, err := buildAssetContextEntry(item.ID, assetIndex)
			if err != nil {
				logging.LogWarnf("skip context asset %s: %s", item.ID, err)
				addAssistantContextDropped(pack, item.Type, item.ID, path.Base(item.ID), err.Error())
				continue
			}
			appendAssistantContextPackEntry(pack, *entry, &remainingChars, item)
		}
	}

	return pack, nil
}

func addAssistantContextDropped(pack *AssistantContextPack, itemType AssistantContextItemType, id, title, reason string) {
	if nil == pack {
		return
	}
	reason = strings.TrimSpace(reason)
	if "" == reason {
		reason = "context item was not included"
	}
	pack.Dropped = append(pack.Dropped, AssistantContextPackDroppedItem{
		Type:   itemType,
		ID:     strings.TrimSpace(id),
		Title:  strings.TrimSpace(title),
		Reason: reason,
	})
}

func appendAssistantContextPackEntry(pack *AssistantContextPack, entry AssistantContextPackEntry, remainingChars *int, source AssistantContextPackItem) {
	if nil == pack || nil == remainingChars {
		return
	}
	if *remainingChars <= 0 && assistantContextEntrySummaryChars(entry) > 0 {
		pack.Truncated = true
		addAssistantContextDropped(pack, source.Type, firstAssistantAINonEmpty(source.ID, source.Notebook), entry.Title, "context pack budget exceeded")
		return
	}
	fitted, truncated := fitAssistantContextEntryBudget(entry, remainingChars)
	if truncated {
		pack.Truncated = true
	}
	pack.Items = append(pack.Items, fitted)
}

func fitAssistantContextEntryBudget(entry AssistantContextPackEntry, remainingChars *int) (AssistantContextPackEntry, bool) {
	truncated := false
	if "" != entry.Summary {
		used := utf8.RuneCountInString(entry.Summary)
		if used > *remainingChars {
			entry.Summary = truncateText(entry.Summary, *remainingChars)
			*remainingChars = 0
			truncated = true
		} else {
			*remainingChars -= used
		}
	}
	if len(entry.Children) < 1 {
		return entry, truncated
	}
	children := make([]AssistantContextPackEntry, 0, len(entry.Children))
	for _, child := range entry.Children {
		if *remainingChars <= 0 && assistantContextEntrySummaryChars(child) > 0 {
			truncated = true
			break
		}
		fittedChild, childTruncated := fitAssistantContextEntryBudget(child, remainingChars)
		if childTruncated {
			truncated = true
		}
		children = append(children, fittedChild)
		if *remainingChars <= 0 {
			break
		}
	}
	entry.Children = children
	return entry, truncated
}

func assistantContextEntrySummaryChars(entry AssistantContextPackEntry) int {
	total := utf8.RuneCountInString(entry.Summary)
	for _, child := range entry.Children {
		total += assistantContextEntrySummaryChars(child)
	}
	return total
}

func canReadAssistantContext(mode AISecurityMode, targetType string, targetIDs []string) (bool, string) {
	result := CheckAISecurityPermissionForRequest(&AISecurityPermissionRequest{
		Mode:       mode,
		Risk:       AISecurityRiskL1,
		TargetType: targetType,
		TargetIDs:  targetIDs,
		Capability: AISecurityCapabilityRead,
	})
	if nil == result {
		return false, "无法读取安全判定结果"
	}
	return AISecurityAllow == result.Decision, result.Reason
}

func canReadAssistantFolderContext(mode AISecurityMode, item AssistantContextPackItem) (bool, string) {
	rootID := strings.TrimSpace(item.ID)
	if "" != rootID {
		return canReadAssistantContext(mode, "note", []string{rootID})
	}
	notebook := strings.TrimSpace(item.Notebook)
	if "" != notebook {
		return canReadAssistantContext(mode, "notebook", []string{notebook})
	}
	return canReadAssistantContext(mode, "folder", []string{})
}

func buildNoteContextEntry(rootID, notebook, docPath string) (*AssistantContextPackEntry, error) {
	var bt *treenode.BlockTree
	func() {
		defer func() {
			if r := recover(); r != nil {
				bt = nil
			}
		}()
		bt = treenode.GetBlockTree(rootID)
	}()
	if bt == nil {
		return nil, fmt.Errorf("block tree not found: %s", rootID)
	}

	title := extractTitleFromHPath(bt.HPath)

	md := GetBlockKramdown(rootID, "")
	summary := truncateText(md, contextSummaryMaxLen)

	return &AssistantContextPackEntry{
		Type:     AssistantContextNote,
		ID:       rootID,
		Title:    title,
		Notebook: bt.BoxID,
		Path:     bt.Path,
		HPath:    bt.HPath,
		Summary:  summary,
	}, nil
}

// buildAssetContextEntry 构建资产条目：仅读取元数据做展示，不读取文件内容（图片 OCR 属第二期）。
// 路径取自资产枚举索引而非用户输入，避免任意路径拼接。
func buildAssetContextEntry(relPath string, assetIndex map[string]assistantContextAssetInfo) (*AssistantContextPackEntry, error) {
	info, ok := assetIndex[relPath]
	if !ok {
		return nil, fmt.Errorf("asset not found: %s", relPath)
	}
	fi, err := os.Stat(info.AbsPath)
	if err != nil {
		return nil, fmt.Errorf("stat asset [%s] failed: %s", relPath, err)
	}
	ext := strings.ToLower(path.Ext(info.RelPath))
	kind := "文档"
	if isAssistantContextImageExt(ext) {
		kind = "图片"
	}
	title := path.Base(info.RelPath)
	summary := "附件：" + title + "\n" +
		"类型：" + kind + "（" + ext + "）\n" +
		"大小：" + humanize.BytesCustomCeil(uint64(fi.Size()), 2) + "\n" +
		"修改时间：" + fi.ModTime().Format("2006-01-02 15:04:05") + "\n" +
		"位置：" + info.HPath
	return &AssistantContextPackEntry{
		Type:    AssistantContextAsset,
		ID:      relPath,
		Title:   title,
		HPath:   info.HPath,
		Summary: summary,
	}, nil
}

func buildFolderContextEntries(rootID, notebook, docPath string, mode AISecurityMode, pack *AssistantContextPack) []AssistantContextPackEntry {
	rootID = strings.TrimSpace(rootID)
	notebook = strings.TrimSpace(notebook)
	docPath = strings.TrimSpace(docPath)

	var bt *treenode.BlockTree
	if "" != rootID {
		func() {
			defer func() {
				if r := recover(); r != nil {
					bt = nil
				}
			}()
			bt = treenode.GetBlockTree(rootID)
		}()
	}

	title := ""
	boxID := notebook
	pathValue := docPath
	hPath := ""
	if bt != nil {
		title = extractTitleFromHPath(bt.HPath)
		boxID = bt.BoxID
		pathValue = bt.Path
		hPath = bt.HPath
	} else {
		if "" == boxID {
			return nil
		}
		if "" == pathValue {
			pathValue = "/"
		}
		if Conf != nil {
			if box := Conf.Box(boxID); box != nil {
				title = box.Name
				hPath = box.Name
			}
		}
		if "" == title {
			title = boxID
		}
		if "" == hPath {
			hPath = boxID
		}
		if pathValue != "/" {
			title = extractTitleFromHPath(pathValue)
			hPath = path.Join(hPath, strings.TrimSuffix(strings.TrimPrefix(pathValue, "/"), ".sf"))
		}
	}

	children := listDirectChildren(boxID, pathValue)

	childEntries := make([]AssistantContextPackEntry, 0, len(children))
	for _, child := range children {
		if len(childEntries) >= contextPackMaxChildren {
			break
		}
		if ok, reason := canReadAssistantContext(mode, "note", []string{child.RootID}); !ok {
			logging.LogWarnf("skip context child %s: %s", child.RootID, reason)
			addAssistantContextDropped(pack, AssistantContextNote, child.RootID, extractTitleFromHPath(child.HPath), reason)
			continue
		}
		childTitle := extractTitleFromHPath(child.HPath)

		childSummary := ""
		childMd := GetBlockKramdown(child.RootID, "")
		if childMd != "" {
			childSummary = truncateText(childMd, contextFolderChildSummaryMaxLen)
		}

		childEntries = append(childEntries, AssistantContextPackEntry{
			Type:     AssistantContextNote,
			ID:       child.RootID,
			Title:    childTitle,
			Notebook: boxID,
			Path:     child.Path,
			HPath:    child.HPath,
			Summary:  childSummary,
		})
	}

	return []AssistantContextPackEntry{{
		Type:     AssistantContextFolder,
		ID:       rootID,
		Title:    title,
		Notebook: boxID,
		Path:     pathValue,
		HPath:    hPath,
		Children: childEntries,
	}}
}

func listDirectChildren(boxID, parentPath string) []*treenode.BlockTree {
	parentPath = strings.TrimSuffix(parentPath, ".sf")
	childPathPrefix := "/"
	if parentPath != "" && parentPath != "/" {
		childPathPrefix = parentPath + "/"
	}
	allChildren := treenode.GetBlockTreesByPathPrefix(childPathPrefix)
	var filtered []*treenode.BlockTree
	for _, bt := range allChildren {
		if bt.BoxID == boxID {
			filtered = append(filtered, bt)
		}
	}
	sort.SliceStable(filtered, func(i, j int) bool {
		left := strings.TrimSpace(filtered[i].Path)
		right := strings.TrimSpace(filtered[j].Path)
		if left != right {
			return left < right
		}
		left = strings.TrimSpace(filtered[i].HPath)
		right = strings.TrimSpace(filtered[j].HPath)
		if left != right {
			return left < right
		}
		return strings.TrimSpace(filtered[i].RootID) < strings.TrimSpace(filtered[j].RootID)
	})
	return filtered
}

func extractTitleFromHPath(hPath string) string {
	if hPath == "" {
		return ""
	}
	hPath = strings.TrimRight(hPath, "/")
	return path.Base(hPath)
}

func truncateText(text string, maxLen int) string {
	if text == "" {
		return ""
	}
	cleaned := strings.TrimSpace(text)
	if maxLen <= 0 {
		return ""
	}
	if utf8.RuneCountInString(cleaned) <= maxLen {
		return cleaned
	}
	runes := []rune(cleaned)
	return string(runes[:maxLen]) + "…"
}
