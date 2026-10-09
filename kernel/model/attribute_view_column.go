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

	"github.com/lonelyor/sourceflow/kernel/av"
)

func (tx *Transaction) doAddAttrViewColumn(operation *Operation) (ret *TxErr) {
	var icon string
	if nil != operation.Data {
		icon = operation.Data.(string)
	}
	err := AddAttributeViewKey(operation.AvID, operation.ID, operation.Name, operation.Typ, icon, operation.PreviousID)

	if err != nil {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func AddAttributeViewKey(avID, keyID, keyName, keyType, keyIcon, previousKeyID string) (err error) {
	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		return
	}

	currentView, err := attrView.GetCurrentView(attrView.ViewID)
	if nil != err {
		return
	}

	keyTyp := av.KeyType(keyType)
	switch keyTyp {
	case av.KeyTypeText, av.KeyTypeNumber, av.KeyTypeDate, av.KeyTypeSelect, av.KeyTypeMSelect, av.KeyTypeURL, av.KeyTypeEmail,
		av.KeyTypePhone, av.KeyTypeMAsset, av.KeyTypeTemplate, av.KeyTypeCreated, av.KeyTypeUpdated, av.KeyTypeCheckbox,
		av.KeyTypeRelation, av.KeyTypeRollup, av.KeyTypeLineNumber:

		key := av.NewKey(keyID, keyName, keyIcon, keyTyp)
		if av.KeyTypeRollup == keyTyp {
			key.Rollup = &av.Rollup{Calc: &av.RollupCalc{Operator: av.CalcOperatorNone}}
		}

		attrView.KeyValues = append(attrView.KeyValues, &av.KeyValues{Key: key})

		for _, view := range attrView.Views {
			newField := &av.BaseField{ID: key.ID}
			if nil != view.Table {
				newField.Wrap = view.Table.WrapField

				if "" == previousKeyID {
					if av.LayoutTypeGallery == currentView.LayoutType || av.LayoutTypeKanban == currentView.LayoutType {
						// 如果当前视图是卡片或看板视图则添加到最后
						view.Table.Columns = append(view.Table.Columns, &av.ViewTableColumn{BaseField: newField})
					} else {
						view.Table.Columns = append([]*av.ViewTableColumn{{BaseField: newField}}, view.Table.Columns...)
					}
				} else {
					added := false
					for i, column := range view.Table.Columns {
						if column.ID == previousKeyID {
							view.Table.Columns = append(view.Table.Columns[:i+1], append([]*av.ViewTableColumn{{BaseField: newField}}, view.Table.Columns[i+1:]...)...)
							added = true
							break
						}
					}
					if !added {
						view.Table.Columns = append(view.Table.Columns, &av.ViewTableColumn{BaseField: newField})
					}
				}
			}

			if nil != view.Gallery {
				newField.Wrap = view.Gallery.WrapField

				if "" == previousKeyID {
					view.Gallery.CardFields = append(view.Gallery.CardFields, &av.ViewGalleryCardField{BaseField: newField})
				} else {
					added := false
					for i, field := range view.Gallery.CardFields {
						if field.ID == previousKeyID {
							view.Gallery.CardFields = append(view.Gallery.CardFields[:i+1], append([]*av.ViewGalleryCardField{{BaseField: newField}}, view.Gallery.CardFields[i+1:]...)...)
							added = true
							break
						}
					}
					if !added {
						view.Gallery.CardFields = append(view.Gallery.CardFields, &av.ViewGalleryCardField{BaseField: newField})
					}
				}
			}

			if nil != view.Kanban {
				newField.Wrap = view.Kanban.WrapField

				if "" == previousKeyID {
					view.Kanban.Fields = append(view.Kanban.Fields, &av.ViewKanbanField{BaseField: newField})
				} else {
					added := false
					for i, field := range view.Kanban.Fields {
						if field.ID == previousKeyID {
							view.Kanban.Fields = append(view.Kanban.Fields[:i+1], append([]*av.ViewKanbanField{{BaseField: newField}}, view.Kanban.Fields[i+1:]...)...)
							added = true
							break
						}
					}
					if !added {
						view.Kanban.Fields = append(view.Kanban.Fields, &av.ViewKanbanField{BaseField: newField})
					}
				}
			}
		}
	}

	err = av.SaveAttributeView(attrView)
	return
}

func (tx *Transaction) doUpdateAttrViewColTemplate(operation *Operation) (ret *TxErr) {
	err := updateAttributeViewColTemplate(operation)
	if err != nil {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func updateAttributeViewColTemplate(operation *Operation) (err error) {
	attrView, err := av.ParseAttributeView(operation.AvID)
	if err != nil {
		return
	}

	colType := av.KeyType(operation.Typ)
	switch colType {
	case av.KeyTypeTemplate:
		for _, keyValues := range attrView.KeyValues {
			if keyValues.Key.ID == operation.ID && av.KeyTypeTemplate == keyValues.Key.Type {
				keyValues.Key.Template = operation.Data.(string)
				break
			}
		}
	}

	regenAttrViewGroups(attrView)
	err = av.SaveAttributeView(attrView)
	return
}

func (tx *Transaction) doUpdateAttrViewColNumberFormat(operation *Operation) (ret *TxErr) {
	err := updateAttributeViewColNumberFormat(operation)
	if err != nil {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func updateAttributeViewColNumberFormat(operation *Operation) (err error) {
	attrView, err := av.ParseAttributeView(operation.AvID)
	if err != nil {
		return
	}

	colType := av.KeyType(operation.Typ)
	switch colType {
	case av.KeyTypeNumber:
		for _, keyValues := range attrView.KeyValues {
			if keyValues.Key.ID == operation.ID && av.KeyTypeNumber == keyValues.Key.Type {
				keyValues.Key.NumberFormat = av.NumberFormat(operation.Format)
				break
			}
		}
	}

	err = av.SaveAttributeView(attrView)
	return
}

func (tx *Transaction) doUpdateAttrViewColumn(operation *Operation) (ret *TxErr) {
	err := updateAttributeViewColumn(operation)
	if err != nil {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func updateAttributeViewColumn(operation *Operation) (err error) {
	attrView, err := av.ParseAttributeView(operation.AvID)
	if err != nil {
		return
	}

	colType := av.KeyType(operation.Typ)
	changeType := false
	switch colType {
	case av.KeyTypeBlock, av.KeyTypeText, av.KeyTypeNumber, av.KeyTypeDate, av.KeyTypeSelect, av.KeyTypeMSelect, av.KeyTypeURL, av.KeyTypeEmail,
		av.KeyTypePhone, av.KeyTypeMAsset, av.KeyTypeTemplate, av.KeyTypeCreated, av.KeyTypeUpdated, av.KeyTypeCheckbox,
		av.KeyTypeRelation, av.KeyTypeRollup, av.KeyTypeLineNumber:
		for _, keyValues := range attrView.KeyValues {
			if keyValues.Key.ID == operation.ID {
				keyValues.Key.Name = strings.TrimSpace(operation.Name)

				changeType = keyValues.Key.Type != colType
				keyValues.Key.Type = colType

				for _, value := range keyValues.Values {
					value.Type = colType
				}

				break
			}
		}
	}

	if changeType {
		for _, view := range attrView.Views {
			if nil != view.Group {
				if groupKey := view.GetGroupKey(attrView); nil != groupKey && groupKey.ID == operation.ID {
					removeAttributeViewGroup0(view)
				}
			}
		}
	}

	if err = av.SaveAttributeView(attrView); nil != err {
		return
	}

	if changeType {
		relatedAvIDs := av.GetSrcAvIDs(attrView.ID)
		for _, relatedAvID := range relatedAvIDs {
			destAv, _ := av.ParseAttributeView(relatedAvID)
			if nil == destAv {
				continue
			}

			for _, keyValues := range destAv.KeyValues {
				if av.KeyTypeRollup == keyValues.Key.Type && keyValues.Key.Rollup.KeyID == operation.ID {
					// 置空关联过来的汇总
					for _, val := range keyValues.Values {
						val.Rollup.Contents = nil
					}
					keyValues.Key.Rollup.Calc = &av.RollupCalc{Operator: av.CalcOperatorNone}
				}
			}

			regenAttrViewGroups(destAv)
			av.SaveAttributeView(destAv)
			ReloadAttrView(destAv.ID)
		}
	}
	return
}

func (tx *Transaction) doRemoveAttrViewColumn(operation *Operation) (ret *TxErr) {
	err := RemoveAttributeViewKey(operation.AvID, operation.ID, operation.RemoveDest)
	if err != nil {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func RemoveAttributeViewKey(avID, keyID string, removeRelationDest bool) (err error) {
	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		return
	}

	var removedKey *av.Key
	for i, keyValues := range attrView.KeyValues {
		if keyValues.Key.ID == keyID {
			attrView.KeyValues = append(attrView.KeyValues[:i], attrView.KeyValues[i+1:]...)
			removedKey = keyValues.Key
			break
		}
	}

	if nil != removedKey && av.KeyTypeRelation == removedKey.Type && nil != removedKey.Relation {
		if removedKey.Relation.IsTwoWay {
			var destAv *av.AttributeView
			if avID == removedKey.Relation.AvID {
				destAv = attrView
			} else {
				destAv, _ = av.ParseAttributeView(removedKey.Relation.AvID)
			}

			if nil != destAv {
				oldDestKey, _ := destAv.GetKey(removedKey.Relation.BackKeyID)
				if nil != oldDestKey && nil != oldDestKey.Relation && oldDestKey.Relation.AvID == attrView.ID && oldDestKey.Relation.IsTwoWay {
					oldDestKey.Relation.IsTwoWay = false
					oldDestKey.Relation.BackKeyID = ""
				}

				destAvRelSrcAv := false
				for i, keyValues := range destAv.KeyValues {
					if keyValues.Key.ID == removedKey.Relation.BackKeyID {
						if removeRelationDest { // 删除双向关联的目标字段
							destAv.KeyValues = append(destAv.KeyValues[:i], destAv.KeyValues[i+1:]...)
						}
						continue
					}

					if av.KeyTypeRelation == keyValues.Key.Type && keyValues.Key.Relation.AvID == attrView.ID {
						destAvRelSrcAv = true
					}
				}

				if removeRelationDest {
					for _, view := range destAv.Views {
						switch view.LayoutType {
						case av.LayoutTypeTable:
							for i, column := range view.Table.Columns {
								if column.ID == removedKey.Relation.BackKeyID {
									view.Table.Columns = append(view.Table.Columns[:i], view.Table.Columns[i+1:]...)
									break
								}
							}
						case av.LayoutTypeGallery:
							for i, field := range view.Gallery.CardFields {
								if field.ID == removedKey.Relation.BackKeyID {
									view.Gallery.CardFields = append(view.Gallery.CardFields[:i], view.Gallery.CardFields[i+1:]...)
									break
								}
							}
						case av.LayoutTypeKanban:
							for i, field := range view.Kanban.Fields {
								if field.ID == removedKey.Relation.BackKeyID {
									view.Kanban.Fields = append(view.Kanban.Fields[:i], view.Kanban.Fields[i+1:]...)
									break
								}
							}
						}
					}
				}

				if destAv != attrView {
					av.SaveAttributeView(destAv)
					ReloadAttrView(destAv.ID)
				}

				if !destAvRelSrcAv {
					av.RemoveAvRel(destAv.ID, attrView.ID)
				}
			}

			srcAvRelDestAv := false
			for _, keyValues := range attrView.KeyValues {
				if av.KeyTypeRelation == keyValues.Key.Type && nil != keyValues.Key.Relation && keyValues.Key.Relation.AvID == removedKey.Relation.AvID {
					srcAvRelDestAv = true
				}
			}
			if !srcAvRelDestAv {
				av.RemoveAvRel(attrView.ID, removedKey.Relation.AvID)
			}
		}
	}

	for _, view := range attrView.Views {
		if nil != view.Table {
			for i, column := range view.Table.Columns {
				if column.ID == keyID {
					view.Table.Columns = append(view.Table.Columns[:i], view.Table.Columns[i+1:]...)
					break
				}
			}
		}

		if nil != view.Gallery {
			for i, field := range view.Gallery.CardFields {
				if field.ID == keyID {
					view.Gallery.CardFields = append(view.Gallery.CardFields[:i], view.Gallery.CardFields[i+1:]...)
					break
				}
			}
		}

		if nil != view.Kanban {
			for i, field := range view.Kanban.Fields {
				if field.ID == keyID {
					view.Kanban.Fields = append(view.Kanban.Fields[:i], view.Kanban.Fields[i+1:]...)
					break
				}
			}
		}
	}

	for _, view := range attrView.Views {
		if nil != view.Group {
			if groupKey := view.GetGroupKey(attrView); nil != groupKey && groupKey.ID == keyID {
				removeAttributeViewGroup0(view)
			}
		}
	}

	if err = av.SaveAttributeView(attrView); nil != err {
		return
	}

	relatedAvIDs := av.GetSrcAvIDs(avID)
	for _, relatedAvID := range relatedAvIDs {
		destAv, _ := av.ParseAttributeView(relatedAvID)
		if nil == destAv {
			continue
		}

		for _, keyValues := range destAv.KeyValues {
			if av.KeyTypeRollup == keyValues.Key.Type && keyValues.Key.Rollup.KeyID == keyID {
				// 置空关联过来的汇总
				for _, val := range keyValues.Values {
					val.Rollup.Contents = nil
				}
			}
		}

		regenAttrViewGroups(destAv)
		av.SaveAttributeView(destAv)
		ReloadAttrView(destAv.ID)
	}
	return
}
