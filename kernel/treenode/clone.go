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

package treenode

import "github.com/lonelyor/sourceflow/third_party/go/lute/ast"

// CloneNode returns a detached deep copy suitable for read-only rendering
// transforms. The source tree must not be mutated by display-only code.
func CloneNode(node *ast.Node) *ast.Node {
	if nil == node {
		return nil
	}

	ret := *node
	ret.Parent = nil
	ret.Previous = nil
	ret.Next = nil
	ret.FirstChild = nil
	ret.LastChild = nil
	ret.Children = nil

	ret.Tokens = cloneBytes(node.Tokens)
	ret.CodeBlockOpenFence = cloneBytes(node.CodeBlockOpenFence)
	ret.CodeBlockInfo = cloneBytes(node.CodeBlockInfo)
	ret.CodeBlockCloseFence = cloneBytes(node.CodeBlockCloseFence)
	ret.TableAligns = cloneInts(node.TableAligns)
	ret.LinkRefLabel = cloneBytes(node.LinkRefLabel)
	ret.FootnotesRefLabel = cloneBytes(node.FootnotesRefLabel)
	ret.FootnotesRefs = cloneNodeRefs(node.FootnotesRefs)
	ret.HtmlEntityTokens = cloneBytes(node.HtmlEntityTokens)
	ret.KramdownIAL = cloneIAL(node.KramdownIAL)
	ret.Properties = cloneStringMap(node.Properties)
	ret.ListData = cloneListData(node.ListData)

	for child := node.FirstChild; nil != child; child = child.Next {
		ret.AppendChild(CloneNode(child))
	}
	if nil == node.FirstChild {
		for _, child := range node.Children {
			ret.AppendChild(CloneNode(child))
		}
	}
	return &ret
}

func cloneBytes(src []byte) []byte {
	if nil == src {
		return nil
	}
	ret := make([]byte, len(src))
	copy(ret, src)
	return ret
}

func cloneInts(src []int) []int {
	if nil == src {
		return nil
	}
	ret := make([]int, len(src))
	copy(ret, src)
	return ret
}

func cloneIAL(src [][]string) [][]string {
	if nil == src {
		return nil
	}
	ret := make([][]string, 0, len(src))
	for _, item := range src {
		cloned := make([]string, len(item))
		copy(cloned, item)
		ret = append(ret, cloned)
	}
	return ret
}

func cloneStringMap(src map[string]string) map[string]string {
	if nil == src {
		return nil
	}
	ret := make(map[string]string, len(src))
	for key, value := range src {
		ret[key] = value
	}
	return ret
}

func cloneListData(src *ast.ListData) *ast.ListData {
	if nil == src {
		return nil
	}
	ret := *src
	ret.Marker = cloneBytes(src.Marker)
	return &ret
}

func cloneNodeRefs(src []*ast.Node) []*ast.Node {
	if nil == src {
		return nil
	}
	ret := make([]*ast.Node, len(src))
	copy(ret, src)
	return ret
}
