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
	"github.com/lonelyor/sourceflow/kernel/av"
	"github.com/lonelyor/sourceflow/kernel/sql"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
)

func (tx *Transaction) doSortAttrViewGroup(operation *Operation) (ret *TxErr) {
	if err := sortAttributeViewGroup(operation.AvID, operation.BlockID, operation.PreviousID, operation.ID); nil != err {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func sortAttributeViewGroup(avID, blockID, previousGroupID, groupID string) (err error) {
	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		logging.LogErrorf("parse attribute view [%s] failed: %s", avID, err)
		return
	}

	view, err := getAttrViewViewByBlockID(attrView, blockID)
	if err != nil {
		return err
	}

	sortGroupViews(attrView, view)

	var groupView *av.View
	var index, previousIndex int
	for i, g := range view.Groups {
		if g.ID == groupID {
			groupView = g
			index = i
			break
		}
	}
	if nil == groupView {
		return
	}
	view.Group.Order = av.GroupOrderMan

	view.Groups = append(view.Groups[:index], view.Groups[index+1:]...)
	for i, g := range view.Groups {
		if g.ID == previousGroupID {
			previousIndex = i + 1
			break
		}
	}
	view.Groups = util.InsertElem(view.Groups, previousIndex, groupView)

	for i, g := range view.Groups {
		g.GroupSort = i
	}

	err = av.SaveAttributeView(attrView)
	return
}

func (tx *Transaction) doRemoveAttrViewGroup(operation *Operation) (ret *TxErr) {
	if err := removeAttributeViewGroup(operation.AvID, operation.BlockID); nil != err {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func removeAttributeViewGroup(avID, blockID string) (err error) {
	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		return err
	}

	view, err := getAttrViewViewByBlockID(attrView, blockID)
	if err != nil {
		return err
	}

	removeAttributeViewGroup0(view)
	err = av.SaveAttributeView(attrView)
	if err != nil {
		logging.LogErrorf("save attribute view [%s] failed: %s", avID, err)
		return err
	}
	return nil
}

func removeAttributeViewGroup0(view *av.View) {
	view.Group, view.Groups, view.GroupCreated = nil, nil, 0
}

func (tx *Transaction) doSyncAttrViewTableColWidth(operation *Operation) (ret *TxErr) {
	err := syncAttrViewTableColWidth(operation)
	if err != nil {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func syncAttrViewTableColWidth(operation *Operation) (err error) {
	attrView, err := av.ParseAttributeView(operation.AvID)
	if err != nil {
		return
	}

	view := attrView.GetView(operation.ID)
	if nil == view {
		err = av.ErrViewNotFound
		logging.LogErrorf("view [%s] not found in attribute view [%s]", operation.ID, operation.AvID)
		return
	}

	var width string
	switch view.LayoutType {
	case av.LayoutTypeTable:
		for _, column := range view.Table.Columns {
			if column.ID == operation.KeyID {
				width = column.Width
				break
			}
		}
	case av.LayoutTypeGallery, av.LayoutTypeKanban:
		return
	}

	for _, v := range attrView.Views {
		if av.LayoutTypeTable == v.LayoutType {
			for _, column := range v.Table.Columns {
				if column.ID == operation.KeyID {
					column.Width = width
					break
				}
			}
		}
	}

	err = av.SaveAttributeView(attrView)
	ReloadAttrView(attrView.ID)
	return
}

func (tx *Transaction) doHideAttrViewGroup(operation *Operation) (ret *TxErr) {
	if err := hideAttributeViewGroup(operation.AvID, operation.BlockID, operation.ID, int(operation.Data.(float64))); nil != err {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func hideAttributeViewGroup(avID, blockID, groupID string, hidden int) (err error) {
	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		return
	}

	view, err := getAttrViewViewByBlockID(attrView, blockID)
	if err != nil {
		return
	}

	for _, group := range view.Groups {
		if group.ID == groupID {
			group.GroupHidden = hidden
			break
		}
	}

	err = av.SaveAttributeView(attrView)
	if err != nil {
		logging.LogErrorf("save attribute view [%s] failed: %s", avID, err)
		return
	}
	return
}

func (tx *Transaction) doHideAttrViewAllGroups(operation *Operation) (ret *TxErr) {
	if err := hideAttributeViewAllGroups(operation.AvID, operation.BlockID, operation.Data.(bool)); nil != err {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func hideAttributeViewAllGroups(avID, blockID string, hidden bool) (err error) {
	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		return
	}

	view, err := getAttrViewViewByBlockID(attrView, blockID)
	if err != nil {
		return
	}

	for _, group := range view.Groups {
		if hidden {
			group.GroupHidden = 2
		} else {
			group.GroupHidden = 0
		}
	}

	err = av.SaveAttributeView(attrView)
	if err != nil {
		logging.LogErrorf("save attribute view [%s] failed: %s", avID, err)
		return
	}
	return
}

func (tx *Transaction) doFoldAttrViewGroup(operation *Operation) (ret *TxErr) {
	if err := foldAttrViewGroup(operation.AvID, operation.BlockID, operation.ID, operation.Data.(bool)); nil != err {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func foldAttrViewGroup(avID, blockID, groupID string, folded bool) (err error) {
	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		return err
	}

	view, err := getAttrViewViewByBlockID(attrView, blockID)
	if err != nil {
		return err
	}

	if !view.IsGroupView() {
		return
	}

	for _, group := range view.Groups {
		if group.ID == groupID {
			group.GroupFolded = folded
			break
		}
	}

	err = av.SaveAttributeView(attrView)
	if err != nil {
		logging.LogErrorf("save attribute view [%s] failed: %s", avID, err)
		return err
	}
	return nil
}

func (tx *Transaction) doSetAttrViewGroup(operation *Operation) (ret *TxErr) {
	data, err := gulu.JSON.MarshalJSON(operation.Data)
	if nil != err {
		logging.LogErrorf("marshal operation data failed: %s", err)
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}

	group := &av.ViewGroup{}
	if err = gulu.JSON.UnmarshalJSON(data, &group); nil != err {
		logging.LogErrorf("unmarshal operation data failed: %s", err)
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}

	if err = SetAttributeViewGroup(operation.AvID, operation.BlockID, group); nil != err {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func SetAttributeViewGroup(avID, blockID string, group *av.ViewGroup) (err error) {
	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		return err
	}

	view, err := getAttrViewViewByBlockID(attrView, blockID)
	if err != nil {
		return err
	}

	setAttributeViewGroup(attrView, view, group)

	err = av.SaveAttributeView(attrView)
	ReloadAttrView(avID)
	return
}

func setAttributeViewGroup(attrView *av.AttributeView, view *av.View, group *av.ViewGroup) {
	var oldHideEmpty, firstInit, changeGroupField bool
	if nil != view.Group {
		oldHideEmpty = view.Group.HideEmpty
		changeGroupField = group.Field != view.Group.Field
	} else {
		firstInit = true
	}

	groupStates := getAttrViewGroupStates(view)
	view.Group = group
	regenAttrViewGroups(attrView)
	setAttrViewGroupStates(view, groupStates)

	if view.Group.HideEmpty != oldHideEmpty {
		if !oldHideEmpty && view.Group.HideEmpty { // 启用隐藏空分组
			for _, g := range view.Groups {
				groupViewable := sql.RenderGroupView(attrView, view, g, "")
				// 必须经过渲染才能得到最终的条目数
				renderViewableInstance(groupViewable, view, attrView, 1, -1)
				if g.GroupHidden == 0 && 1 > groupViewable.(av.Collection).CountItems() {
					g.GroupHidden = 1
				}
			}
		}
		if oldHideEmpty && !view.Group.HideEmpty { // 禁用隐藏空分组
			for _, g := range view.Groups {
				groupViewable := sql.RenderGroupView(attrView, view, g, "")
				renderViewableInstance(groupViewable, view, attrView, 1, -1)
				if g.GroupHidden == 1 && 1 > groupViewable.(av.Collection).CountItems() {
					g.GroupHidden = 0
				}
			}
		}
	}

	if firstInit || changeGroupField { // 首次设置分组时
		if groupKey := view.GetGroupKey(attrView); nil != groupKey {
			if av.KeyTypeSelect == groupKey.Type || av.KeyTypeMSelect == groupKey.Type {
				// 如果分组字段是单选或多选，则将分组排序方式改为按选项排序 https://github.com/lonelyor/SourceFlow/issues/15534
				view.Group.Order = av.GroupOrderSelectOption
				sortGroupsBySelectOption(view, groupKey)
			} else if av.KeyTypeCheckbox == groupKey.Type {
				// 如果分组字段是复选框，则将分组排序改为手动排序，并且已勾选在前面
				view.Group.Order = av.GroupOrderMan
				checked := view.GetGroupByGroupValue(av.CheckboxCheckedStr)
				unchecked := view.GetGroupByGroupValue("")
				view.Groups = nil
				view.Groups = append(view.Groups, checked, unchecked)
			}

		}

		for i, g := range view.Groups {
			g.GroupSort = i
		}
	}
}
