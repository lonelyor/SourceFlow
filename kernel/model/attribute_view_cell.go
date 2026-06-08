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
	"fmt"
	"math/rand"
	"slices"
	"strings"
	"time"

	"github.com/lonelyor/sourceflow/kernel/av"
	"github.com/lonelyor/sourceflow/kernel/treenode"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
	"github.com/lonelyor/sourceflow/third_party/go/lute/parse"
)

func (tx *Transaction) doReplaceAttrViewBlock(operation *Operation) (ret *TxErr) {
	err := replaceAttributeViewBlock(operation.AvID, operation.PreviousID, operation.NextID, operation.IsDetached, tx)
	if err != nil {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID}
	}
	return
}

func replaceAttributeViewBlock(avID, oldBlockID, newBlockID string, isDetached bool, tx *Transaction) (err error) {
	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		return
	}

	if err = replaceAttributeViewBlock0(attrView, oldBlockID, newBlockID, isDetached, tx); nil != err {
		return
	}

	if err = av.SaveAttributeView(attrView); nil != err {
		return
	}
	return
}

func replaceAttributeViewBlock0(attrView *av.AttributeView, oldBlockID, newNodeID string, isDetached bool, tx *Transaction) (err error) {
	avID := attrView.ID
	var tree *parse.Tree
	var node *ast.Node
	if !isDetached {
		node, tree, _ = getNodeByBlockID(tx, newNodeID)
	}

	now := util.CurrentTimeMillis()
	// 检查是否已经存在绑定块，如果存在的话则重新绑定
	for _, blockVal := range attrView.GetBlockKeyValues().Values {
		if !isDetached && blockVal.Block.ID == newNodeID && nil != node && nil != tree {
			bindBlockAv0(tx, avID, node, tree)
			blockVal.IsDetached = false
			icon, content := getNodeAvBlockText(node, "")
			content = util.UnescapeHTML(content)
			blockVal.Block.Icon, blockVal.Block.Content = icon, content
			blockVal.UpdatedAt = now
			regenAttrViewGroups(attrView)
			return
		}
	}

	for _, blockVal := range attrView.GetBlockKeyValues().Values {
		if blockVal.BlockID != oldBlockID {
			continue
		}

		if av.KeyTypeBlock == blockVal.Type {
			blockVal.IsDetached = isDetached
			if !isDetached {
				if "" != blockVal.Block.ID && blockVal.Block.ID != newNodeID {
					unbindBlockAv(tx, avID, blockVal.Block.ID)
				}
				bindBlockAv(tx, avID, newNodeID)

				blockVal.Block.ID = newNodeID
				icon, content := getNodeAvBlockText(node, "")
				content = util.UnescapeHTML(content)
				blockVal.Block.Icon, blockVal.Block.Content = icon, content

				refreshRelatedSrcAvs(avID, tx)
			} else {
				blockVal.Block.ID = ""
			}
		}
	}

	regenAttrViewGroups(attrView)
	return
}

func BatchReplaceAttributeViewBlocks(avID string, isDetached bool, oldNew []map[string]string) (err error) {
	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		return
	}

	for _, oldNewMap := range oldNew {
		for oldBlockID, newNodeID := range oldNewMap {
			if err = replaceAttributeViewBlock0(attrView, oldBlockID, newNodeID, isDetached, nil); nil != err {
				return
			}
		}
	}

	if err = av.SaveAttributeView(attrView); nil != err {
		return
	}
	return
}

func (tx *Transaction) doUpdateAttrViewCell(operation *Operation) (ret *TxErr) {
	_, err := UpdateAttributeViewCell(tx, operation.AvID, operation.KeyID, operation.RowID, operation.Data)
	if err != nil {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func BatchUpdateAttributeViewCells(tx *Transaction, avID string, values []interface{}) (err error) {
	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		return
	}

	for _, value := range values {
		v := value.(map[string]interface{})
		keyID := v["keyID"].(string)
		var itemID string
		if _, ok := v["itemID"]; ok {
			itemID = v["itemID"].(string)
		} else if _, ok := v["rowID"]; ok {
			// TODO 计划于 2026 年 6 月 30 日后删除 https://github.com/lonelyor/SourceFlow/issues/15708#issuecomment-3239694546
			itemID = v["rowID"].(string)
			logging.LogWarnf("[%s] parameter [%s] is deprecated, it will be removed at [%s], visit [https://github.com/lonelyor/SourceFlow/issues/15727] for details",
				"/api/av/batchSetAttributeViewBlockAttrs", "rowID", "2026-06-30")
		}
		valueData := v["value"]
		_, err = updateAttributeViewValue(tx, attrView, keyID, itemID, valueData)
		if err != nil {
			return
		}
	}
	return
}

func UpdateAttributeViewCell(tx *Transaction, avID, keyID, itemID string, valueData interface{}) (val *av.Value, err error) {
	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		return
	}

	val, err = updateAttributeViewValue(tx, attrView, keyID, itemID, valueData)
	if nil != err {
		return
	}
	return
}

func updateAttributeViewValue(tx *Transaction, attrView *av.AttributeView, keyID, itemID string, valueData interface{}) (val *av.Value, err error) {
	avID := attrView.ID
	var blockVal *av.Value
	for _, kv := range attrView.KeyValues {
		if av.KeyTypeBlock == kv.Key.Type {
			for _, v := range kv.Values {
				if itemID == v.BlockID {
					blockVal = v
					break
				}
			}
			break
		}
	}

	now := time.Now().UnixMilli()
	oldIsDetached := true
	var oldBoundBlockID string
	if nil != blockVal {
		oldIsDetached = blockVal.IsDetached
		oldBoundBlockID = blockVal.Block.ID
	}
	for _, keyValues := range attrView.KeyValues {
		if keyID != keyValues.Key.ID {
			continue
		}

		for _, value := range keyValues.Values {
			if itemID == value.BlockID {
				val = value
				val.Type = keyValues.Key.Type
				break
			}
		}

		if nil == val {
			val = &av.Value{ID: ast.NewNodeID(), KeyID: keyID, BlockID: itemID, Type: keyValues.Key.Type, CreatedAt: now, UpdatedAt: now}
			keyValues.Values = append(keyValues.Values, val)
		}
		break
	}

	isUpdatingBlockKey := av.KeyTypeBlock == val.Type
	var oldRelationBlockIDs []string
	if av.KeyTypeRelation == val.Type {
		if nil != val.Relation {
			for _, bID := range val.Relation.BlockIDs {
				oldRelationBlockIDs = append(oldRelationBlockIDs, bID)
			}
		}
	}
	data, err := gulu.JSON.MarshalJSON(valueData)
	if err != nil {
		logging.LogErrorf("marshal value [%+v] failed: %s", valueData, err)
		return
	}
	if err = gulu.JSON.UnmarshalJSON(data, &val); err != nil {
		logging.LogErrorf("unmarshal data [%s] failed: %s", data, err)
		return
	}

	key, _ := attrView.GetKey(keyID)

	if av.KeyTypeNumber == val.Type {
		if nil != val.Number {
			if !val.Number.IsNotEmpty {
				val.Number.Content = 0
				val.Number.FormattedContent = ""
			} else {
				val.Number.FormatNumber()
			}
		}
	} else if av.KeyTypeDate == val.Type {
		if nil != val.Date && !val.Date.IsNotEmpty {
			val.Date.Content = 0
			val.Date.FormattedContent = ""
		}
	} else if av.KeyTypeSelect == val.Type || av.KeyTypeMSelect == val.Type {
		if nil != key && 0 < len(val.MSelect) {
			var tmp []*av.ValueSelect
			// 移除空选项 https://github.com/lonelyor/SourceFlow/issues/15533
			for _, v := range val.MSelect {
				if "" != v.Content {
					tmp = append(tmp, v)
				}
			}
			val.MSelect = tmp

			if 1 > len(val.MSelect) {
				return
			}

			// The selection options are inconsistent after pasting data into the database https://github.com/lonelyor/SourceFlow/issues/11409
			for _, valOpt := range val.MSelect {
				if opt := key.GetOption(valOpt.Content); nil == opt {
					// 不存在的选项新建保存
					color := valOpt.Color
					if "" == color {
						color = fmt.Sprintf("%d", 1+rand.Intn(14))
					}
					opt = &av.SelectOption{Name: valOpt.Content, Color: color}
					key.Options = append(key.Options, opt)
				} else {
					// 已经存在的选项颜色需要保持不变
					valOpt.Color = opt.Color
				}
			}
		}
	}

	relationChangeMode := 0 // 0：不变（仅排序），1：增加，2：减少
	if av.KeyTypeRelation == val.Type {
		// 关联字段得 content 是自动渲染的，所以不需要保存
		val.Relation.Contents = nil
		val.Relation.BlockIDs = gulu.Str.RemoveDuplicatedElem(val.Relation.BlockIDs)

		// 计算关联变更模式
		if !slices.Equal(oldRelationBlockIDs, val.Relation.BlockIDs) {
			if len(oldRelationBlockIDs) > len(val.Relation.BlockIDs) {
				relationChangeMode = 2
			} else {
				relationChangeMode = 1
			}
		}
	}

	// val.IsDetached 只有更新主键的时候才会传入，所以下面需要结合 isUpdatingBlockKey 来判断

	if isUpdatingBlockKey {
		if oldIsDetached {
			// 之前是非绑定块

			if !val.IsDetached { // 现在绑定了块
				bindBlockAv(tx, avID, val.Block.ID)
			}
		} else {
			// 之前绑定了块

			if val.IsDetached { // 现在是非绑定块
				unbindBlockAv(tx, avID, val.Block.ID)
				val.Block.ID = ""
			} else {
				// 现在也绑定了块

				if oldBoundBlockID != val.Block.ID { // 之前绑定的块和现在绑定的块不一样
					// 换绑块
					unbindBlockAv(tx, avID, oldBoundBlockID)
					bindBlockAv(tx, avID, val.Block.ID)
					val.Block.Content = util.UnescapeHTML(val.Block.Content)
				} else { // 之前绑定的块和现在绑定的块一样
					content := strings.TrimSpace(val.Block.Content)
					node, tree, _ := getNodeByBlockID(tx, val.Block.ID)
					_, blockText := getNodeAvBlockText(node, "")
					if "" == content {
						// 使用动态锚文本
						val.Block.Content = util.UnescapeHTML(blockText)
						updateBlockValueStaticText(tx, node, tree, avID, "")
					} else {
						val.Block.Content = content
						updateBlockValueStaticText(tx, node, tree, avID, content)
					}
				}
			}
		}
	}

	if nil != blockVal {
		blockVal.Block.Updated = now
		blockVal.SetUpdatedAt(now)
		if isUpdatingBlockKey {
			blockVal.IsDetached = val.IsDetached
		}
	}
	val.SetUpdatedAt(now)

	if nil != key && av.KeyTypeRelation == key.Type && nil != key.Relation && key.Relation.IsTwoWay {
		// 双向关联需要同时更新目标字段的值
		updateTwoWayRelationDestAttrView(attrView, key, val, relationChangeMode, oldRelationBlockIDs)
	}

	regenAttrViewGroups(attrView)
	if err = av.SaveAttributeView(attrView); nil != err {
		return
	}

	refreshRelatedSrcAvs(avID, tx)
	return
}

func refreshRelatedSrcAvs(destAvID string, tx *Transaction) {
	relatedAvIDs := av.GetSrcAvIDs(destAvID)

	var tmp []string
	for _, relatedAvID := range relatedAvIDs {
		if relatedAvID == destAvID {
			// 目标和源相同则跳过
			continue
		}

		tmp = append(tmp, relatedAvID)
	}
	relatedAvIDs = tmp

	if nil != tx {
		tx.relatedAvIDs = append(tx.relatedAvIDs, relatedAvIDs...)
	} else {
		for _, relatedAvID := range relatedAvIDs {
			destAv, _ := av.ParseAttributeView(relatedAvID)
			if nil == destAv {
				continue
			}

			regenAttrViewGroups(destAv)
			av.SaveAttributeView(destAv)
			ReloadAttrView(relatedAvID)
		}
	}
}

// relationChangeMode
// 0：关联字段值不变（仅排序），不影响目标值
// 1：关联字段值增加，增加目标值
// 2：关联字段值减少，减少目标值
func updateTwoWayRelationDestAttrView(attrView *av.AttributeView, relKey *av.Key, val *av.Value, relationChangeMode int, oldRelationBlockIDs []string) {
	var destAv *av.AttributeView
	if attrView.ID == relKey.Relation.AvID {
		destAv = attrView
	} else {
		destAv, _ = av.ParseAttributeView(relKey.Relation.AvID)
	}

	if nil == destAv {
		return
	}

	now := util.CurrentTimeMillis()
	if 1 == relationChangeMode {
		addBlockIDs := val.Relation.BlockIDs
		for _, bID := range oldRelationBlockIDs {
			addBlockIDs = gulu.Str.RemoveElem(addBlockIDs, bID)
		}

		for _, blockID := range addBlockIDs {
			for _, keyValues := range destAv.KeyValues {
				if keyValues.Key.ID != relKey.Relation.BackKeyID {
					continue
				}

				destVal := keyValues.GetValue(blockID)
				if nil == destVal {
					destVal = &av.Value{ID: ast.NewNodeID(), KeyID: keyValues.Key.ID, BlockID: blockID, Type: keyValues.Key.Type, Relation: &av.ValueRelation{}, CreatedAt: now, UpdatedAt: now + 1000}
					keyValues.Values = append(keyValues.Values, destVal)
				}

				destVal.Relation.BlockIDs = append(destVal.Relation.BlockIDs, val.BlockID)
				destVal.Relation.BlockIDs = gulu.Str.RemoveDuplicatedElem(destVal.Relation.BlockIDs)
				break
			}
		}
	} else if 2 == relationChangeMode {
		removeBlockIDs := oldRelationBlockIDs
		for _, bID := range val.Relation.BlockIDs {
			removeBlockIDs = gulu.Str.RemoveElem(removeBlockIDs, bID)
		}

		for _, blockID := range removeBlockIDs {
			for _, keyValues := range destAv.KeyValues {
				if keyValues.Key.ID != relKey.Relation.BackKeyID {
					continue
				}

				for _, value := range keyValues.Values {
					if value.BlockID == blockID {
						value.Relation.BlockIDs = gulu.Str.RemoveElem(value.Relation.BlockIDs, val.BlockID)
						value.SetUpdatedAt(now)
						break
					}
				}
			}
		}
	}

	if destAv != attrView {
		regenAttrViewGroups(destAv)
		av.SaveAttributeView(destAv)
	}
}

// regenAttrViewGroups 重新生成分组视图。
func regenAttrViewGroups(attrView *av.AttributeView) {
	for _, view := range attrView.Views {
		groupKey := view.GetGroupKey(attrView)
		if nil == groupKey {
			continue
		}

		genAttrViewGroups(view, attrView)
	}
}

func unbindBlockAv(tx *Transaction, avID, nodeID string) {
	node, tree, err := getNodeByBlockID(tx, nodeID)
	if err != nil {
		return
	}

	attrs := parse.IAL2Map(node.KramdownIAL)
	if "" == attrs[av.NodeAttrNameAvs] {
		return
	}

	avIDs := strings.Split(attrs[av.NodeAttrNameAvs], ",")
	avIDs = gulu.Str.RemoveElem(avIDs, avID)
	if 0 == len(avIDs) {
		attrs[av.NodeAttrNameAvs] = ""
	} else {
		attrs[av.NodeAttrNameAvs] = strings.Join(avIDs, ",")
	}

	avNames := getAvNames(attrs[av.NodeAttrNameAvs])
	if "" != avNames {
		attrs[av.NodeAttrViewNames] = avNames
	}

	if nil != tx {
		err = setNodeAttrsWithTx(tx, node, tree, attrs)
	} else {
		err = setNodeAttrs(node, tree, attrs)
	}
	if err != nil {
		logging.LogWarnf("set node [%s] attrs failed: %s", nodeID, err)
		return
	}
	return
}

func bindBlockAv(tx *Transaction, avID, blockID string) {
	node, tree, err := getNodeByBlockID(tx, blockID)
	if err != nil {
		return
	}

	bindBlockAv0(tx, avID, node, tree)
	return
}

func bindBlockAv0(tx *Transaction, avID string, node *ast.Node, tree *parse.Tree) {
	attrs := parse.IAL2Map(node.KramdownIAL)
	if "" == attrs[av.NodeAttrNameAvs] {
		attrs[av.NodeAttrNameAvs] = avID
	} else {
		avIDs := strings.Split(attrs[av.NodeAttrNameAvs], ",")
		avIDs = append(avIDs, avID)
		avIDs = gulu.Str.RemoveDuplicatedElem(avIDs)
		attrs[av.NodeAttrNameAvs] = strings.Join(avIDs, ",")
	}

	avNames := getAvNames(attrs[av.NodeAttrNameAvs])
	if "" != avNames {
		attrs[av.NodeAttrViewNames] = avNames
	}

	var err error
	if nil != tx {
		err = setNodeAttrsWithTx(tx, node, tree, attrs)
	} else {
		err = setNodeAttrs(node, tree, attrs)
	}
	if err != nil {
		logging.LogWarnf("set node [%s] attrs failed: %s", node.ID, err)
		return
	}
	return
}

func updateBlockValueStaticText(tx *Transaction, node *ast.Node, tree *parse.Tree, avID, text string) {
	// 设置静态锚文本 Database-bound block primary key supports setting static anchor text https://github.com/lonelyor/SourceFlow/issues/10049

	if nil == node {
		return
	}

	attrs := parse.IAL2Map(node.KramdownIAL)
	av.SetNodeAttrViewStaticText(attrs, avID, text)
	var err error
	if nil != tx {
		err = setNodeAttrsWithTx(tx, node, tree, attrs)
	} else {
		err = setNodeAttrs(node, tree, attrs)
	}
	if err != nil {
		logging.LogWarnf("set node [%s] attrs failed: %s", node.ID, err)
		return
	}
}

func getNodeByBlockID(tx *Transaction, blockID string) (node *ast.Node, tree *parse.Tree, err error) {
	if nil != tx {
		tree, err = tx.loadTree(blockID)
	} else {
		tree, err = LoadTreeByBlockID(blockID)
	}
	if err != nil {
		return
	}
	node = treenode.GetNodeInTree(tree, blockID)
	if nil == node {
		logging.LogWarnf("node [%s] not found in tree [%s]", blockID, tree.ID)
		return
	}
	return
}
