package api

import (
	"strings"
	"testing"
)

func TestConvertHTMLToBlockDOMPreservesMergedTableCells(t *testing.T) {
	blockDOM, err := convertHTMLToBlockDOM(`<div><table><thead><tr><th rowspan="2">A</th><th>B</th></tr><tr><th>C</th></tr></thead><tbody><tr><td colspan="2">D</td></tr></tbody></table></div>`)
	if nil != err {
		t.Fatalf("convertHTMLToBlockDOM() error = %v", err)
	}

	for _, want := range []string{
		`data-type="NodeTable"`,
		`<th rowspan="2">A</th>`,
		`<th class="fn__none"></th>`,
		`<td colspan="2">D</td>`,
		`<td class="fn__none"></td>`,
	} {
		if !strings.Contains(blockDOM, want) {
			t.Fatalf("convertHTMLToBlockDOM() missing %q in %s", want, blockDOM)
		}
	}
}

func TestConvertHTMLToBlockDOMDowngradesSingleCellTable(t *testing.T) {
	blockDOM, err := convertHTMLToBlockDOM(`<table><tbody><tr><td><strong>Only</strong></td></tr></tbody></table>`)
	if nil != err {
		t.Fatalf("convertHTMLToBlockDOM() error = %v", err)
	}

	if strings.Contains(blockDOM, `data-type="NodeTable"`) {
		t.Fatalf("convertHTMLToBlockDOM() unexpectedly returned a table: %s", blockDOM)
	}
	if !strings.Contains(blockDOM, `data-type="NodeParagraph"`) || !strings.Contains(blockDOM, `data-type="strong"`) {
		t.Fatalf("convertHTMLToBlockDOM() did not keep paragraph formatting: %s", blockDOM)
	}
}

func TestConvertHTMLToBlockDOMKeepsUsefulInlineFormattingButDropsCellStyles(t *testing.T) {
	blockDOM, err := convertHTMLToBlockDOM(`<table><tbody><tr><td style="text-align:center;background:#f00;border:1px solid red"><strong>Bold</strong> <em>Italic</em> <code>x</code></td></tr><tr><td><a href="https://example.com">Link</a></td></tr></tbody></table>`)
	if nil != err {
		t.Fatalf("convertHTMLToBlockDOM() error = %v", err)
	}

	for _, want := range []string{
		`align="center"`,
		`data-type="strong"`,
		`data-type="em"`,
		`data-type="code"`,
		`data-type="a" data-href="https://example.com"`,
	} {
		if !strings.Contains(blockDOM, want) {
			t.Fatalf("convertHTMLToBlockDOM() missing %q in %s", want, blockDOM)
		}
	}

	for _, unwanted := range []string{`background`, `border:`, `style="text-align:center`} {
		if strings.Contains(blockDOM, unwanted) {
			t.Fatalf("convertHTMLToBlockDOM() unexpectedly kept %q in %s", unwanted, blockDOM)
		}
	}
}

func TestConvertHTMLToBlockDOMFallsBackWhenHTMLContainsTextOutsideTable(t *testing.T) {
	blockDOM, err := convertHTMLToBlockDOM(`<div><p>Before</p><table><tbody><tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr></tbody></table></div>`)
	if nil != err {
		t.Fatalf("convertHTMLToBlockDOM() error = %v", err)
	}

	if !strings.Contains(blockDOM, `data-type="NodeParagraph"`) {
		t.Fatalf("convertHTMLToBlockDOM() did not keep non-table paragraph content: %s", blockDOM)
	}
	if strings.Contains(blockDOM, `class="fn__none"`) {
		t.Fatalf("convertHTMLToBlockDOM() unexpectedly used merged-table placeholders for mixed HTML: %s", blockDOM)
	}
}
