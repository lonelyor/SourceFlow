package treenode

import "github.com/lonelyor/sourceflow/third_party/go/lute/ast"

// ResetBlockIDs removes caller-supplied block IDs from an imported fragment.
// External Markdown should not be allowed to collide with existing note IDs.
func ResetBlockIDs(node *ast.Node) {
	if nil == node {
		return
	}
	ast.Walk(node, func(n *ast.Node, entering bool) ast.WalkStatus {
		if !entering || !n.IsBlock() || ast.NodeDocument == n.Type || ast.NodeKramdownBlockIAL == n.Type {
			return ast.WalkContinue
		}
		n.ID = ast.NewNodeID()
		n.SetIALAttr("id", n.ID)
		return ast.WalkContinue
	})
}
