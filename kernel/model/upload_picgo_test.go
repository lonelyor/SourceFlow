package model

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newUploadTestFileHeader(t *testing.T, fieldName, filename string, content []byte) *multipart.FileHeader {
	t.Helper()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile(fieldName, filename)
	if nil != err {
		t.Fatalf("CreateFormFile failed: %v", err)
	}
	if _, err = part.Write(content); nil != err {
		t.Fatalf("Write failed: %v", err)
	}
	if err = writer.Close(); nil != err {
		t.Fatalf("Close failed: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/upload", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if err = req.ParseMultipartForm(1024 * 1024); nil != err {
		t.Fatalf("ParseMultipartForm failed: %v", err)
	}
	return req.MultipartForm.File[fieldName][0]
}

func TestUploadSingleImageViaPicGo(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if "/upload" != r.URL.Path {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if err := r.ParseMultipartForm(1024 * 1024); nil != err {
			t.Fatalf("ParseMultipartForm failed: %v", err)
		}
		files := r.MultipartForm.File["files"]
		if 1 != len(files) {
			t.Fatalf("unexpected files len %d", len(files))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"result":["https://img.example.com/demo.png"]}`))
	}))
	defer server.Close()

	file := newUploadTestFileHeader(t, "file[]", "demo.png", []byte("png"))
	url, err := uploadSingleImageViaPicGo(file, server.URL+"/upload")
	if nil != err {
		t.Fatalf("uploadSingleImageViaPicGo returned error: %v", err)
	}
	if "https://img.example.com/demo.png" != url {
		t.Fatalf("unexpected uploaded url %q", url)
	}
}

func TestUploadImageFilesViaPicGoKeepsPartialSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(1024 * 1024); nil != err {
			t.Fatalf("ParseMultipartForm failed: %v", err)
		}
		filename := r.MultipartForm.File["files"][0].Filename
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(filename, "broken") {
			_, _ = w.Write([]byte(`{"success":false,"message":"broken upload"}`))
			return
		}
		_, _ = w.Write([]byte(`{"success":true,"result":["https://img.example.com/ok.png"]}`))
	}))
	defer server.Close()

	okFile := newUploadTestFileHeader(t, "file[]", "ok.png", []byte("png"))
	brokenFile := newUploadTestFileHeader(t, "file[]", "broken.png", []byte("png"))
	errFiles, succMap, err := uploadImageFilesViaPicGo([]*multipart.FileHeader{okFile, brokenFile}, server.URL)
	if nil == err {
		t.Fatal("expected PicGo partial failure error")
	}
	if 1 != len(errFiles) || "broken.png" != errFiles[0] {
		t.Fatalf("unexpected errFiles %#v", errFiles)
	}
	if "https://img.example.com/ok.png" != succMap["ok.png"] {
		t.Fatalf("unexpected succMap %#v", succMap)
	}
}
