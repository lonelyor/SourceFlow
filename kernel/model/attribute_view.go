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
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/lonelyor/sourceflow/kernel/av"
	"github.com/lonelyor/sourceflow/kernel/search"
	"github.com/lonelyor/sourceflow/kernel/sql"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/filelock"
	"github.com/lonelyor/sourceflow/third_party/go/go-humanize"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
	"github.com/lonelyor/sourceflow/third_party/go/lute/parse"
)

func RemoveUnusedAttributeView(id string) {
	absPath := filepath.Join(util.DataDir, "storage", "av", id+".json")
	if !filelock.IsExist(absPath) {
		return
	}

	historyDir, err := GetHistoryDir(HistoryOpClean)
	if err != nil {
		logging.LogErrorf("get history dir failed: %s", err)
		return
	}

	newP := strings.TrimPrefix(absPath, util.DataDir)
	historyPath := filepath.Join(historyDir, newP)
	if filelock.IsExist(absPath) {
		if err = filelock.Copy(absPath, historyPath); err != nil {
			return
		}
	}

	if err = filelock.RemoveWithoutFatal(absPath); err != nil {
		logging.LogErrorf("remove unused asset [%s] failed: %s", absPath, err)
		util.PushErrMsg(fmt.Sprintf("%s", err), 7000)
		return
	}

	IncSync()

	indexHistoryDir(filepath.Base(historyDir), util.NewLute())
	return
}

func RemoveUnusedAttributeViews() (ret []string) {
	ret = []string{}
	var size int64

	msgId := util.PushMsg(Conf.Language(100), 30*1000)
	defer func() {
		msg := fmt.Sprintf(Conf.Language(280), len(ret), humanize.BytesCustomCeil(uint64(size), 2))
		util.PushUpdateMsg(msgId, msg, 7000)
	}()

	unusedAttributeViews := UnusedAttributeViews(false)

	historyDir, err := GetHistoryDir(HistoryOpClean)
	if err != nil {
		logging.LogErrorf("get history dir failed: %s", err)
		return
	}

	for _, unusedAv := range unusedAttributeViews {
		id := unusedAv.Item
		srcPath := filepath.Join(util.DataDir, "storage", "av", id+".json")
		if filelock.IsExist(srcPath) {
			historyPath := filepath.Join(historyDir, "storage", "av", id+".json")
			if err = filelock.Copy(srcPath, historyPath); err != nil {
				return
			}
		}
	}

	for _, unusedAv := range unusedAttributeViews {
		id := unusedAv.Item
		absPath := filepath.Join(util.DataDir, "storage", "av", id+".json")
		if filelock.IsExist(absPath) {
			info, statErr := os.Stat(absPath)
			if statErr == nil {
				size += info.Size()
			}

			if removeErr := filelock.RemoveWithoutFatal(absPath); removeErr != nil {
				logging.LogErrorf("remove unused av [%s] failed: %s", absPath, removeErr)
				util.PushErrMsg(fmt.Sprintf("%s", removeErr), 7000)
				return
			}
		}
		ret = append(ret, absPath)
	}
	if 0 < len(ret) {
		IncSync()
	}

	indexHistoryDir(filepath.Base(historyDir), util.NewLute())
	return
}

func UnusedAttributeViews(sorted bool) (ret []*UnusedItem) {
	defer logging.Recover()
	ret = []*UnusedItem{}

	allAvIDs, err := getAllAvIDs()
	if err != nil {
		return
	}

	docReferencedAvIDs := map[string]bool{}
	luteEngine := util.NewLute()
	boxes := Conf.GetBoxes()
	for _, box := range boxes {
		pages := pagedPaths(filepath.Join(util.DataDir, box.ID), 32)
		for _, paths := range pages {
			var trees []*parse.Tree
			for _, localPath := range paths {
				tree, loadTreeErr := loadTree(localPath, luteEngine)
				if nil != loadTreeErr {
					continue
				}
				trees = append(trees, tree)
			}
			for _, tree := range trees {
				for _, id := range getAvIDs(tree, allAvIDs) {
					docReferencedAvIDs[id] = true
				}
			}
		}
	}

	templateAvIDs := search.FindAllMatchedTargets(filepath.Join(util.DataDir, "templates"), allAvIDs)
	for _, id := range templateAvIDs {
		docReferencedAvIDs[id] = true
	}

	checkedAvIDs := map[string]bool{}
	for _, id := range allAvIDs {
		if !docReferencedAvIDs[id] && !isRelatedSrcAvDocReferenced(id, docReferencedAvIDs, checkedAvIDs) {
			name, _ := av.GetAttributeViewName(id)

			var modTime time.Time
			if sorted {
				p := filepath.Join(util.DataDir, "storage", "av", id+".json")
				if info, statErr := os.Stat(p); nil == statErr {
					modTime = info.ModTime()
				}
			}

			ret = append(ret, &UnusedItem{Item: id, Name: name, ModTime: modTime})
		}
	}

	if sorted {
		sort.Slice(ret, func(i, j int) bool {
			if !ret[i].ModTime.Equal(ret[j].ModTime) {
				return ret[i].ModTime.After(ret[j].ModTime)
			}
			return ret[i].Item > ret[j].Item
		})
	}
	return
}

func isRelatedSrcAvDocReferenced(destAvID string, docReferencedAvIDs, checkedAvIDs map[string]bool) bool {
	if checkedAvIDs[destAvID] {
		if docReferencedAvIDs[destAvID] {
			return true
		}
		return false
	}
	checkedAvIDs[destAvID] = true

	srcAvIDs := av.GetSrcAvIDs(destAvID)
	srcAvIDs = gulu.Str.RemoveElem(srcAvIDs, destAvID) // 忽略自身关联
	if 1 > len(srcAvIDs) {
		return false
	}

	for _, srcAvID := range srcAvIDs {
		if docReferencedAvIDs[srcAvID] {
			return true
		}
	}

	// 递归检查间接关联的 av
	for _, srcAvID := range srcAvIDs {
		if isRelatedSrcAvDocReferenced(srcAvID, docReferencedAvIDs, checkedAvIDs) {
			return true
		}
	}
	return false
}

func getAvIDs(tree *parse.Tree, allAvIDs []string) (ret []string) {
	ast.Walk(tree.Root, func(n *ast.Node, entering bool) ast.WalkStatus {
		if !entering {
			return ast.WalkContinue
		}

		if ast.NodeAttributeView == n.Type {
			ret = append(ret, n.AttributeViewID)
		}

		for _, kv := range n.KramdownIAL {
			ids := util.GetContainsSubStrs(kv[1], allAvIDs)
			if 0 < len(ids) {
				ret = append(ret, ids...)
			}
		}

		return ast.WalkContinue
	})

	ret = gulu.Str.RemoveDuplicatedElem(ret)
	return
}

func getAllAvIDs() (ret []string, err error) {
	ret = []string{}

	entries, err := os.ReadDir(filepath.Join(util.DataDir, "storage", "av"))
	if nil != err {
		return
	}

	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasSuffix(name, ".json") {
			continue
		}

		id := strings.TrimSuffix(name, ".json")
		if !ast.IsNodeIDPattern(id) {
			continue
		}

		ret = append(ret, id)
	}
	ret = gulu.Str.RemoveDuplicatedElem(ret)
	return
}

func GetAttributeViewItemIDs(avID string, blockIDs []string) (ret map[string]string) {
	ret = map[string]string{}
	for _, blockID := range blockIDs {
		ret[blockID] = ""
	}

	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		logging.LogErrorf("parse attribute view [%s] failed: %s", avID, err)
		return
	}

	blockKv := attrView.GetBlockKeyValues()
	for _, b := range blockKv.Values {
		if _, ok := ret[b.Block.ID]; ok {
			ret[b.Block.ID] = b.BlockID
		}
	}
	return
}

func GetAttributeViewBoundBlockIDs(avID string, itemIDs []string) (ret map[string]string) {
	ret = map[string]string{}
	for _, itemID := range itemIDs {
		ret[itemID] = ""
	}

	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		logging.LogErrorf("parse attribute view [%s] failed: %s", avID, err)
		return
	}

	blockKv := attrView.GetBlockKeyValues()
	for _, b := range blockKv.Values {
		if _, ok := ret[b.BlockID]; ok {
			ret[b.BlockID] = b.Block.ID
		}
	}
	return
}

func GetAttrViewAddingBlockDefaultValues(avID, viewID, groupID, previousBlockID, addingBlockID string) (ret map[string]*av.Value) {
	ret = map[string]*av.Value{}

	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		logging.LogErrorf("parse attribute view [%s] failed: %s", avID, err)
		return
	}

	view, _ := attrView.GetCurrentView(viewID)
	if nil == view {
		logging.LogErrorf("view [%s] not found in attribute view [%s]", viewID, avID)
		return
	}

	if 1 > len(view.Filters) && !view.IsGroupView() {
		// 没有过滤条件也没有分组条件时忽略
		return
	}

	groupView := view
	if "" != groupID {
		groupView = view.GetGroupByID(groupID)
	}
	if nil == groupView {
		logging.LogErrorf("group [%s] not found in view [%s] of attribute view [%s]", groupID, viewID, avID)
		return
	}

	ret = getAttrViewAddingBlockDefaultValues(attrView, view, groupView, previousBlockID, addingBlockID, true)
	for _, value := range ret {
		// 主键都不返回内容，避免闪烁 https://github.com/lonelyor/SourceFlow/issues/15561#issuecomment-3184746195
		if av.KeyTypeBlock == value.Type {
			value.Block.Content = ""
		}
	}
	return
}

func getAttrViewAddingBlockDefaultValues(attrView *av.AttributeView, view, groupView *av.View, previousItemID, addingItemID string, isCreate bool) (ret map[string]*av.Value) {
	ret = map[string]*av.Value{}

	if 1 > len(view.Filters) && !view.IsGroupView() {
		// 没有过滤条件也没有分组条件时忽略
		return
	}

	nearItem := getNearItem(attrView, view, groupView, previousItemID)

	// 使用模板或汇总进行过滤或分组时，需要解析涉及到的其他字段
	templateRelevantKeys, rollupRelevantKeys := map[string][]*av.Key{}, map[string]*av.Key{}
	for _, keyValues := range attrView.KeyValues {
		if av.KeyTypeTemplate == keyValues.Key.Type {
			if tplRelevantKeys := sql.GetTemplateKeyRelevantKeys(attrView, keyValues.Key); 0 < len(tplRelevantKeys) {
				for _, k := range tplRelevantKeys {
					templateRelevantKeys[keyValues.Key.ID] = append(templateRelevantKeys[keyValues.Key.ID], k)
				}
			}
		} else if av.KeyTypeRollup == keyValues.Key.Type {
			if nil != keyValues.Key.Rollup {
				relKey, _ := attrView.GetKey(keyValues.Key.Rollup.RelationKeyID)
				if nil != relKey && nil != relKey.Relation {
					if attrView.ID == relKey.Relation.AvID {
						if k, _ := attrView.GetKey(keyValues.Key.Rollup.KeyID); nil != k {
							rollupRelevantKeys[k.ID] = k
						}
					}
				}
			}
		}
	}

	filterKeyIDs := map[string]bool{}
	for _, filter := range view.Filters {
		filterKeyIDs[filter.Column] = true
		keyValues, _ := attrView.GetKeyValues(filter.Column)
		if nil == keyValues {
			continue
		}

		if av.KeyTypeTemplate == keyValues.Key.Type && nil != nearItem {
			if keys := templateRelevantKeys[keyValues.Key.ID]; 0 < len(keys) {
				for _, k := range keys {
					if nil == ret[k.ID] {
						ret[k.ID] = getNewValueByNearItem(nearItem, k, addingItemID)
					}
				}
			}
			continue
		}

		if av.KeyTypeRollup == keyValues.Key.Type && nil != nearItem {
			if relKey, ok := rollupRelevantKeys[keyValues.Key.ID]; ok {
				if nil == ret[relKey.ID] {
					ret[relKey.ID] = getNewValueByNearItem(nearItem, relKey, addingItemID)
				}
			}
			continue
		}

		if av.KeyTypeMAsset == keyValues.Key.Type {
			if nil != nearItem {
				if _, ok := ret[keyValues.Key.ID]; !ok {
					ret[keyValues.Key.ID] = getNewValueByNearItem(nearItem, keyValues.Key, addingItemID)
				}
			}
			return
		}

		newValue := filter.GetAffectValue(keyValues.Key, addingItemID)
		if nil == newValue {
			if filter.IsValid() {
				newValue = getNewValueByNearItem(nearItem, keyValues.Key, addingItemID)
			}
		}
		if nil != newValue {
			if av.KeyTypeDate == keyValues.Key.Type {
				if nil != nearItem {
					nearValue := getNewValueByNearItem(nearItem, keyValues.Key, addingItemID)
					newValue.Date.IsNotTime = nearValue.Date.IsNotTime
				}

				if nil != keyValues.Key.Date && keyValues.Key.Date.AutoFillNow {
					newValue.Date.Content = time.Now().UnixMilli()
					newValue.Date.IsNotEmpty = true
				}
			}

			ret[keyValues.Key.ID] = newValue
		}
	}

	groupKey := view.GetGroupKey(attrView)
	if nil == groupKey {
		return
	}

	keyValues, _ := attrView.GetKeyValues(groupKey.ID)
	if nil == keyValues {
		return
	}

	newValue := getNewValueByNearItem(nearItem, groupKey, addingItemID)
	if av.KeyTypeSelect == groupKey.Type || av.KeyTypeMSelect == groupKey.Type {
		// 因为单选或多选只能按选项分组，并且可能存在空白分组（找不到临近项），所以单选或多选类型的分组字段使用分组值内容对应的选项
		if opt := groupKey.GetOption(groupView.GetGroupValue()); nil != opt && groupValueDefault != groupView.GetGroupValue() {
			if nil == newValue {
				newValue = ret[groupKey.ID] // 如果没有临近项，则尝试从过滤结果中获取
			}
			if nil == newValue {
				newValue = keyValues.GetValue(addingItemID) // 尝试从已有值中获取
			}

			if nil != newValue {
				if !av.MSelectExistOption(newValue.MSelect, groupView.GetGroupValue()) {
					if 1 > len(newValue.MSelect) || av.KeyTypeMSelect == groupKey.Type {
						newValue.MSelect = append(newValue.MSelect, &av.ValueSelect{Content: opt.Name, Color: opt.Color})
					} else {
						newValue.MSelect = []*av.ValueSelect{{Content: opt.Name, Color: opt.Color}}
					}
				} else {
					var vals []*av.ValueSelect
					if isCreate {
						vals = append(vals, &av.ValueSelect{Content: opt.Name, Color: opt.Color})
					} else {
						existingVal := keyValues.GetValue(addingItemID)
						if nil != existingVal {
							if !av.MSelectExistOption(existingVal.MSelect, opt.Name) {
								existingVal.MSelect = append(existingVal.MSelect, &av.ValueSelect{Content: opt.Name, Color: opt.Color})
							}
							vals = existingVal.MSelect
						} else {
							vals = append(vals, &av.ValueSelect{Content: opt.Name, Color: opt.Color})
						}
					}

					// 添加过滤结果选项的值
					if nil != ret[groupKey.ID] {
						for _, v := range ret[groupKey.ID].MSelect {
							if !av.MSelectExistOption(vals, v.Content) {
								vals = append(vals, v)
							}
						}
					}
					newValue.MSelect = vals
				}
			} else {
				newValue = av.GetAttributeViewDefaultValue(ast.NewNodeID(), groupKey.ID, addingItemID, groupKey.Type, false)
				newValue.MSelect = append(newValue.MSelect, &av.ValueSelect{Content: opt.Name, Color: opt.Color})
			}
		}

		if nil != newValue {
			ret[groupKey.ID] = newValue
		}
		return
	}

	if av.KeyTypeTemplate == keyValues.Key.Type && nil != nearItem {
		if keys := templateRelevantKeys[keyValues.Key.ID]; 0 < len(keys) {
			for _, k := range keys {
				if nil == ret[k.ID] {
					ret[k.ID] = getNewValueByNearItem(nearItem, k, addingItemID)
				}
			}
		}
		return
	}

	if av.KeyTypeRollup == keyValues.Key.Type && nil != nearItem {
		if relKey, ok := rollupRelevantKeys[keyValues.Key.ID]; ok {
			if nil == ret[relKey.ID] {
				ret[relKey.ID] = getNewValueByNearItem(nearItem, relKey, addingItemID)
			}
		}
		return
	}

	if nil != nearItem && filterKeyIDs[groupKey.ID] {
		// 临近项不为空并且分组字段和过滤字段相同时，优先使用临近项 https://github.com/lonelyor/SourceFlow/issues/15591
		newValue = getNewValueByNearItem(nearItem, groupKey, addingItemID)
		ret[groupKey.ID] = newValue

		if nil != keyValues.Key.Date && keyValues.Key.Date.AutoFillNow {
			newValue.Date.Content = time.Now().UnixMilli()
			newValue.Date.IsNotEmpty = true
		}
		return
	}

	if nil == nearItem && !filterKeyIDs[groupKey.ID] {
		// 没有临近项并且分组字段和过滤字段不同时，使用分组值
		newValue = av.GetAttributeViewDefaultValue(ast.NewNodeID(), groupKey.ID, addingItemID, groupKey.Type, false)
		if av.KeyTypeText == groupView.GroupVal.Type {
			content := groupView.GroupVal.Text.Content
			if groupValueDefault == content {
				content = ""
			}

			switch newValue.Type {
			case av.KeyTypeBlock:
				newValue.Block.Content = content
			case av.KeyTypeText:
				newValue.Text.Content = content
			case av.KeyTypeNumber:
				num, _ := strconv.ParseFloat(strings.Split(content, " - ")[0], 64)
				newValue.Number.Content = num
				newValue.Number.IsNotEmpty = true
			case av.KeyTypeURL:
				newValue.URL.Content = content
			case av.KeyTypeEmail:
				newValue.Email.Content = content
			case av.KeyTypePhone:
				newValue.Phone.Content = content
			}
		} else if av.KeyTypeCheckbox == groupView.GroupVal.Type {
			newValue.Checkbox.Checked = groupView.GroupVal.Checkbox.Checked
		}

		ret[groupKey.ID] = newValue
		return
	}

	if nil != newValue && !filterKeyIDs[groupKey.ID] {
		ret[groupKey.ID] = newValue

		if nil != keyValues.Key.Date && keyValues.Key.Date.AutoFillNow {
			newValue.Date.Content = time.Now().UnixMilli()
			newValue.Date.IsNotEmpty = true
		}
	}
	return
}
