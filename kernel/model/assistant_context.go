package model

import (
	"fmt"
	"path"
	"strings"
	"unicode/utf8"

	"github.com/lonelyor/sourceflow/kernel/treenode"
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
	Items []AssistantContextPackEntry `json:"items"`
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

const contextSummaryMaxLen = 2000
const contextFolderChildSummaryMaxLen = 200
const contextPackMaxChildren = 100

func SearchAssistantContextItems(query string, limit int) []*AssistantContextSearchResult {
	var results []*AssistantContextSearchResult

	docs := SearchDocs(query, false, nil)
	for i, doc := range docs {
		if i >= limit {
			break
		}
		rootID := doc["rootID"]
		if rootID == "" {
			if doc["path"] == "/" {
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

	return results
}

func BuildAssistantContextPack(items []AssistantContextPackItem) (*AssistantContextPack, error) {
	pack := &AssistantContextPack{}

	for _, item := range items {
		switch item.Type {
		case AssistantContextNote:
			entry, err := buildNoteContextEntry(item.ID, item.Notebook, item.Path)
			if err != nil {
				logging.LogWarnf("skip context item %s: %s", item.ID, err)
				continue
			}
			pack.Items = append(pack.Items, *entry)

		case AssistantContextFolder:
			entries := buildFolderContextEntries(item.ID, item.Notebook, item.Path)
			if len(entries) > 0 {
				pack.Items = append(pack.Items, entries...)
			}

		case AssistantContextSelection:
			pack.Items = append(pack.Items, AssistantContextPackEntry{
				Type:    AssistantContextSelection,
				ID:      item.ID,
				Title:   "选区",
				Summary: truncateText(item.Content, contextSummaryMaxLen),
			})

		case AssistantContextAsset:
			pack.Items = append(pack.Items, AssistantContextPackEntry{
				Type:    AssistantContextAsset,
				ID:      item.ID,
				Title:   item.ID,
				Summary: truncateText(item.Content, contextSummaryMaxLen),
			})
		}
	}

	return pack, nil
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

func buildFolderContextEntries(rootID, notebook, docPath string) []AssistantContextPackEntry {
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
	if len(children) > contextPackMaxChildren {
		children = children[:contextPackMaxChildren]
	}

	childEntries := make([]AssistantContextPackEntry, 0, len(children))
	for _, child := range children {
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
	if utf8.RuneCountInString(cleaned) <= maxLen {
		return cleaned
	}
	runes := []rune(cleaned)
	return string(runes[:maxLen]) + "…"
}
