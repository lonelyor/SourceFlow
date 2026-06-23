package api

import (
	"errors"
	"strings"
	"testing"
)

func TestCreateAssistantInboxDocRollsBackOnAttrFailure(t *testing.T) {
	created := false
	removedID := ""
	deps := assistantInboxCreateDeps{
		createWithMarkdown: func(tags, notebook, hPath, markdown, parentID, id string, withMath bool, clippingHref string) (string, error) {
			created = true
			if "/AI/Result" != hPath {
				t.Fatalf("hPath = %q, want normalized inbox path", hPath)
			}
			return "created-doc", nil
		},
		setBlockAttrs: func(id string, attrs map[string]string) error {
			if "created-doc" != id {
				t.Fatalf("setBlockAttrs id = %q", id)
			}
			return errors.New("attrs failed")
		},
		removeCreatedDoc: func(id string) error {
			removedID = id
			return nil
		},
	}

	result, err := createAssistantInboxDoc(&assistantInboxCreateRequest{
		Notebook: "box-1",
		Path:     "/AI/Result",
		Markdown: "markdown",
	}, map[string]string{"custom-inbox": "true"}, deps)
	if nil != result {
		t.Fatalf("result = %#v, want nil on attrs failure", result)
	}
	if nil == err || !strings.Contains(err.Error(), "set assistant inbox attrs failed") {
		t.Fatalf("err = %v, want attrs failure", err)
	}
	if !created {
		t.Fatalf("createWithMarkdown was not called")
	}
	if "created-doc" != removedID {
		t.Fatalf("removedID = %q, want created-doc", removedID)
	}
}

func TestCreateAssistantInboxDocSuccessDoesNotRollback(t *testing.T) {
	removed := false
	flushed := false
	deps := assistantInboxCreateDeps{
		createWithMarkdown: func(tags, notebook, hPath, markdown, parentID, id string, withMath bool, clippingHref string) (string, error) {
			if "assistant-ai" != tags {
				t.Fatalf("tags = %q", tags)
			}
			if "" == strings.TrimSpace(id) {
				t.Fatalf("id should be generated before create")
			}
			return "created-doc", nil
		},
		setBlockAttrs: func(id string, attrs map[string]string) error {
			if "true" != attrs["custom-inbox"] {
				t.Fatalf("attrs = %#v", attrs)
			}
			return nil
		},
		removeCreatedDoc: func(id string) error {
			removed = true
			return nil
		},
		flushTxQueue: func() {
			flushed = true
		},
	}

	result, err := createAssistantInboxDoc(&assistantInboxCreateRequest{
		Notebook: "box-1",
		Path:     "/AI/Result",
		Markdown: "markdown",
		Tags:     "assistant-ai",
	}, map[string]string{"custom-inbox": "true"}, deps)
	if nil != err {
		t.Fatalf("createAssistantInboxDoc err = %v", err)
	}
	if nil == result || "created-doc" != result.ID {
		t.Fatalf("result = %#v", result)
	}
	if removed {
		t.Fatalf("created doc should not be removed on success")
	}
	if !flushed {
		t.Fatalf("flushTxQueue was not called")
	}
}

func TestCreateAssistantInboxDocDoesNotRollbackExistingDoc(t *testing.T) {
	removed := false
	deps := assistantInboxCreateDeps{
		existingDocIDs: func(hPath, notebook string) ([]string, error) {
			return []string{"existing-doc"}, nil
		},
		createWithMarkdown: func(tags, notebook, hPath, markdown, parentID, id string, withMath bool, clippingHref string) (string, error) {
			return "existing-doc", nil
		},
		setBlockAttrs: func(id string, attrs map[string]string) error {
			return errors.New("attrs failed")
		},
		removeCreatedDoc: func(id string) error {
			removed = true
			return nil
		},
	}

	result, err := createAssistantInboxDoc(&assistantInboxCreateRequest{
		Notebook: "box-1",
		Path:     "/AI/Result",
		Markdown: "markdown",
	}, map[string]string{"custom-inbox": "true"}, deps)
	if nil != result {
		t.Fatalf("result = %#v, want nil on attrs failure", result)
	}
	if nil == err || !strings.Contains(err.Error(), "set assistant inbox attrs failed") {
		t.Fatalf("err = %v, want attrs failure", err)
	}
	if removed {
		t.Fatalf("existing doc must not be removed when attr setting fails")
	}
}

func TestNormalizeBlockAttrValuesRejectsNonStringAttrs(t *testing.T) {
	attrs, err := normalizeBlockAttrValues(map[string]interface{}{
		"tags":    "assistant-ai",
		"removed": nil,
	})
	if nil != err {
		t.Fatalf("normalizeBlockAttrValues err = %v", err)
	}
	if "assistant-ai" != attrs["tags"] || "" != attrs["removed"] {
		t.Fatalf("attrs = %#v", attrs)
	}

	_, err = normalizeBlockAttrValues(map[string]interface{}{"bad": 1})
	if nil == err || !strings.Contains(err.Error(), "must be a string") {
		t.Fatalf("err = %v, want non-string attr failure", err)
	}
}
