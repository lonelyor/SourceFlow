package util

import (
	"context"
	"errors"
	"testing"
)

func TestIsBenignRhyNetworkError(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "context canceled",
			err:  context.Canceled,
			want: true,
		},
		{
			name: "dns lookup failure",
			err:  errors.New(`Get "https://sync.sourceflow.app/apis/sourceflow/version?ver=0.1.0": dial tcp: lookup sync.sourceflow.app: no such host`),
			want: true,
		},
		{
			name: "unexpected server error",
			err:  errors.New("unexpected parse failure"),
			want: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isBenignRhyNetworkError(tc.err); got != tc.want {
				t.Fatalf("isBenignRhyNetworkError() = %v, want %v", got, tc.want)
			}
		})
	}
}
