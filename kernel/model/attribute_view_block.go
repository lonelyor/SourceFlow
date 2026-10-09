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
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/lonelyor/sourceflow/kernel/av"
	"github.com/lonelyor/sourceflow/kernel/sql"
	"github.com/lonelyor/sourceflow/kernel/treenode"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/filelock"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
	"github.com/lonelyor/sourceflow/third_party/go/lute/parse"
)

func (tx *Transaction) doInsertAttrViewBlock(operation *Operation) (ret *TxErr) {
	err := AddAttributeViewBlock(tx, operation.Srcs, operation.AvID, operation.BlockID, operation.ViewID, operation.GroupID, operation.PreviousID, operation.IgnoreDefaultFill)
	if err != nil {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func AddAttributeViewBlock(tx *Transaction, srcs []map[string]interface{}, avID, dbBlockID, viewID, groupID, previousItemID string, ignoreDefaultFill bool) (err error) {
	slices.Reverse(srcs) // https://github.com/lonelyor/SourceFlow/issues/11286

	now := time.Now().UnixMilli()
	for _, src := range srcs {
		boundBlockID := ""
		srcItemID := ast.NewNodeID()
		if nil != src["itemID"] {
			srcItemID = src["itemID"].(string)
		}

		isDetached := src["isDetached"].(bool)
		var tree *parse.Tree
		if !isDetached {
			boundBlockID = src["id"].(string)
			if !ast.IsNodeIDPattern(boundBlockID) {
				continue
			}

			var loadErr error
			if nil != tx {
				tree, loadErr = tx.loadTree(boundBlockID)
			} else {
				tree, loadErr = LoadTreeByBlockID(boundBlockID)
			}
			if nil != loadErr {
				logging.LogErrorf("load tree [%s] failed: %s", boundBlockID, loadErr)
				return loadErr
			}
		}

		var srcContent string
		if nil != src["content"] {
			srcContent = src["content"].(string)
		}
		if avErr := addAttributeViewBlock(now, avID, dbBlockID, viewID, groupID, previousItemID, srcItemID, boundBlockID, srcContent, isDetached, ignoreDefaultFill, tree, tx); nil != avErr {
			return avErr
		}
	}
	return
}

func addAttributeViewBlock(now int64, avID, dbBlockID, viewID, groupID, previousItemID, addingItemID, addingBoundBlockID, addingBlockContent string, isDetached, ignoreDefaultFill bool, tree *parse.Tree, tx *Transaction) (err error) {
	var node *ast.Node
	if !isDetached {
		node = treenode.GetNodeInTree(tree, addingBoundBlockID)
		if nil == node {
			err = ErrBlockNotFound
			return
		}
	} else {
		if "" == addingItemID {
			addingItemID = ast.NewNodeID()
			logging.LogWarnf("detached block id is empty, generate a new one [%s]", addingItemID)
		}
	}

	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		return
	}

	var blockIcon string
	if !isDetached {
		blockIcon, addingBlockContent = getNodeAvBlockText(node, "")
		addingBlockContent = util.UnescapeHTML(addingBlockContent)
	}

	// 检查是否重复添加相同的块
	blockValues := attrView.GetBlockKeyValues()
	for _, blockValue := range blockValues.Values {
		if "" != addingBoundBlockID && blockValue.Block.ID == addingBoundBlockID {
			if !isDetached {
				// 重复绑定一下，比如剪切数据库块、取消绑定块后再次添加的场景需要
				bindBlockAv0(tx, avID, node, tree)
				blockValue.IsDetached = isDetached
				blockValue.Block.Icon = blockIcon
				blockValue.Block.Content = addingBlockContent
				blockValue.UpdatedAt = now
				err = av.SaveAttributeView(attrView)
			}

			msg := fmt.Sprintf(Conf.language(269), getAttrViewName(attrView))
			util.PushMsg(msg, 5000)
			return
		}
	}

	blockValue := &av.Value{
		ID:         ast.NewNodeID(),
		KeyID:      blockValues.Key.ID,
		BlockID:    addingItemID,
		Type:       av.KeyTypeBlock,
		IsDetached: isDetached,
		CreatedAt:  now,
		UpdatedAt:  now,
		Block:      &av.ValueBlock{Icon: blockIcon, Content: addingBlockContent, Created: now, Updated: now}}
	if !isDetached {
		blockValue.Block.ID = addingBoundBlockID
	}

	blockValues.Values = append(blockValues.Values, blockValue)

	view, err := getAttrViewViewByBlockID(attrView, dbBlockID)
	if nil != err {
		logging.LogErrorf("get view by block ID [%s] failed: %s", dbBlockID, err)
		return
	}

	if "" != viewID {
		view = attrView.GetView(viewID)
		if nil == view {
			logging.LogErrorf("get view by view ID [%s] failed", viewID)
			return av.ErrViewNotFound
		}
	}

	groupView := view
	if "" != groupID {
		groupView = view.GetGroupByID(groupID)
	}

	if !ignoreDefaultFill {
		fillDefaultValue(attrView, view, groupView, previousItemID, addingItemID, true)
	}

	// 处理日期字段默认填充当前创建时间
	// The database date field supports filling the current time by default https://github.com/lonelyor/SourceFlow/issues/10823
	for _, keyValues := range attrView.KeyValues {
		if av.KeyTypeDate == keyValues.Key.Type && nil != keyValues.Key.Date && keyValues.Key.Date.AutoFillNow {
			val := keyValues.GetValue(addingItemID)
			if nil == val { // 避免覆盖已有值（可能前面已经通过过滤或者分组条件填充了值）
				dateVal := &av.Value{
					ID: ast.NewNodeID(), KeyID: keyValues.Key.ID, BlockID: addingItemID, Type: av.KeyTypeDate, IsDetached: isDetached, CreatedAt: now, UpdatedAt: now + 1000,
					Date: &av.ValueDate{Content: now, IsNotEmpty: true, IsNotTime: !keyValues.Key.Date.FillSpecificTime},
				}
				keyValues.Values = append(keyValues.Values, dateVal)
			} else {
				if val.IsRenderAutoFill {
					val.CreatedAt, val.UpdatedAt = now, now+1000
					val.Date.Content, val.Date.IsNotEmpty, val.Date.IsNotTime = now, true, !keyValues.Key.Date.FillSpecificTime
					val.IsRenderAutoFill = false
				}
			}
		}
	}

	if !isDetached {
		bindBlockAv0(tx, avID, node, tree)
	}

	// 在所有视图上添加项目
	for _, v := range attrView.Views {
		if "" != previousItemID {
			changed := false
			for i, id := range v.ItemIDs {
				if id == previousItemID {
					v.ItemIDs = append(v.ItemIDs[:i+1], append([]string{addingItemID}, v.ItemIDs[i+1:]...)...)
					changed = true
					break
				}
			}
			if !changed {
				v.ItemIDs = append(v.ItemIDs, addingItemID)
			}
		} else {
			v.ItemIDs = append([]string{addingItemID}, v.ItemIDs...)
		}

		// 在所有分组视图中添加，目的是为了在重新分组的过程中保住排序状态 https://github.com/lonelyor/SourceFlow/issues/15560
		for _, g := range v.Groups {
			if "" != previousItemID {
				changed := false
				for i, id := range g.GroupItemIDs {
					if id == previousItemID {
						g.GroupItemIDs = append(g.GroupItemIDs[:i+1], append([]string{addingItemID}, g.GroupItemIDs[i+1:]...)...)
						changed = true
						break
					}
				}
				if !changed {
					g.GroupItemIDs = append(g.GroupItemIDs, addingItemID)
				}
			} else {
				g.GroupItemIDs = append([]string{addingItemID}, g.GroupItemIDs...)
			}
		}
	}

	regenAttrViewGroups(attrView)
	err = av.SaveAttributeView(attrView)
	return
}

func fillDefaultValue(attrView *av.AttributeView, view, groupView *av.View, previousItemID, addingItemID string, isCreate bool) {
	defaultValues := getAttrViewAddingBlockDefaultValues(attrView, view, groupView, previousItemID, addingItemID, isCreate)
	for keyID, newValue := range defaultValues {
		newValue.BlockID = addingItemID
		keyValues, getErr := attrView.GetKeyValues(keyID)
		if nil != getErr {
			continue
		}

		if av.KeyTypeRollup == newValue.Type {
			// 汇总字段的值是渲染时计算的，不需要添加到数据存储中
			continue
		}

		if (av.KeyTypeSelect == newValue.Type || av.KeyTypeMSelect == newValue.Type) && 1 > len(newValue.MSelect) && groupValueDefault != groupView.GetGroupValue() {
			// 单选或多选类型的值可能需要从分组条件中获取默认值
			if opt := keyValues.Key.GetOption(groupView.GetGroupValue()); nil != opt {
				newValue.MSelect = append(newValue.MSelect, &av.ValueSelect{Content: opt.Name, Color: opt.Color})
			}
		}

		if av.KeyTypeRelation == newValue.Type && nil != keyValues.Key.Relation && keyValues.Key.Relation.IsTwoWay {
			// 双向关联需要同时更新目标字段的值
			updateTwoWayRelationDestAttrView(attrView, keyValues.Key, newValue, 1, []string{})
		}

		existingVal := keyValues.GetValue(addingItemID)
		if nil == existingVal {
			newValue.IsRenderAutoFill = false
			keyValues.Values = append(keyValues.Values, newValue)
		} else {
			newValueRaw := newValue.GetValByType(keyValues.Key.Type)
			if av.KeyTypeBlock != existingVal.Type || (av.KeyTypeBlock == existingVal.Type && existingVal.IsDetached) {
				// 非主键的值直接覆盖，主键的值只覆盖非绑定块
				existingVal.IsRenderAutoFill = false
				existingVal.SetValByType(keyValues.Key.Type, newValueRaw)
			}
		}
	}
}

func getNewValueByNearItem(nearItem av.Item, key *av.Key, addingBlockID string) (ret *av.Value) {
	if nil == nearItem {
		return
	}

	defaultVal := nearItem.GetValue(key.ID)
	ret = defaultVal.Clone()
	ret.ID = ast.NewNodeID()
	ret.KeyID = key.ID
	ret.BlockID = addingBlockID
	ret.CreatedAt = util.CurrentTimeMillis()
	ret.UpdatedAt = ret.CreatedAt + 1000
	return
}

func getNearItem(attrView *av.AttributeView, view, groupView *av.View, previousItemID string) (ret av.Item) {
	cachedAttrViews := map[string]*av.AttributeView{}
	rollupFurtherCollections := sql.GetFurtherCollections(attrView, cachedAttrViews)
	viewable := sql.RenderGroupView(attrView, view, groupView, "")
	av.Filter(viewable, attrView, rollupFurtherCollections, cachedAttrViews)
	av.Sort(viewable, attrView)
	items := viewable.(av.Collection).GetItems()
	if 0 < len(items) {
		if "" != previousItemID {
			for _, row := range items {
				if row.GetID() == previousItemID {
					ret = row
					return
				}
			}
		} else {
			if 0 < len(items) {
				ret = items[0]
				return
			}
		}
	}
	return
}

func (tx *Transaction) doRemoveAttrViewBlock(operation *Operation) (ret *TxErr) {
	err := removeAttributeViewBlock(operation.SrcIDs, operation.AvID, tx)
	if err != nil {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID}
	}
	return
}

func RemoveAttributeViewBlock(srcIDs []string, avID string) (err error) {
	err = removeAttributeViewBlock(srcIDs, avID, nil)
	return
}

func removeAttributeViewBlock(srcIDs []string, avID string, tx *Transaction) (err error) {
	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		return
	}

	trees := map[string]*parse.Tree{}
	for _, keyValues := range attrView.KeyValues {
		tmp := keyValues.Values[:0]
		for i, val := range keyValues.Values {
			if !gulu.Str.Contains(val.BlockID, srcIDs) {
				tmp = append(tmp, keyValues.Values[i])
			} else {
				// Remove av block also remove node attr https://github.com/lonelyor/SourceFlow/issues/9091#issuecomment-1709824006
				if !val.IsDetached && nil != val.Block {
					if bt := treenode.GetBlockTree(val.Block.ID); nil != bt {
						tree := trees[bt.RootID]
						if nil == tree {
							tree, _ = LoadTreeByBlockID(val.Block.ID)
						}

						if nil != tree {
							trees[bt.RootID] = tree
							if node := treenode.GetNodeInTree(tree, val.Block.ID); nil != node {
								if err = removeNodeAvID(node, avID, tx, tree); err != nil {
									return
								}
							}
						}
					}
				}
			}
		}
		keyValues.Values = tmp
	}

	for _, view := range attrView.Views {
		for _, blockID := range srcIDs {
			view.ItemIDs = gulu.Str.RemoveElem(view.ItemIDs, blockID)
		}
	}

	regenAttrViewGroups(attrView)

	err = av.SaveAttributeView(attrView)
	if nil != err {
		return
	}

	refreshRelatedSrcAvs(avID, tx)

	historyDir, err := GetHistoryDir(HistoryOpUpdate)
	if err != nil {
		logging.LogErrorf("get history dir failed: %s", err)
		return
	}
	blockIDs := treenode.GetMirrorAttrViewBlockIDs(avID)
	for _, blockID := range blockIDs {
		tree := trees[blockID]
		if nil == tree {
			tree, _ = LoadTreeByBlockID(blockID)
		}
		if nil == tree {
			continue
		}

		historyPath := filepath.Join(historyDir, tree.Box, tree.Path)
		absPath := filepath.Join(util.DataDir, tree.Box, tree.Path)
		if err = filelock.Copy(absPath, historyPath); err != nil {
			logging.LogErrorf("backup [path=%s] to history [%s] failed: %s", absPath, historyPath, err)
			return
		}
	}

	srcAvPath := filepath.Join(util.DataDir, "storage", "av", avID+".json")
	destAvPath := filepath.Join(historyDir, "storage", "av", avID+".json")
	if copyErr := filelock.Copy(srcAvPath, destAvPath); nil != copyErr {
		logging.LogErrorf("copy av [%s] failed: %s", srcAvPath, copyErr)
	}

	indexHistoryDir(filepath.Base(historyDir), util.NewLute())
	return
}

func removeNodeAvID(node *ast.Node, avID string, tx *Transaction, tree *parse.Tree) (err error) {
	attrs := parse.IAL2Map(node.KramdownIAL)
	if ast.NodeDocument == node.Type {
		delete(attrs, "custom-hidden")
		node.RemoveIALAttr("custom-hidden")
	}

	if avs := attrs[av.NodeAttrNameAvs]; "" != avs {
		avIDs := strings.Split(avs, ",")
		avIDs = gulu.Str.RemoveElem(avIDs, avID)
		var existAvIDs []string
		for _, attributeViewID := range avIDs {
			if av.IsAttributeViewExist(attributeViewID) {
				existAvIDs = append(existAvIDs, attributeViewID)
			}
		}
		avIDs = existAvIDs

		if 0 == len(avIDs) {
			attrs[av.NodeAttrNameAvs] = ""
		} else {
			attrs[av.NodeAttrNameAvs] = strings.Join(avIDs, ",")
			node.SetIALAttr(av.NodeAttrNameAvs, strings.Join(avIDs, ","))
			avNames := getAvNames(node.IALAttr(av.NodeAttrNameAvs))
			attrs[av.NodeAttrViewNames] = avNames
		}
	}

	if nil != tx {
		if err = setNodeAttrsWithTx(tx, node, tree, attrs); err != nil {
			return
		}
	} else {
		if err = setNodeAttrs(node, tree, attrs); err != nil {
			return
		}
	}
	return
}
