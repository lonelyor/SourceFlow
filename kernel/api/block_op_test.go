package api

import (
	"strings"
	"testing"

	"github.com/lonelyor/sourceflow/kernel/util"
)

func TestDataBlockDOMSanitizedEmptyMarkdownKeepsBlankParagraph(t *testing.T) {
	blockDOM, err := dataBlockDOM("", util.NewLute(), true)
	if err != nil {
		t.Fatalf("dataBlockDOM() error = %v", err)
	}
	if !strings.Contains(blockDOM, `data-type="NodeParagraph"`) {
		t.Fatalf("dataBlockDOM() must keep blank paragraph for empty markdown: %s", blockDOM)
	}
}
