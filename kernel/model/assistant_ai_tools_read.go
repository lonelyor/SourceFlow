package model

import (
	"encoding/json"
	"fmt"
	"strings"

	sql "github.com/lonelyor/sourceflow/kernel/sql"
	"github.com/lonelyor/sourceflow/kernel/treenode"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
	"github.com/lonelyor/sourceflow/third_party/go/lute/parse"
)

func getAssistantAICurrentNote(context *AssistantAINoteContext) (ret map[string]interface{}, err error) {
	rootID := contextID(context)
	if "" == rootID {
		return nil, fmt.Errorf("当前没有可用的笔记上下文")
	}
	pathValue, boxID, err := GetPathByID(rootID)
	if nil != err {
		return nil, err
	}
	info := GetDocInfo(rootID)
	if nil == info {
		return nil, fmt.Errorf("读取当前笔记信息失败")
	}
	markdown := strings.TrimSpace(GetBlockKramdown(rootID, ""))
	ret = map[string]interface{}{
		"rootID":           rootID,
		"notebook":         boxID,
		"path":             pathValue,
		"title":            info.Name,
		"attrs":            info.IAL,
		"markdown":         truncateAssistantAIToolText(markdown, 16000),
		"currentBlockID":   contextCurrentBlockID(context),
		"currentBlockType": strings.TrimSpace(context.CurrentBlockType),
		"selectedText":     truncateAssistantAIToolText(contextSelectedText(context), 4000),
	}
	return ret, nil
}

func getAssistantAICurrentBlock(context *AssistantAINoteContext, scope string) (ret map[string]interface{}, err error) {
	blockID := strings.TrimSpace(contextCurrentBlockID(context))
	if "" == blockID {
		return nil, fmt.Errorf("当前没有可用的块上下文")
	}
	block, resolvedScope, readErr := readAssistantAIBlock(blockID, context, scope)
	if nil != readErr {
		return nil, readErr
	}
	block["scope"] = resolvedScope
	block["targetID"] = blockID
	if selectedText := strings.TrimSpace(contextSelectedText(context)); "" != selectedText {
		block["selectedText"] = truncateAssistantAIToolText(selectedText, 4000)
	}
	return block, nil
}

func readAssistantAINoteBacklinks(args map[string]interface{}, context *AssistantAINoteContext, scope string) (ret map[string]interface{}, resolvedScope string, err error) {
	rootID, notebook, docPath, resolvedScope, err := resolveAssistantAINoteTarget(args, context, scope)
	if nil != err {
		return nil, resolvedScope, err
	}
	title := ""
	if info := GetDocInfo(rootID); nil != info {
		title = strings.TrimSpace(info.Name)
	}
	keyword := strings.TrimSpace(getAssistantAIStringValue(args, "keyword", ""))
	mentionKeyword := strings.TrimSpace(getAssistantAIStringValue(args, "mentionKeyword", ""))
	limit := clampAssistantAIToolLimit(getAssistantAIIntValue(args, "limit", 8), 1, 32)
	_, backlinks, backmentions, linkRefsCount, mentionsCount := GetBacklink2(rootID, keyword, mentionKeyword, util.SortModeUpdatedDESC, util.SortModeUpdatedDESC, Conf.Editor.BacklinkContainChildren)
	ret = map[string]interface{}{
		"rootID":         rootID,
		"notebook":       notebook,
		"path":           docPath,
		"title":          title,
		"keyword":        keyword,
		"mentionKeyword": mentionKeyword,
		"linkRefsCount":  linkRefsCount,
		"mentionsCount":  mentionsCount,
		"backlinks":      flattenAssistantAIPaths(backlinks, limit),
		"backmentions":   flattenAssistantAIPaths(backmentions, limit),
	}
	return ret, resolvedScope, nil
}

func readAssistantAINoteOutline(args map[string]interface{}, context *AssistantAINoteContext, scope string) (ret map[string]interface{}, resolvedScope string, err error) {
	rootID, notebook, docPath, resolvedScope, err := resolveAssistantAINoteTarget(args, context, scope)
	if nil != err {
		return nil, resolvedScope, err
	}
	title := ""
	if info := GetDocInfo(rootID); nil != info {
		title = strings.TrimSpace(info.Name)
	}
	limit := clampAssistantAIToolLimit(getAssistantAIIntValue(args, "limit", 24), 1, 128)
	outline, outlineErr := Outline(rootID, false)
	if nil != outlineErr {
		return nil, resolvedScope, outlineErr
	}
	ret = map[string]interface{}{
		"rootID":   rootID,
		"notebook": notebook,
		"path":     docPath,
		"title":    title,
		"count":    len(flattenAssistantAIPaths(outline, 0)),
		"headings": flattenAssistantAIPaths(outline, limit),
	}
	return ret, resolvedScope, nil
}

func resolveAssistantAINoteTarget(args map[string]interface{}, context *AssistantAINoteContext, scope string) (rootID, notebook, docPath, resolvedScope string, err error) {
	resolvedScope = normalizeAssistantAIToolScope(scope, AssistantAIToolScopeWorkspace)
	rootID = strings.TrimSpace(getAssistantAIStringValue(args, "rootID", ""))
	notebook = strings.TrimSpace(getAssistantAIStringValue(args, "notebook", ""))
	docPath = strings.TrimSpace(getAssistantAIStringValue(args, "path", ""))
	if "" != rootID {
		docPath, notebook, err = GetPathByID(rootID)
		if nil != err {
			return "", "", "", resolvedScope, err
		}
	} else if "" != notebook && "" != docPath {
		bt := treenode.GetBlockTreeRootByPath(notebook, docPath)
		if nil == bt || "" == strings.TrimSpace(bt.RootID) {
			return "", "", "", resolvedScope, fmt.Errorf("未找到指定笔记")
		}
		rootID = strings.TrimSpace(bt.RootID)
	} else {
		rootID = contextID(context)
		notebook = contextNotebook(context)
		docPath = contextPath(context)
	}
	if "" == rootID || "" == notebook || "" == docPath {
		return "", "", "", resolvedScope, fmt.Errorf("当前没有可用的笔记上下文")
	}
	if !assistantAINoteMatchesScope(resolvedScope, context, notebook, docPath, rootID) {
		return "", "", "", resolvedScope, fmt.Errorf("当前读取范围不允许读取该笔记")
	}
	return rootID, notebook, docPath, resolvedScope, nil
}

func flattenAssistantAIPaths(paths []*Path, limit int) (ret []map[string]interface{}) {
	ret = []map[string]interface{}{}
	var walk func(items []*Path)
	walk = func(items []*Path) {
		for _, item := range items {
			if nil == item {
				continue
			}
			if 0 < limit && limit <= len(ret) {
				return
			}
			ret = append(ret, map[string]interface{}{
				"id":       strings.TrimSpace(item.ID),
				"box":      strings.TrimSpace(item.Box),
				"name":     truncateAssistantAIToolText(strings.TrimSpace(item.Name), 240),
				"hPath":    strings.TrimSpace(item.HPath),
				"nodeType": strings.TrimSpace(item.NodeType),
				"subType":  strings.TrimSpace(item.SubType),
				"depth":    item.Depth,
				"count":    item.Count,
				"folded":   item.Folded,
				"updated":  strings.TrimSpace(item.Updated),
				"created":  strings.TrimSpace(item.Created),
			})
			if 0 < len(item.Children) {
				walk(item.Children)
			}
			if 0 < limit && limit <= len(ret) {
				return
			}
		}
	}
	walk(paths)
	return ret
}

func searchAssistantAINotes(query string, limit int, context *AssistantAINoteContext, scope string) (ret []map[string]interface{}, resolvedScope string, err error) {
	ret = []map[string]interface{}{}
	resolvedScope = normalizeAssistantAIToolScope(scope, AssistantAIToolScopeWorkspace)
	rows := SearchDocs(query, false, nil)
	for _, row := range rows {
		if limit <= len(ret) {
			break
		}
		boxID := strings.TrimSpace(row["box"])
		docPath := strings.TrimSpace(row["path"])
		bt := treenode.GetBlockTreeRootByPath(boxID, docPath)
		rootID := ""
		if nil != bt {
			rootID = strings.TrimSpace(bt.RootID)
		}
		if !assistantAINoteMatchesScope(resolvedScope, context, boxID, docPath, rootID) {
			continue
		}
		ret = append(ret, map[string]interface{}{
			"rootID":   rootID,
			"notebook": boxID,
			"path":     docPath,
			"title":    strings.TrimSpace(row["hPath"]),
			"boxIcon":  strings.TrimSpace(row["boxIcon"]),
		})
	}
	return ret, resolvedScope, nil
}

func readAssistantAINote(notebook, docPath string, context *AssistantAINoteContext, scope string) (ret map[string]interface{}, resolvedScope string, err error) {
	resolvedScope = normalizeAssistantAIToolScope(scope, AssistantAIToolScopeWorkspace)
	notebook = strings.TrimSpace(notebook)
	docPath = strings.TrimSpace(docPath)
	if "" == notebook || "" == docPath {
		return nil, resolvedScope, fmt.Errorf("读取指定笔记需要 notebook 和 path")
	}
	bt := treenode.GetBlockTreeRootByPath(notebook, docPath)
	if nil == bt || "" == strings.TrimSpace(bt.RootID) {
		return nil, resolvedScope, fmt.Errorf("未找到指定笔记")
	}
	rootID := strings.TrimSpace(bt.RootID)
	if !assistantAINoteMatchesScope(resolvedScope, context, notebook, docPath, rootID) {
		return nil, resolvedScope, fmt.Errorf("当前读取范围不允许读取该笔记")
	}
	info := GetDocInfo(rootID)
	if nil == info {
		return nil, resolvedScope, fmt.Errorf("读取指定笔记信息失败")
	}
	markdown := strings.TrimSpace(GetBlockKramdown(rootID, ""))
	ret = map[string]interface{}{
		"rootID":   rootID,
		"notebook": notebook,
		"path":     docPath,
		"title":    info.Name,
		"attrs":    info.IAL,
		"markdown": truncateAssistantAIToolText(markdown, 16000),
	}
	return ret, resolvedScope, nil
}

func searchAssistantAIBlocks(query string, limit int, context *AssistantAINoteContext, scope string) (ret []map[string]interface{}, resolvedScope string, err error) {
	ret = []map[string]interface{}{}
	resolvedScope = normalizeAssistantAIToolScope(scope, AssistantAIToolScopeWorkspace)
	var boxes []string
	var paths []string
	switch resolvedScope {
	case AssistantAIToolScopeCurrentNote:
		if nil == context || "" == strings.TrimSpace(context.Path) {
			return nil, resolvedScope, fmt.Errorf("当前没有可用的笔记上下文")
		}
		paths = []string{strings.TrimSpace(context.Path)}
	case AssistantAIToolScopeCurrentNotebook:
		if nil == context || "" == strings.TrimSpace(context.Notebook) {
			return nil, resolvedScope, fmt.Errorf("当前没有可用的笔记本上下文")
		}
		boxes = []string{strings.TrimSpace(context.Notebook)}
	}
	blocks, _, _, _, _ := FullTextSearchBlock(query, boxes, paths, nil, 0, 7, 0, 1, limit)
	for _, item := range blocks {
		if nil == item {
			continue
		}
		ret = append(ret, map[string]interface{}{
			"id":       item.ID,
			"rootID":   item.RootID,
			"type":     item.Type,
			"notebook": item.Box,
			"path":     item.Path,
			"content":  truncateAssistantAIToolText(strings.TrimSpace(item.Content), 240),
		})
	}
	return ret, resolvedScope, nil
}

func readAssistantAIBlock(blockID string, context *AssistantAINoteContext, scope string) (ret map[string]interface{}, resolvedScope string, err error) {
	resolvedScope = normalizeAssistantAIToolScope(scope, AssistantAIToolScopeWorkspace)
	blockID = strings.TrimSpace(blockID)
	if "" == blockID {
		return nil, resolvedScope, fmt.Errorf("块 ID 不能为空")
	}
	block := sql.GetBlock(blockID)
	if nil == block {
		return nil, resolvedScope, fmt.Errorf("未找到指定块")
	}
	if !assistantAINoteMatchesScope(resolvedScope, context, strings.TrimSpace(block.Box), strings.TrimSpace(block.Path), strings.TrimSpace(block.RootID)) {
		return nil, resolvedScope, fmt.Errorf("当前读取范围不允许读取该块")
	}
	markdown := strings.TrimSpace(GetBlockKramdown(blockID, ""))
	attrs := map[string]string{}
	if tree, treeErr := LoadTreeByBlockID(blockID); nil == treeErr && nil != tree {
		if node := treenode.GetNodeInTree(tree, blockID); nil != node {
			attrs = parse.IAL2Map(node.KramdownIAL)
		}
	}
	ret = map[string]interface{}{
		"id":        block.ID,
		"rootID":    block.RootID,
		"parentID":  block.ParentID,
		"type":      block.Type,
		"subType":   block.SubType,
		"notebook":  block.Box,
		"path":      block.Path,
		"hPath":     block.HPath,
		"title":     firstAssistantAINonEmpty(strings.TrimSpace(block.Name), strings.TrimSpace(block.HPath)),
		"content":   truncateAssistantAIToolText(strings.TrimSpace(block.Content), 1200),
		"markdown":  truncateAssistantAIToolText(markdown, 8000),
		"attrs":     attrs,
		"created":   block.Created,
		"updated":   block.Updated,
		"docTitle":  strings.TrimSpace(block.HPath),
		"docPath":   strings.TrimSpace(block.Path),
		"docRootID": strings.TrimSpace(block.RootID),
	}
	return ret, resolvedScope, nil
}

func getAssistantAICurrentBlockContext(context *AssistantAINoteContext, scope string) (ret map[string]interface{}, err error) {
	blockID := contextCurrentBlockID(context)
	if "" == blockID {
		return nil, fmt.Errorf("当前没有可用的块上下文")
	}
	resolvedScope := normalizeAssistantAIToolScope(scope, AssistantAIToolScopeCurrentNote)
	block, _, readErr := readAssistantAIBlock(blockID, context, resolvedScope)
	if nil != readErr {
		return nil, readErr
	}
	ret = cloneAssistantAIMap(block)
	ret["scope"] = resolvedScope
	ret["refText"] = truncateAssistantAIToolText(GetBlockRefText(blockID), 800)
	if markdown := strings.TrimSpace(context.CurrentBlockMarkdown); "" != markdown {
		ret["currentBlockMarkdown"] = truncateAssistantAIToolText(markdown, 4000)
	}
	if selectedText := contextSelectedText(context); "" != selectedText {
		ret["selectedText"] = truncateAssistantAIToolText(selectedText, 4000)
	}

	parentID, previousID, nextID, idsErr := GetBlockRelevantIDs(blockID)
	if nil == idsErr {
		if preview := assistantAICompactBlockPreviewByID(parentID, context, resolvedScope); nil != preview {
			ret["parent"] = preview
		}
		if preview := assistantAICompactBlockPreviewByID(previousID, context, resolvedScope); nil != preview {
			ret["previous"] = preview
		}
		if preview := assistantAICompactBlockPreviewByID(nextID, context, resolvedScope); nil != preview {
			ret["next"] = preview
		}
	}
	if unfoldedParentID := strings.TrimSpace(GetUnfoldedParentID(blockID)); "" != unfoldedParentID && unfoldedParentID != blockID {
		ret["unfoldedParentID"] = unfoldedParentID
		if preview := assistantAICompactBlockPreviewByID(unfoldedParentID, context, resolvedScope); nil != preview {
			ret["unfoldedParent"] = preview
		}
	}

	if tree, treeErr := LoadTreeByBlockID(blockID); nil == treeErr && nil != tree {
		if node := treenode.GetNodeInTree(tree, blockID); nil != node {
			children := []map[string]interface{}{}
			childCount := 0
			for child := node.FirstChild; nil != child; child = child.Next {
				if !child.IsBlock() || ast.NodeKramdownBlockIAL == child.Type {
					continue
				}
				childCount++
				if 8 <= len(children) {
					continue
				}
				children = append(children, assistantAICompactBlockPreviewNode(child))
			}
			ret["childCount"] = childCount
			ret["children"] = children
		}
	}
	return ret, nil
}

func readAssistantAIBlockReferences(args map[string]interface{}, context *AssistantAINoteContext, scope string) (ret map[string]interface{}, resolvedScope string, err error) {
	blockID := strings.TrimSpace(firstAssistantAINonEmpty(
		getAssistantAIStringValue(args, "id", ""),
		contextCurrentBlockID(context),
	))
	if "" == blockID {
		return nil, normalizeAssistantAIToolScope(scope, AssistantAIToolScopeWorkspace), fmt.Errorf("当前没有可用的块上下文")
	}
	block, resolvedScope, readErr := readAssistantAIBlock(blockID, context, scope)
	if nil != readErr {
		return nil, resolvedScope, readErr
	}
	ret = cloneAssistantAIMap(block)
	ret["refText"] = truncateAssistantAIToolText(GetBlockRefText(blockID), 800)

	refDefs, originalRefBlockIDs := GetBlockRefs(blockID)
	items := make([]map[string]interface{}, 0, len(refDefs))
	for _, refDef := range refDefs {
		if nil == refDef {
			continue
		}
		refID := strings.TrimSpace(refDef.RefID)
		if "" == refID {
			continue
		}
		preview := assistantAICompactBlockPreviewByID(refID, context, resolvedScope)
		if nil == preview {
			continue
		}
		preview["defIDs"] = append([]string{}, refDef.DefIDs...)
		if originalRefID := strings.TrimSpace(originalRefBlockIDs[refID]); "" != originalRefID {
			preview["originalRefBlockID"] = originalRefID
		}
		items = append(items, preview)
	}
	ret["referenceCount"] = len(items)
	ret["references"] = items
	return ret, resolvedScope, nil
}

func listAssistantAINoteHistory(args map[string]interface{}, context *AssistantAINoteContext, scope string) (ret map[string]interface{}, resolvedScope string, err error) {
	rootID, notebook, docPath, resolvedScope, err := resolveAssistantAINoteTarget(args, context, scope)
	if nil != err {
		return nil, resolvedScope, err
	}
	title := ""
	if info := GetDocInfo(rootID); nil != info {
		title = strings.TrimSpace(info.Name)
	}
	groupLimit := clampAssistantAIToolLimit(getAssistantAIIntValue(args, "limit", 6), 1, 12)
	itemLimit := clampAssistantAIToolLimit(getAssistantAIIntValue(args, "itemLimit", 12), 1, 32)
	op := firstAssistantAINonEmpty(strings.TrimSpace(getAssistantAIStringValue(args, "op", "")), "all")
	createdGroups, pageCount, totalCount := FullTextSearchHistory(rootID, notebook, op, HistoryTypeDocID, 1)
	if len(createdGroups) > groupLimit {
		createdGroups = createdGroups[:groupLimit]
	}
	groups := make([]map[string]interface{}, 0, len(createdGroups))
	for _, created := range createdGroups {
		items := FullTextSearchHistoryItems(created, rootID, notebook, op, HistoryTypeDocID)
		rows := make([]map[string]interface{}, 0, len(items))
		for i, item := range items {
			if nil == item || itemLimit <= i {
				break
			}
			rows = append(rows, map[string]interface{}{
				"title":    strings.TrimSpace(item.Title),
				"path":     strings.TrimSpace(item.Path),
				"op":       strings.TrimSpace(item.Op),
				"notebook": strings.TrimSpace(item.Notebook),
			})
		}
		groups = append(groups, map[string]interface{}{
			"created":   created,
			"itemCount": len(items),
			"items":     rows,
		})
	}
	ret = map[string]interface{}{
		"rootID":     rootID,
		"notebook":   notebook,
		"path":       docPath,
		"title":      title,
		"groupCount": len(groups),
		"pageCount":  pageCount,
		"totalCount": totalCount,
		"groups":     groups,
	}
	return ret, resolvedScope, nil
}

func listAssistantAIRestorePoints(args map[string]interface{}) (ret map[string]interface{}, err error) {
	limit := clampAssistantAIToolLimit(getAssistantAIIntValue(args, "limit", 8), 1, 16)
	ret = map[string]interface{}{
		"limit": limit,
	}
	errs := map[string]interface{}{}

	if stat, statErr := GetSnapshotProtectionStat(); nil == statErr {
		ret["stat"] = stat
	} else {
		errs["stat"] = statErr.Error()
	}

	if snapshots, _, _, snapshotErr := GetRepoSnapshots(1); nil == snapshotErr {
		ret["localSnapshots"] = assistantAIJSONSliceLimit(snapshots, limit)
	} else {
		errs["localSnapshots"] = snapshotErr.Error()
	}
	if tags, tagErr := GetTagSnapshots(); nil == tagErr {
		ret["localTags"] = assistantAIJSONSliceLimit(tags, limit)
	} else {
		errs["localTags"] = tagErr.Error()
	}
	if snapshots, _, _, snapshotErr := GetCloudRepoSnapshots(1); nil == snapshotErr {
		ret["remoteSnapshots"] = assistantAIJSONSliceLimit(snapshots, limit)
	} else {
		errs["remoteSnapshots"] = snapshotErr.Error()
	}
	if tags, tagErr := GetCloudRepoTagSnapshots(); nil == tagErr {
		ret["remoteTags"] = assistantAIJSONSliceLimit(tags, limit)
	} else {
		errs["remoteTags"] = tagErr.Error()
	}

	if 0 < len(errs) {
		ret["errors"] = errs
	}
	if 1 == len(ret) && 0 < len(errs) {
		return nil, fmt.Errorf("读取恢复点失败")
	}
	return ret, nil
}

func searchAssistantAIAssets(query string, limit int) (ret []map[string]interface{}, err error) {
	ret = []map[string]interface{}{}
	types := map[string]bool{}
	for _, ext := range allAssistantAIAssetTypes() {
		types[ext] = true
	}
	results, _, _ := FullTextSearchAssetContent(query, types, 0, 0, 1, limit)
	for _, item := range results {
		if nil == item {
			continue
		}
		ret = append(ret, map[string]interface{}{
			"id":      item.ID,
			"name":    item.Name,
			"ext":     item.Ext,
			"path":    item.Path,
			"updated": item.Updated,
			"size":    item.Size,
			"content": truncateAssistantAIToolText(strings.TrimSpace(item.Content), 320),
		})
	}
	return ret, nil
}

func listAssistantAINoteAssets(args map[string]interface{}, context *AssistantAINoteContext, scope string) (ret map[string]interface{}, resolvedScope string, err error) {
	rootID, notebook, docPath, resolvedScope, err := resolveAssistantAINoteTarget(args, context, scope)
	if nil != err {
		return nil, resolvedScope, err
	}
	title := ""
	if info := GetDocInfo(rootID); nil != info {
		title = strings.TrimSpace(info.Name)
	}
	paths, listErr := DocAssets(rootID)
	if nil != listErr {
		return nil, resolvedScope, listErr
	}
	items := make([]map[string]interface{}, 0, len(paths))
	seen := map[string]bool{}
	for _, assetPath := range paths {
		normalized := normalizeAssistantAINoteAssetPath(assetPath)
		if "" == normalized || seen[normalized] {
			continue
		}
		seen[normalized] = true
		if item := assistantAINoteAssetMeta(normalized); nil != item {
			items = append(items, item)
		}
	}
	ret = map[string]interface{}{
		"rootID":   rootID,
		"notebook": notebook,
		"path":     docPath,
		"title":    title,
		"count":    len(items),
		"items":    items,
	}
	return ret, resolvedScope, nil
}

func readAssistantAINoteAssetFile(args map[string]interface{}, context *AssistantAINoteContext, scope string) (ret map[string]interface{}, resolvedScope string, err error) {
	rootID, notebook, docPath, resolvedScope, err := resolveAssistantAINoteTarget(args, context, scope)
	if nil != err {
		return nil, resolvedScope, err
	}
	assetPath := strings.TrimSpace(firstAssistantAINonEmpty(
		getAssistantAIStringValue(args, "path", ""),
		getAssistantAIStringValue(args, "assetPath", ""),
	))
	if "" == assetPath {
		return nil, resolvedScope, fmt.Errorf("读取附件需要 path")
	}
	allowedPath, resolveErr := resolveAssistantAINoteAssetPath(rootID, assetPath)
	if nil != resolveErr {
		return nil, resolvedScope, resolveErr
	}
	meta := assistantAINoteAssetMeta(allowedPath)
	if nil == meta {
		return nil, resolvedScope, fmt.Errorf("读取附件信息失败")
	}
	ret = map[string]interface{}{
		"rootID":   rootID,
		"notebook": notebook,
		"path":     getAssistantAIStringValue(meta, "path", ""),
		"docPath":  docPath,
		"asset":    meta,
		"name":     getAssistantAIStringValue(meta, "name", ""),
		"kind":     getAssistantAIStringValue(meta, "kind", ""),
		"exists":   meta["exists"],
		"size":     meta["size"],
	}
	absPath := getAssistantAIStringValue(meta, "absPath", "")
	if "" == absPath {
		return ret, resolvedScope, nil
	}
	if assistantAITextAssetKind(getAssistantAIStringValue(meta, "kind", "")) {
		content, truncated, readErr := readAssistantAITextAsset(absPath)
		if nil != readErr {
			ret["readable"] = false
			ret["readError"] = readErr.Error()
			return ret, resolvedScope, nil
		}
		ret["readable"] = true
		ret["content"] = content
		ret["truncated"] = truncated
		return ret, resolvedScope, nil
	}
	ret["readable"] = false
	ret["content"] = ""
	ret["reason"] = "当前 AI 会话通道为文本模式，图片和二进制附件默认返回元信息而不做 OCR"
	return ret, resolvedScope, nil
}

func readAssistantAIAssetContent(assetID string) (ret map[string]interface{}, err error) {
	stmt := "SELECT id, name, ext, path, size, updated, content FROM asset_contents_fts_case_insensitive WHERE id = ? LIMIT 1"
	rows, queryErr := sql.QueryAssetContentRows(stmt, strings.TrimSpace(assetID))
	if nil != queryErr {
		return nil, queryErr
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, fmt.Errorf("未找到附件内容索引")
	}
	var item sql.AssetContent
	if scanErr := rows.Scan(&item.ID, &item.Name, &item.Ext, &item.Path, &item.Size, &item.Updated, &item.Content); nil != scanErr {
		return nil, scanErr
	}
	ret = map[string]interface{}{
		"id":      item.ID,
		"name":    item.Name,
		"ext":     item.Ext,
		"path":    item.Path,
		"updated": item.Updated,
		"size":    item.Size,
		"content": truncateAssistantAIToolText(strings.TrimSpace(item.Content), 16000),
	}
	return ret, nil
}

func assistantAICompactBlockPreviewByID(blockID string, context *AssistantAINoteContext, scope string) map[string]interface{} {
	blockID = strings.TrimSpace(blockID)
	if "" == blockID {
		return nil
	}
	block, _, err := readAssistantAIBlock(blockID, context, scope)
	if nil != err {
		return nil
	}
	return assistantAICompactBlockPreview(block)
}

func assistantAICompactBlockPreviewNode(node *ast.Node) map[string]interface{} {
	if nil == node || !node.IsBlock() {
		return nil
	}
	ret := map[string]interface{}{
		"id":      strings.TrimSpace(node.ID),
		"type":    strings.TrimSpace(node.Type.String()),
		"content": truncateAssistantAIToolText(getNodeRefText(node), 280),
	}
	if sqlBlock := sql.GetBlock(strings.TrimSpace(node.ID)); nil != sqlBlock {
		ret["rootID"] = strings.TrimSpace(sqlBlock.RootID)
		ret["notebook"] = strings.TrimSpace(sqlBlock.Box)
		ret["path"] = strings.TrimSpace(sqlBlock.Path)
		ret["hPath"] = strings.TrimSpace(sqlBlock.HPath)
		ret["title"] = firstAssistantAINonEmpty(strings.TrimSpace(sqlBlock.Name), strings.TrimSpace(sqlBlock.HPath))
	}
	return ret
}

func assistantAICompactBlockPreview(block map[string]interface{}) map[string]interface{} {
	if nil == block {
		return nil
	}
	return map[string]interface{}{
		"id":       getAssistantAIStringValue(block, "id", ""),
		"rootID":   getAssistantAIStringValue(block, "rootID", ""),
		"type":     getAssistantAIStringValue(block, "type", ""),
		"notebook": getAssistantAIStringValue(block, "notebook", ""),
		"path":     getAssistantAIStringValue(block, "path", ""),
		"hPath":    getAssistantAIStringValue(block, "hPath", ""),
		"title":    getAssistantAIStringValue(block, "title", ""),
		"content":  truncateAssistantAIToolText(getAssistantAIStringValue(block, "content", ""), 280),
		"markdown": truncateAssistantAIToolText(getAssistantAIStringValue(block, "markdown", ""), 800),
	}
}

func assistantAIJSONSliceLimit(value interface{}, limit int) []map[string]interface{} {
	buf, err := json.Marshal(value)
	if nil != err {
		return []map[string]interface{}{}
	}
	rows := []map[string]interface{}{}
	if err = json.Unmarshal(buf, &rows); nil != err {
		return []map[string]interface{}{}
	}
	if len(rows) > limit {
		rows = rows[:limit]
	}
	for _, row := range rows {
		delete(row, "files")
	}
	return rows
}
