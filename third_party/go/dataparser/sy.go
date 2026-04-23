// SourceFlow - Make knowledge flow
// MIT License
//
// Copyright (c) 2019-present B3log 开源, b3log.org
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

package dataparser

import (
	"bytes"
	"strings"

	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
	"github.com/lonelyor/sourceflow/third_party/go/lute/editor"
	"github.com/lonelyor/sourceflow/third_party/go/lute/parse"
)

func ParseJSONWithoutFix(jsonData []byte, options *parse.Options) (ret *parse.Tree, err error) {
	root := &ast.Node{}
	err = unmarshalJSON(jsonData, root)
	if err != nil {
		return
	}

	ret = &parse.Tree{Name: "", ID: root.ID, Root: &ast.Node{Type: ast.NodeDocument, ID: root.ID, Spec: root.Spec}, Context: &parse.Context{ParseOption: options}}
	ret.Root.KramdownIAL = parse.Map2IAL(root.Properties)
	ret.Root.SetIALAttr("type", "doc")
	ret.Context.Tip = ret.Root
	if nil == root.Children {
		return
	}

	idMap := map[string]bool{}
	for _, child := range root.Children {
		genTreeByJSON(child, ret, &idMap, nil, nil, true)
	}
	return
}

func ParseJSON(jsonData []byte, options *parse.Options) (ret *parse.Tree, needFix bool, err error) {
	root := &ast.Node{}
	err = unmarshalJSON(jsonData, root)
	if err != nil {
		return
	}

	ret = &parse.Tree{Name: "", ID: root.ID, Root: &ast.Node{Type: ast.NodeDocument, ID: root.ID, Spec: root.Spec}, Context: &parse.Context{ParseOption: options}}
	ret.Root.KramdownIAL = parse.Map2IAL(root.Properties)
	ret.Root.SetIALAttr("type", "doc")
	for _, kv := range ret.Root.KramdownIAL {
		if strings.Contains(kv[1], "\n") {
			val := kv[1]
			val = strings.ReplaceAll(val, "\n", editor.IALValEscNewLine)
			ret.Root.SetIALAttr(kv[0], val)
			needFix = true
		}
	}

	ret.Context.Tip = ret.Root
	if nil == root.Children {
		newPara := &ast.Node{Type: ast.NodeParagraph, ID: ast.NewNodeID()}
		newPara.SetIALAttr("id", newPara.ID)
		newPara.SetIALAttr("updated", newPara.ID[:14])
		ret.Root.AppendChild(newPara)
		needFix = true
		return
	}

	needMigrate2Spec1 := false
	idMap := map[string]bool{}
	for _, child := range root.Children {
		genTreeByJSON(child, ret, &idMap, &needFix, &needMigrate2Spec1, false)
	}

	if nil == ret.Root.FirstChild {
		// 如果是空文档的话挂一个空段落上去
		newP := newParagraph()
		ret.Root.AppendChild(newP)
		ret.Root.SetIALAttr("updated", newP.ID[:14])
	}

	if needMigrate2Spec1 {
		parse.NestedInlines2FlattedSpans(ret, false)
		needFix = true
	}
	return
}

func genTreeByJSON(node *ast.Node, tree *parse.Tree, idMap *map[string]bool, needFix, needMigrate2Spec1 *bool, ignoreFix bool) {
	node.Tokens, node.Type = gulu.Str.ToBytes(node.Data), ast.Str2NodeType(node.TypeStr)
	node.Data, node.TypeStr = "", ""
	node.KramdownIAL = parse.Map2IAL(node.Properties)
	node.Properties = nil

	if !ignoreFix {
		// 历史数据订正

		if -1 == node.Type {
			*needFix = true
			node.Type = ast.NodeParagraph
			node.AppendChild(&ast.Node{Type: ast.NodeText, Tokens: node.Tokens})
			node.Children = nil
		}

		switch node.Type {
		case ast.NodeList:
			if 1 > len(node.Children) {
				*needFix = true
				return // 忽略空列表
			}
		case ast.NodeListItem:
			if 1 > len(node.Children) {
				*needFix = true
				return // 忽略空列表项
			}
		case ast.NodeBlockquote:
			if 2 > len(node.Children) {
				*needFix = true
				return // 忽略空引述
			}
		case ast.NodeSuperBlock:
			if 4 > len(node.Children) {
				*needFix = true
				return // 忽略空超级块
			}
		case ast.NodeMathBlock:
			if 1 > len(node.Children) {
				*needFix = true
				return // 忽略空公式
			}
		case ast.NodeBlockQueryEmbed:
			if 1 > len(node.Children) {
				*needFix = true
				return // 忽略空查询嵌入块
			}
		case ast.NodeCodeBlock:
			if 4 > len(node.Children) {
				// https://ld246.com/article/1713689223067
				existCode := false
				for _, child := range node.Children {
					if ast.NodeCodeBlockCode.String() == child.TypeStr {
						existCode = true
						break
					}
				}
				if !existCode {
					*needFix = true
					return // 忽略空代码块
				}
			}
		}

		fixLegacyData(tree.Context.Tip, node, idMap, needFix, needMigrate2Spec1)
	}

	tree.Context.Tip.AppendChild(node)
	tree.Context.Tip = node
	defer tree.Context.ParentTip()
	if nil == node.Children {
		return
	}
	for _, child := range node.Children {
		genTreeByJSON(child, tree, idMap, needFix, needMigrate2Spec1, ignoreFix)
	}
	node.Children = nil
}

func fixLegacyData(tip, node *ast.Node, idMap *map[string]bool, needFix, needMigrate2Spec1 *bool) {
	if node.IsBlock() {
		if "" == node.ID {
			node.ID = ast.NewNodeID()
			node.SetIALAttr("id", node.ID)
			*needFix = true
		}

		if node.ID != node.IALAttr("id") {
			//某些情况下会导致 ID 和属性 id 不相同 https://ld246.com/article/1722826829447
			node.SetIALAttr("id", node.ID)
			*needFix = true
		}

		if 0 < len(node.Children) && ast.NodeBr.String() == node.Children[len(node.Children)-1].TypeStr {
			// 剔除块尾多余的软换行 https://github.com/lonelyor/SourceFlow/issues/6191
			node.Children = node.Children[:len(node.Children)-1]
			*needFix = true
		}
	}
	if "" != node.ID {
		if _, ok := (*idMap)[node.ID]; ok {
			node.ID = ast.NewNodeID()
			node.SetIALAttr("id", node.ID)
			*needFix = true
		}
		(*idMap)[node.ID] = true
	}

	switch node.Type {
	case ast.NodeIFrame:
		if bytes.Contains(node.Tokens, gulu.Str.ToBytes("iframe-content")) {
			start := bytes.Index(node.Tokens, gulu.Str.ToBytes("<iframe"))
			end := bytes.Index(node.Tokens, gulu.Str.ToBytes("</iframe>"))
			node.Tokens = node.Tokens[start : end+9]
			*needFix = true
		}
	case ast.NodeWidget:
		if bytes.Contains(node.Tokens, gulu.Str.ToBytes("http://127.0.0.1:6806")) {
			node.Tokens = bytes.ReplaceAll(node.Tokens, []byte("http://127.0.0.1:6806"), nil)
			*needFix = true
		}
	case ast.NodeList:
		if nil != node.ListData && 3 != node.ListData.Typ && 0 < len(node.Children) &&
			nil != node.Children[0].ListData && 3 == node.Children[0].ListData.Typ {
			node.ListData.Typ = 3
			*needFix = true
		}
	case ast.NodeMark:
		if 3 == len(node.Children) && "NodeText" == node.Children[1].TypeStr {
			if strings.HasPrefix(node.Children[1].Data, " ") || strings.HasSuffix(node.Children[1].Data, " ") {
				node.Children[1].Data = strings.TrimSpace(node.Children[1].Data)
				*needFix = true
			}
		}
	case ast.NodeHeading:
		if 6 < node.HeadingLevel {
			node.HeadingLevel = 6
			*needFix = true
		}
	case ast.NodeLinkDest:
		if bytes.HasPrefix(node.Tokens, []byte("assets/")) && bytes.HasSuffix(node.Tokens, []byte(" ")) {
			node.Tokens = bytes.TrimSpace(node.Tokens)
			*needFix = true
		}
	case ast.NodeText:
		if nil != tip.LastChild && ast.NodeTagOpenMarker == tip.LastChild.Type && 1 > len(node.Tokens) {
			node.Tokens = []byte("Untitled")
			*needFix = true
		}
	case ast.NodeTagCloseMarker:
		if nil != tip.LastChild {
			if ast.NodeTagOpenMarker == tip.LastChild.Type {
				tip.AppendChild(&ast.Node{Type: ast.NodeText, Tokens: []byte("Untitled")})
				*needFix = true
			} else if "" == tip.LastChild.Text() {
				tip.LastChild.Type = ast.NodeText
				tip.LastChild.Tokens = []byte("Untitled")
				*needFix = true
			}
		}
	case ast.NodeBlockRef:
		// 建立索引时无法解析 `v2.2.0-` 版本的块引用 https://github.com/lonelyor/SourceFlow/issues/6889
		// 早先的迁移程序有缺陷，漏迁移了块引用节点，这里检测到块引用节点后标识需要迁移
		*needMigrate2Spec1 = true
	case ast.NodeInlineHTML:
		*needFix = true
		node.Type = ast.NodeHTMLBlock
	}

	for _, kv := range node.KramdownIAL {
		if strings.Contains(kv[1], "\n") {
			val := kv[1]
			val = strings.ReplaceAll(val, "\n", editor.IALValEscNewLine)
			node.SetIALAttr(kv[0], val)
			*needFix = true
		}
	}
}

func newParagraph() (ret *ast.Node) {
	id := ast.NewNodeID()
	ret = &ast.Node{ID: id, Type: ast.NodeParagraph}
	ret.SetIALAttr("id", id)
	ret.SetIALAttr("updated", id[:14])
	return
}
