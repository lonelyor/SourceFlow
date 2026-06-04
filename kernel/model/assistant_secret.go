package model

import (
	"fmt"
	"strings"
)

const (
	AssistantAPIKeyActionKeep    = "keep"
	AssistantAPIKeyActionReplace = "replace"
	AssistantAPIKeyActionClear   = "clear"
)

func NormalizeAssistantAPIKeyAction(action, apiKey string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(action)) {
	case "":
		if "" != strings.TrimSpace(apiKey) {
			return AssistantAPIKeyActionReplace, nil
		}
		return AssistantAPIKeyActionKeep, nil
	case AssistantAPIKeyActionKeep:
		return AssistantAPIKeyActionKeep, nil
	case AssistantAPIKeyActionReplace:
		return AssistantAPIKeyActionReplace, nil
	case AssistantAPIKeyActionClear:
		return AssistantAPIKeyActionClear, nil
	default:
		return "", fmt.Errorf("unsupported API key action [%s]", action)
	}
}
