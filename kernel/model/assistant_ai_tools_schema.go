package model

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/sashabaranov/go-openai"
)

const assistantAIMaxToolRounds = 5

func buildAssistantAIOpenAIToolDefinitions(profile *AssistantAIProfile) []openai.Tool {
	policy := getAssistantAIToolPolicy(profile)
	tools := make([]openai.Tool, 0, len(assistantAIToolCatalog))
	for _, def := range assistantAIToolCatalog {
		mode := resolveAssistantAIToolDecision(policy, def)
		if AssistantAIToolModeDeny == mode {
			continue
		}
		tools = append(tools, openai.Tool{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name:        def.ID,
				Description: def.Description,
				Parameters:  buildAssistantAIToolParameterSchema(def),
			},
		})
	}
	return tools
}

func buildAssistantAIToolParameterSchema(def *AssistantAIToolDefinition) interface{} {
	switch def.ID {
	case AssistantAIToolReadCurrentNote, AssistantAIToolReadCurrentBlock,
		AssistantAIToolReadCurrentBlockContext:
		return map[string]interface{}{
			"type":       "object",
			"properties": map[string]interface{}{},
		}
	case AssistantAIToolSearchNotes, AssistantAIToolSearchBlocks:
		return map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"query": map[string]interface{}{
					"type":        "string",
					"description": "搜索关键词",
				},
				"limit": map[string]interface{}{
					"type":        "integer",
					"description": "返回结果数量，默认5，最大10",
					"default":     5,
				},
			},
			"required": []string{"query"},
		}
	case AssistantAIToolReadNote:
		return map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"notebook": map[string]interface{}{
					"type":        "string",
					"description": "笔记本ID",
				},
				"path": map[string]interface{}{
					"type":        "string",
					"description": "笔记路径",
				},
				"rootID": map[string]interface{}{
					"type":        "string",
					"description": "笔记根块ID（与notebook+path二选一）",
				},
			},
		}
	case AssistantAIToolReadNoteBacklinks:
		return map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"rootID": map[string]interface{}{
					"type":        "string",
					"description": "笔记根块ID（可选，默认当前笔记）",
				},
				"keyword": map[string]interface{}{
					"type":        "string",
					"description": "反链过滤关键词",
				},
				"limit": map[string]interface{}{
					"type":        "integer",
					"description": "返回数量，默认8，最大32",
					"default":     8,
				},
			},
		}
	case AssistantAIToolReadNoteOutline:
		return map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"rootID": map[string]interface{}{
					"type":        "string",
					"description": "笔记根块ID（可选，默认当前笔记）",
				},
				"limit": map[string]interface{}{
					"type":        "integer",
					"description": "返回标题数量，默认24，最大128",
					"default":     24,
				},
			},
		}
	case AssistantAIToolReadBlock:
		return map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"id": map[string]interface{}{
					"type":        "string",
					"description": "块ID",
				},
			},
			"required": []string{"id"},
		}
	case AssistantAIToolReadBlockReferences:
		return map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"id": map[string]interface{}{
					"type":        "string",
					"description": "块ID（可选，默认当前块）",
				},
			},
		}
	case AssistantAIToolListNoteHistory:
		return map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"rootID": map[string]interface{}{
					"type":        "string",
					"description": "笔记根块ID（可选，默认当前笔记）",
				},
				"limit": map[string]interface{}{
					"type":        "integer",
					"description": "返回组数，默认6，最大12",
					"default":     6,
				},
			},
		}
	case AssistantAIToolListRestorePoints:
		return map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"limit": map[string]interface{}{
					"type":        "integer",
					"description": "返回数量，默认8，最大16",
					"default":     8,
				},
			},
		}
	case AssistantAIToolListNoteAssets:
		return map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"rootID": map[string]interface{}{
					"type":        "string",
					"description": "笔记根块ID（可选，默认当前笔记）",
				},
			},
		}
	case AssistantAIToolReadNoteAsset:
		return map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"path": map[string]interface{}{
					"type":        "string",
					"description": "附件路径",
				},
				"assetPath": map[string]interface{}{
					"type":        "string",
					"description": "备选附件路径",
				},
			},
		}
	case AssistantAIToolSearchAssets:
		return map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"query": map[string]interface{}{
					"type":        "string",
					"description": "搜索关键词",
				},
				"limit": map[string]interface{}{
					"type":        "integer",
					"description": "返回数量，默认5，最大10",
					"default":     5,
				},
			},
			"required": []string{"query"},
		}
	case AssistantAIToolReadAssetContent:
		return map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"id": map[string]interface{}{
					"type":        "string",
					"description": "附件资源ID",
				},
			},
			"required": []string{"id"},
		}
	case AssistantAIToolAppendCurrentNote:
		return map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"markdown": map[string]interface{}{
					"type":        "string",
					"description": "要追加的Markdown内容",
				},
			},
			"required": []string{"markdown"},
		}
	case AssistantAIToolCreateNote:
		return map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"title": map[string]interface{}{
					"type":        "string",
					"description": "笔记标题",
				},
				"markdown": map[string]interface{}{
					"type":        "string",
					"description": "笔记内容（Markdown）",
				},
				"notebook": map[string]interface{}{
					"type":        "string",
					"description": "笔记本ID（可选）",
				},
				"path": map[string]interface{}{
					"type":        "string",
					"description": "笔记路径（可选）",
				},
			},
			"required": []string{"markdown"},
		}
	case AssistantAIToolCreateChildNote:
		return map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"title": map[string]interface{}{
					"type":        "string",
					"description": "子文档标题",
				},
				"markdown": map[string]interface{}{
					"type":        "string",
					"description": "子文档内容（Markdown）",
				},
			},
			"required": []string{"markdown"},
		}
	case AssistantAIToolCreateWorkbench:
		return map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"type": map[string]interface{}{
					"type":        "string",
					"description": "类型：note/task/event/project",
					"default":     "note",
				},
				"title": map[string]interface{}{
					"type":        "string",
					"description": "标题",
				},
				"markdown": map[string]interface{}{
					"type":        "string",
					"description": "内容（Markdown）",
				},
				"status": map[string]interface{}{"type": "string", "description": "状态"},
				"project": map[string]interface{}{"type": "string", "description": "所属项目"},
				"dueDate": map[string]interface{}{"type": "string", "description": "截止日期"},
				"tags": map[string]interface{}{
					"type":        "string",
					"description": "标签（逗号分隔）",
				},
			},
			"required": []string{"markdown"},
		}
	case AssistantAIToolInsertAfterBlock:
		return map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"id": map[string]interface{}{
					"type":        "string",
					"description": "目标块ID（可选，默认当前块）",
				},
				"markdown": map[string]interface{}{
					"type":        "string",
					"description": "要插入的Markdown内容",
				},
			},
			"required": []string{"markdown"},
		}
	case AssistantAIToolDeleteBlock:
		return map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"id": map[string]interface{}{
					"type":        "string",
					"description": "要删除的块ID（可选，默认当前块）",
				},
			},
		}
	case AssistantAIToolReplaceBlock:
		return map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"id": map[string]interface{}{
					"type":        "string",
					"description": "要替换的块ID",
				},
				"markdown": map[string]interface{}{
					"type":        "string",
					"description": "替换后的Markdown内容",
				},
			},
			"required": []string{"id", "markdown"},
		}
	default:
		return map[string]interface{}{
			"type":       "object",
			"properties": map[string]interface{}{},
		}
	}
}

func buildAssistantAIToolContextSystemPart(context *AssistantAINoteContext) string {
	if nil == context || "" == strings.TrimSpace(context.RootID) {
		return ""
	}
	lines := []string{
		"Current note context:",
		fmt.Sprintf("- current note: title=%q, notebook=%q, path=%q, rootID=%q",
			strings.TrimSpace(context.Title),
			strings.TrimSpace(context.Notebook),
			strings.TrimSpace(context.Path),
			strings.TrimSpace(context.RootID)),
	}
	if "" != strings.TrimSpace(context.CurrentBlockID) {
		lines = append(lines, fmt.Sprintf("- current block: id=%q, type=%q",
			strings.TrimSpace(context.CurrentBlockID),
			strings.TrimSpace(context.CurrentBlockType)))
	}
	if "" != strings.TrimSpace(context.SelectedText) {
		lines = append(lines, fmt.Sprintf("- selected text: %q",
			truncateAssistantAIToolText(strings.TrimSpace(context.SelectedText), 200)))
	}
	return strings.Join(lines, "\n")
}

func extractAssistantAIToolCallArgs(argsJSON string) map[string]interface{} {
	args := map[string]interface{}{}
	if "" != strings.TrimSpace(argsJSON) {
		_ = json.Unmarshal([]byte(argsJSON), &args)
	}
	return args
}

func buildAssistantAIAnthropicTools(profile *AssistantAIProfile) []map[string]interface{} {
	policy := getAssistantAIToolPolicy(profile)
	tools := make([]map[string]interface{}, 0, len(assistantAIToolCatalog))
	for _, def := range assistantAIToolCatalog {
		mode := resolveAssistantAIToolDecision(policy, def)
		if AssistantAIToolModeDeny == mode {
			continue
		}
		tools = append(tools, map[string]interface{}{
			"name":         def.ID,
			"description":  def.Description,
			"input_schema": buildAssistantAIToolParameterSchema(def),
		})
	}
	return tools
}

func buildAssistantAIGeminiTools(profile *AssistantAIProfile) []map[string]interface{} {
	policy := getAssistantAIToolPolicy(profile)
	declarations := make([]map[string]interface{}, 0, len(assistantAIToolCatalog))
	for _, def := range assistantAIToolCatalog {
		mode := resolveAssistantAIToolDecision(policy, def)
		if AssistantAIToolModeDeny == mode {
			continue
		}
		declarations = append(declarations, map[string]interface{}{
			"name":        def.ID,
			"description": def.Description,
			"parameters":  buildAssistantAIToolParameterSchema(def),
		})
	}
	return declarations
}
