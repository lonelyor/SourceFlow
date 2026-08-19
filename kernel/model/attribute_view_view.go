// SourceFlow - Make knowledge flow
// Copyright (c) 2020-present, SourceFlow contributors
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

package model

import (
	"bytes"
	"strings"
	"unicode/utf8"

	"github.com/jinzhu/copier"
	"github.com/lonelyor/sourceflow/kernel/av"
	"github.com/lonelyor/sourceflow/kernel/cache"
	"github.com/lonelyor/sourceflow/kernel/filesys"
	"github.com/lonelyor/sourceflow/kernel/treenode"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
	"github.com/lonelyor/sourceflow/third_party/go/lute/parse"
)

func (tx *Transaction) doSortAttrViewView(operation *Operation) (ret *TxErr) {
	avID := operation.AvID
	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		logging.LogErrorf("parse attribute view [%s] failed: %s", operation.AvID, err)
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}

	view := attrView.GetView(operation.ID)
	if nil == view {
		logging.LogErrorf("get view failed: %s", operation.BlockID)
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	viewID := view.ID
	previousViewID := operation.PreviousID
	if viewID == previousViewID {
		return
	}

	var index, previousIndex int
	for i, v := range attrView.Views {
		if v.ID == viewID {
			view = v
			index = i
			break
		}
	}

	attrView.Views = append(attrView.Views[:index], attrView.Views[index+1:]...)
	for i, v := range attrView.Views {
		if v.ID == previousViewID {
			previousIndex = i + 1
			break
		}
	}
	attrView.Views = util.InsertElem(attrView.Views, previousIndex, view)

	if err = av.SaveAttributeView(attrView); err != nil {
		logging.LogErrorf("save attribute view [%s] failed: %s", avID, err)
		return &TxErr{code: TxErrCodeWriteTree, msg: err.Error(), id: avID}
	}
	return
}

func (tx *Transaction) doRemoveAttrViewView(operation *Operation) (ret *TxErr) {
	var err error
	avID := operation.AvID
	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		logging.LogErrorf("parse attribute view [%s] failed: %s", avID, err)
		return &TxErr{code: TxErrCodeBlockNotFound, id: avID}
	}

	if 1 >= len(attrView.Views) {
		logging.LogWarnf("can't remove last view [%s] of attribute view [%s]", operation.AvID, avID)
		return
	}

	view, err := getAttrViewViewByBlockID(attrView, operation.BlockID)
	if nil == view {
		logging.LogWarnf("get view failed: %s", operation.BlockID)
		return
	}

	viewID := view.ID
	var index int
	for i, view := range attrView.Views {
		if viewID == view.ID {
			attrView.Views = append(attrView.Views[:i], attrView.Views[i+1:]...)
			index = i - 1
			break
		}
	}
	if 0 > index {
		index = 0
	}

	view = attrView.Views[index]
	attrView.ViewID = view.ID
	if err = av.SaveAttributeView(attrView); err != nil {
		logging.LogErrorf("save attribute view [%s] failed: %s", avID, err)
		return &TxErr{code: TxErrCodeWriteTree, msg: err.Error(), id: avID}
	}

	trees, nodes := getMirrorBlocksNodes(avID)
	for _, node := range nodes {
		attrs := parse.IAL2Map(node.KramdownIAL)
		blockViewID := av.GetNodeAttrViewFromAttrs(attrs)
		if blockViewID == viewID {
			av.SetNodeAttrView(attrs, attrView.ViewID)
			node.AttributeViewType = string(view.LayoutType)
			oldAttrsUnEsc, e := setNodeAttrs0(node, attrs)
			if nil != e {
				logging.LogErrorf("set node attrs failed: %s", e)
				continue
			}

			cache.PutBlockIAL(node.ID, parse.IAL2Map(node.KramdownIAL))
			pushBlockAttrs(oldAttrsUnEsc, node)
		}
	}

	for _, tree := range trees {
		if err = indexWriteTreeUpsertQueue(tree); err != nil {
			return
		}
	}

	operation.RetData = view.LayoutType
	return
}

func getMirrorBlocksNodes(avID string) (trees []*parse.Tree, nodes []*ast.Node) {
	mirrorBlockIDs := treenode.GetMirrorAttrViewBlockIDs(avID)
	mirrorBlockTrees := filesys.LoadTrees(mirrorBlockIDs)
	for id, tree := range mirrorBlockTrees {
		node := treenode.GetNodeInTree(tree, id)
		if nil == node {
			logging.LogErrorf("get node in tree by block ID [%s] failed", id)
			continue
		}
		nodes = append(nodes, node)
	}

	for _, tree := range mirrorBlockTrees {
		trees = append(trees, tree)
	}
	return
}

func (tx *Transaction) doDuplicateAttrViewView(operation *Operation) (ret *TxErr) {
	var err error
	avID := operation.AvID
	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		logging.LogErrorf("parse attribute view [%s] failed: %s", avID, err)
		return &TxErr{code: TxErrHandleAttributeView, id: avID}
	}

	masterView := attrView.GetView(operation.PreviousID)
	if nil == masterView {
		logging.LogErrorf("get master view failed: %s", avID)
		return &TxErr{code: TxErrHandleAttributeView, id: avID}
	}

	node, tree, _ := getNodeByBlockID(nil, operation.BlockID)
	if nil == node {
		logging.LogErrorf("get node by block ID [%s] failed", operation.BlockID)
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID}
	}

	attrs := parse.IAL2Map(node.KramdownIAL)
	av.SetNodeAttrView(attrs, operation.ID)
	node.AttributeViewType = string(masterView.LayoutType)
	err = setNodeAttrs(node, tree, attrs)
	if err != nil {
		logging.LogWarnf("set node [%s] attrs failed: %s", operation.BlockID, err)
		return
	}

	var view *av.View
	switch masterView.LayoutType {
	case av.LayoutTypeTable:
		view = av.NewTableView()
	case av.LayoutTypeGallery:
		view = av.NewGalleryView()
	case av.LayoutTypeKanban:
		view = av.NewKanbanView()
	}

	view.ID = operation.ID
	attrView.Views = append(attrView.Views, view)
	attrView.ViewID = view.ID

	view.Icon = masterView.Icon
	view.Name = util.GetDuplicateName(masterView.Name)
	view.HideAttrViewName = masterView.HideAttrViewName
	view.Desc = masterView.Desc
	view.LayoutType = masterView.LayoutType
	view.PageSize = masterView.PageSize

	for _, filter := range masterView.Filters {
		view.Filters = append(view.Filters, &av.ViewFilter{
			Column:        filter.Column,
			Qualifier:     filter.Qualifier,
			Operator:      filter.Operator,
			Value:         filter.Value,
			RelativeDate:  filter.RelativeDate,
			RelativeDate2: filter.RelativeDate2,
		})
	}

	for _, s := range masterView.Sorts {
		view.Sorts = append(view.Sorts, &av.ViewSort{
			Column: s.Column,
			Order:  s.Order,
		})
	}

	switch masterView.LayoutType {
	case av.LayoutTypeTable:
		for _, col := range masterView.Table.Columns {
			view.Table.Columns = append(view.Table.Columns, &av.ViewTableColumn{
				BaseField: &av.BaseField{
					ID:     col.ID,
					Wrap:   col.Wrap,
					Hidden: col.Hidden,
					Desc:   col.Desc,
				},
				Pin:   col.Pin,
				Width: col.Width,
				Calc:  col.Calc,
			})
		}

		view.Table.ShowIcon = masterView.Table.ShowIcon
		view.Table.WrapField = masterView.Table.WrapField
	case av.LayoutTypeGallery:
		for _, field := range masterView.Gallery.CardFields {
			view.Gallery.CardFields = append(view.Gallery.CardFields, &av.ViewGalleryCardField{
				BaseField: &av.BaseField{
					ID:     field.ID,
					Wrap:   field.Wrap,
					Hidden: field.Hidden,
					Desc:   field.Desc,
				},
			})
		}

		view.Gallery.CoverFrom = masterView.Gallery.CoverFrom
		view.Gallery.CoverFromAssetKeyID = masterView.Gallery.CoverFromAssetKeyID
		view.Gallery.CardSize = masterView.Gallery.CardSize
		view.Gallery.FitImage = masterView.Gallery.FitImage
		view.Gallery.DisplayFieldName = masterView.Gallery.DisplayFieldName
		view.Gallery.ShowIcon = masterView.Gallery.ShowIcon
		view.Gallery.WrapField = masterView.Gallery.WrapField
	case av.LayoutTypeKanban:
		for _, field := range masterView.Kanban.Fields {
			view.Kanban.Fields = append(view.Kanban.Fields, &av.ViewKanbanField{
				BaseField: &av.BaseField{
					ID:     field.ID,
					Wrap:   field.Wrap,
					Hidden: field.Hidden,
					Desc:   field.Desc,
				},
			})
		}

		view.Kanban.CoverFrom = masterView.Kanban.CoverFrom
		view.Kanban.CoverFromAssetKeyID = masterView.Kanban.CoverFromAssetKeyID
		view.Kanban.CardSize = masterView.Kanban.CardSize
		view.Kanban.FitImage = masterView.Kanban.FitImage
		view.Kanban.DisplayFieldName = masterView.Kanban.DisplayFieldName
		view.Kanban.FillColBackgroundColor = masterView.Kanban.FillColBackgroundColor
		view.Kanban.ShowIcon = masterView.Kanban.ShowIcon
		view.Kanban.WrapField = masterView.Kanban.WrapField
	}

	view.ItemIDs = masterView.ItemIDs

	if nil != masterView.Group {
		view.Group = &av.ViewGroup{}
		if copyErr := copier.Copy(view.Group, masterView.Group); nil != copyErr {
			logging.LogErrorf("copy group failed: %s", copyErr)
			return &TxErr{code: TxErrHandleAttributeView, id: avID, msg: copyErr.Error()}
		}

		view.GroupItemIDs = masterView.GroupItemIDs
		regenAttrViewGroups(attrView)
	}

	if err = av.SaveAttributeView(attrView); err != nil {
		logging.LogErrorf("save attribute view [%s] failed: %s", avID, err)
		return &TxErr{code: TxErrHandleAttributeView, msg: err.Error(), id: avID}
	}
	return
}

func (tx *Transaction) doAddAttrViewView(operation *Operation) (ret *TxErr) {
	err := addAttrViewView(operation.AvID, operation.ID, operation.BlockID, operation.Layout)
	if nil != err {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func addAttrViewView(avID, viewID, blockID string, layout av.LayoutType) (err error) {
	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		logging.LogErrorf("parse attribute view [%s] failed: %s", avID, err)
		return
	}

	if 1 > len(attrView.Views) {
		logging.LogErrorf("no view in attribute view [%s]", avID)
		return
	}

	firstView := attrView.Views[0]
	if nil == firstView {
		logging.LogErrorf("get first view failed: %s", avID)
		return
	}

	if "" == layout {
		layout = av.LayoutTypeTable
	}

	var view *av.View
	switch layout {
	case av.LayoutTypeTable:
		view = av.NewTableView()
		switch firstView.LayoutType {
		case av.LayoutTypeTable:
			for _, col := range firstView.Table.Columns {
				view.Table.Columns = append(view.Table.Columns, &av.ViewTableColumn{BaseField: &av.BaseField{ID: col.ID}, Width: col.Width})
			}
		case av.LayoutTypeGallery:
			for _, field := range firstView.Gallery.CardFields {
				view.Table.Columns = append(view.Table.Columns, &av.ViewTableColumn{BaseField: &av.BaseField{ID: field.ID}})
			}
		case av.LayoutTypeKanban:
			for _, field := range firstView.Kanban.Fields {
				view.Table.Columns = append(view.Table.Columns, &av.ViewTableColumn{BaseField: &av.BaseField{ID: field.ID}})
			}
		}
	case av.LayoutTypeGallery:
		view = av.NewGalleryView()
		switch firstView.LayoutType {
		case av.LayoutTypeTable:
			for _, col := range firstView.Table.Columns {
				view.Gallery.CardFields = append(view.Gallery.CardFields, &av.ViewGalleryCardField{BaseField: &av.BaseField{ID: col.ID}})
			}
		case av.LayoutTypeGallery:
			for _, field := range firstView.Gallery.CardFields {
				view.Gallery.CardFields = append(view.Gallery.CardFields, &av.ViewGalleryCardField{BaseField: &av.BaseField{ID: field.ID}})
			}
		case av.LayoutTypeKanban:
			for _, field := range firstView.Kanban.Fields {
				view.Gallery.CardFields = append(view.Gallery.CardFields, &av.ViewGalleryCardField{BaseField: &av.BaseField{ID: field.ID}})
			}
		}
	case av.LayoutTypeKanban:
		view = av.NewKanbanView()
		switch firstView.LayoutType {
		case av.LayoutTypeTable:
			for _, col := range firstView.Table.Columns {
				view.Kanban.Fields = append(view.Kanban.Fields, &av.ViewKanbanField{BaseField: &av.BaseField{ID: col.ID}})
			}
		case av.LayoutTypeGallery:
			for _, field := range firstView.Gallery.CardFields {
				view.Kanban.Fields = append(view.Kanban.Fields, &av.ViewKanbanField{BaseField: &av.BaseField{ID: field.ID}})
			}
		case av.LayoutTypeKanban:
			for _, field := range firstView.Kanban.Fields {
				view.Kanban.Fields = append(view.Kanban.Fields, &av.ViewKanbanField{BaseField: &av.BaseField{ID: field.ID}})
			}
		}
	default:
		err = av.ErrWrongLayoutType
		logging.LogErrorf("wrong layout type [%s] for attribute view [%s]", layout, avID)
		return
	}

	view.ItemIDs = firstView.ItemIDs
	attrView.ViewID = viewID
	view.ID = viewID
	attrView.Views = append(attrView.Views, view)

	if av.LayoutTypeKanban == layout {
		preferredGroupKey := getKanbanPreferredGroupKey(attrView)
		group := &av.ViewGroup{Field: preferredGroupKey.ID}
		setAttributeViewGroup(attrView, view, group)
	}

	node, tree, _ := getNodeByBlockID(nil, blockID)
	if nil == node {
		logging.LogErrorf("get node by block ID [%s] failed", blockID)
		return
	}

	node.AttributeViewType = string(view.LayoutType)
	attrs := parse.IAL2Map(node.KramdownIAL)
	av.SetNodeAttrView(attrs, viewID)
	err = setNodeAttrs(node, tree, attrs)
	if err != nil {
		logging.LogWarnf("set node [%s] attrs failed: %s", blockID, err)
		return
	}

	if err = av.SaveAttributeView(attrView); err != nil {
		logging.LogErrorf("save attribute view [%s] failed: %s", avID, err)
		return
	}
	return
}

func getKanbanPreferredGroupKey(attrView *av.AttributeView) (ret *av.Key) {
	for _, kv := range attrView.KeyValues {
		if av.KeyTypeSelect == kv.Key.Type {
			ret = kv.Key
			break
		}
	}

	if nil == ret {
		name := av.GetAttributeViewI18n("select")
		ret = av.NewKey(ast.NewNodeID(), name, "", av.KeyTypeSelect)
		attrView.KeyValues = append(attrView.KeyValues, &av.KeyValues{Key: ret})
		for _, view := range attrView.Views {
			newField := &av.BaseField{ID: ret.ID}
			if nil != view.Table {
				newField.Wrap = view.Table.WrapField
				view.Table.Columns = append(view.Table.Columns, &av.ViewTableColumn{BaseField: newField})
			}

			if nil != view.Gallery {
				newField.Wrap = view.Gallery.WrapField
				view.Gallery.CardFields = append(view.Gallery.CardFields, &av.ViewGalleryCardField{BaseField: newField})
			}

			if nil != view.Kanban {
				newField.Wrap = view.Kanban.WrapField
				view.Kanban.Fields = append(view.Kanban.Fields, &av.ViewKanbanField{BaseField: newField})
			}
		}
	}
	return
}

func (tx *Transaction) doSetAttrViewViewName(operation *Operation) (ret *TxErr) {
	var err error
	avID := operation.AvID
	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		logging.LogErrorf("parse attribute view [%s] failed: %s", avID, err)
		return &TxErr{code: TxErrHandleAttributeView, id: avID}
	}

	viewID := operation.ID
	view := attrView.GetView(viewID)
	if nil == view {
		logging.LogErrorf("get view [%s] failed: %s", viewID, err)
		return &TxErr{code: TxErrHandleAttributeView, id: viewID}
	}

	view.Name = strings.TrimSpace(operation.Data.(string))
	if err = av.SaveAttributeView(attrView); err != nil {
		logging.LogErrorf("save attribute view [%s] failed: %s", avID, err)
		return &TxErr{code: TxErrHandleAttributeView, msg: err.Error(), id: avID}
	}
	return
}

func (tx *Transaction) doSetAttrViewViewIcon(operation *Operation) (ret *TxErr) {
	var err error
	avID := operation.AvID
	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		logging.LogErrorf("parse attribute view [%s] failed: %s", avID, err)
		return &TxErr{code: TxErrHandleAttributeView, id: avID}
	}

	viewID := operation.ID
	view := attrView.GetView(viewID)
	if nil == view {
		logging.LogErrorf("get view [%s] failed: %s", viewID, err)
		return &TxErr{code: TxErrHandleAttributeView, id: viewID}
	}

	view.Icon = operation.Data.(string)
	if err = av.SaveAttributeView(attrView); err != nil {
		logging.LogErrorf("save attribute view [%s] failed: %s", avID, err)
		return &TxErr{code: TxErrHandleAttributeView, msg: err.Error(), id: avID}
	}
	return
}

func (tx *Transaction) doSetAttrViewViewDesc(operation *Operation) (ret *TxErr) {
	var err error
	avID := operation.AvID
	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		logging.LogErrorf("parse attribute view [%s] failed: %s", avID, err)
		return &TxErr{code: TxErrHandleAttributeView, id: avID}
	}

	viewID := operation.ID
	view := attrView.GetView(viewID)
	if nil == view {
		logging.LogErrorf("get view [%s] failed: %s", viewID, err)
		return &TxErr{code: TxErrHandleAttributeView, id: viewID}
	}

	view.Desc = strings.TrimSpace(operation.Data.(string))
	if err = av.SaveAttributeView(attrView); err != nil {
		logging.LogErrorf("save attribute view [%s] failed: %s", avID, err)
		return &TxErr{code: TxErrHandleAttributeView, msg: err.Error(), id: avID}
	}
	return
}

func (tx *Transaction) doSetAttrViewName(operation *Operation) (ret *TxErr) {
	err := tx.setAttributeViewName(operation)
	if err != nil {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

const attrAvNameTpl = `<span data-av-id="${avID}" data-popover-url="/api/av/getMirrorDatabaseBlocks" class="popover__block">${avName}</span>`

func (tx *Transaction) setAttributeViewName(operation *Operation) (err error) {
	avID := operation.ID
	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		return
	}

	attrView.Name = strings.TrimSpace(operation.Data.(string))
	attrView.Name = strings.ReplaceAll(attrView.Name, "\n", " ")
	if 512 < utf8.RuneCountInString(attrView.Name) {
		attrView.Name = gulu.Str.SubStr(attrView.Name, 512)
	}
	err = av.SaveAttributeView(attrView)

	_, nodes := tx.getAttrViewBoundNodes(attrView)
	for _, node := range nodes {
		avNames := getAvNames(node.IALAttr(av.NodeAttrNameAvs))
		oldAttrs := parse.IAL2Map(node.KramdownIAL)
		node.SetIALAttr(av.NodeAttrViewNames, avNames)
		pushBlockAttrs(oldAttrs, node)
	}
	return
}

func getAvNames(avIDs string) (ret string) {
	if "" == avIDs {
		return
	}
	avNames := bytes.Buffer{}
	nodeAvIDs := strings.Split(avIDs, ",")
	for _, nodeAvID := range nodeAvIDs {
		nodeAvName, getErr := av.GetAttributeViewName(nodeAvID)
		if nil != getErr {
			continue
		}
		if "" == nodeAvName {
			nodeAvName = Conf.language(105)
		}

		tpl := strings.ReplaceAll(attrAvNameTpl, "${avID}", nodeAvID)
		tpl = strings.ReplaceAll(tpl, "${avName}", nodeAvName)
		avNames.WriteString(tpl)
		avNames.WriteString("&nbsp;")
	}
	if 0 < avNames.Len() {
		avNames.Truncate(avNames.Len() - 6)
		ret = avNames.String()
	}
	return
}

func (tx *Transaction) getAttrViewBoundNodes(attrView *av.AttributeView) (trees map[string]*parse.Tree, nodes []*ast.Node) {
	blockKeyValues := attrView.GetBlockKeyValues()
	trees = map[string]*parse.Tree{}
	for _, blockKeyValue := range blockKeyValues.Values {
		if blockKeyValue.IsDetached {
			continue
		}

		var tree *parse.Tree
		tree = trees[blockKeyValue.Block.ID]
		if nil == tree {
			if nil == tx {
				tree, _ = LoadTreeByBlockID(blockKeyValue.Block.ID)
			} else {
				tree, _ = tx.loadTree(blockKeyValue.Block.ID)
			}
		}
		if nil == tree {
			continue
		}
		trees[blockKeyValue.Block.ID] = tree

		node := treenode.GetNodeInTree(tree, blockKeyValue.Block.ID)
		if nil == node {
			continue
		}

		nodes = append(nodes, node)
	}
	return
}

func (tx *Transaction) doSetAttrViewFilters(operation *Operation) (ret *TxErr) {
	err := setAttributeViewFilters(operation)
	if err != nil {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func setAttributeViewFilters(operation *Operation) (err error) {
	attrView, err := av.ParseAttributeView(operation.AvID)
	if err != nil {
		return
	}

	view, err := getAttrViewViewByBlockID(attrView, operation.BlockID)
	if err != nil {
		return
	}

	operationData := operation.Data.([]interface{})
	data, err := gulu.JSON.MarshalJSON(operationData)
	if err != nil {
		return
	}

	if err = gulu.JSON.UnmarshalJSON(data, &view.Filters); err != nil {
		return
	}

	err = av.SaveAttributeView(attrView)
	return
}

func (tx *Transaction) doSetAttrViewSorts(operation *Operation) (ret *TxErr) {
	err := setAttributeViewSorts(operation)
	if err != nil {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func setAttributeViewSorts(operation *Operation) (err error) {
	attrView, err := av.ParseAttributeView(operation.AvID)
	if err != nil {
		return
	}

	view, err := getAttrViewViewByBlockID(attrView, operation.BlockID)
	if err != nil {
		return
	}

	operationData := operation.Data.([]interface{})
	data, err := gulu.JSON.MarshalJSON(operationData)
	if err != nil {
		return
	}

	if err = gulu.JSON.UnmarshalJSON(data, &view.Sorts); err != nil {
		return
	}

	err = av.SaveAttributeView(attrView)
	return
}

func (tx *Transaction) doSetAttrViewPageSize(operation *Operation) (ret *TxErr) {
	err := setAttributeViewPageSize(operation)
	if err != nil {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func setAttributeViewPageSize(operation *Operation) (err error) {
	attrView, err := av.ParseAttributeView(operation.AvID)
	if err != nil {
		return
	}

	view, err := getAttrViewViewByBlockID(attrView, operation.BlockID)
	if err != nil {
		return
	}

	view.PageSize = int(operation.Data.(float64))

	err = av.SaveAttributeView(attrView)
	return
}

func (tx *Transaction) doSetAttrViewColCalc(operation *Operation) (ret *TxErr) {
	err := setAttributeViewColumnCalc(operation)
	if err != nil {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func setAttributeViewColumnCalc(operation *Operation) (err error) {
	attrView, err := av.ParseAttributeView(operation.AvID)
	if err != nil {
		return
	}

	view, err := getAttrViewViewByBlockID(attrView, operation.BlockID)
	if err != nil {
		return
	}

	operationData := operation.Data.(interface{})
	data, err := gulu.JSON.MarshalJSON(operationData)
	if err != nil {
		return
	}

	calc := &av.FieldCalc{}
	switch view.LayoutType {
	case av.LayoutTypeTable:
		if err = gulu.JSON.UnmarshalJSON(data, calc); err != nil {
			return
		}

		for _, column := range view.Table.Columns {
			if column.ID == operation.ID {
				column.Calc = calc
				break
			}
		}
	case av.LayoutTypeGallery, av.LayoutTypeKanban:
		return
	}

	err = av.SaveAttributeView(attrView)
	return
}
