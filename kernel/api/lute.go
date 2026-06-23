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

package api

import (
	"bytes"
	"errors"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/lonelyor/sourceflow/kernel/model"
	"github.com/lonelyor/sourceflow/kernel/treenode"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/filelock"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
	"github.com/lonelyor/sourceflow/third_party/go/lute"
	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
	lutehtml "github.com/lonelyor/sourceflow/third_party/go/lute/html"
	"github.com/lonelyor/sourceflow/third_party/go/lute/html/atom"
	"github.com/lonelyor/sourceflow/third_party/go/lute/parse"
	"github.com/lonelyor/sourceflow/third_party/go/lute/render"
	luteutil "github.com/lonelyor/sourceflow/third_party/go/lute/util"
)

func copyStdMarkdown(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	id := arg["id"].(string)
	assetsDestSpace2Underscore := false
	if nil != arg["assetsDestSpace2Underscore"] {
		assetsDestSpace2Underscore = arg["assetsDestSpace2Underscore"].(bool)
	}

	fillCSSVar := false
	if nil != arg["fillCSSVar"] {
		fillCSSVar = arg["fillCSSVar"].(bool)
	}

	adjustHeadingLevel := false
	if nil != arg["adjustHeadingLevel"] {
		adjustHeadingLevel = arg["adjustHeadingLevel"].(bool)
	}

	imgTag := false
	if nil != arg["imgTag"] {
		imgTag = arg["imgTag"].(bool)
	}

	markdownContent := model.ExportStdMarkdown(id, assetsDestSpace2Underscore, fillCSSVar, adjustHeadingLevel, imgTag)
	if model.IsReadOnlyRoleContext(c) {
		bt := treenode.GetBlockTree(id)
		if bt != nil {
			publishAccess := model.GetPublishAccess()
			markdownContent = model.FilterContentByPublishAccess(c, publishAccess, bt.BoxID, bt.Path, markdownContent, true)
		}
	}
	ret.Data = markdownContent
}

func html2BlockDOM(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	var dom string
	if !util.ParseJsonArgs(arg, ret, util.BindJsonArg("dom", true, &dom)) {
		return
	}
	blockDOM, err := convertHTMLToBlockDOM(dom)
	if nil != err {
		ret.Data = "Failed to convert"
		return
	}
	ret.Data = blockDOM
}

type htmlTableSourceCell struct {
	node    *lutehtml.Node
	colspan int
	rowspan int
	align   string
}

type htmlTableSourceRow struct {
	isHeader bool
	cells    []*htmlTableSourceCell
}

type htmlTableGridSlot struct {
	cell        *htmlTableSourceCell
	placeholder bool
}

func newHTMLPasteLute() *lute.Lute {
	luteEngine := util.NewLute()
	luteEngine.SetHTMLTag2TextMark(true)
	luteEngine.SetHTML2MarkdownAttrs([]string{"alias", "memo", "bookmark", "custom-*"})
	return luteEngine
}

func convertHTMLToBlockDOM(dom string) (string, error) {
	luteEngine := newHTMLPasteLute()
	root := luteutil.ParseHTML(dom)
	if nil == root {
		return "", errors.New("failed to parse html")
	}

	if isolatedTable := findIsolatedTable(root); nil != isolatedTable {
		return convertHTMLTableNodeToBlockDOM(isolatedTable, luteEngine)
	}
	return convertHTMLFragmentWithExistingPipeline(dom, luteEngine)
}

func convertHTMLFragmentWithExistingPipeline(dom string, luteEngine *lute.Lute) (string, error) {
	tree, _ := model.HTML2Tree(dom, luteEngine)
	if nil == tree {
		return "", errors.New("failed to convert html to tree")
	}

	var unlinks []*ast.Node
	ast.Walk(tree.Root, func(n *ast.Node, entering bool) ast.WalkStatus {
		if !entering {
			return ast.WalkContinue
		}

		if ast.NodeListItem == n.Type && nil == n.FirstChild {
			newNode := treenode.NewParagraph("")
			n.AppendChild(newNode)
			n.SetIALAttr("updated", util.TimeFromID(newNode.ID))
			return ast.WalkSkipChildren
		} else if ast.NodeBlockquote == n.Type && nil == n.FirstChild.Next {
			unlinks = append(unlinks, n)
		}
		return ast.WalkContinue
	})
	for _, n := range unlinks {
		n.Unlink()
	}

	// 表格只包含一个单元格时，将其转换为段落
	// Copy one cell from Excel/HTML table and paste it using the cell's content https://github.com/lonelyor/SourceFlow/issues/9614
	unlinks = nil
	if nil != tree.Root.FirstChild && ast.NodeTable == tree.Root.FirstChild.Type && (nil == tree.Root.FirstChild.Next ||
		(ast.NodeKramdownBlockIAL == tree.Root.FirstChild.Next.Type && nil == tree.Root.FirstChild.Next.Next)) {
		if nil != tree.Root.FirstChild.FirstChild && ast.NodeTableHead == tree.Root.FirstChild.FirstChild.Type {
			head := tree.Root.FirstChild.FirstChild
			if nil == head.Next && nil != head.FirstChild && nil == head.FirstChild.Next {
				row := head.FirstChild
				if nil != row.FirstChild && nil == row.FirstChild.Next {
					cell := row.FirstChild
					p := treenode.NewParagraph("")
					var contents []*ast.Node
					for c := cell.FirstChild; nil != c; c = c.Next {
						contents = append(contents, c)
					}
					for _, c := range contents {
						p.AppendChild(c)
					}
					tree.Root.FirstChild.Unlink()
					tree.Root.PrependChild(p)
				}
			}
		}
	}

	if nil != model.Conf && util.ContainerStd == model.Conf.System.Container {
		// 处理本地资源文件复制
		ast.Walk(tree.Root, func(n *ast.Node, entering bool) ast.WalkStatus {
			if !entering || ast.NodeLinkDest != n.Type {
				return ast.WalkContinue
			}

			if "" == n.TokensStr() {
				return ast.WalkContinue
			}

			localPath := n.TokensStr()
			if strings.HasPrefix(localPath, "http") {
				return ast.WalkContinue
			}
			localPath = util.FileURLToLocalPath(localPath)
			if !filepath.IsAbs(localPath) {
				// Kernel crash when copy-pasting from some browsers https://github.com/lonelyor/SourceFlow/issues/9203
				return ast.WalkContinue
			}
			if !gulu.File.IsExist(localPath) {
				return ast.WalkContinue
			}

			if util.IsSensitivePath(localPath) {
				logging.LogWarnf("skip copying asset [%s] due to sensitive path", localPath)
				return ast.WalkContinue
			}

			name := filepath.Base(localPath)
			ext := filepath.Ext(name)
			name = name[0 : len(name)-len(ext)]
			name = name + "-" + ast.NewNodeID() + ext
			targetPath := filepath.Join(util.DataDir, "assets", name)
			if err := filelock.Copy(localPath, targetPath); err != nil {
				logging.LogErrorf("copy asset from [%s] to [%s] failed: %s", localPath, targetPath, err)
				return ast.WalkStop
			}
			n.Tokens = gulu.Str.ToBytes("assets/" + name)
			return ast.WalkContinue
		})
	}

	parse.TextMarks2Inlines(tree) // 先将 TextMark 转换为 Inlines https://github.com/lonelyor/SourceFlow/issues/13056
	parse.NestedInlines2FlattedSpansHybrid(tree, false)

	md, err := lute.FormatNodeSync(tree.Root, luteEngine.ParseOptions, luteEngine.RenderOptions)
	if nil != err {
		return "", err
	}

	tree = parse.Parse("", []byte(md), luteEngine.ParseOptions)
	renderer := render.NewProtyleRenderer(tree, luteEngine.RenderOptions, luteEngine.ParseOptions)
	output := renderer.Render()
	return gulu.Str.FromBytes(output), nil
}

func findIsolatedTable(root *lutehtml.Node) *lutehtml.Node {
	tables := luteutil.DomChildrenByType(root, atom.Table)
	if 1 != len(tables) {
		return nil
	}

	table := tables[0]
	if hasMeaningfulContentOutsideTable(root, table) {
		return nil
	}
	return table
}

func hasMeaningfulContentOutsideTable(root, table *lutehtml.Node) bool {
	var meaningful bool
	var walk func(*lutehtml.Node)
	walk = func(n *lutehtml.Node) {
		if meaningful || nil == n {
			return
		}
		if isDescendantOrSelf(n, table) {
			return
		}

		if lutehtml.CommentNode == n.Type {
			return
		}
		if lutehtml.TextNode == n.Type {
			if "" != strings.TrimSpace(strings.ReplaceAll(n.Data, "\u00A0", " ")) {
				meaningful = true
			}
			return
		}

		switch n.DataAtom {
		case atom.Meta, atom.Script, atom.Style:
			return
		}

		for c := n.FirstChild; nil != c; c = c.NextSibling {
			walk(c)
		}
	}
	walk(root)
	return meaningful
}

func isDescendantOrSelf(n, target *lutehtml.Node) bool {
	for current := n; nil != current; current = current.Parent {
		if current == target {
			return true
		}
	}
	return false
}

func convertHTMLTableNodeToBlockDOM(table *lutehtml.Node, luteEngine *lute.Lute) (string, error) {
	rows := collectHTMLTableRows(table)
	if 1 > len(rows) {
		return convertHTMLFragmentWithExistingPipeline(string(luteutil.DomHTML(table)), luteEngine)
	}

	grid, columnCount := buildHTMLTableGrid(rows)
	if 1 > columnCount {
		return convertHTMLFragmentWithExistingPipeline(string(luteutil.DomHTML(table)), luteEngine)
	}

	actualCellCount := 0
	for _, row := range rows {
		actualCellCount += len(row.cells)
	}
	if 1 == len(rows) && 1 == columnCount && 1 == actualCellCount && 1 == rows[0].cells[0].colspan && 1 == rows[0].cells[0].rowspan {
		return convertHTMLFragmentWithExistingPipeline(domInnerHTML(rows[0].cells[0].node), luteEngine)
	}

	id := ast.NewNodeID()
	updated := util.TimeFromID(id)
	var builder strings.Builder
	builder.WriteString("<div data-node-id=\"")
	builder.WriteString(id)
	builder.WriteString("\" data-node-index=\"1\" data-type=\"NodeTable\" class=\"table\" updated=\"")
	builder.WriteString(updated)
	builder.WriteString("\"><div contenteditable=\"false\"><table contenteditable=\"true\" spellcheck=\"false\"><colgroup>")
	for i := 0; i < columnCount; i++ {
		builder.WriteString("<col />")
	}
	builder.WriteString("</colgroup>")

	headRowCount := 0
	for _, row := range rows {
		if row.isHeader {
			headRowCount++
		}
	}

	builder.WriteString("<thead>")
	if 0 == headRowCount {
		builder.WriteString("<tr>")
		for i := 0; i < columnCount; i++ {
			builder.WriteString("<th></th>")
		}
		builder.WriteString("</tr>")
	} else {
		for rowIndex, row := range rows {
			if !row.isHeader {
				continue
			}
			builder.WriteString(renderHTMLTableRow(grid[rowIndex], row, luteEngine))
		}
	}
	builder.WriteString("</thead><tbody>")
	for rowIndex, row := range rows {
		if row.isHeader {
			continue
		}
		builder.WriteString(renderHTMLTableRow(grid[rowIndex], row, luteEngine))
	}
	builder.WriteString("</tbody></table><div class=\"protyle-action__table\"><div class=\"table__resize\"></div><div class=\"table__select\"></div></div></div><div class=\"protyle-attr\" contenteditable=\"false\">\u200b</div></div>")
	return builder.String(), nil
}

func collectHTMLTableRows(table *lutehtml.Node) []htmlTableSourceRow {
	var headRows, bodyRows []htmlTableSourceRow
	appendRows := func(container *lutehtml.Node, isHeader bool, target *[]htmlTableSourceRow) {
		for tr := container.FirstChild; nil != tr; tr = tr.NextSibling {
			if atom.Tr != tr.DataAtom {
				continue
			}

			row := htmlTableSourceRow{isHeader: isHeader}
			for cell := tr.FirstChild; nil != cell; cell = cell.NextSibling {
				if atom.Th != cell.DataAtom && atom.Td != cell.DataAtom {
					continue
				}
				row.cells = append(row.cells, &htmlTableSourceCell{
					node:    cell,
					colspan: parseHTMLTableCellSpan(cell, "colspan"),
					rowspan: parseHTMLTableCellSpan(cell, "rowspan"),
					align:   parseHTMLTableCellAlign(cell),
				})
			}
			if 0 < len(row.cells) {
				*target = append(*target, row)
			}
		}
	}

	for child := table.FirstChild; nil != child; child = child.NextSibling {
		switch child.DataAtom {
		case atom.Thead:
			appendRows(child, true, &headRows)
		case atom.Tbody, atom.Tfoot:
			appendRows(child, false, &bodyRows)
		case atom.Tr:
			appendRows(table, false, &bodyRows)
			return finalizeHTMLTableRows(headRows, bodyRows)
		}
	}
	return finalizeHTMLTableRows(headRows, bodyRows)
}

func finalizeHTMLTableRows(headRows, bodyRows []htmlTableSourceRow) []htmlTableSourceRow {
	if 0 == len(headRows) && 0 < len(bodyRows) {
		bodyRows[0].isHeader = true
		headRows = append(headRows, bodyRows[0])
		bodyRows = bodyRows[1:]
	}
	return append(headRows, bodyRows...)
}

func parseHTMLTableCellSpan(cell *lutehtml.Node, attr string) int {
	value := strings.TrimSpace(luteutil.DomAttrValue(cell, attr))
	if "" == value {
		return 1
	}
	span, err := strconv.Atoi(value)
	if nil != err || 1 > span {
		return 1
	}
	return span
}

func parseHTMLTableCellAlign(cell *lutehtml.Node) string {
	align := strings.ToLower(strings.TrimSpace(luteutil.DomAttrValue(cell, "align")))
	switch align {
	case "left", "center", "right":
		return align
	}

	style := strings.ToLower(luteutil.DomAttrValue(cell, "style"))
	if "" == style {
		return ""
	}

	for _, part := range strings.Split(style, ";") {
		part = strings.TrimSpace(part)
		if !strings.HasPrefix(part, "text-align:") {
			continue
		}
		value := strings.TrimSpace(strings.TrimPrefix(part, "text-align:"))
		switch value {
		case "left", "center", "right":
			return value
		}
	}
	return ""
}

func buildHTMLTableGrid(rows []htmlTableSourceRow) ([][]*htmlTableGridSlot, int) {
	grid := make([][]*htmlTableGridSlot, len(rows))
	maxCols := 0
	for rowIndex, row := range rows {
		for _, cell := range row.cells {
			colIndex := 0
			for {
				for colIndex < len(grid[rowIndex]) && nil != grid[rowIndex][colIndex] {
					colIndex++
				}
				if htmlTableAreaAvailable(grid, rowIndex, colIndex, cell.rowspan, cell.colspan) {
					break
				}
				colIndex++
			}

			endRow := min(len(rows), rowIndex+cell.rowspan)
			for r := rowIndex; r < endRow; r++ {
				if len(grid[r]) < colIndex+cell.colspan {
					grid[r] = append(grid[r], make([]*htmlTableGridSlot, colIndex+cell.colspan-len(grid[r]))...)
				}
				for c := colIndex; c < colIndex+cell.colspan; c++ {
					grid[r][c] = &htmlTableGridSlot{
						cell:        cell,
						placeholder: !(r == rowIndex && c == colIndex),
					}
				}
			}

			if colIndex+cell.colspan > maxCols {
				maxCols = colIndex + cell.colspan
			}
		}
	}
	return grid, maxCols
}

func htmlTableAreaAvailable(grid [][]*htmlTableGridSlot, rowIndex, colIndex, rowspan, colspan int) bool {
	endRow := min(len(grid), rowIndex+rowspan)
	for r := rowIndex; r < endRow; r++ {
		for c := colIndex; c < colIndex+colspan; c++ {
			if c < len(grid[r]) && nil != grid[r][c] {
				return false
			}
		}
	}
	return true
}

func renderHTMLTableRow(gridRow []*htmlTableGridSlot, row htmlTableSourceRow, luteEngine *lute.Lute) string {
	tagName := "td"
	if row.isHeader {
		tagName = "th"
	}

	maxCols := len(gridRow)
	var builder strings.Builder
	builder.WriteString("<tr>")
	for colIndex := 0; colIndex < maxCols; colIndex++ {
		slot := gridRow[colIndex]
		switch {
		case nil == slot:
			builder.WriteString("<")
			builder.WriteString(tagName)
			builder.WriteString("></")
			builder.WriteString(tagName)
			builder.WriteString(">")
		case slot.placeholder:
			builder.WriteString("<")
			builder.WriteString(tagName)
			builder.WriteString(" class=\"fn__none\"></")
			builder.WriteString(tagName)
			builder.WriteString(">")
		default:
			builder.WriteString(renderHTMLTableCell(tagName, slot.cell, luteEngine))
		}
	}
	builder.WriteString("</tr>")
	return builder.String()
}

func renderHTMLTableCell(tagName string, cell *htmlTableSourceCell, luteEngine *lute.Lute) string {
	var builder strings.Builder
	builder.WriteString("<")
	builder.WriteString(tagName)
	if 1 < cell.colspan {
		builder.WriteString(" colspan=\"")
		builder.WriteString(strconv.Itoa(cell.colspan))
		builder.WriteString("\"")
	}
	if 1 < cell.rowspan {
		builder.WriteString(" rowspan=\"")
		builder.WriteString(strconv.Itoa(cell.rowspan))
		builder.WriteString("\"")
	}
	if "" != cell.align {
		builder.WriteString(" align=\"")
		builder.WriteString(cell.align)
		builder.WriteString("\"")
	}
	builder.WriteString(">")
	builder.WriteString(convertHTMLTableCellContent(cell.node, luteEngine))
	builder.WriteString("</")
	builder.WriteString(tagName)
	builder.WriteString(">")
	return builder.String()
}

func convertHTMLTableCellContent(cell *lutehtml.Node, luteEngine *lute.Lute) string {
	innerHTML := domInnerHTML(cell)
	if "" == strings.TrimSpace(strings.ReplaceAll(innerHTML, "\u00A0", " ")) {
		return ""
	}

	blockDOM, err := convertHTMLFragmentWithExistingPipeline(innerHTML, luteEngine)
	if nil != err {
		return lutehtml.EscapeHTMLStr(strings.TrimSpace(luteutil.DomText(cell)))
	}
	return blockDOMToTableCellContent(blockDOM, luteEngine)
}

func blockDOMToTableCellContent(blockDOM string, luteEngine *lute.Lute) string {
	root := luteutil.ParseHTML(blockDOM)
	if nil == root {
		return ""
	}

	var parts []string
	for child := root.FirstChild; nil != child; child = child.NextSibling {
		if lutehtml.TextNode == child.Type && "" == strings.TrimSpace(child.Data) {
			continue
		}

		inlineHTML := luteEngine.BlockDOM2InlineBlockDOM(string(luteutil.DomHTML(child)))
		inlineHTML = strings.ReplaceAll(inlineHTML, "\n", "<br />")
		if "" == strings.TrimSpace(inlineHTML) {
			continue
		}
		parts = append(parts, inlineHTML)
	}
	return strings.Join(parts, "<br />")
}

func domInnerHTML(n *lutehtml.Node) string {
	buf := &bytes.Buffer{}
	for child := n.FirstChild; nil != child; child = child.NextSibling {
		buf.Write(luteutil.DomHTML(child))
	}
	return buf.String()
}

func spinBlockDOM(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	var dom string
	if !util.ParseJsonArgs(arg, ret, util.BindJsonArg("dom", true, &dom)) {
		return
	}
	luteEngine := model.NewLute()

	dom = luteEngine.SpinBlockDOM(dom)
	ret.Data = map[string]interface{}{
		"dom": dom,
	}
}
