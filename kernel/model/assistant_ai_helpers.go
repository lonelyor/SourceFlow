package model

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
)

func normalizeAssistantAIInputAttachments(items []AssistantAIInputAttachment) []AssistantAIInputAttachment {
	if 1 > len(items) {
		return nil
	}

	ret := make([]AssistantAIInputAttachment, 0, len(items))
	for _, item := range items {
		mimeType := strings.ToLower(strings.TrimSpace(item.MimeType))
		data := strings.TrimSpace(item.Data)
		if strings.HasPrefix(data, "data:") {
			if comma := strings.Index(data, ","); 0 < comma {
				header := strings.ToLower(data[:comma])
				if "" == mimeType && strings.HasPrefix(header, "data:") {
					if sep := strings.Index(header, ";"); 5 < sep {
						mimeType = strings.TrimSpace(header[5:sep])
					}
				}
				data = strings.TrimSpace(data[comma+1:])
			}
		}
		if "" == mimeType || !strings.HasPrefix(mimeType, "image/") || "" == data {
			continue
		}
		attachment := AssistantAIInputAttachment{
			ID:       strings.TrimSpace(item.ID),
			Name:     strings.TrimSpace(item.Name),
			MimeType: mimeType,
			Data:     data,
		}
		if "" == attachment.ID {
			attachment.ID = ast.NewNodeID()
		}
		if "" == attachment.Name {
			attachment.Name = "image"
		}
		ret = append(ret, attachment)
		if 8 <= len(ret) {
			break
		}
	}
	if 1 > len(ret) {
		return nil
	}
	return ret
}

func assistantAIInputAttachmentsToMetadata(items []AssistantAIInputAttachment) []map[string]string {
	normalized := normalizeAssistantAIInputAttachments(items)
	if 1 > len(normalized) {
		return nil
	}
	ret := make([]map[string]string, 0, len(normalized))
	for _, item := range normalized {
		ret = append(ret, map[string]string{
			"id":       item.ID,
			"name":     item.Name,
			"mimeType": item.MimeType,
			"data":     item.Data,
		})
	}
	return ret
}

func normalizeAssistantAISourceCitations(items []AssistantAISourceCitation) []AssistantAISourceCitation {
	if 1 > len(items) {
		return nil
	}
	seen := map[string]struct{}{}
	count := 0
	return normalizeAssistantAISourceCitations0(items, seen, &count)
}

func normalizeAssistantAISourceCitations0(items []AssistantAISourceCitation, seen map[string]struct{}, count *int) []AssistantAISourceCitation {
	ret := make([]AssistantAISourceCitation, 0, len(items))
	for _, item := range items {
		if nil != count && *count >= 50 {
			break
		}
		id := strings.TrimSpace(item.ID)
		title := truncateText(strings.TrimSpace(item.Title), 160)
		itemType := strings.TrimSpace(item.Type)
		if "" == id || "" == title {
			continue
		}
		key := itemType + "\x00" + id
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		if nil != count {
			(*count)++
		}
		normalized := AssistantAISourceCitation{
			ID:       id,
			Type:     truncateText(itemType, 32),
			Title:    title,
			Notebook: truncateText(strings.TrimSpace(item.Notebook), 128),
			Path:     truncateText(strings.TrimSpace(item.Path), 512),
			HPath:    truncateText(strings.TrimSpace(item.HPath), 512),
		}
		normalized.Children = normalizeAssistantAISourceCitations0(item.Children, seen, count)
		ret = append(ret, normalized)
	}
	if 1 > len(ret) {
		return nil
	}
	return ret
}

func assistantAISourceCitationsToMetadata(items []AssistantAISourceCitation) []AssistantAISourceCitation {
	return normalizeAssistantAISourceCitations(items)
}

func assistantAIMessageAttachments(msg *AssistantAIMessage) []AssistantAIInputAttachment {
	if nil == msg || nil == msg.Metadata {
		return nil
	}
	raw, ok := msg.Metadata["attachments"]
	if !ok || nil == raw {
		return nil
	}

	switch items := raw.(type) {
	case []AssistantAIInputAttachment:
		return normalizeAssistantAIInputAttachments(items)
	case []map[string]string:
		ret := make([]AssistantAIInputAttachment, 0, len(items))
		for _, item := range items {
			ret = append(ret, AssistantAIInputAttachment{
				ID:       item["id"],
				Name:     item["name"],
				MimeType: item["mimeType"],
				Data:     item["data"],
			})
		}
		return normalizeAssistantAIInputAttachments(ret)
	case []interface{}:
		ret := make([]AssistantAIInputAttachment, 0, len(items))
		for _, rawItem := range items {
			row, ok := rawItem.(map[string]interface{})
			if !ok {
				continue
			}
			ret = append(ret, AssistantAIInputAttachment{
				ID:       strings.TrimSpace(fmt.Sprint(row["id"])),
				Name:     strings.TrimSpace(fmt.Sprint(row["name"])),
				MimeType: strings.TrimSpace(fmt.Sprint(row["mimeType"])),
				Data:     strings.TrimSpace(fmt.Sprint(row["data"])),
			})
		}
		return normalizeAssistantAIInputAttachments(ret)
	default:
		return nil
	}
}

func assistantAIInputAttachmentDataURL(item AssistantAIInputAttachment) string {
	return "data:" + strings.TrimSpace(item.MimeType) + ";base64," + strings.TrimSpace(item.Data)
}

func getAssistantAIIntSetting(settings map[string]interface{}, key string, defaultValue int) int {
	if nil == settings {
		return defaultValue
	}
	raw, ok := settings[key]
	if !ok || nil == raw {
		return defaultValue
	}
	switch v := raw.(type) {
	case int:
		return v
	case int64:
		return int(v)
	case float64:
		return int(v)
	case json.Number:
		if parsed, err := v.Int64(); nil == err {
			return int(parsed)
		}
	case string:
		if parsed, err := json.Number(strings.TrimSpace(v)).Int64(); nil == err {
			return int(parsed)
		}
	}
	return defaultValue
}

func getAssistantAIFloatSetting(settings map[string]interface{}, key string, defaultValue float64) float64 {
	if nil == settings {
		return defaultValue
	}
	raw, ok := settings[key]
	if !ok || nil == raw {
		return defaultValue
	}
	switch v := raw.(type) {
	case float64:
		return v
	case float32:
		return float64(v)
	case int:
		return float64(v)
	case int64:
		return float64(v)
	case json.Number:
		if parsed, err := v.Float64(); nil == err {
			return parsed
		}
	case string:
		if parsed, err := json.Number(strings.TrimSpace(v)).Float64(); nil == err {
			return parsed
		}
	}
	return defaultValue
}

func getAssistantAIStringSetting(settings map[string]interface{}, key, defaultValue string) string {
	if nil == settings {
		return defaultValue
	}
	raw, ok := settings[key]
	if !ok || nil == raw {
		return defaultValue
	}
	if val, ok := raw.(string); ok {
		val = strings.TrimSpace(val)
		if "" != val {
			return val
		}
	}
	return defaultValue
}

func resolveAssistantAIUserAgent(userAgent string) string {
	userAgent = strings.TrimSpace(userAgent)
	if "" != userAgent {
		return userAgent
	}
	return util.GetEnv(util.DefaultAIUserAgentEnv)
}

func boolToInt(v bool) int {
	if v {
		return 1
	}
	return 0
}

func firstAssistantAINonEmpty(values ...string) string {
	for _, value := range values {
		if "" != strings.TrimSpace(value) {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func maxAssistantAIInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func marshalAssistantAIMap(val map[string]interface{}) ([]byte, error) {
	if nil == val {
		val = map[string]interface{}{}
	}
	return json.Marshal(val)
}

func cloneAssistantAIMap(val map[string]interface{}) map[string]interface{} {
	if nil == val {
		return map[string]interface{}{}
	}
	buf, err := json.Marshal(val)
	if nil != err {
		ret := make(map[string]interface{}, len(val))
		for k, v := range val {
			ret[k] = v
		}
		return ret
	}
	ret := map[string]interface{}{}
	if err = json.Unmarshal(buf, &ret); nil != err {
		ret := make(map[string]interface{}, len(val))
		for k, v := range val {
			ret[k] = v
		}
		return ret
	}
	return ret
}
