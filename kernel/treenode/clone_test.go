package treenode

import (
	"testing"

	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
)

func TestCloneNodeDetachesMutableTree(t *testing.T) {
	root := &ast.Node{Type: ast.NodeDocument, ID: "root"}
	first := &ast.Node{Type: ast.NodeParagraph, ID: "first", Tokens: []byte("first")}
	second := &ast.Node{Type: ast.NodeParagraph, ID: "second", Tokens: []byte("second")}
	root.AppendChild(first)
	root.AppendChild(second)

	clonedFirst := CloneNode(first)
	if clonedFirst == first {
		t.Fatal("CloneNode must return a different node")
	}
	if clonedFirst.Parent != nil || clonedFirst.Next != nil || clonedFirst.Previous != nil {
		t.Fatal("CloneNode must return a detached node")
	}

	renderRoot := &ast.Node{Type: ast.NodeDocument, ID: "render"}
	renderRoot.AppendChild(clonedFirst)
	if root.FirstChild != first {
		t.Fatal("appending a cloned node must not detach the source first child")
	}
	if first.Next != second || second.Previous != first {
		t.Fatal("appending a cloned node must not mutate source sibling links")
	}

	clonedFirst.Tokens[0] = 'F'
	if string(first.Tokens) != "first" {
		t.Fatal("mutating cloned tokens must not mutate source tokens")
	}
}
