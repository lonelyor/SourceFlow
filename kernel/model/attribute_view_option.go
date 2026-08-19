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
	"sort"
	"strings"

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

func (tx *Transaction) doUpdateAttrViewColOptions(operation *Operation) (ret *TxErr) {
	err := updateAttributeViewColumnOptions(operation)
	if err != nil {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func updateAttributeViewColumnOptions(operation *Operation) (err error) {
	attrView, err := av.ParseAttributeView(operation.AvID)
	if err != nil {
		return
	}

	jsonData, err := gulu.JSON.MarshalJSON(operation.Data)
	if err != nil {
		return
	}

	options := []*av.SelectOption{}
	if err = gulu.JSON.UnmarshalJSON(jsonData, &options); err != nil {
		return
	}

	// 移除空选项 https://github.com/lonelyor/SourceFlow/issues/15533
	var tmp []*av.SelectOption
	for _, opt := range options {
		if "" != opt.Name {
			tmp = append(tmp, opt)
		}
	}
	options = tmp
	if 1 > len(options) {
		return
	}

	optionSorts := map[string]int{}
	for i, opt := range options {
		optionSorts[opt.Name] = i
	}

	addNew := false
	selectKey, _ := attrView.GetKey(operation.ID)
	if nil == selectKey {
		return
	}
	existingOptions := map[string]*av.SelectOption{}
	for _, opt := range selectKey.Options {
		existingOptions[opt.Name] = opt
	}
	for _, opt := range options {
		if existingOpt, exists := existingOptions[opt.Name]; exists {
			// 如果选项已经存在则更新颜色和描述
			existingOpt.Color = opt.Color
			existingOpt.Desc = opt.Desc
		} else {
			// 如果选项不存在则添加新选项
			selectKey.Options = append(selectKey.Options, &av.SelectOption{
				Name:  opt.Name,
				Color: opt.Color,
				Desc:  opt.Desc,
			})
			addNew = true
		}
	}

	if !addNew {
		sort.SliceStable(selectKey.Options, func(i, j int) bool {
			return optionSorts[selectKey.Options[i].Name] < optionSorts[selectKey.Options[j].Name]
		})
	}

	regenAttrViewGroups(attrView)
	err = av.SaveAttributeView(attrView)
	return
}

func (tx *Transaction) doRemoveAttrViewColOption(operation *Operation) (ret *TxErr) {
	err := removeAttributeViewColumnOption(operation)
	if err != nil {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func removeAttributeViewColumnOption(operation *Operation) (err error) {
	attrView, err := av.ParseAttributeView(operation.AvID)
	if err != nil {
		return
	}

	optName := operation.Data.(string)

	key, err := attrView.GetKey(operation.ID)
	if err != nil {
		return
	}

	for i, opt := range key.Options {
		if optName == opt.Name {
			key.Options = append(key.Options[:i], key.Options[i+1:]...)
			break
		}
	}

	for _, keyValues := range attrView.KeyValues {
		if keyValues.Key.ID != operation.ID {
			continue
		}

		for _, value := range keyValues.Values {
			if nil == value || nil == value.MSelect {
				continue
			}

			for i, opt := range value.MSelect {
				if optName == opt.Content {
					value.MSelect = append(value.MSelect[:i], value.MSelect[i+1:]...)
					break
				}
			}
		}
		break
	}

	// 如果存在选项对应的过滤条件，则删除过滤条件中设置的选项值 https://github.com/lonelyor/SourceFlow/issues/15536
	for _, view := range attrView.Views {
		for _, filter := range view.Filters {
			if filter.Column != operation.ID {
				continue
			}

			if nil != filter.Value && (av.KeyTypeSelect == filter.Value.Type || av.KeyTypeMSelect == filter.Value.Type) {
				if av.FilterOperatorIsEmpty == filter.Operator || av.FilterOperatorIsNotEmpty == filter.Operator {
					continue
				}

				for i, opt := range filter.Value.MSelect {
					if optName == opt.Content {
						filter.Value.MSelect = append(filter.Value.MSelect[:i], filter.Value.MSelect[i+1:]...)
						break
					}
				}
				if 1 > len(filter.Value.MSelect) {
					// 如果删除后选项值为空，则删除过滤条件
					for i, f := range view.Filters {
						if f.Column == operation.ID && f.Value == filter.Value {
							view.Filters = append(view.Filters[:i], view.Filters[i+1:]...)
							break
						}
					}
				}
			}
		}
	}

	regenAttrViewGroups(attrView)
	err = av.SaveAttributeView(attrView)
	return
}

func (tx *Transaction) doUpdateAttrViewColOption(operation *Operation) (ret *TxErr) {
	err := updateAttributeViewColumnOption(operation)
	if err != nil {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func updateAttributeViewColumnOption(operation *Operation) (err error) {
	attrView, err := av.ParseAttributeView(operation.AvID)
	if err != nil {
		return
	}

	key, err := attrView.GetKey(operation.ID)
	if err != nil {
		return
	}

	data := operation.Data.(map[string]interface{})

	rename := false
	oldName := strings.TrimSpace(data["oldName"].(string))
	newName := strings.TrimSpace(data["newName"].(string))
	newDesc := strings.TrimSpace(data["newDesc"].(string))
	newColor := data["newColor"].(string)

	found := false
	if oldName != newName {
		rename = true

		for _, opt := range key.Options {
			if newName == opt.Name { // 如果选项已经存在则直接使用
				found = true
				newColor = opt.Color
				newDesc = opt.Desc
				break
			}
		}
	}

	if !found {
		for i, opt := range key.Options {
			if oldName == opt.Name {
				key.Options[i].Name = newName
				key.Options[i].Color = newColor
				key.Options[i].Desc = newDesc
				break
			}
		}
	}

	// 如果存在选项对应的值，需要更新值中的选项
	for _, keyValues := range attrView.KeyValues {
		if keyValues.Key.ID != operation.ID {
			continue
		}

		for _, value := range keyValues.Values {
			if nil == value || nil == value.MSelect {
				continue
			}

			found = false
			for _, opt := range value.MSelect {
				if newName == opt.Content {
					found = true
					break
				}
			}
			if found && rename {
				idx := -1
				for i, opt := range value.MSelect {
					if oldName == opt.Content {
						idx = i
						break
					}
				}
				if 0 <= idx {
					value.MSelect = util.RemoveElem(value.MSelect, idx)
				}
			} else {
				for i, opt := range value.MSelect {
					if oldName == opt.Content {
						value.MSelect[i].Content = newName
						value.MSelect[i].Color = newColor
						break
					}
				}
			}
		}
		break
	}

	// 如果存在选项对应的过滤条件，需要更新过滤条件中设置的选项值
	// Database select field filters follow option editing changes https://github.com/lonelyor/SourceFlow/issues/10881
	for _, view := range attrView.Views {
		for _, filter := range view.Filters {
			if filter.Column != key.ID {
				continue
			}

			if nil != filter.Value && (av.KeyTypeSelect == filter.Value.Type || av.KeyTypeMSelect == filter.Value.Type) {
				for i, opt := range filter.Value.MSelect {
					if oldName == opt.Content {
						filter.Value.MSelect[i].Content = newName
						filter.Value.MSelect[i].Color = newColor
						break
					}
				}
			}
		}
	}

	regenAttrViewGroups(attrView)
	err = av.SaveAttributeView(attrView)
	return
}

func (tx *Transaction) doSetAttrViewColOptionDesc(operation *Operation) (ret *TxErr) {
	err := setAttributeViewColumnOptionDesc(operation)
	if err != nil {
		return &TxErr{code: TxErrHandleAttributeView, id: operation.AvID, msg: err.Error()}
	}
	return
}

func setAttributeViewColumnOptionDesc(operation *Operation) (err error) {
	attrView, err := av.ParseAttributeView(operation.AvID)
	if err != nil {
		return
	}

	key, err := attrView.GetKey(operation.ID)
	if err != nil {
		return
	}

	data := operation.Data.(map[string]interface{})
	name := data["name"].(string)
	desc := data["desc"].(string)

	for i, opt := range key.Options {
		if name == opt.Name {
			key.Options[i].Desc = desc
			break
		}
	}

	err = av.SaveAttributeView(attrView)
	return
}

func getAttrViewViewByBlockID(attrView *av.AttributeView, blockID string) (ret *av.View, err error) {
	var viewID string
	var node *ast.Node
	if "" != blockID {
		node, _, _ = getNodeByBlockID(nil, blockID)
	}
	if nil != node {
		viewID = av.GetNodeAttrView(node)
	}
	return attrView.GetCurrentView(viewID)
}

func getAttrViewName(attrView *av.AttributeView) string {
	ret := strings.TrimSpace(attrView.Name)
	if "" == ret {
		ret = Conf.language(105)
	}
	return ret
}

func updateBoundBlockAvsAttribute(avIDs []string) {
	// 更新指定 avIDs 中绑定块的 avs 属性

	cachedTrees, saveTrees := map[string]*parse.Tree{}, map[string]*parse.Tree{}
	luteEngine := util.NewLute()
	for _, avID := range avIDs {
		attrView, _ := av.ParseAttributeView(avID)
		if nil == attrView {
			continue
		}

		blockKeyValues := attrView.GetBlockKeyValues()
		for _, blockValue := range blockKeyValues.Values {
			if blockValue.IsDetached {
				continue
			}
			bt := treenode.GetBlockTree(blockValue.BlockID)
			if nil == bt {
				continue
			}

			tree := cachedTrees[bt.RootID]
			if nil == tree {
				tree, _ = filesys.LoadTree(bt.BoxID, bt.Path, luteEngine)
				if nil == tree {
					continue
				}
				cachedTrees[bt.RootID] = tree
			}

			node := treenode.GetNodeInTree(tree, blockValue.BlockID)
			if nil == node {
				continue
			}

			attrs := parse.IAL2Map(node.KramdownIAL)
			if "" == attrs[av.NodeAttrNameAvs] {
				attrs[av.NodeAttrNameAvs] = avID
			} else {
				nodeAvIDs := strings.Split(attrs[av.NodeAttrNameAvs], ",")
				nodeAvIDs = append(nodeAvIDs, avID)
				nodeAvIDs = gulu.Str.RemoveDuplicatedElem(nodeAvIDs)
				attrs[av.NodeAttrNameAvs] = strings.Join(nodeAvIDs, ",")
				saveTrees[bt.RootID] = tree
			}

			avNames := getAvNames(attrs[av.NodeAttrNameAvs])
			if "" != avNames {
				attrs[av.NodeAttrViewNames] = avNames
			}

			oldAttrsUnEsc, setErr := setNodeAttrs0(node, attrs)
			if nil != setErr {
				continue
			}
			cache.PutBlockIAL(node.ID, parse.IAL2Map(node.KramdownIAL))
			pushBlockAttrs(oldAttrsUnEsc, node)
			if "" != avNames {
				node.RemoveIALAttr(av.NodeAttrViewNames)
			}
		}
	}

	for _, saveTree := range saveTrees {
		if treeErr := indexWriteTreeUpsertQueue(saveTree); nil != treeErr {
			logging.LogErrorf("index write tree upsert queue failed: %s", treeErr)
		}

		avNodes := saveTree.Root.ChildrenByType(ast.NodeAttributeView)
		av.BatchUpsertBlockRel(avNodes)
	}
}
