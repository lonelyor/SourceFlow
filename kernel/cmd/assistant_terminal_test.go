package cmd

import "testing"

func TestBaseCmdRawStringParamPreservesTerminalInput(t *testing.T) {
	base := &BaseCmd{
		param: map[string]interface{}{
			"data": " echo __codex_terminal_ok__\r",
		},
	}

	if got := base.rawStringParam("data"); got != " echo __codex_terminal_ok__\r" {
		t.Fatalf("rawStringParam should preserve terminal input, got %q", got)
	}

	if got := base.stringParam("data"); got != "echo __codex_terminal_ok__" {
		t.Fatalf("stringParam should continue trimming regular command fields, got %q", got)
	}
}
