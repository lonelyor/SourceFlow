package model

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestResolveAssistantAIOllamaShowEndpoint(t *testing.T) {
	cases := map[string]string{
		"http://127.0.0.1:11434/v1":  "http://127.0.0.1:11434/api/show",
		"http://127.0.0.1:11434/":    "http://127.0.0.1:11434/api/show",
		"http://127.0.0.1:11434":     "http://127.0.0.1:11434/api/show",
		"http://host:8080/ollama/v1": "http://host:8080/ollama/api/show",
	}
	for input, expected := range cases {
		if got := resolveAssistantAIOllamaShowEndpoint(input); got != expected {
			t.Fatalf("resolveAssistantAIOllamaShowEndpoint(%q) = %q, want %q", input, got, expected)
		}
	}
}

func TestParseOllamaShowContextLength(t *testing.T) {
	cases := []struct {
		name string
		body string
		want int
	}{
		{"model_info string value", `{"model_info":{"ollama.context_length":"131072"}}`, 131072},
		{"model_info number value", `{"model_info":{"ollama.context_length":8192}}`, 8192},
		{"parameters quoted modelfile", `{"parameters":"'parameter' 'num_ctx' '4096'\n'parameter' 'temperature' '0.7'"}`, 4096},
		{"parameters plain modelfile", `{"parameters":"PARAMETER num_ctx 8192\nPARAMETER stop <|user|>"}`, 8192},
		{"model_info preferred over parameters", `{"parameters":"PARAMETER num_ctx 2048","model_info":{"ollama.context_length":"65536"}}`, 65536},
		{"absent", `{"model_info":{"general.architecture":"llama"},"parameters":"PARAMETER temperature 0.7"}`, 0},
		{"invalid json", `not-json`, 0},
		{"zero ignored", `{"model_info":{"ollama.context_length":"0"},"parameters":""}`, 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := parseOllamaShowContextLength([]byte(c.body)); got != c.want {
				t.Fatalf("parseOllamaShowContextLength(%s) = %d, want %d", c.name, got, c.want)
			}
		})
	}
}

func TestListAssistantAIModelsOllamaShowEnrichment(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/tags":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"models":[{"name":"llama3.2:latest"},{"name":"qwen2.5:latest"}]}`))
		case "/api/show":
			var req struct {
				Model string `json:"model"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); nil != err {
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			switch req.Model {
			case "llama3.2:latest":
				// No window info at all: stays 0, frontend falls back to catalog.
				_, _ = w.Write([]byte(`{"parameters":"","model_info":{"general.architecture":"llama"}}`))
			case "qwen2.5:latest":
				_, _ = w.Write([]byte(`{"parameters":"PARAMETER num_ctx 32768","model_info":{"ollama.context_length":"32768"}}`))
			default:
				w.WriteHeader(http.StatusNotFound)
			}
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	result := ListAssistantAIModels(AssistantAIProviderOllama, server.URL+"/v1", "", "", "")
	if "" != result.Error {
		t.Fatalf("unexpected error: %s", result.Error)
	}
	if 2 != len(result.Models) {
		t.Fatalf("expected 2 models, got %d", len(result.Models))
	}
	byID := map[string]int{}
	for _, m := range result.Models {
		byID[m.ID] = m.ContextWindow
	}
	if got := byID["llama3.2:latest"]; 0 != got {
		t.Fatalf("llama3.2 contextWindow = %d, want 0 (no info exposed)", got)
	}
	if got := byID["qwen2.5:latest"]; 32768 != got {
		t.Fatalf("qwen2.5 contextWindow = %d, want 32768 resolved from /api/show", got)
	}
}
