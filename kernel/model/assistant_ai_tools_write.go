package model

import (
	"errors"
	"fmt"
	"path"
	"regexp"
	"strings"
	"time"

	sql "github.com/lonelyor/sourceflow/kernel/sql"
	"github.com/lonelyor/sourceflow/kernel/treenode"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/lute"
	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
)

func runAssistantAITool(def *AssistantAIToolDefinition, policy *AssistantAIToolPolicy, context *AssistantAINoteContext, args map[string]interface{}) (ret map[string]interface{}, summary, targetID string, err error) {
	ret = map[string]interface{}{}
	switch def.ID {
	case AssistantAIToolReadCurrentNote:
		note, noteErr := getAssistantAICurrentNote(context)
		if nil != noteErr {
			return nil, "", "", noteErr
		}
		return note, "已读取当前笔记", note["rootID"].(string), nil
	case AssistantAIToolReadCurrentBlock:
		block, blockErr := getAssistantAICurrentBlock(context, policy.ReadScope)
		if nil != blockErr {
			return nil, "", "", blockErr
		}
		return block, "已读取当前块", getAssistantAIStringValue(block, "targetID", ""), nil
	case AssistantAIToolSearchNotes:
		query := strings.TrimSpace(getAssistantAIStringValue(args, "query", ""))
		if "" == query {
			return nil, "", "", fmt.Errorf("搜索关键词不能为空")
		}
		limit := clampAssistantAIToolLimit(getAssistantAIIntValue(args, "limit", 5), 1, 10)
		results, queryScope, searchErr := searchAssistantAINotes(query, limit, context, policy.ReadScope)
		if nil != searchErr {
			return nil, "", "", searchErr
		}
		ret["query"] = query
		ret["count"] = len(results)
		ret["scope"] = queryScope
		ret["items"] = results
		return ret, fmt.Sprintf("已搜索到 %d 条相关笔记", len(results)), firstAssistantAINonEmpty(contextID(context)), nil
	case AssistantAIToolReadNote:
		notebook := strings.TrimSpace(getAssistantAIStringValue(args, "notebook", ""))
		docPath := strings.TrimSpace(getAssistantAIStringValue(args, "path", ""))
		if "" == notebook || "" == docPath {
			return nil, "", "", fmt.Errorf("读取指定笔记需要 notebook 和 path")
		}
		note, scope, readErr := readAssistantAINote(notebook, docPath, context, policy.ReadScope)
		if nil != readErr {
			return nil, "", "", readErr
		}
		note["scope"] = scope
		return note, "已读取指定笔记", getAssistantAIStringValue(note, "rootID", ""), nil
	case AssistantAIToolReadNoteBacklinks:
		note, scope, readErr := readAssistantAINoteBacklinks(args, context, policy.ReadScope)
		if nil != readErr {
			return nil, "", "", readErr
		}
		note["scope"] = scope
		return note, "已读取笔记反链与提及", getAssistantAIStringValue(note, "rootID", ""), nil
	case AssistantAIToolReadNoteOutline:
		note, scope, readErr := readAssistantAINoteOutline(args, context, policy.ReadScope)
		if nil != readErr {
			return nil, "", "", readErr
		}
		note["scope"] = scope
		return note, "已读取笔记大纲", getAssistantAIStringValue(note, "rootID", ""), nil
	case AssistantAIToolSearchBlocks:
		query := strings.TrimSpace(getAssistantAIStringValue(args, "query", ""))
		if "" == query {
			return nil, "", "", fmt.Errorf("搜索关键词不能为空")
		}
		limit := clampAssistantAIToolLimit(getAssistantAIIntValue(args, "limit", 5), 1, 10)
		results, queryScope, searchErr := searchAssistantAIBlocks(query, limit, context, policy.ReadScope)
		if nil != searchErr {
			return nil, "", "", searchErr
		}
		ret["query"] = query
		ret["count"] = len(results)
		ret["scope"] = queryScope
		ret["items"] = results
		return ret, fmt.Sprintf("已搜索到 %d 条相关内容块", len(results)), firstAssistantAINonEmpty(contextID(context)), nil
	case AssistantAIToolReadBlock:
		blockID := strings.TrimSpace(getAssistantAIStringValue(args, "id", ""))
		if "" == blockID {
			return nil, "", "", fmt.Errorf("块 ID 不能为空")
		}
		block, scope, readErr := readAssistantAIBlock(blockID, context, policy.ReadScope)
		if nil != readErr {
			return nil, "", "", readErr
		}
		block["scope"] = scope
		return block, "已读取指定块", getAssistantAIStringValue(block, "id", blockID), nil
	case AssistantAIToolReadCurrentBlockContext:
		block, readErr := getAssistantAICurrentBlockContext(context, policy.ReadScope)
		if nil != readErr {
			return nil, "", "", readErr
		}
		return block, "已读取当前块上下文", getAssistantAIStringValue(block, "id", contextCurrentBlockID(context)), nil
	case AssistantAIToolReadBlockReferences:
		block, scope, readErr := readAssistantAIBlockReferences(args, context, policy.ReadScope)
		if nil != readErr {
			return nil, "", "", readErr
		}
		block["scope"] = scope
		return block, "已读取块引用关系", getAssistantAIStringValue(block, "id", ""), nil
	case AssistantAIToolListNoteHistory:
		history, scope, readErr := listAssistantAINoteHistory(args, context, policy.ReadScope)
		if nil != readErr {
			return nil, "", "", readErr
		}
		history["scope"] = scope
		return history, fmt.Sprintf("已列出 %d 组笔记历史", getAssistantAIIntValue(history, "groupCount", 0)), getAssistantAIStringValue(history, "rootID", ""), nil
	case AssistantAIToolListRestorePoints:
		points, readErr := listAssistantAIRestorePoints(args)
		if nil != readErr {
			return nil, "", "", readErr
		}
		return points, "已列出可用恢复点", firstAssistantAINonEmpty(contextID(context), "restore-points"), nil
	case AssistantAIToolListNoteAssets:
		assets, scope, readErr := listAssistantAINoteAssets(args, context, policy.ReadScope)
		if nil != readErr {
			return nil, "", "", readErr
		}
		assets["scope"] = scope
		return assets, fmt.Sprintf("已列出 %d 个笔记附件", getAssistantAIIntValue(assets, "count", 0)), getAssistantAIStringValue(assets, "rootID", ""), nil
	case AssistantAIToolReadNoteAsset:
		asset, scope, readErr := readAssistantAINoteAssetFile(args, context, policy.ReadScope)
		if nil != readErr {
			return nil, "", "", readErr
		}
		asset["scope"] = scope
		return asset, "已读取笔记附件文件", getAssistantAIStringValue(asset, "path", ""), nil
	case AssistantAIToolSearchAssets:
		query := strings.TrimSpace(getAssistantAIStringValue(args, "query", ""))
		if "" == query {
			return nil, "", "", fmt.Errorf("搜索关键词不能为空")
		}
		limit := clampAssistantAIToolLimit(getAssistantAIIntValue(args, "limit", 5), 1, 10)
		results, searchErr := searchAssistantAIAssets(query, limit)
		if nil != searchErr {
			return nil, "", "", searchErr
		}
		ret["query"] = query
		ret["count"] = len(results)
		ret["items"] = results
		return ret, fmt.Sprintf("已搜索到 %d 条相关附件", len(results)), firstAssistantAINonEmpty(contextID(context)), nil
	case AssistantAIToolReadAssetContent:
		assetID := strings.TrimSpace(getAssistantAIStringValue(args, "id", ""))
		if "" == assetID {
			return nil, "", "", fmt.Errorf("附件 ID 不能为空")
		}
		content, readErr := readAssistantAIAssetContent(assetID)
		if nil != readErr {
			return nil, "", "", readErr
		}
		return content, "已读取附件内容", getAssistantAIStringValue(content, "id", assetID), nil
	case AssistantAIToolAppendCurrentNote:
		if AssistantAIToolScopeCurrentNote != policy.WriteScope {
			return nil, "", "", fmt.Errorf("当前写入范围不允许追加当前笔记")
		}
		rootID := contextID(context)
		if "" == rootID {
			return nil, "", "", fmt.Errorf("当前没有可用的笔记上下文")
		}
		markdown := strings.TrimSpace(getAssistantAIContentValue(args))
		if "" == markdown {
			return nil, "", "", fmt.Errorf("追加内容不能为空")
		}
		traceMode := normalizeAssistantAIToolTraceMode(getAssistantAIStringValue(map[string]interface{}{"traceMode": policy.TraceMode}, "traceMode", AssistantAIToolTraceAuditOnly))
		if AssistantAIToolTraceMarkdown == traceMode {
			markdown = buildAssistantAIToolTrace(def, markdown)
		}
		if appendErr := appendAssistantAIMarkdown(rootID, markdown); nil != appendErr {
			return nil, "", "", appendErr
		}
		ret["targetID"] = rootID
		ret["appendedLength"] = len([]rune(markdown))
		return ret, "已追加到当前笔记", rootID, nil
	case AssistantAIToolCreateNote:
		notebook, hPath, createErr := resolveAssistantAINewNoteTarget(args, context, policy.WriteScope)
		if nil != createErr {
			return nil, "", "", createErr
		}
		markdown := strings.TrimSpace(getAssistantAIContentValue(args))
		if "" == markdown {
			return nil, "", "", fmt.Errorf("新建笔记内容不能为空")
		}
		traceMode := normalizeAssistantAIToolTraceMode(getAssistantAIStringValue(map[string]interface{}{"traceMode": policy.TraceMode}, "traceMode", AssistantAIToolTraceAuditOnly))
		if AssistantAIToolTraceMarkdown == traceMode {
			markdown = buildAssistantAIToolTrace(def, markdown)
		}
		id, createErr := CreateWithMarkdownSanitized("", notebook, hPath, markdown, "", ast.NewNodeID(), false, "")
		if nil != createErr {
			return nil, "", "", createErr
		}
		ret["targetID"] = id
		ret["notebook"] = notebook
		ret["path"] = hPath
		return ret, "已创建新笔记", id, nil
	case AssistantAIToolCreateChildNote:
		return createAssistantAIChildNote(def, policy, context, args)
	case AssistantAIToolCreateWorkbench:
		return createAssistantAIWorkbenchItem(def, policy, context, args)
	case AssistantAIToolInsertAfterBlock:
		return insertAssistantAIBlockAfter(policy, context, args)
	case AssistantAIToolDeleteBlock:
		return deleteAssistantAIBlock(policy, context, args)
	case AssistantAIToolReplaceBlock:
		return replaceAssistantAIBlock(policy, context, args)
	default:
		return nil, "", "", fmt.Errorf("unsupported assistant AI tool [%s]", def.ID)
	}
}

func appendAssistantAIMarkdown(parentID, markdown string) error {
	if "" == strings.TrimSpace(parentID) {
		return fmt.Errorf("parent block ID is required")
	}
	luteEngine := util.NewLute()
	data, err := dataBlockDOMForAssistant(markdown, luteEngine)
	if nil != err {
		return err
	}
	transactions := []*Transaction{{
		DoOperations: []*Operation{{
			Action:   "appendInsert",
			Data:     data,
			ParentID: strings.TrimSpace(parentID),
		}},
	}}
	PerformTransactions(&transactions)
	FlushTxQueue()
	return nil
}

func replaceAssistantAIBlockMarkdown(blockID, markdown string) error {
	if "" == strings.TrimSpace(blockID) {
		return fmt.Errorf("block ID is required")
	}
	luteEngine := util.NewLute()
	data, err := dataBlockDOMForAssistant(markdown, luteEngine)
	if nil != err {
		return err
	}
	tree := luteEngine.BlockDOM2Tree(data)
	if nil == tree || nil == tree.Root || nil == tree.Root.FirstChild {
		return fmt.Errorf("parse tree failed")
	}
	if "NodeList" == tree.Root.FirstChild.Type.String() && nil != tree.Root.FirstChild.FirstChild {
		tree.Root.AppendChild(tree.Root.FirstChild.FirstChild)
		tree.Root.FirstChild.Unlink()
		tree.Root.FirstChild.Unlink()
	}
	if nil != tree.Root.FirstChild {
		tree.Root.FirstChild.SetIALAttr("id", blockID)
	}
	data = luteEngine.Tree2BlockDOM(tree, luteEngine.RenderOptions, luteEngine.ParseOptions)
	transactions := []*Transaction{{
		DoOperations: []*Operation{{
			Action: "update",
			ID:     strings.TrimSpace(blockID),
			Data:   data,
		}},
	}}
	PerformTransactions(&transactions)
	FlushTxQueue()
	return nil
}

func dataBlockDOMForAssistant(data string, luteEngine *lute.Lute) (ret string, err error) {
	luteEngine.SetHTMLTag2TextMark(true)
	ret, tree := luteEngine.Md2BlockDOMTree(data, true)
	if "" == ret {
		blankParagraph := treenode.NewParagraph("")
		if nil != tree && nil != tree.Root {
			tree.Root.AppendChild(blankParagraph)
			ret = luteEngine.Tree2BlockDOM(tree, luteEngine.RenderOptions, luteEngine.ParseOptions)
		} else {
			ret = luteEngine.RenderNodeBlockDOM(blankParagraph)
		}
	}

	invalidID := ""
	ast.Walk(tree.Root, func(n *ast.Node, entering bool) ast.WalkStatus {
		if !entering {
			return ast.WalkContinue
		}
		if "" != n.ID && !ast.IsNodeIDPattern(n.ID) {
			invalidID = n.ID
			return ast.WalkStop
		}
		return ast.WalkContinue
	})
	if "" != invalidID {
		return "", errors.New("found invalid ID [" + invalidID + "]")
	}
	if nil != tree && nil != tree.Root {
		treenode.ResetBlockIDs(tree.Root)
		ret = luteEngine.Tree2BlockDOM(tree, luteEngine.RenderOptions, luteEngine.ParseOptions)
	}
	return ret, nil
}

func resolveAssistantAINewNoteTarget(args map[string]interface{}, context *AssistantAINoteContext, scope string) (notebook, hPath string, err error) {
	scope = normalizeAssistantAIToolScope(scope, AssistantAIToolScopeCurrentNotebook)
	requestedNotebook := strings.TrimSpace(getAssistantAIStringValue(args, "notebook", ""))
	requestedPath := strings.TrimSpace(getAssistantAIStringValue(args, "path", ""))
	title := sanitizeAssistantAINoteTitle(firstAssistantAINonEmpty(getAssistantAIStringValue(args, "title", ""), "AI 笔记"))

	switch scope {
	case AssistantAIToolScopeCurrentNote, AssistantAIToolScopeCurrentNotebook:
		if nil == context || "" == strings.TrimSpace(context.Notebook) {
			return "", "", fmt.Errorf("当前没有可用的笔记本上下文")
		}
		notebook = strings.TrimSpace(context.Notebook)
		if "" != requestedNotebook && requestedNotebook != notebook {
			return "", "", fmt.Errorf("当前配置只允许在当前笔记本内创建笔记")
		}
	default:
		notebook = firstAssistantAINonEmpty(requestedNotebook, contextNotebook(context))
		if "" == notebook {
			opened := Conf.GetOpenedBoxes()
			if 0 < len(opened) {
				notebook = opened[0].ID
			}
		}
	}
	if "" == notebook {
		return "", "", fmt.Errorf("没有可用的笔记本")
	}
	if "" == requestedPath {
		requestedPath = path.Join("/AI", title)
	}
	if !strings.HasPrefix(requestedPath, "/") {
		requestedPath = "/" + requestedPath
	}
	return notebook, sanitizeAssistantAINotePath(requestedPath, title), nil
}

func createAssistantAIWorkbenchItem(def *AssistantAIToolDefinition, policy *AssistantAIToolPolicy, context *AssistantAINoteContext, args map[string]interface{}) (ret map[string]interface{}, summary, targetID string, err error) {
	typ := normalizeWorkbenchType(getAssistantAIStringValue(args, "type", "note"), "note")
	if "url" == typ || "attachment" == typ || "doc" == typ {
		typ = "note"
	}
	title := sanitizeAssistantAINoteTitle(firstAssistantAINonEmpty(getAssistantAIStringValue(args, "title", ""), "AI "+def.Name))
	notebook, hPath, err := resolveAssistantAINewNoteTarget(args, context, policy.WriteScope)
	if nil != err {
		return nil, "", "", err
	}
	markdown := strings.TrimSpace(getAssistantAIContentValue(args))
	if "" == markdown {
		markdown = "# " + title + "\n"
	}
	traceMode := normalizeAssistantAIToolTraceMode(getAssistantAIStringValue(map[string]interface{}{"traceMode": policy.TraceMode}, "traceMode", AssistantAIToolTraceAuditOnly))
	if AssistantAIToolTraceMarkdown == traceMode {
		markdown = buildAssistantAIToolTrace(def, markdown)
	}
	id, createErr := CreateWithMarkdownSanitized("", notebook, hPath, markdown, "", ast.NewNodeID(), false, "")
	if nil != createErr {
		return nil, "", "", createErr
	}

	attrs := map[string]string{
		WorkbenchAttrType:       typ,
		WorkbenchAttrStatus:     strings.TrimSpace(getAssistantAIStringValue(args, "status", "")),
		WorkbenchAttrInbox:      assistantAIBoolStringValue(args, "inbox", ""),
		WorkbenchAttrProject:    strings.TrimSpace(getAssistantAIStringValue(args, "project", "")),
		WorkbenchAttrDueDate:    strings.TrimSpace(getAssistantAIStringValue(args, "dueDate", "")),
		WorkbenchAttrEventTime:  strings.TrimSpace(getAssistantAIStringValue(args, "eventTime", "")),
		WorkbenchAttrLocation:   strings.TrimSpace(getAssistantAIStringValue(args, "location", "")),
		WorkbenchAttrSourceURL:  strings.TrimSpace(getAssistantAIStringValue(args, "sourceURL", "")),
		WorkbenchAttrGoal:       strings.TrimSpace(getAssistantAIStringValue(args, "goal", "")),
		WorkbenchAttrNextStep:   strings.TrimSpace(getAssistantAIStringValue(args, "nextStep", "")),
		WorkbenchAttrCapturedAt: strings.TrimSpace(getAssistantAIStringValue(args, "capturedAt", "")),
		WorkbenchAttrTitle:      title,
	}
	if tags := assistantAIJoinedStringArrayValue(args, "tags"); "" != tags {
		attrs["tags"] = tags
	}
	if saveErr := SaveWorkbenchItem(id, title, attrs); nil != saveErr {
		return nil, "", "", saveErr
	}

	ret = map[string]interface{}{
		"targetID":  id,
		"type":      typ,
		"title":     title,
		"notebook":  notebook,
		"path":      hPath,
		"status":    normalizeWorkbenchStatus(typ, attrs[WorkbenchAttrStatus], ""),
		"project":   attrs[WorkbenchAttrProject],
		"dueDate":   attrs[WorkbenchAttrDueDate],
		"eventTime": attrs[WorkbenchAttrEventTime],
		"location":  attrs[WorkbenchAttrLocation],
	}
	return ret, fmt.Sprintf("已创建%s", assistantAIWorkbenchItemLabel(typ)), id, nil
}

func createAssistantAIChildNote(def *AssistantAIToolDefinition, policy *AssistantAIToolPolicy, context *AssistantAINoteContext, args map[string]interface{}) (ret map[string]interface{}, summary, targetID string, err error) {
	if nil == context || "" == contextID(context) || "" == contextNotebook(context) {
		return nil, "", "", fmt.Errorf("当前没有可用的笔记上下文")
	}
	title := sanitizeAssistantAINoteTitle(firstAssistantAINonEmpty(getAssistantAIStringValue(args, "title", ""), "AI 子文档"))
	parentHPath, hPathErr := GetHPathByID(contextID(context))
	if nil != hPathErr {
		return nil, "", "", hPathErr
	}
	hPath := sanitizeAssistantAINotePath(path.Join(parentHPath, title), title)
	markdown := strings.TrimSpace(getAssistantAIContentValue(args))
	if "" == markdown {
		markdown = "# " + title + "\n"
	}
	traceMode := normalizeAssistantAIToolTraceMode(getAssistantAIStringValue(map[string]interface{}{"traceMode": policy.TraceMode}, "traceMode", AssistantAIToolTraceAuditOnly))
	if AssistantAIToolTraceMarkdown == traceMode {
		markdown = buildAssistantAIToolTrace(def, markdown)
	}
	tags := assistantAIJoinedStringArrayValue(args, "tags")
	id, createErr := CreateWithMarkdownSanitized(tags, contextNotebook(context), hPath, markdown, contextID(context), ast.NewNodeID(), false, "")
	if nil != createErr {
		return nil, "", "", createErr
	}
	ret = map[string]interface{}{
		"targetID":     id,
		"title":        title,
		"rootID":       id,
		"parentRootID": contextID(context),
		"notebook":     contextNotebook(context),
		"path":         hPath,
	}
	return ret, "已创建当前笔记子文档", id, nil
}

func insertAssistantAIBlockAfter(policy *AssistantAIToolPolicy, context *AssistantAINoteContext, args map[string]interface{}) (ret map[string]interface{}, summary, targetID string, err error) {
	blockID := strings.TrimSpace(firstAssistantAINonEmpty(getAssistantAIStringValue(args, "id", ""), contextCurrentBlockID(context)))
	markdown := strings.TrimSpace(getAssistantAIContentValue(args))
	if "" == blockID {
		return nil, "", "", fmt.Errorf("当前没有可用的块上下文")
	}
	if "" == markdown {
		return nil, "", "", fmt.Errorf("插入内容不能为空，请在 markdown、content 或 text 字段中提供正文")
	}
	block := sql.GetBlock(blockID)
	if nil == block {
		return nil, "", "", fmt.Errorf("未找到指定块")
	}
	scope := normalizeAssistantAIToolScope(policy.WriteScope, AssistantAIToolScopeCurrentNotebook)
	if !assistantAINoteMatchesScope(scope, context, strings.TrimSpace(block.Box), strings.TrimSpace(block.Path), strings.TrimSpace(block.RootID)) {
		return nil, "", "", fmt.Errorf("当前写入范围不允许修改该块")
	}
	if "d" == strings.TrimSpace(block.Type) {
		return nil, "", "", fmt.Errorf("根文档请使用追加到当前笔记或创建子文档")
	}
	def := getAssistantAIToolDefinition(AssistantAIToolInsertAfterBlock)
	traceMode := normalizeAssistantAIToolTraceMode(getAssistantAIStringValue(map[string]interface{}{"traceMode": policy.TraceMode}, "traceMode", AssistantAIToolTraceAuditOnly))
	if AssistantAIToolTraceMarkdown == traceMode && nil != def {
		markdown = buildAssistantAIToolTrace(def, markdown)
	}
	luteEngine := util.NewLute()
	data, domErr := dataBlockDOMForAssistant(markdown, luteEngine)
	if nil != domErr {
		return nil, "", "", domErr
	}
	parentID, _, nextID, idsErr := GetBlockRelevantIDs(blockID)
	if nil != idsErr {
		return nil, "", "", idsErr
	}
	transactions := []*Transaction{{
		DoOperations: []*Operation{{
			Action:     "insert",
			Data:       data,
			ParentID:   parentID,
			PreviousID: blockID,
			NextID:     nextID,
		}},
	}}
	PerformTransactions(&transactions)
	FlushTxQueue()
	ret = map[string]interface{}{
		"targetID":        blockID,
		"afterBlockID":    blockID,
		"rootID":          strings.TrimSpace(block.RootID),
		"notebook":        strings.TrimSpace(block.Box),
		"path":            strings.TrimSpace(block.Path),
		"insertedLength":  len([]rune(markdown)),
		"insertedPreview": truncateAssistantAIToolText(markdown, 240),
	}
	return ret, "已在指定块后插入内容", blockID, nil
}

func deleteAssistantAIBlock(policy *AssistantAIToolPolicy, context *AssistantAINoteContext, args map[string]interface{}) (ret map[string]interface{}, summary, targetID string, err error) {
	blockID := strings.TrimSpace(firstAssistantAINonEmpty(getAssistantAIStringValue(args, "id", ""), contextCurrentBlockID(context)))
	if "" == blockID {
		return nil, "", "", fmt.Errorf("块 ID 不能为空")
	}
	block := sql.GetBlock(blockID)
	if nil == block {
		return nil, "", "", fmt.Errorf("未找到指定块")
	}
	scope := normalizeAssistantAIToolScope(policy.WriteScope, AssistantAIToolScopeCurrentNotebook)
	if !assistantAINoteMatchesScope(scope, context, strings.TrimSpace(block.Box), strings.TrimSpace(block.Path), strings.TrimSpace(block.RootID)) {
		return nil, "", "", fmt.Errorf("当前写入范围不允许修改该块")
	}
	if "d" == strings.TrimSpace(block.Type) {
		return nil, "", "", fmt.Errorf("根文档请使用恢复、移动或删除文档能力，不能直接通过删块工具删除")
	}
	transactions := []*Transaction{{
		DoOperations: []*Operation{{
			Action: "delete",
			ID:     blockID,
		}},
	}}
	PerformTransactions(&transactions)
	FlushTxQueue()
	ret = map[string]interface{}{
		"targetID": blockID,
		"rootID":   strings.TrimSpace(block.RootID),
		"notebook": strings.TrimSpace(block.Box),
		"path":     strings.TrimSpace(block.Path),
	}
	return ret, "已删除指定块", blockID, nil
}

func replaceAssistantAIBlock(policy *AssistantAIToolPolicy, context *AssistantAINoteContext, args map[string]interface{}) (ret map[string]interface{}, summary, targetID string, err error) {
	blockID := strings.TrimSpace(getAssistantAIStringValue(args, "id", ""))
	markdown := strings.TrimSpace(getAssistantAIContentValue(args))
	if "" == blockID {
		return nil, "", "", fmt.Errorf("块 ID 不能为空")
	}
	if "" == markdown {
		if assistantAIIsDeleteIntent(args) {
			return deleteAssistantAIBlock(policy, context, map[string]interface{}{"id": blockID})
		}
		return nil, "", "", fmt.Errorf("替换内容不能为空；如果要删除块，请改用 delete-block")
	}
	block := sql.GetBlock(blockID)
	if nil == block {
		return nil, "", "", fmt.Errorf("未找到指定块")
	}
	scope := normalizeAssistantAIToolScope(policy.WriteScope, AssistantAIToolScopeCurrentNotebook)
	if !assistantAINoteMatchesScope(scope, context, strings.TrimSpace(block.Box), strings.TrimSpace(block.Path), strings.TrimSpace(block.RootID)) {
		return nil, "", "", fmt.Errorf("当前写入范围不允许修改该块")
	}
	if "d" == strings.TrimSpace(block.Type) {
		return nil, "", "", fmt.Errorf("根文档请使用新建、追加或更细粒度的块修改方式")
	}
	if err = replaceAssistantAIBlockMarkdown(blockID, markdown); nil != err {
		return nil, "", "", err
	}
	ret = map[string]interface{}{
		"targetID":       blockID,
		"rootID":         strings.TrimSpace(block.RootID),
		"notebook":       strings.TrimSpace(block.Box),
		"path":           strings.TrimSpace(block.Path),
		"updatedLength":  len([]rune(markdown)),
		"updatedPreview": truncateAssistantAIToolText(markdown, 240),
	}
	return ret, "已替换指定块内容", blockID, nil
}

func sanitizeAssistantAINoteTitle(value string) string {
	replacer := regexp.MustCompile(`[\\/:*?"<>|\r\n]+`)
	value = replacer.ReplaceAllString(value, " ")
	value = strings.Join(strings.Fields(value), " ")
	if "" == value {
		return "AI 笔记"
	}
	return value
}

func sanitizeAssistantAINotePath(hPath, title string) string {
	baseName := path.Base(hPath)
	dir := path.Dir(hPath)
	baseName = sanitizeAssistantAINoteTitle(baseName)
	if "" == strings.TrimSpace(baseName) {
		baseName = title
	}
	if !strings.HasPrefix(dir, "/") {
		dir = "/" + dir
	}
	return path.Join(dir, baseName)
}

func buildAssistantAIToolTrace(def *AssistantAIToolDefinition, markdown string) string {
	header := strings.Join([]string{
		"> AI 留痕",
		"> 工具：" + def.ID,
		"> 时间：" + time.Now().Format("2006-01-02 15:04:05"),
		"",
	}, "\n")
	return header + strings.TrimSpace(markdown) + "\n"
}
