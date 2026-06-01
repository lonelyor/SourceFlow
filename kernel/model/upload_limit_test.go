package model

import (
	"mime/multipart"
	"testing"
)

func TestValidateUploadFileHeadersRejectsTooManyFiles(t *testing.T) {
	files := make([]*multipart.FileHeader, maxUploadFileCount+1)
	for i := range files {
		files[i] = &multipart.FileHeader{Filename: "asset.txt", Size: 1}
	}

	if err := validateUploadFileHeaders(files); err == nil {
		t.Fatal("validateUploadFileHeaders must reject too many files")
	}
}

func TestValidateUploadFileHeadersRejectsOversizedFile(t *testing.T) {
	files := []*multipart.FileHeader{{Filename: "asset.bin", Size: maxUploadSingleFileSize + 1}}

	if err := validateUploadFileHeaders(files); err == nil {
		t.Fatal("validateUploadFileHeaders must reject oversized files")
	}
}

func TestValidateUploadFileHeadersRejectsOversizedTotal(t *testing.T) {
	files := []*multipart.FileHeader{
		{Filename: "a.bin", Size: maxUploadTotalFileSize/2 + 1},
		{Filename: "b.bin", Size: maxUploadTotalFileSize/2 + 1},
	}

	if err := validateUploadFileHeaders(files); err == nil {
		t.Fatal("validateUploadFileHeaders must reject oversized upload totals")
	}
}
