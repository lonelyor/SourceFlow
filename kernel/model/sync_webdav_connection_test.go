// SourceFlow - Make knowledge flow
// Copyright (c) 2020-present, SourceFlow contributors
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

package model

import (
	"strings"
	"testing"

	"github.com/lonelyor/sourceflow/kernel/conf"
)

func TestValidateWebDAVConnectionTestConfig(t *testing.T) {
	tests := []struct {
		name     string
		endpoint string
		wantErr  string
	}{
		{name: "Synology HTTPS", endpoint: "https://nas.example.com:5006/sourceflow"},
		{name: "generic WebDAV", endpoint: "https://dav.example.com/notes"},
		{name: "scheme omitted", endpoint: "dav.example.com/notes"},
		{name: "empty endpoint", endpoint: "", wantErr: "endpoint is empty"},
		{name: "unsupported scheme", endpoint: "ftp://nas.example.com/notes", wantErr: "HTTP or HTTPS"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			webdav := &conf.WebDAV{Endpoint: test.endpoint}
			err := validateWebDAVConnectionTestConfig(webdav)
			if "" == test.wantErr && nil != err {
				t.Fatalf("validateWebDAVConnectionTestConfig returned error: %v", err)
			}
			if "" != test.wantErr && (nil == err || !strings.Contains(err.Error(), test.wantErr)) {
				t.Fatalf("error = %v, want error containing %q", err, test.wantErr)
			}
		})
	}
}

func TestTestSyncProviderWebDAVNilConfig(t *testing.T) {
	if err := TestSyncProviderWebDAV(nil); nil == err {
		t.Fatal("TestSyncProviderWebDAV(nil) returned nil, want error")
	}
}
