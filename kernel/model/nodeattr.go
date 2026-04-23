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

import "github.com/lonelyor/sourceflow/third_party/go/lute/ast"

const (
	DailyNoteAttrPrefix = "custom-dailynote-"
	NodeAttrTitleEmpty  = "custom-sf-title-empty"
)

func GetNodeAttr(attrs map[string]string, key string) string {
	if nil == attrs {
		return ""
	}
	return attrs[key]
}

func GetNodeIALAttr(node *ast.Node, key string) string {
	if nil == node {
		return ""
	}
	return node.IALAttr(key)
}

func IsNodeTitleEmpty(node *ast.Node) bool {
	return "" != GetNodeIALAttr(node, NodeAttrTitleEmpty)
}

func SetNodeTitleEmpty(node *ast.Node, empty bool) {
	if nil == node {
		return
	}
	if empty {
		node.SetIALAttr(NodeAttrTitleEmpty, "true")
		return
	}
	node.RemoveIALAttr(NodeAttrTitleEmpty)
}
