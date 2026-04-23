package util

import (
	"testing"

	"github.com/sashabaranov/go-openai"
)

func TestApplyOpenAICompatibleMaxTokens(t *testing.T) {
	req := &openai.ChatCompletionRequest{MaxCompletionTokens: 128}
	ApplyOpenAICompatibleMaxTokens(req, 256)

	if got := req.MaxTokens; 256 != got {
		t.Fatalf("expected MaxTokens to be 256, got %d", got)
	}
	if got := req.MaxCompletionTokens; 0 != got {
		t.Fatalf("expected MaxCompletionTokens to be reset to 0, got %d", got)
	}
}
