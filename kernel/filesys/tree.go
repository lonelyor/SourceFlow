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

package filesys

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"

	jsoniter "github.com/json-iterator/go"
	"github.com/lonelyor/sourceflow/kernel/cache"
	"github.com/lonelyor/sourceflow/kernel/treenode"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/dataparser"
	"github.com/lonelyor/sourceflow/third_party/go/filelock"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
	"github.com/lonelyor/sourceflow/third_party/go/lute"
	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
	"github.com/lonelyor/sourceflow/third_party/go/lute/html"
	"github.com/lonelyor/sourceflow/third_party/go/lute/parse"
	"github.com/lonelyor/sourceflow/third_party/go/lute/render"
	"github.com/panjf2000/ants/v2"
)

func LoadTrees(ids []string) (ret map[string]*parse.Tree) {
	ret = map[string]*parse.Tree{}
	if 1 > len(ids) {
		return ret
	}

	bts := treenode.GetBlockTrees(ids)
	luteEngine := util.NewLute()
	var boxIDs []string
	var paths []string
	blockIDs := map[string][]string{}
	for _, bt := range bts {
		boxIDs = append(boxIDs, bt.BoxID)
		paths = append(paths, bt.Path)
		if _, ok := blockIDs[bt.RootID]; !ok {
			blockIDs[bt.RootID] = []string{}
		}
		blockIDs[bt.RootID] = append(blockIDs[bt.RootID], bt.ID)
	}

	trees, errs := batchLoadTrees(boxIDs, paths, luteEngine)
	for i := range trees {
		tree := trees[i]
		err := errs[i]
		if err != nil || tree == nil {
			logging.LogErrorf("load tree failed: %s", err)
			continue
		}

		bIDs := blockIDs[tree.Root.ID]
		for _, bID := range bIDs {
			ret[bID] = tree
		}
	}
	return
}

func batchLoadTrees(boxIDs, paths []string, luteEngine *lute.Lute) (ret []*parse.Tree, errs []error) {
	waitGroup := sync.WaitGroup{}
	lock := sync.Mutex{}
	poolSize := min(runtime.NumCPU(), 8)

	p, _ := ants.NewPoolWithFunc(poolSize, func(arg interface{}) {
		defer waitGroup.Done()

		i := arg.(int)
		boxID := boxIDs[i]
		path := paths[i]
		tree, err := LoadTree(boxID, path, luteEngine)
		lock.Lock()
		ret = append(ret, tree)
		errs = append(errs, err)
		lock.Unlock()
	})
	loaded := map[string]bool{}
	for i := range paths {
		if loaded[boxIDs[i]+paths[i]] {
			continue
		}

		loaded[boxIDs[i]+paths[i]] = true

		waitGroup.Add(1)
		p.Invoke(i)
	}
	waitGroup.Wait()
	p.Release()
	return
}

func LoadTree(boxID, p string, luteEngine *lute.Lute) (ret *parse.Tree, err error) {
	cleanPath, err := util.CleanRelativePath(p)
	if nil != err {
		logging.LogErrorf("resolve tree [%s] failed: %s", p, err)
		return
	}
	if "" == cleanPath || !strings.HasSuffix(cleanPath, ".sf") {
		err = fmt.Errorf("invalid tree path [%s]", p)
		logging.LogErrorf("%s", err)
		return
	}
	treePath := "/" + cleanPath
	rootID := util.GetTreeID(cleanPath)

	if raw, ok := cache.GetTreeData(rootID); ok {
		return LoadTreeByData(raw, boxID, treePath, luteEngine)
	}

	filePath, err := util.ResolvePathUnder(filepath.Join(util.DataDir, boxID), cleanPath)
	if nil != err {
		logging.LogErrorf("resolve tree [%s] failed: %s", p, err)
		return
	}
	data, err := filelock.ReadFile(filePath)
	if nil != err {
		logging.LogErrorf("load tree [%s] failed: %s", p, err)
		return
	}

	data, err = correctTreeJSONData(boxID, treePath, data, luteEngine)
	if nil != err {
		return
	}

	ret, err = LoadTreeByData(data, boxID, treePath, luteEngine)
	if nil == err {
		cache.SetTreeData(rootID, data)
	}
	return
}

func LoadTreeByData(data []byte, boxID, p string, luteEngine *lute.Lute) (ret *parse.Tree, err error) {
	cleanPath, err := util.CleanRelativePath(p)
	if nil != err {
		logging.LogErrorf("resolve tree data path [%s] failed: %s", p, err)
		return
	}
	if "" == cleanPath || !strings.HasSuffix(cleanPath, ".sf") {
		err = fmt.Errorf("invalid tree path [%s]", p)
		logging.LogErrorf("%s", err)
		return
	}

	treePath := "/" + cleanPath
	ret, err = parseJSON2Tree(boxID, treePath, data, luteEngine)
	if nil != err {
		logging.LogErrorf("parse tree [%s] failed: %s", p, err)
		return
	}
	ret.Path = treePath
	ret.Root.Path = treePath

	parts := strings.Split(cleanPath, "/")
	parts = parts[:len(parts)-1]
	if 1 > len(parts) {
		ret.HPath = "/" + ret.Root.IALAttr("title")
		ret.Hash = treenode.NodeHash(ret.Root, ret, luteEngine)
		return
	}

	hPathBuilder := bytes.Buffer{}
	hPathBuilder.WriteString("/")
	for i := range parts {
		var parentAbsPath string
		if 0 < i {
			parentAbsPath = strings.Join(parts[:i+1], "/")
		} else {
			parentAbsPath = parts[0]
		}
		parentAbsPath += ".sf"
		parentPath := parentAbsPath
		parentAbsPath, err = util.ResolvePathUnder(filepath.Join(util.DataDir, boxID), parentPath)
		if nil != err {
			logging.LogErrorf("resolve parent tree [%s] failed: %s", parentPath, err)
			return
		}

		parentDocIAL := DocIAL(parentAbsPath)
		if 1 > len(parentDocIAL) {
			parentTree := treenode.NewTree(boxID, parentPath, hPathBuilder.String()+"Untitled", "Untitled")
			if _, writeErr := WriteTree(parentTree); nil != writeErr {
				logging.LogErrorf("rebuild parent tree [%s] failed: %s", parentAbsPath, writeErr)
			} else {
				logging.LogInfof("rebuilt parent tree [%s]", parentAbsPath)
				treenode.UpsertBlockTree(parentTree)
			}
			hPathBuilder.WriteString("Untitled/")
			continue
		}

		title := parentDocIAL["title"]
		if "" == title {
			title = "Untitled"
		}
		hPathBuilder.WriteString(util.UnescapeHTML(title))
		hPathBuilder.WriteString("/")
	}
	hPathBuilder.WriteString(ret.Root.IALAttr("title"))
	ret.HPath = hPathBuilder.String()
	ret.Hash = treenode.NodeHash(ret.Root, ret, luteEngine)
	return
}

func DocIAL(absPath string) (ret map[string]string) {
	filelock.Lock(absPath)
	file, err := os.Open(absPath)
	if err != nil {
		logging.LogErrorf("open file [%s] failed: %s", absPath, err)
		filelock.Unlock(absPath)
		return nil
	}

	iter := jsoniter.Parse(jsoniter.ConfigCompatibleWithStandardLibrary, file, 512)
	for field := iter.ReadObject(); field != ""; field = iter.ReadObject() {
		if field == "Properties" {
			iter.ReadVal(&ret)
			break
		} else {
			iter.Skip()
		}
	}
	file.Close()
	filelock.Unlock(absPath)
	return
}

func TreeSize(tree *parse.Tree) (size uint64) {
	luteEngine := util.NewLute() // 不关注用户的自定义解析渲染选项
	renderer := render.NewJSONRenderer(tree, luteEngine.RenderOptions, luteEngine.ParseOptions)
	return uint64(len(renderer.Render()))
}

func WriteTree(tree *parse.Tree) (size uint64, err error) {
	data, filePath, err := prepareWriteTree(tree)
	if err != nil {
		return
	}

	if err = writeTreeByWriteFile(filePath, data); nil != err {
		return
	}

	if util.ExceedLargeFileWarningSize(len(data)) {
		msg := fmt.Sprintf(util.Langs[util.Lang][268], tree.Root.IALAttr("title")+" "+filepath.Base(filePath), util.LargeFileWarningSize)
		util.PushErrMsg(msg, 7000)
	}

	cache.SetTreeData(tree.ID, data)
	afterWriteTree(tree)
	size = uint64(len(data))
	return
}

func PrepareWriteTree(tree *parse.Tree) (data []byte, filePath string, err error) {
	return prepareWriteTree(tree)
}

func AfterWriteTree(tree *parse.Tree) {
	afterWriteTree(tree)
}

func writeTreeByWriteFile(filePath string, data []byte) (err error) {
	if err = filelock.WriteFile(filePath, data); err != nil {
		msg := fmt.Sprintf("write data [%s] failed: %s", filePath, err)
		logging.LogErrorf("%s", msg)
		err = errors.New(msg)
		return
	}
	return
}

func prepareWriteTree(tree *parse.Tree) (data []byte, filePath string, err error) {
	luteEngine := util.NewLute() // 不关注用户的自定义解析渲染选项

	if nil == tree || nil == tree.Root {
		err = errors.New("invalid empty tree")
		return
	}

	filePath, err = util.ResolvePathUnder(filepath.Join(util.DataDir, tree.Box), tree.Path)
	if nil != err {
		logging.LogErrorf("resolve tree write path [%s] failed: %s", tree.Path, err)
		return
	}
	if nil == tree.Root.FirstChild {
		info, statErr := os.Stat(filePath)
		if nil == statErr && 0 < info.Size() {
			err = fmt.Errorf("refuse to write empty tree over existing document [%s]", filePath)
			logging.LogErrorf("%s", err)
			return
		}
		if nil != statErr && !os.IsNotExist(statErr) {
			err = fmt.Errorf("check tree file [%s] failed: %w", filePath, statErr)
			logging.LogErrorf("%s", err)
			return
		}
		newP := treenode.NewParagraph("")
		tree.Root.AppendChild(newP)
		tree.Root.SetIALAttr("updated", util.TimeFromID(newP.ID))
		treenode.UpsertBlockTree(tree)
	}

	treenode.UpgradeSpec(tree)

	tree.Root.SetIALAttr("type", "doc")
	renderer := render.NewJSONRenderer(tree, luteEngine.RenderOptions, luteEngine.ParseOptions)
	data = renderer.Render()
	data = removeUnescapedUnicodeNull(data)
	if !util.UseSingleLineSave {
		buf := bytes.Buffer{}
		buf.Grow(1024 * 1024 * 2)
		if err = json.Indent(&buf, data, "", "\t"); err != nil {
			logging.LogErrorf("json indent failed: %s", err)
			return
		}
		data = buf.Bytes()
	}

	if err = os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		return
	}
	return
}

// removeUnescapedUnicodeNull 只移除未被转义的 `\u0000` 字面序列。
// 判断方法：在匹配到 `\u0000` 时向前数连续的 `\` 个数，若为偶数则视为未转义并移除。
func removeUnescapedUnicodeNull(data []byte) []byte {
	patLen := 6 // len(`\u0000`)
	n := len(data)
	if n < patLen {
		return data
	}
	if !bytes.Contains(data, []byte(`\u0000`)) {
		return data
	}

	dst := make([]byte, 0, n)
	i := 0
	for i < n {
		from := i
		j := bytes.IndexByte(data[i:], '\\')
		if j < 0 {
			dst = append(dst, data[from:]...)
			break
		}
		i += j
		dst = append(dst, data[from:i]...)

		// 快速检查是否可能匹配 `\u0000`
		if i+patLen <= n &&
			data[i+1] == 'u' &&
			data[i+2] == '0' &&
			data[i+3] == '0' &&
			data[i+4] == '0' &&
			data[i+5] == '0' {
			// 统计当前 `\` 之前连续的反斜杠数量
			backslashes := 0
			for k := i - 1; k >= 0 && data[k] == '\\'; k-- {
				backslashes++
			}
			// 若为偶数，则当前 `\` 未被转义，跳过整个 `\u0000`
			if backslashes%2 == 0 {
				i += patLen
				continue
			}
		}
		// 否则保留当前字节
		dst = append(dst, data[i])
		i++
	}
	return dst
}

func afterWriteTree(tree *parse.Tree) {
	docIAL := parse.IAL2MapUnEsc(tree.Root.KramdownIAL)
	cache.PutDocIAL(tree.Path, docIAL)
}

// correctTreeJSONData 订正树 JSON 数据。
func correctTreeJSONData(boxID, p string, jsonData []byte, luteEngine *lute.Lute) ([]byte, error) {
	jsonData = removeUnescapedUnicodeNull(jsonData)
	var needFix bool
	ret, needFix, err := dataparser.ParseJSON(jsonData, luteEngine.ParseOptions)
	if err != nil {
		logging.LogErrorf("parse json [%s] to tree failed: %s", boxID+p, err)
		return nil, err
	}

	ret.Box = boxID
	ret.Path = p

	if err = treenode.CheckSpec(ret); errors.Is(err, treenode.ErrSpecTooNew) {
		return nil, err
	}

	if treenode.UpgradeSpec(ret) {
		needFix = true
	}

	// v3.5.1 https://github.com/lonelyor/SourceFlow/pull/16657 引入的问题，属性值未转义
	// v3.5.2 https://github.com/lonelyor/SourceFlow/issues/16686 进行了修复，并加了订正逻辑 https://github.com/lonelyor/SourceFlow/pull/16712
	// https://github.com/lonelyor/SourceFlow/security/advisories/GHSA-ff66-236v-p4fg XSS 漏洞："title": "&amp;\" onmouseenter=\"require('child_process').exec('calc')"
	if escapeAttributeValues(ret) {
		needFix = true
	}

	if pathID := util.GetTreeID(p); pathID != ret.Root.ID {
		needFix = true
		logging.LogInfof("reset tree id from [%s] to [%s]", ret.Root.ID, pathID)
		ret.Root.ID = pathID
		ret.ID = pathID
		ret.Root.SetIALAttr("id", ret.ID)
	}

	if !needFix {
		return jsonData, nil
	}

	renderer := render.NewJSONRenderer(ret, luteEngine.RenderOptions, luteEngine.ParseOptions)
	data := renderer.Render()

	if !util.UseSingleLineSave {
		buf := bytes.Buffer{}
		buf.Grow(1024 * 1024 * 2)
		if err = json.Indent(&buf, data, "", "\t"); err != nil {
			return nil, err
		}
		data = buf.Bytes()
	}

	filePath, err := util.ResolvePathUnder(filepath.Join(util.DataDir, ret.Box), ret.Path)
	if nil != err {
		return nil, err
	}
	if err = os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		return nil, err
	}
	if err = filelock.WriteFile(filePath, data); err != nil {
		logging.LogErrorf("write data [%s] failed: %s", filePath, err)
	}
	return data, nil
}

func parseJSON2Tree(boxID, p string, jsonData []byte, luteEngine *lute.Lute) (ret *parse.Tree, err error) {
	ret, _, err = dataparser.ParseJSON(jsonData, luteEngine.ParseOptions)
	if err != nil {
		logging.LogErrorf("parse json [%s] to tree failed: %s", boxID+p, err)
		return
	}

	ret.Box = boxID
	ret.Path = p

	if err = treenode.CheckSpec(ret); errors.Is(err, treenode.ErrSpecTooNew) {
		return
	}
	return
}

// escapeAttributeValues 转义属性值
func escapeAttributeValues(tree *parse.Tree) (hasEscaped bool) {
	if nil == tree || nil == tree.Root {
		return false
	}

	ast.Walk(tree.Root, func(n *ast.Node, entering bool) ast.WalkStatus {
		if !entering || !n.IsBlock() || "" == n.ID || 0 == len(n.KramdownIAL) {
			return ast.WalkContinue
		}

		if escaped := escapeNodeAttributeValues(n); escaped {
			hasEscaped = true
		}
		return ast.WalkContinue
	})
	return hasEscaped
}

// escapeNodeAttributeValues 转义节点的属性值
func escapeNodeAttributeValues(node *ast.Node) (escaped bool) {
	if nil == node || 0 == len(node.KramdownIAL) {
		return false
	}

	for _, kv := range node.KramdownIAL {
		// 解码再编码后发生变化则说明未正确转义或存在恶意拼接，需要订正
		canonical := html.EscapeAttrVal(html.UnescapeAttrVal(kv[1]))
		if canonical != kv[1] {
			kv[1] = canonical
			escaped = true
		}
	}
	return
}
