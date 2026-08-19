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
	"strings"
	"time"

	"github.com/lonelyor/sourceflow/kernel/av"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
)

func (tx *Transaction) doSetAttrViewColDateFillCreated(operation *Operation) (ret *TxErr) {
	err := setAttributeViewColDateFillCreated(operation)
	if err != nil {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func setAttributeViewColDateFillCreated(operation *Operation) (err error) {
	attrView, err := av.ParseAttributeView(operation.AvID)
	if err != nil {
		return
	}

	keyID := operation.ID
	key, _ := attrView.GetKey(keyID)
	if nil == key || av.KeyTypeDate != key.Type {
		return
	}

	if nil == key.Date {
		key.Date = &av.Date{}
	}

	key.Date.AutoFillNow = operation.Data.(bool)
	err = av.SaveAttributeView(attrView)
	return
}

func (tx *Transaction) doSetAttrViewColDateFillSpecificTime(operation *Operation) (ret *TxErr) {
	err := setAttrViewColDateFillSpecificTime(operation)
	if err != nil {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func setAttrViewColDateFillSpecificTime(operation *Operation) (err error) {
	attrView, err := av.ParseAttributeView(operation.AvID)
	if err != nil {
		return
	}

	keyID := operation.ID
	dateValues, _ := attrView.GetKeyValues(keyID)
	if nil == dateValues || av.KeyTypeDate != dateValues.Key.Type {
		return
	}

	if nil == dateValues.Key.Date {
		dateValues.Key.Date = &av.Date{}
	}

	dateValues.Key.Date.FillSpecificTime = operation.Data.(bool)
	for _, v := range dateValues.Values {
		if !v.IsEmpty() {
			continue
		}
		if nil == v.Date {
			v.Date = &av.ValueDate{}
		}
		v.Date.IsNotTime = !dateValues.Key.Date.FillSpecificTime
	}

	err = av.SaveAttributeView(attrView)
	return
}

func (tx *Transaction) doSetAttrViewCreatedIncludeTime(operation *Operation) (ret *TxErr) {
	err := setAttrViewCreatedIncludeTime(operation)
	if err != nil {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func setAttrViewCreatedIncludeTime(operation *Operation) (err error) {
	attrView, err := av.ParseAttributeView(operation.AvID)
	if err != nil {
		return
	}

	key, _ := attrView.GetKey(operation.ID)
	if nil == key {
		return
	}

	if nil == key.Created {
		key.Created = &av.Created{}
	}

	key.Created.IncludeTime = operation.Data.(bool)
	err = av.SaveAttributeView(attrView)
	return
}

func (tx *Transaction) doSetAttrViewUpdatedIncludeTime(operation *Operation) (ret *TxErr) {
	err := setAttrViewUpdatedIncludeTime(operation)
	if err != nil {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func setAttrViewUpdatedIncludeTime(operation *Operation) (err error) {
	attrView, err := av.ParseAttributeView(operation.AvID)
	if err != nil {
		return
	}

	key, _ := attrView.GetKey(operation.ID)
	if nil == key {
		return
	}

	if nil == key.Updated {
		key.Updated = &av.Updated{}
	}

	key.Updated.IncludeTime = operation.Data.(bool)
	err = av.SaveAttributeView(attrView)
	return
}

func (tx *Transaction) doHideAttrViewName(operation *Operation) (ret *TxErr) {
	err := hideAttrViewName(operation)
	if err != nil {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func hideAttrViewName(operation *Operation) (err error) {
	attrView, err := av.ParseAttributeView(operation.AvID)
	if err != nil {
		logging.LogErrorf("parse attribute view [%s] failed: %s", operation.AvID, err)
		return
	}

	view, err := getAttrViewViewByBlockID(attrView, operation.BlockID)
	if nil == view {
		logging.LogErrorf("get view [%s] failed: %s", operation.BlockID, err)
		return
	}

	view.HideAttrViewName = operation.Data.(bool)
	err = av.SaveAttributeView(attrView)
	return
}

func (tx *Transaction) doUpdateAttrViewColRollup(operation *Operation) (ret *TxErr) {
	err := updateAttributeViewColRollup(operation)
	if err != nil {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func updateAttributeViewColRollup(operation *Operation) (err error) {
	// operation.AvID 汇总字段所在 av
	// operation.ID 汇总字段 ID
	// operation.ParentID 汇总字段基于的关联字段 ID
	// operation.KeyID 目标字段 ID
	// operation.Data 计算方式

	attrView, err := av.ParseAttributeView(operation.AvID)
	if err != nil {
		return
	}

	rollUpKey, _ := attrView.GetKey(operation.ID)
	if nil == rollUpKey {
		return
	}

	rollUpKey.Rollup = &av.Rollup{
		RelationKeyID: operation.ParentID,
		KeyID:         operation.KeyID,
	}

	if nil == operation.Data {
		return
	}

	data := operation.Data.(map[string]interface{})
	if nil != data["calc"] {
		calcData, jsonErr := gulu.JSON.MarshalJSON(data["calc"])
		if nil != jsonErr {
			err = jsonErr
			return
		}
		if jsonErr = gulu.JSON.UnmarshalJSON(calcData, &rollUpKey.Rollup.Calc); nil != jsonErr {
			err = jsonErr
			return
		}
	}

	// 如果存在该汇总字段的过滤条件，则移除该过滤条件 https://github.com/lonelyor/SourceFlow/issues/15660
	for _, view := range attrView.Views {
		for i, filter := range view.Filters {
			if filter.Column != rollUpKey.ID {
				continue
			}

			view.Filters = append(view.Filters[:i], view.Filters[i+1:]...)
		}
	}

	err = av.SaveAttributeView(attrView)
	return
}

func (tx *Transaction) doUpdateAttrViewColRelation(operation *Operation) (ret *TxErr) {
	err := updateAttributeViewColRelation(operation)
	if err != nil {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func updateAttributeViewColRelation(operation *Operation) (err error) {
	// operation.AvID 源 avID
	// operation.ID 目标 avID
	// operation.KeyID 源 av 关联字段 ID
	// operation.IsTwoWay 是否双向关联
	// operation.BackRelationKeyID 双向关联的目标关联字段 ID
	// operation.Name 双向关联的目标关联字段名称
	// operation.Format 源 av 关联字段名称

	srcAv, err := av.ParseAttributeView(operation.AvID)
	if err != nil {
		return
	}

	destAv, err := av.ParseAttributeView(operation.ID)
	if err != nil {
		return
	}

	isSameAv := srcAv.ID == destAv.ID
	if isSameAv {
		destAv = srcAv
	}

	for _, keyValues := range srcAv.KeyValues {
		if keyValues.Key.ID != operation.KeyID {
			continue
		}

		srcRel := keyValues.Key.Relation
		// 已经设置过双向关联的话需要先断开双向关联
		if nil != srcRel {
			if srcRel.IsTwoWay {
				oldDestAv, _ := av.ParseAttributeView(srcRel.AvID)
				if nil != oldDestAv {
					isOldSameAv := oldDestAv.ID == destAv.ID
					if isOldSameAv {
						oldDestAv = destAv
					}

					oldDestKey, _ := oldDestAv.GetKey(srcRel.BackKeyID)
					if nil != oldDestKey && nil != oldDestKey.Relation && oldDestKey.Relation.AvID == srcAv.ID && oldDestKey.Relation.IsTwoWay {
						oldDestKey.Relation.IsTwoWay = false
						oldDestKey.Relation.BackKeyID = ""
					}

					if !isOldSameAv {
						err = av.SaveAttributeView(oldDestAv)
						if err != nil {
							return
						}
					}
				}
			}

			av.RemoveAvRel(srcAv.ID, srcRel.AvID)
		}

		srcRel = &av.Relation{
			AvID:     operation.ID,
			IsTwoWay: operation.IsTwoWay,
		}
		if operation.IsTwoWay {
			srcRel.BackKeyID = operation.BackRelationKeyID
		} else {
			srcRel.BackKeyID = ""
		}
		keyValues.Key.Relation = srcRel
		keyValues.Key.Name = operation.Format

		break
	}

	destAdded := false
	backRelKey, _ := destAv.GetKey(operation.BackRelationKeyID)
	if nil != backRelKey {
		backRelKey.Relation = &av.Relation{
			AvID:      operation.AvID,
			IsTwoWay:  operation.IsTwoWay,
			BackKeyID: operation.KeyID,
		}
		destAdded = true
		if operation.IsTwoWay {
			name := strings.TrimSpace(operation.Name)
			if "" == name {
				name = srcAv.Name + " " + operation.Format
			}
			backRelKey.Name = strings.TrimSpace(name)
		} else {
			backRelKey.Relation.BackKeyID = ""
		}
	}

	if !destAdded && operation.IsTwoWay {
		// 新建双向关联目标字段
		name := strings.TrimSpace(operation.Name)
		if "" == name {
			name = srcAv.Name + " " + operation.Format
			name = strings.TrimSpace(name)
		}

		destKeyValues := &av.KeyValues{
			Key: &av.Key{
				ID:       operation.BackRelationKeyID,
				Name:     name,
				Type:     av.KeyTypeRelation,
				Relation: &av.Relation{AvID: operation.AvID, IsTwoWay: operation.IsTwoWay, BackKeyID: operation.KeyID},
			},
		}
		destAv.KeyValues = append(destAv.KeyValues, destKeyValues)

		for _, v := range destAv.Views {
			switch v.LayoutType {
			case av.LayoutTypeTable:
				v.Table.Columns = append(v.Table.Columns, &av.ViewTableColumn{BaseField: &av.BaseField{ID: operation.BackRelationKeyID}})
			case av.LayoutTypeGallery:
				v.Gallery.CardFields = append(v.Gallery.CardFields, &av.ViewGalleryCardField{BaseField: &av.BaseField{ID: operation.BackRelationKeyID}})
			case av.LayoutTypeKanban:
				v.Kanban.Fields = append(v.Kanban.Fields, &av.ViewKanbanField{BaseField: &av.BaseField{ID: operation.BackRelationKeyID}})
			}
		}

		now := time.Now().UnixMilli()
		// 和现有值进行关联
		for _, keyValues := range srcAv.KeyValues {
			if keyValues.Key.ID != operation.KeyID {
				continue
			}

			for _, srcVal := range keyValues.Values {
				for _, blockID := range srcVal.Relation.BlockIDs {
					destVal := destAv.GetValue(destKeyValues.Key.ID, blockID)
					if nil == destVal {
						destVal = &av.Value{ID: ast.NewNodeID(), KeyID: destKeyValues.Key.ID, BlockID: blockID, Type: keyValues.Key.Type, Relation: &av.ValueRelation{}, CreatedAt: now, UpdatedAt: now + 1000}
					} else {
						destVal.Type = keyValues.Key.Type
						if nil == destVal.Relation {
							destVal.Relation = &av.ValueRelation{}
						}
						destVal.UpdatedAt = now
						destVal.IsRenderAutoFill = false
					}
					destVal.Relation.BlockIDs = append(destVal.Relation.BlockIDs, srcVal.BlockID)
					destVal.Relation.BlockIDs = gulu.Str.RemoveDuplicatedElem(destVal.Relation.BlockIDs)
					destKeyValues.Values = append(destKeyValues.Values, destVal)
				}
			}
		}
	}

	regenAttrViewGroups(srcAv)
	err = av.SaveAttributeView(srcAv)
	if err != nil {
		return
	}
	if !isSameAv {
		regenAttrViewGroups(destAv)
		err = av.SaveAttributeView(destAv)
		ReloadAttrView(destAv.ID)
	}

	av.UpsertAvBackRel(srcAv.ID, destAv.ID)
	if operation.IsTwoWay && !isSameAv {
		av.UpsertAvBackRel(destAv.ID, srcAv.ID)
	}
	return
}
