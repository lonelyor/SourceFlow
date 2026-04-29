package model

import (
	"os"
	"path/filepath"
	"slices"
	"testing"

	shellquote "github.com/kballard/go-shellquote"
	"github.com/lonelyor/sourceflow/kernel/util"
)

func TestEnsurePandocResourceArgReplacesMissingReferenceDoc(t *testing.T) {
	dir := t.TempDir()
	templatePath := filepath.Join(dir, "pandoc-template.docx")
	if err := os.WriteFile(templatePath, []byte("template"), 0644); err != nil {
		t.Fatalf("write template: %v", err)
	}

	missingTemplatePath := filepath.Join(dir, "missing-template.docx")
	args := ensurePandocResourceArg([]string{
		"-f", "html",
		"--reference-doc", missingTemplatePath,
		"--metadata", "title=demo",
	}, "--reference-doc", templatePath)

	if slices.Contains(args, missingTemplatePath) {
		t.Fatalf("stale reference-doc path was not removed: %v", args)
	}
	if !containsPandocResourceArg(args, "--reference-doc", templatePath) {
		t.Fatalf("current reference-doc path was not appended: %v", args)
	}
}

func TestNormalizePandocReferenceDocParamsRewritesStaleBuiltInTemplate(t *testing.T) {
	dir := t.TempDir()
	templatePath := filepath.Join(dir, "pandoc-template.docx")
	if err := os.WriteFile(templatePath, []byte("template"), 0644); err != nil {
		t.Fatalf("write template: %v", err)
	}

	previousTemplatePath := filepath.Join(dir, "old", "pandoc-template.docx")
	originalPandocTemplatePath := util.PandocTemplatePath
	util.PandocTemplatePath = templatePath
	defer func() {
		util.PandocTemplatePath = originalPandocTemplatePath
	}()

	params, changed := normalizePandocReferenceDocParams(`--standalone --reference-doc "` + previousTemplatePath + `"`)
	if !changed {
		t.Fatalf("expected stale reference-doc params to change")
	}
	if slices.Contains(splitPandocParamsForTest(t, params), previousTemplatePath) {
		t.Fatalf("stale reference-doc path was not removed: %s", params)
	}
	if !containsPandocResourceArg(splitPandocParamsForTest(t, params), "--reference-doc", templatePath) {
		t.Fatalf("current reference-doc path was not written: %s", params)
	}
}

func TestReplacePDFWithProcessedFileKeepsProcessedOutput(t *testing.T) {
	dir := t.TempDir()
	originalPath := filepath.Join(dir, "export.pdf")
	processedPath := filepath.Join(dir, ".export.pdf.sourceflow-postprocess-test.pdf")
	if err := os.WriteFile(originalPath, []byte("raw pdf"), 0644); err != nil {
		t.Fatalf("write original pdf: %v", err)
	}
	if err := os.WriteFile(processedPath, []byte("processed pdf"), 0644); err != nil {
		t.Fatalf("write processed pdf: %v", err)
	}

	if err := replacePDFWithProcessedFile(originalPath, processedPath); err != nil {
		t.Fatalf("replace pdf: %v", err)
	}

	got, err := os.ReadFile(originalPath)
	if err != nil {
		t.Fatalf("read original pdf: %v", err)
	}
	if string(got) != "processed pdf" {
		t.Fatalf("original pdf was not replaced with processed output: %q", got)
	}
	if _, err = os.Stat(processedPath); !os.IsNotExist(err) {
		t.Fatalf("processed temp file should have been moved, err=%v", err)
	}
}

func containsPandocResourceArg(args []string, flag, value string) bool {
	for i := 0; i < len(args)-1; i++ {
		if args[i] == flag && args[i+1] == value {
			return true
		}
	}
	return false
}

func splitPandocParamsForTest(t *testing.T, params string) []string {
	t.Helper()
	args, err := shellquote.Split(params)
	if err != nil {
		t.Fatalf("split params %q: %v", params, err)
	}
	return args
}
