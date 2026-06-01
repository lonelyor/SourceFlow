package treenode

import (
	"strings"
	"testing"

	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
)

func TestResetBlockIDsRegeneratesExternalIDs(t *testing.T) {
	root := &ast.Node{Type: ast.NodeDocument, ID: "root"}
	paragraph := &ast.Node{Type: ast.NodeParagraph, ID: "20260601120000-abcdefg"}
	paragraph.SetIALAttr("id", paragraph.ID)
	child := &ast.Node{Type: ast.NodeParagraph, ID: "20260601120000-hijklmn"}
	child.SetIALAttr("id", child.ID)
	paragraph.AppendChild(child)
	root.AppendChild(paragraph)

	ResetBlockIDs(root)
	if paragraph.ID == "20260601120000-abcdefg" || child.ID == "20260601120000-hijklmn" {
		t.Fatal("ResetBlockIDs must regenerate caller-supplied block IDs")
	}
	if paragraph.IALAttr("id") != paragraph.ID || child.IALAttr("id") != child.ID {
		t.Fatal("ResetBlockIDs must keep ID attributes in sync")
	}
	if root.ID != "root" {
		t.Fatal("ResetBlockIDs must not rewrite document root ID")
	}
}

func TestResetBlockIDsRemovesParsedIALIDsFromRenderedDOM(t *testing.T) {
	luteEngine := util.NewLute()
	_, tree := luteEngine.Md2BlockDOMTree("paragraph\n{: id=\"20260601120000-abcdefg\"}", true)
	if tree == nil || tree.Root == nil {
		t.Fatal("parse Markdown fixture failed")
	}

	ResetBlockIDs(tree.Root)
	dom := luteEngine.Tree2BlockDOM(tree, luteEngine.RenderOptions, luteEngine.ParseOptions)
	if strings.Contains(dom, "20260601120000-abcdefg") {
		t.Fatalf("rendered DOM must not retain caller-supplied block ID: %s", dom)
	}
}
