package api

import (
	"testing"
	"time"

	"github.com/lonelyor/sourceflow/kernel/model"
)

func TestCollectNormalizeURL(t *testing.T) {
	tests := []struct {
		name                  string
		input                 string
		want                  string
		wantAllowHTTPFallback bool
		wantErr               string
	}{
		{
			name:                  "http url",
			input:                 "http://example.com/path?q=1",
			want:                  "http://example.com/path?q=1",
			wantAllowHTTPFallback: false,
		},
		{
			name:                  "https url",
			input:                 "https://example.com/path?q=1",
			want:                  "https://example.com/path?q=1",
			wantAllowHTTPFallback: false,
		},
		{
			name:                  "bare domain",
			input:                 "example.com/path?q=1",
			want:                  "https://example.com/path?q=1",
			wantAllowHTTPFallback: true,
		},
		{
			name:                  "trimmed localhost",
			input:                 "  localhost:6806/api/system/version  ",
			want:                  "https://localhost:6806/api/system/version",
			wantAllowHTTPFallback: true,
		},
		{
			name:    "empty",
			input:   "",
			wantErr: collectURLEmptyMsg,
		},
		{
			name:    "invalid scheme",
			input:   "ftp://example.com/file.txt",
			wantErr: collectURLInvalidMsg,
		},
		{
			name:    "missing host",
			input:   "http://",
			wantErr: collectURLInvalidMsg,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, allowHTTPFallback, err := normalizeCollectURL(test.input)
			if "" != test.wantErr {
				if nil == err {
					t.Fatalf("expected error %q, got nil", test.wantErr)
				}
				if test.wantErr != err.Error() {
					t.Fatalf("expected error %q, got %q", test.wantErr, err.Error())
				}
				return
			}

			if nil != err {
				t.Fatalf("unexpected error: %s", err)
			}
			if test.want != got {
				t.Fatalf("expected %q, got %q", test.want, got)
			}
			if test.wantAllowHTTPFallback != allowHTTPFallback {
				t.Fatalf("expected allowHTTPFallback=%v, got %v", test.wantAllowHTTPFallback, allowHTTPFallback)
			}
		})
	}
}

func TestCollectResolveCollectedWebPath(t *testing.T) {
	tests := []struct {
		name       string
		hPath      string
		pathPrefix string
		title      string
		want       string
	}{
		{
			name:       "existing path wins",
			hPath:      "收件箱/旧路径/现有标题",
			pathPrefix: "收件箱/网页导入",
			title:      "网页标题",
			want:       "/收件箱/旧路径/现有标题",
		},
		{
			name:       "path prefix builds title path",
			pathPrefix: "收件箱/网页导入",
			title:      "网页标题",
			want:       "/收件箱/网页导入/网页标题",
		},
		{
			name:  "default path prefix",
			title: "网页标题",
			want:  "/收件箱/网页导入/网页标题",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := resolveCollectedWebPath(test.hPath, test.pathPrefix, test.title)
			if test.want != got {
				t.Fatalf("expected %q, got %q", test.want, got)
			}
		})
	}
}

func TestCollectBuildCollectedWebAttrs(t *testing.T) {
	attrs := buildCollectedWebAttrs("网页标题", "https://example.com/article")
	if "url" != attrs[model.WorkbenchAttrType] {
		t.Fatalf("unexpected attr %s: %q", model.WorkbenchAttrType, attrs[model.WorkbenchAttrType])
	}
	if "open" != attrs[model.WorkbenchAttrStatus] {
		t.Fatalf("unexpected attr %s: %q", model.WorkbenchAttrStatus, attrs[model.WorkbenchAttrStatus])
	}
	if "true" != attrs[model.WorkbenchAttrInbox] {
		t.Fatalf("unexpected attr %s: %q", model.WorkbenchAttrInbox, attrs[model.WorkbenchAttrInbox])
	}
	if "https://example.com/article" != attrs[model.WorkbenchAttrSourceURL] {
		t.Fatalf("unexpected attr %s: %q", model.WorkbenchAttrSourceURL, attrs[model.WorkbenchAttrSourceURL])
	}
	if "网页标题" != attrs[model.WorkbenchAttrTitle] {
		t.Fatalf("unexpected attr %s: %q", model.WorkbenchAttrTitle, attrs[model.WorkbenchAttrTitle])
	}
	if _, err := time.Parse(time.RFC3339, attrs[model.WorkbenchAttrCapturedAt]); nil != err {
		t.Fatalf("invalid captured time %q: %s", attrs[model.WorkbenchAttrCapturedAt], err)
	}
}

func TestNormalizeCollectedMarkdownBodyRemovesDuplicateHeading(t *testing.T) {
	got := normalizeCollectedMarkdownBody("页面标题", "# 页面标题\n\n## 概览\n\n正文")
	want := "## 概览\n\n正文"
	if want != got {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestNormalizeCollectedMarkdownBodyDemotesBodyHeadings(t *testing.T) {
	got := normalizeCollectedMarkdownBody("页面标题", "# 第一节\n\n## 第二节\n\n正文")
	want := "## 第一节\n\n### 第二节\n\n正文"
	if want != got {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestBuildClippedMarkdownUsesNormalizedBody(t *testing.T) {
	got := buildClippedMarkdown("页面标题", "https://example.com/article", "# 页面标题\n\n## 概览\n\n正文")
	want := "# 页面标题\n\n> 来源：https://example.com/article\n\n## 概览\n\n正文"
	if want != got {
		t.Fatalf("expected %q, got %q", want, got)
	}
}
