package api

import (
	"mime/multipart"
	"path/filepath"
	"testing"

	"github.com/lonelyor/sourceflow/third_party/go/gulu"
)

func TestSaveImportUploadRejectsOversizedFile(t *testing.T) {
	file := &multipart.FileHeader{Filename: "oversized.zip", Size: gulu.MaxZipTotalUncompressedSize + 1}

	err := saveImportUpload(file, filepath.Join(t.TempDir(), "oversized.zip"), ".zip")
	if err == nil {
		t.Fatal("saveImportUpload must reject oversized imports")
	}
}
