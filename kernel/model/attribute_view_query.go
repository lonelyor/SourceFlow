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
	"fmt"
	"os"
	"path/filepath"
	"sort"
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
	"github.com/xrash/smetrics"
)

func AppendAttributeViewDetachedBlocksWithValues(avID string, blocksValues [][]*av.Value) (err error) {
	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		logging.LogErrorf("parse attribute view [%s] failed: %s", avID, err)
		return
	}

	now := util.CurrentTimeMillis()
	var blockIDs []string
	for _, blockValues := range blocksValues {
		blockID := ast.NewNodeID()
		if v := blockValues[0]; "" != v.BlockID {
			blockID = v.BlockID
		}
		blockIDs = append(blockIDs, blockID)
		for _, v := range blockValues {
			keyValues, _ := attrView.GetKeyValues(v.KeyID)
			if nil == keyValues {
				err = fmt.Errorf("key [%s] not found", v.KeyID)
				return
			}

			v.ID = ast.NewNodeID()
			v.BlockID = blockID
			v.Type = keyValues.Key.Type
			if av.KeyTypeBlock == v.Type {
				v.Block.Created = now
				v.Block.Updated = now
				v.Block.ID = ""
			}
			v.IsDetached = true
			v.CreatedAt = now
			v.UpdatedAt = now
			v.IsRenderAutoFill = false
			keyValues.Values = append(keyValues.Values, v)

			if av.KeyTypeSelect == v.Type || av.KeyTypeMSelect == v.Type {
				// 保存选项 https://github.com/lonelyor/SourceFlow/issues/12475
				key, _ := attrView.GetKey(v.KeyID)
				if nil != key && 0 < len(v.MSelect) {
					for _, valOpt := range v.MSelect {
						if opt := key.GetOption(valOpt.Content); nil == opt {
							// 不存在的选项新建保存
							opt = &av.SelectOption{Name: valOpt.Content, Color: valOpt.Color}
							key.Options = append(key.Options, opt)
						} else {
							// 已经存在的选项颜色需要保持不变
							valOpt.Color = opt.Color
						}
					}
				}
			}
		}
	}

	for _, v := range attrView.Views {
		for _, addingBlockID := range blockIDs {
			v.ItemIDs = append(v.ItemIDs, addingBlockID)
		}
	}

	regenAttrViewGroups(attrView)
	if err = av.SaveAttributeView(attrView); err != nil {
		logging.LogErrorf("save attribute view [%s] failed: %s", avID, err)
		return
	}

	ReloadAttrView(avID)
	return
}

func DuplicateDatabaseBlock(avID string) (newAvID, newBlockID string, err error) {
	storageAvDir := filepath.Join(util.DataDir, "storage", "av")
	oldAvPath := filepath.Join(storageAvDir, avID+".json")
	newAvID, newBlockID = ast.NewNodeID(), ast.NewNodeID()

	oldAv, err := av.ParseAttributeView(avID)
	if err != nil {
		return
	}

	data, err := filelock.ReadFile(oldAvPath)
	if err != nil {
		logging.LogErrorf("read attribute view [%s] failed: %s", avID, err)
		return
	}

	data = bytes.ReplaceAll(data, []byte(avID), []byte(newAvID))
	av.UpsertBlockRel(newAvID, newBlockID)

	newAv := &av.AttributeView{}
	if err = gulu.JSON.UnmarshalJSON(data, newAv); err != nil {
		logging.LogErrorf("unmarshal attribute view [%s] failed: %s", newAvID, err)
		return
	}

	if "" != newAv.Name {
		newAv.Name = oldAv.Name + " (Duplicated " + time.Now().Format("2006-01-02 15:04:05") + ")"
	}

	for _, keyValues := range newAv.KeyValues {
		if nil != keyValues.Key.Relation && keyValues.Key.Relation.IsTwoWay {
			// 断开双向关联
			keyValues.Key.Relation.IsTwoWay = false
			keyValues.Key.Relation.BackKeyID = ""
		}
	}

	data, err = gulu.JSON.MarshalJSON(newAv)
	if err != nil {
		logging.LogErrorf("marshal attribute view [%s] failed: %s", newAvID, err)
		return
	}

	newAvPath := filepath.Join(storageAvDir, newAvID+".json")
	if err = filelock.WriteFile(newAvPath, data); err != nil {
		logging.LogErrorf("write attribute view [%s] failed: %s", newAvID, err)
		return
	}

	updateBoundBlockAvsAttribute([]string{newAvID})
	return
}

func GetAttributeViewKeysByID(avID string, keyIDs ...string) (ret []*av.Key) {
	ret = []*av.Key{}

	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		logging.LogErrorf("parse attribute view [%s] failed: %s", avID, err)
		return
	}

	if 1 > len(keyIDs) {
		for _, keyValues := range attrView.KeyValues {
			key := keyValues.Key
			ret = append(ret, key)
		}
		return
	}

	for _, keyValues := range attrView.KeyValues {
		key := keyValues.Key
		for _, keyID := range keyIDs {
			if key.ID == keyID {
				ret = append(ret, key)
			}
		}
	}
	return ret
}

func SetDatabaseBlockView(blockID, avID, viewID string) (err error) {
	attrView, err := av.ParseAttributeView(avID)
	if nil != err {
		logging.LogErrorf("parse attribute view [%s] failed: %s", avID, err)
		return
	}
	if attrView.ViewID != viewID {
		attrView.ViewID = viewID
		if err = av.SaveAttributeView(attrView); err != nil {
			return
		}
	}

	view := attrView.GetView(viewID)
	if nil == view {
		err = av.ErrViewNotFound
		logging.LogErrorf("view [%s] not found in attribute view [%s]", viewID, avID)
		return
	}

	node, tree, err := getNodeByBlockID(nil, blockID)
	if err != nil {
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
	return
}

func GetAttributeViewPrimaryKeyValues(avID, keyword string, page, pageSize int) (attributeViewName string, databaseBlockIDs []string, keyValues *av.KeyValues, err error) {
	waitForSyncingStorages()

	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		logging.LogErrorf("parse attribute view [%s] failed: %s", avID, err)
		return
	}
	attributeViewName = getAttrViewName(attrView)

	databaseBlockIDs = treenode.GetMirrorAttrViewBlockIDs(avID)

	keyValues = attrView.GetBlockKeyValues()
	var values []*av.Value
	for _, kv := range keyValues.Values {
		if !kv.IsDetached && !treenode.ExistBlockTree(kv.Block.ID) {
			continue
		}

		if strings.Contains(strings.ToLower(kv.String(true)), strings.ToLower(keyword)) {
			values = append(values, kv)
		}
	}
	keyValues.Values = values

	sort.Slice(keyValues.Values, func(i, j int) bool {
		return keyValues.Values[i].Block.Updated > keyValues.Values[j].Block.Updated
	})

	if 1 > pageSize {
		pageSize = 16
	}
	start := (page - 1) * pageSize
	end := start + pageSize
	if len(keyValues.Values) < end {
		end = len(keyValues.Values)
	}
	keyValues.Values = keyValues.Values[start:end]
	return
}

func GetAttributeViewFilterSort(avID, blockID string) (filters []*av.ViewFilter, sorts []*av.ViewSort) {
	waitForSyncingStorages()

	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		logging.LogErrorf("parse attribute view [%s] failed: %s", avID, err)
		return
	}

	view, err := getAttrViewViewByBlockID(attrView, blockID)
	if nil == view {
		view, err = attrView.GetCurrentView(attrView.ViewID)
		if nil == view || err != nil {
			logging.LogErrorf("get current view failed: %s", err)
			return
		}
	}

	filters = view.Filters
	sorts = view.Sorts
	if 1 > len(filters) {
		filters = []*av.ViewFilter{}
	}
	if 1 > len(sorts) {
		sorts = []*av.ViewSort{}
	}
	return
}

func SearchAttributeViewNonRelationKey(avID, keyword string) (ret []*av.Key) {
	waitForSyncingStorages()

	ret = []*av.Key{}
	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		logging.LogErrorf("parse attribute view [%s] failed: %s", avID, err)
		return
	}

	for _, keyValues := range attrView.KeyValues {
		if av.KeyTypeRelation != keyValues.Key.Type && av.KeyTypeRollup != keyValues.Key.Type && av.KeyTypeLineNumber != keyValues.Key.Type {
			if strings.Contains(strings.ToLower(keyValues.Key.Name), strings.ToLower(keyword)) {
				ret = append(ret, keyValues.Key)
			}
		}
	}
	return
}

func SearchAttributeViewRollupDestKeys(avID, keyword string) (ret []*av.Key) {
	waitForSyncingStorages()

	ret = []*av.Key{}
	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		logging.LogErrorf("parse attribute view [%s] failed: %s", avID, err)
		return
	}

	for _, keyValues := range attrView.KeyValues {
		if av.KeyTypeRollup != keyValues.Key.Type && av.KeyTypeLineNumber != keyValues.Key.Type {
			if strings.Contains(strings.ToLower(keyValues.Key.Name), strings.ToLower(keyword)) {
				ret = append(ret, keyValues.Key)
			}
		}
	}
	return
}

func SearchAttributeViewRelationKey(avID, keyword string) (ret []*av.Key) {
	waitForSyncingStorages()

	ret = []*av.Key{}
	attrView, err := av.ParseAttributeView(avID)
	if err != nil {
		logging.LogErrorf("parse attribute view [%s] failed: %s", avID, err)
		return
	}

	for _, keyValues := range attrView.KeyValues {
		if av.KeyTypeRelation == keyValues.Key.Type && nil != keyValues.Key.Relation {
			if strings.Contains(strings.ToLower(keyValues.Key.Name), strings.ToLower(keyword)) {
				ret = append(ret, keyValues.Key)
			}
		}
	}
	return
}

func GetAttributeView(avID string) (ret *av.AttributeView) {
	waitForSyncingStorages()

	ret, _ = av.ParseAttributeView(avID)
	return
}

type AvSearchResult struct {
	AvID       string            `json:"avID"`
	AvName     string            `json:"avName"`
	ViewName   string            `json:"viewName"`
	ViewID     string            `json:"viewID"`
	ViewLayout av.LayoutType     `json:"viewLayout"`
	BlockID    string            `json:"blockID"`
	HPath      string            `json:"hPath"`
	Children   []*AvSearchResult `json:"children,omitempty"`
}

type AvSearchTempResult struct {
	AvID      string
	AvName    string
	AvUpdated int64
	Score     float64
}

func SearchAttributeView(keyword string, excludeAvIDs []string) (ret []*AvSearchResult) {
	waitForSyncingStorages()

	ret = []*AvSearchResult{}
	keyword = strings.TrimSpace(keyword)
	keywords := strings.Fields(keyword)

	var avSearchTmpResults []*AvSearchTempResult
	avDir := filepath.Join(util.DataDir, "storage", "av")
	entries, err := os.ReadDir(avDir)
	if err != nil {
		logging.LogErrorf("read directory [%s] failed: %s", avDir, err)
		return
	}

	avBlockRels := av.GetBlockRels()
	if 1 > len(avBlockRels) {
		return
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		id := strings.TrimSuffix(entry.Name(), ".json")
		if !ast.IsNodeIDPattern(id) {
			continue
		}

		if gulu.Str.Contains(id, excludeAvIDs) {
			continue
		}

		if nil == avBlockRels[id] {
			continue
		}

		name, _ := av.GetAttributeViewNameByPath(filepath.Join(avDir, entry.Name()))
		info, _ := entry.Info()
		if "" != keyword {
			score := 0.0
			hit := false
			for _, k := range keywords {
				if strings.Contains(strings.ToLower(name), strings.ToLower(k)) {
					score += smetrics.JaroWinkler(name, k, 0.7, 4)
					hit = true
				} else {
					hit = false
					break
				}
			}

			if hit {
				a := &AvSearchTempResult{AvID: id, AvName: name, Score: score}
				if nil != info && !info.ModTime().IsZero() {
					a.AvUpdated = info.ModTime().UnixMilli()
				}
				avSearchTmpResults = append(avSearchTmpResults, a)
			}
		} else {
			a := &AvSearchTempResult{AvID: id, AvName: name}
			if nil != info && !info.ModTime().IsZero() {
				a.AvUpdated = info.ModTime().UnixMilli()
			}
			avSearchTmpResults = append(avSearchTmpResults, a)
		}
	}

	if "" == keyword {
		sort.Slice(avSearchTmpResults, func(i, j int) bool { return avSearchTmpResults[i].AvUpdated > avSearchTmpResults[j].AvUpdated })
	} else {
		sort.SliceStable(avSearchTmpResults, func(i, j int) bool {
			if avSearchTmpResults[i].Score == avSearchTmpResults[j].Score {
				return avSearchTmpResults[i].AvUpdated > avSearchTmpResults[j].AvUpdated
			}
			return avSearchTmpResults[i].Score > avSearchTmpResults[j].Score
		})
	}
	if 12 <= len(avSearchTmpResults) {
		avSearchTmpResults = avSearchTmpResults[:12]
	}

	for _, tmpResult := range avSearchTmpResults {
		bIDs := avBlockRels[tmpResult.AvID]
		var node *ast.Node
		for _, bID := range bIDs {
			tree, _ := LoadTreeByBlockID(bID)
			if nil == tree {
				continue
			}

			node = treenode.GetNodeInTree(tree, bID)
			if nil == node || "" == node.AttributeViewID || ast.NodeAttributeView != node.Type {
				node = nil
				continue
			}

			break
		}

		if nil == node {
			continue
		}

		attrView, _ := av.ParseAttributeView(tmpResult.AvID)
		if nil == attrView {
			continue
		}

		var hPath string
		baseBlock := treenode.GetBlockTreeRootByPath(node.Box, node.Path)
		if nil != baseBlock {
			hPath = baseBlock.HPath
		}
		box := Conf.Box(node.Box)
		if nil != box {
			hPath = box.Name + hPath
		}

		name := tmpResult.AvName
		if "" == name {
			name = Conf.language(267)
		}

		parent := &AvSearchResult{
			AvID:    tmpResult.AvID,
			AvName:  tmpResult.AvName,
			BlockID: node.ID,
			HPath:   hPath,
		}
		ret = append(ret, parent)

		for _, view := range attrView.Views {
			child := &AvSearchResult{
				AvID:       tmpResult.AvID,
				AvName:     tmpResult.AvName,
				ViewName:   view.Name,
				ViewID:     view.ID,
				ViewLayout: view.LayoutType,
				BlockID:    node.ID,
				HPath:      hPath,
			}
			parent.Children = append(parent.Children, child)
		}
	}
	return
}

type BlockAttributeViewKeys struct {
	AvID      string          `json:"avID"`
	AvName    string          `json:"avName"`
	BlockIDs  []string        `json:"blockIDs"`
	KeyValues []*av.KeyValues `json:"keyValues"`
}

func GetBlockAttributeViewKeys(nodeID string) (ret []*BlockAttributeViewKeys) {
	waitForSyncingStorages()

	ret = []*BlockAttributeViewKeys{}
	attrs := sql.GetBlockAttrs(nodeID)
	avs := attrs[av.NodeAttrNameAvs]
	if "" == avs {
		return
	}

	cachedAttrViews := map[string]*av.AttributeView{}
	avIDs := strings.Split(avs, ",")
	for _, avID := range avIDs {
		attrView := cachedAttrViews[avID]
		if nil == attrView {
			var err error
			attrView, err = av.ParseAttributeView(avID)
			if nil == attrView {
				logging.LogErrorf("parse attribute view [%s] failed: %s", avID, err)
				continue
			}
			cachedAttrViews[avID] = attrView
		}

		if !attrView.ExistBoundBlock(nodeID) {
			// 比如剪切后粘贴，块 ID 会变，但是属性还在块上，这里做一次数据订正
			// Auto verify the database name when clicking the block superscript icon https://github.com/lonelyor/SourceFlow/issues/10861
			unbindBlockAv(nil, avID, nodeID)
			return
		}

		blockVal := attrView.GetBlockValueByBoundID(nodeID)
		if nil == blockVal {
			continue
		}

		itemID := blockVal.BlockID
		view, err := getRenderAttributeViewView(attrView, "", nodeID)
		if nil != err {
			continue
		}

		// 渲染填充 attrView.KeyValues
		sql.RenderView(attrView, view, "")

		var keyValues []*av.KeyValues
		for _, kv := range attrView.KeyValues {
			if av.KeyTypeLineNumber == kv.Key.Type {
				// 属性面板中不显示行号字段
				// The line number field no longer appears in the database attribute panel https://github.com/lonelyor/SourceFlow/issues/11319
				continue
			}

			kValues := &av.KeyValues{Key: kv.Key}
			for _, v := range kv.Values {
				if v.BlockID == itemID {
					kValues.Values = append(kValues.Values, v)
				}
			}

			keyValues = append(keyValues, kValues)
		}

		// 字段排序
		refreshAttrViewKeyIDs(attrView, true)
		sorts := map[string]int{}
		for i, k := range attrView.KeyIDs {
			sorts[k] = i
		}
		sort.Slice(keyValues, func(i, j int) bool {
			return sorts[keyValues[i].Key.ID] < sorts[keyValues[j].Key.ID]
		})

		blockIDs := treenode.GetMirrorAttrViewBlockIDs(avID)
		if 1 > len(blockIDs) {
			// 老数据兼容处理
			avBts := treenode.GetBlockTreesByType("av")
			for _, avBt := range avBts {
				if nil == avBt {
					continue
				}
				tree, _ := LoadTreeByBlockID(avBt.ID)
				if nil == tree {
					continue
				}
				node := treenode.GetNodeInTree(tree, avBt.ID)
				if nil == node {
					continue
				}
				if avID == node.AttributeViewID {
					blockIDs = append(blockIDs, avBt.ID)
				}
			}
			if 1 > len(blockIDs) {
				tree, _ := LoadTreeByBlockID(nodeID)
				if nil != tree {
					node := treenode.GetNodeInTree(tree, nodeID)
					if nil != node {
						if removeErr := removeNodeAvID(node, avID, nil, tree); nil != removeErr {
							logging.LogErrorf("remove node avID [%s] failed: %s", avID, removeErr)
						}
					}
				}
				continue
			}
			blockIDs = gulu.Str.RemoveDuplicatedElem(blockIDs)
			for _, blockID := range blockIDs {
				av.UpsertBlockRel(avID, blockID)
			}
		}

		ret = append(ret, &BlockAttributeViewKeys{
			AvID:      avID,
			AvName:    getAttrViewName(attrView),
			BlockIDs:  blockIDs,
			KeyValues: keyValues,
		})
	}
	return
}
