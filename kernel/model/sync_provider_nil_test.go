package model

import "testing"

func TestSyncProviderSettersRejectNilConfig(t *testing.T) {
	tests := []struct {
		name string
		set  func() error
	}{
		{name: "S3", set: func() error { return SetSyncProviderS3(nil) }},
		{name: "WebDAV", set: func() error { return SetSyncProviderWebDAV(nil) }},
		{name: "local", set: func() error { return SetSyncProviderLocal(nil) }},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := test.set(); nil == err {
				t.Fatal("nil provider config was accepted")
			}
		})
	}
}
