package model

import (
	"context"
	dbsql "database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/lonelyor/sourceflow/kernel/conf"
	_ "github.com/lonelyor/sourceflow/kernel/sql"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
	"github.com/sashabaranov/go-openai"
)

const (
	AssistantAIProviderOpenAICompatible = "openai-compatible"
	AssistantAIProviderAnthropic        = "anthropic"
	AssistantAIProviderGemini           = "gemini"
	AssistantAIProviderVolcengine       = "volcengine"
	AssistantAIProviderVolcenginePlan   = "volcengine-plan"
	AssistantAIProviderKimi             = "kimi"
	AssistantAIProviderGLM              = "glm"
	AssistantAIProviderQwen             = "qwen"
	AssistantAIProviderOpenRouter       = "openrouter"
	AssistantAIProviderDeepSeek         = "deepseek"
	AssistantAIProviderOllama           = "ollama"

	assistantAIDefaultTimeout          = 60
	assistantAIDefaultTemperature      = 0.7
	assistantAIDefaultContextMessages  = 24
	assistantAIDefaultContextTokens    = 256 * 1024
	assistantAIDefaultAnthropicVersion = "2023-06-01"
)

var (
	assistantAIDB            *dbsql.DB
	assistantAIDBLock        sync.Mutex
	assistantAIHTTPClients   map[string]*http.Client
	assistantAIHTTPClientsMu sync.Mutex
)

var assistantAIProviderCatalog = []*AssistantAIProviderType{
	{ID: AssistantAIProviderOpenAICompatible, Name: "OpenAI Compatible", BaseURL: "https://api.openai.com/v1", DefaultModel: "gpt-4.1", RecommendedSettings: map[string]interface{}{"temperature": 0.7, "maxTokens": 4096, "maxContextTokens": 1048576, "maxContextMessages": 32}},
	{ID: AssistantAIProviderAnthropic, Name: "Anthropic", BaseURL: "https://api.anthropic.com", DefaultModel: "claude-sonnet-4-20250514", RecommendedSettings: map[string]interface{}{"temperature": 1.0, "maxTokens": 8192, "maxContextTokens": 200000, "maxContextMessages": 32}},
	{ID: AssistantAIProviderGemini, Name: "Gemini", BaseURL: "https://generativelanguage.googleapis.com", DefaultModel: "gemini-2.5-flash", RecommendedSettings: map[string]interface{}{"temperature": 1.0, "maxTokens": 8192, "maxContextTokens": 1048576, "maxContextMessages": 32}},
	{ID: AssistantAIProviderVolcengine, Name: "Volcengine Ark", BaseURL: "https://ark.cn-beijing.volces.com/api/v3", DefaultModel: "", RecommendedSettings: map[string]interface{}{"temperature": 0.1, "maxTokens": 4096, "maxContextTokens": 131072, "maxContextMessages": 24}},
	{ID: AssistantAIProviderVolcenginePlan, Name: "Volcengine Coding Plan", BaseURL: "https://ark.cn-beijing.volces.com/api/v3", DefaultModel: "", RecommendedSettings: map[string]interface{}{"temperature": 0.1, "maxTokens": 4096, "maxContextTokens": 131072, "maxContextMessages": 24}},
	{ID: AssistantAIProviderKimi, Name: "Kimi", BaseURL: "https://api.moonshot.cn/v1", DefaultModel: "moonshot-v1-auto", RecommendedSettings: map[string]interface{}{"temperature": 0.7, "maxTokens": 8192, "maxContextTokens": 131072, "maxContextMessages": 24}},
	{ID: AssistantAIProviderGLM, Name: "GLM", BaseURL: "https://open.bigmodel.cn/api/paas/v4", DefaultModel: "glm-4-flash", RecommendedSettings: map[string]interface{}{"temperature": 0.7, "maxTokens": 4096, "maxContextTokens": 131072, "maxContextMessages": 24}},
	{ID: AssistantAIProviderQwen, Name: "Qwen", BaseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", DefaultModel: "qwen-plus", RecommendedSettings: map[string]interface{}{"temperature": 0.7, "maxTokens": 8192, "maxContextTokens": 131072, "maxContextMessages": 24}},
	{ID: AssistantAIProviderOpenRouter, Name: "OpenRouter", BaseURL: "https://openrouter.ai/api/v1", DefaultModel: "", RecommendedSettings: map[string]interface{}{"temperature": 1.0, "maxTokens": 4096, "maxContextTokens": 200000, "maxContextMessages": 32}},
	{ID: AssistantAIProviderDeepSeek, Name: "DeepSeek", BaseURL: "https://api.deepseek.com/v1", DefaultModel: "deepseek-chat", RecommendedSettings: map[string]interface{}{"temperature": 1.0, "maxTokens": 8192, "maxContextTokens": 131072, "maxContextMessages": 24}},
	{ID: AssistantAIProviderOllama, Name: "Ollama", BaseURL: "http://127.0.0.1:11434/v1", DefaultModel: "", RecommendedSettings: map[string]interface{}{"temperature": 0.7, "maxTokens": 4096, "maxContextTokens": 32768, "maxContextMessages": 16}},
}

var assistantAIProviderBaseURLs = map[string]string{
		AssistantAIProviderOpenAICompatible: "https://api.openai.com/v1",
		AssistantAIProviderAnthropic:        "https://api.anthropic.com",
		AssistantAIProviderGemini:           "https://generativelanguage.googleapis.com",
		AssistantAIProviderVolcengine:       "https://ark.cn-beijing.volces.com/api/v3",
		AssistantAIProviderVolcenginePlan:   "https://ark.cn-beijing.volces.com/api/v3",
		AssistantAIProviderKimi:             "https://api.moonshot.cn/v1",
	AssistantAIProviderGLM:              "https://open.bigmodel.cn/api/paas/v4",
	AssistantAIProviderQwen:             "https://dashscope.aliyuncs.com/compatible-mode/v1",
	AssistantAIProviderOpenRouter:       "https://openrouter.ai/api/v1",
		AssistantAIProviderDeepSeek:         "https://api.deepseek.com/v1",
		AssistantAIProviderOllama:           "http://127.0.0.1:11434/v1",
}

type AssistantAIProviderType struct {
	ID                   string                 `json:"id"`
	Name                 string                 `json:"name"`
	BaseURL              string                 `json:"baseURL"`
	DefaultModel         string                 `json:"defaultModel"`
	RecommendedSettings  map[string]interface{} `json:"recommendedSettings"`
}

type AssistantAIProfile struct {
	ID        string                 `json:"id"`
	Name      string                 `json:"name"`
	Provider  string                 `json:"provider"`
	BaseURL   string                 `json:"baseURL"`
	APIKey    string                 `json:"apiKey"`
	Model     string                 `json:"model"`
	UserAgent string                 `json:"userAgent"`
	Proxy     string                 `json:"proxy"`
	Version   string                 `json:"version"`
	IsDefault bool                   `json:"isDefault"`
	Settings  map[string]interface{} `json:"settings"`
	CreatedAt int64                  `json:"createdAt"`
	UpdatedAt int64                  `json:"updatedAt"`
}

type AssistantAISession struct {
	ID                    string `json:"id"`
	ProfileID             string `json:"profileId"`
	Mode                  string `json:"mode"`
	Title                 string `json:"title"`
	Summary               string `json:"summary"`
	MessageCount          int    `json:"messageCount"`
	UserMessageCount      int    `json:"userMessageCount"`
	AssistantMessageCount int    `json:"assistantMessageCount"`
	LastMessageAt         int64  `json:"lastMessageAt"`
	CreatedAt             int64  `json:"createdAt"`
	UpdatedAt             int64  `json:"updatedAt"`
}

type AssistantAIMessage struct {
	ID                string                 `json:"id"`
	SessionID         string                 `json:"sessionId"`
	Role              string                 `json:"role"`
	Content           string                 `json:"content"`
	ProviderMessageID string                 `json:"providerMessageId"`
	InputTokens       int                    `json:"inputTokens"`
	OutputTokens      int                    `json:"outputTokens"`
	Metadata          map[string]interface{} `json:"metadata"`
	CreatedAt         int64                  `json:"createdAt"`
}

type AssistantAIInputAttachment struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	MimeType string `json:"mimeType"`
	Data     string `json:"data"`
}

type AssistantAIChatRequest struct {
	ProfileID   string                       `json:"profileId"`
	SessionID   string                       `json:"sessionId"`
	Mode        string                       `json:"mode"`
	Title       string                       `json:"title"`
	Message     string                       `json:"message"`
	System      string                       `json:"system"`
	EnableTools bool                         `json:"enableTools"`
	Context     *AssistantAINoteContext      `json:"context"`
	Attachments []AssistantAIInputAttachment `json:"attachments"`
}

type AssistantAIMessageEditRequest struct {
	ProfileID   string                       `json:"profileId"`
	SessionID   string                       `json:"sessionId"`
	MessageID   string                       `json:"messageId"`
	Message     string                       `json:"message"`
	System      string                       `json:"system"`
	EnableTools bool                         `json:"enableTools"`
	Context     *AssistantAINoteContext      `json:"context"`
	Attachments []AssistantAIInputAttachment `json:"attachments"`
}

type AssistantAIChatResult struct {
	Session          *AssistantAISession      `json:"session"`
	Profile          *AssistantAIProfile      `json:"profile"`
	UserMessage      *AssistantAIMessage      `json:"userMessage"`
	AssistantMessage *AssistantAIMessage      `json:"assistantMessage"`
	Messages         []*AssistantAIMessage    `json:"messages"`
	ToolResults      []*AssistantAIToolResult `json:"toolResults"`
}

type AssistantAIAnalyzeRequest struct {
	ProfileID string `json:"profileId"`
	SessionID string `json:"sessionId"`
	Prompt    string `json:"prompt"`
}

type AssistantAIToolConfirmRequest struct {
	ProfileID string                  `json:"profileId"`
	SessionID string                  `json:"sessionId"`
	MessageID string                  `json:"messageId"`
	AuditID   string                  `json:"auditId"`
	Context   *AssistantAINoteContext `json:"context"`
	ToolID    string                  `json:"toolId"`
	Args      map[string]interface{}  `json:"args"`
}

type AssistantAIToolRejectRequest struct {
	ProfileID string `json:"profileId"`
	SessionID string `json:"sessionId"`
	MessageID string `json:"messageId"`
	AuditID   string `json:"auditId"`
	ToolID    string `json:"toolId"`
}

type assistantAIProviderReply struct {
	Content           string
	ProviderMessageID string
	InputTokens       int
	OutputTokens      int
	Metadata          map[string]interface{}
	ToolCalls         []map[string]interface{}
}

type assistantAIChatOptions struct {
	EnableTools bool
	Context     *AssistantAINoteContext
	UserPrompt  string
}

func ListAssistantAIProviderTypes() []*AssistantAIProviderType {
	ret := make([]*AssistantAIProviderType, 0, len(assistantAIProviderCatalog))
	for _, item := range assistantAIProviderCatalog {
		ret = append(ret, &AssistantAIProviderType{ID: item.ID, Name: item.Name, BaseURL: item.BaseURL})
	}
	return ret
}

func EnsureAssistantAIStore() error {
	_, err := getAssistantAIDB()
	return err
}

func ListAssistantAIProfiles() (ret []*AssistantAIProfile, err error) {
	ret = []*AssistantAIProfile{}
	db, err := getAssistantAIDB()
	if err != nil {
		return nil, err
	}

	rows, err := db.Query(`SELECT id, name, provider, base_url, api_key, model, user_agent, proxy, version, is_default, settings, created_at, updated_at
        FROM ai_profiles ORDER BY is_default DESC, updated_at DESC, created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		profile, scanErr := scanAssistantAIProfile(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		ret = append(ret, profile)
	}
	return ret, rows.Err()
}

func SaveAssistantAIProfile(profile *AssistantAIProfile) (ret *AssistantAIProfile, err error) {
	if nil == profile {
		return nil, fmt.Errorf("assistant AI profile is required")
	}

	normalized, err := normalizeAssistantAIProfile(profile)
	if err != nil {
		return nil, err
	}

	db, err := getAssistantAIDB()
	if err != nil {
		return nil, err
	}

	now := time.Now().UnixMilli()
	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer rollbackAssistantAITx(tx)

	var exists int
	if err = tx.QueryRow(`SELECT COUNT(1) FROM ai_profiles WHERE id = ?`, normalized.ID).Scan(&exists); err != nil {
		return nil, err
	}

	var total int
	if err = tx.QueryRow(`SELECT COUNT(1) FROM ai_profiles`).Scan(&total); err != nil {
		return nil, err
	}

	normalized.UpdatedAt = now
	if 0 == exists {
		normalized.CreatedAt = now
	} else {
		if err = tx.QueryRow(`SELECT created_at FROM ai_profiles WHERE id = ?`, normalized.ID).Scan(&normalized.CreatedAt); err != nil {
			return nil, err
		}
	}

	if normalized.IsDefault || 0 == total {
		if _, err = tx.Exec(`UPDATE ai_profiles SET is_default = 0`); err != nil {
			return nil, err
		}
		normalized.IsDefault = true
	}

	settingsJSON, err := marshalAssistantAIMap(normalized.Settings)
	if err != nil {
		return nil, err
	}

	_, err = tx.Exec(`INSERT INTO ai_profiles (id, name, provider, base_url, api_key, model, user_agent, proxy, version, is_default, settings, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            provider = excluded.provider,
            base_url = excluded.base_url,
            api_key = excluded.api_key,
            model = excluded.model,
            user_agent = excluded.user_agent,
            proxy = excluded.proxy,
            version = excluded.version,
            is_default = excluded.is_default,
            settings = excluded.settings,
            updated_at = excluded.updated_at`,
		normalized.ID, normalized.Name, normalized.Provider, normalized.BaseURL, normalized.APIKey, normalized.Model,
		normalized.UserAgent, normalized.Proxy, normalized.Version, boolToInt(normalized.IsDefault), string(settingsJSON),
		normalized.CreatedAt, normalized.UpdatedAt)
	if err != nil {
		return nil, err
	}

	if err = tx.Commit(); err != nil {
		return nil, err
	}
	syncAssistantAILegacyConfig(db)
	return normalized, nil
}

func GetAssistantAIProfile(id string) (ret *AssistantAIProfile, err error) {
	db, err := getAssistantAIDB()
	if err != nil {
		return nil, err
	}
	return getAssistantAIProfile0(db, strings.TrimSpace(id))
}

func DeleteAssistantAIProfile(id string) (err error) {
	id = strings.TrimSpace(id)
	if "" == id {
		return fmt.Errorf("assistant AI profile ID is required")
	}

	db, err := getAssistantAIDB()
	if err != nil {
		return err
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer rollbackAssistantAITx(tx)

	if _, err = tx.Exec(`UPDATE ai_sessions SET profile_id = '' WHERE profile_id = ?`, id); err != nil {
		return err
	}
	if _, err = tx.Exec(`DELETE FROM ai_profiles WHERE id = ?`, id); err != nil {
		return err
	}
	if err = ensureAssistantAIDefaultProfileTx(tx); err != nil {
		return err
	}
	if err = tx.Commit(); err != nil {
		return err
	}
	syncAssistantAILegacyConfig(db)
	return nil
}

func ListAssistantAISessions() (ret []*AssistantAISession, err error) {
	ret = []*AssistantAISession{}
	db, err := getAssistantAIDB()
	if err != nil {
		return nil, err
	}

	rows, err := db.Query(`SELECT s.id, s.profile_id, s.mode, s.title, s.summary, s.created_at, s.updated_at,
        COALESCE(st.message_count, 0), COALESCE(st.user_message_count, 0), COALESCE(st.assistant_message_count, 0), COALESCE(st.last_message_at, 0)
        FROM ai_sessions s
        LEFT JOIN ai_session_stats st ON st.session_id = s.id
        ORDER BY s.updated_at DESC, s.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		session, scanErr := scanAssistantAISession(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		ret = append(ret, session)
	}
	return ret, rows.Err()
}

func CreateAssistantAISession(profileID, mode, title string) (ret *AssistantAISession, err error) {
	db, err := getAssistantAIDB()
	if err != nil {
		return nil, err
	}
	return createAssistantAISession0(db, strings.TrimSpace(profileID), strings.TrimSpace(mode), strings.TrimSpace(title))
}

func GetAssistantAISession(id string) (ret *AssistantAISession, err error) {
	db, err := getAssistantAIDB()
	if err != nil {
		return nil, err
	}
	return getAssistantAISession0(db, strings.TrimSpace(id))
}

func RenameAssistantAISession(id, title string) (err error) {
	id = strings.TrimSpace(id)
	title = strings.TrimSpace(title)
	if "" == id {
		return fmt.Errorf("assistant AI session ID is required")
	}
	if "" == title {
		return fmt.Errorf("assistant AI session title is required")
	}

	db, err := getAssistantAIDB()
	if err != nil {
		return err
	}
	_, err = db.Exec(`UPDATE ai_sessions SET title = ?, updated_at = ? WHERE id = ?`, title, time.Now().UnixMilli(), id)
	return err
}

func DeleteAssistantAISession(id string) (err error) {
	id = strings.TrimSpace(id)
	if "" == id {
		return fmt.Errorf("assistant AI session ID is required")
	}

	db, err := getAssistantAIDB()
	if err != nil {
		return err
	}
	_, err = db.Exec(`DELETE FROM ai_sessions WHERE id = ?`, id)
	return err
}

func ClearAssistantAISession(id string) (err error) {
	id = strings.TrimSpace(id)
	if "" == id {
		return fmt.Errorf("assistant AI session ID is required")
	}

	db, err := getAssistantAIDB()
	if err != nil {
		return err
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer rollbackAssistantAITx(tx)

	if _, err = tx.Exec(`DELETE FROM ai_messages WHERE session_id = ?`, id); err != nil {
		return err
	}
	if _, err = tx.Exec(`DELETE FROM ai_session_stats WHERE session_id = ?`, id); err != nil {
		return err
	}
	if _, err = tx.Exec(`UPDATE ai_sessions SET updated_at = ? WHERE id = ?`, time.Now().UnixMilli(), id); err != nil {
		return err
	}
	return tx.Commit()
}

func ClearAllAssistantAISessions() (err error) {
	db, err := getAssistantAIDB()
	if err != nil {
		return err
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer rollbackAssistantAITx(tx)

	if _, err = tx.Exec(`DELETE FROM ai_messages`); err != nil {
		return err
	}
	if _, err = tx.Exec(`DELETE FROM ai_session_stats`); err != nil {
		return err
	}
	if _, err = tx.Exec(`DELETE FROM ai_sessions`); err != nil {
		return err
	}
	return tx.Commit()
}

func GetAssistantAISessionMessages(sessionID string) (ret []*AssistantAIMessage, err error) {
	sessionID = strings.TrimSpace(sessionID)
	if "" == sessionID {
		return []*AssistantAIMessage{}, nil
	}

	db, err := getAssistantAIDB()
	if err != nil {
		return nil, err
	}
	return listAssistantAISessionMessages(db, sessionID, 0)
}

func ChatAssistantAI(req *AssistantAIChatRequest) (ret *AssistantAIChatResult, err error) {
	return chatAssistantAI0(req, nil)
}

func ChatAssistantAIStream(req *AssistantAIChatRequest, onDelta func(string) error) (ret *AssistantAIChatResult, err error) {
	return chatAssistantAI0(req, onDelta)
}

func EditAssistantAIMessage(req *AssistantAIMessageEditRequest) (ret *AssistantAIChatResult, err error) {
	return editAssistantAIMessage0(req, nil)
}

func EditAssistantAIMessageStream(req *AssistantAIMessageEditRequest, onDelta func(string) error) (ret *AssistantAIChatResult, err error) {
	return editAssistantAIMessage0(req, onDelta)
}

func chatAssistantAI0(req *AssistantAIChatRequest, onDelta func(string) error) (ret *AssistantAIChatResult, err error) {
	if nil == req {
		return nil, fmt.Errorf("assistant AI chat request is required")
	}

	message := strings.TrimSpace(req.Message)
	attachments := normalizeAssistantAIInputAttachments(req.Attachments)
	if "" == message && 1 > len(attachments) {
		return nil, fmt.Errorf("assistant AI message is required")
	}

	db, err := getAssistantAIDB()
	if err != nil {
		return nil, err
	}

	var session *AssistantAISession
	sessionID := strings.TrimSpace(req.SessionID)
	if "" != sessionID {
		session, err = getAssistantAISession0(db, sessionID)
		if err != nil {
			return nil, err
		}
	}

	profileID := strings.TrimSpace(req.ProfileID)
	if "" == profileID && nil != session {
		profileID = session.ProfileID
	}
	profile, err := getAssistantAIProfile0(db, profileID)
	if err != nil {
		return nil, err
	}

	if nil == session {
		title := strings.TrimSpace(req.Title)
		if "" == title {
			title = buildAssistantAISessionTitle(message)
		}
		session, err = createAssistantAISession0(db, profile.ID, strings.TrimSpace(req.Mode), title)
		if err != nil {
			return nil, err
		}
	} else if profile.ID != session.ProfileID {
		if _, err = db.Exec(`UPDATE ai_sessions SET profile_id = ?, updated_at = ? WHERE id = ?`, profile.ID, time.Now().UnixMilli(), session.ID); err != nil {
			return nil, err
		}
		session.ProfileID = profile.ID
	}

	userMessage := &AssistantAIMessage{
		ID:        ast.NewNodeID(),
		SessionID: session.ID,
		Role:      "user",
		Content:   message,
		Metadata:  map[string]interface{}{},
		CreatedAt: time.Now().UnixMilli(),
	}
	if 0 < len(attachments) {
		userMessage.Metadata["attachments"] = assistantAIInputAttachmentsToMetadata(attachments)
	}

	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer rollbackAssistantAITx(tx)

	if err = insertAssistantAIMessageTx(tx, userMessage); err != nil {
		return nil, err
	}
	if err = syncAssistantAISessionStatsTx(tx, session.ID); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}

	maxContextMessages := getAssistantAIIntSetting(profile.Settings, "maxContextMessages", assistantAIDefaultContextMessages)
	contextMessages, err := listAssistantAISessionMessages(db, session.ID, maxContextMessages)
	if err != nil {
		return nil, err
	}
	maxContextTokens := getAssistantAIIntSetting(profile.Settings, "maxContextTokens", assistantAIDefaultContextTokens)
	contextMessages = trimAssistantAIContextMessages(contextMessages, maxContextTokens)

	systemPrompt := strings.TrimSpace(req.System)
	if "" == systemPrompt {
		systemPrompt = getAssistantAIStringSetting(profile.Settings, "systemPrompt", "")
	}

	useNativeTools := req.EnableTools && (isAssistantAILegacyCompatibleProvider(profile.Provider) || AssistantAIProviderAnthropic == profile.Provider || AssistantAIProviderGemini == profile.Provider)
	if req.EnableTools && !useNativeTools {
		toolPrompt := buildAssistantAIToolPrompt(profile, req.Context)
		if "" != toolPrompt {
			systemPrompt = strings.TrimSpace(firstAssistantAINonEmpty(systemPrompt, "") + "\n\n" + toolPrompt)
		}
	}
	if useNativeTools {
		ctxPart := buildAssistantAIToolContextSystemPart(req.Context)
		if "" != ctxPart {
			systemPrompt = strings.TrimSpace(systemPrompt + "\n\n" + ctxPart)
		}
	}

	loopResult, loopErr := runAssistantAIToolLoop(&assistantAIToolLoopParams{
		DB:              db,
		Profile:         profile,
		SessionID:       session.ID,
		Context:         req.Context,
		UserPrompt:      strings.TrimSpace(req.Message),
		SystemPrompt:    systemPrompt,
		ContextMessages: contextMessages,
		EnableTools:     req.EnableTools,
		UseNativeTools:  useNativeTools,
		OnDelta:         onDelta,
	})
	if nil != loopErr {
		return nil, loopErr
	}
	reply := loopResult.Reply
	toolResults := loopResult.ToolResults

	assistantMessage := &AssistantAIMessage{
		ID:                ast.NewNodeID(),
		SessionID:         session.ID,
		Role:              "assistant",
		Content:           strings.TrimSpace(reply.Content),
		ProviderMessageID: reply.ProviderMessageID,
		InputTokens:       reply.InputTokens,
		OutputTokens:      reply.OutputTokens,
		Metadata:          cloneAssistantAIMap(reply.Metadata),
		CreatedAt:         time.Now().UnixMilli(),
	}
	if nil == assistantMessage.Metadata {
		assistantMessage.Metadata = map[string]interface{}{}
	}
	if 0 < len(toolResults) {
		toolResultsJSON, marshalErr := marshalAssistantAIToolResults(toolResults)
		if nil == marshalErr {
			assistantMessage.Metadata["toolResults"] = toolResultsJSON
		}
	}

	tx, err = db.Begin()
	if err != nil {
		return nil, err
	}
	defer rollbackAssistantAITx(tx)

	if err = insertAssistantAIMessageTx(tx, assistantMessage); err != nil {
		return nil, err
	}
	if err = syncAssistantAISessionStatsTx(tx, session.ID); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}

	session, err = getAssistantAISession0(db, session.ID)
	if err != nil {
		return nil, err
	}
	messages, err := listAssistantAISessionMessages(db, session.ID, 0)
	if err != nil {
		return nil, err
	}

	return &AssistantAIChatResult{Session: session, Profile: profile, UserMessage: userMessage, AssistantMessage: assistantMessage, Messages: messages, ToolResults: toolResults}, nil
}

func editAssistantAIMessage0(req *AssistantAIMessageEditRequest, onDelta func(string) error) (ret *AssistantAIChatResult, err error) {
	if nil == req {
		return nil, fmt.Errorf("assistant AI edit request is required")
	}

	sessionID := strings.TrimSpace(req.SessionID)
	if "" == sessionID {
		return nil, fmt.Errorf("assistant AI session ID is required")
	}

	messageID := strings.TrimSpace(req.MessageID)
	if "" == messageID {
		return nil, fmt.Errorf("assistant AI message ID is required")
	}

	message := strings.TrimSpace(req.Message)
	attachments := normalizeAssistantAIInputAttachments(req.Attachments)
	if "" == message && 1 > len(attachments) {
		return nil, fmt.Errorf("assistant AI message is required")
	}

	db, err := getAssistantAIDB()
	if err != nil {
		return nil, err
	}

	session, err := getAssistantAISession0(db, sessionID)
	if err != nil {
		return nil, err
	}

	profileID := strings.TrimSpace(req.ProfileID)
	if "" == profileID {
		profileID = session.ProfileID
	}
	profile, err := getAssistantAIProfile0(db, profileID)
	if err != nil {
		return nil, err
	}

	userMessage, userMessageRowID, err := getAssistantAIMessagePosition0(db, session.ID, messageID)
	if err != nil {
		return nil, err
	}
	if "user" != strings.TrimSpace(userMessage.Role) {
		return nil, fmt.Errorf("assistant AI only supports editing user messages")
	}

	editedAt := time.Now().UnixMilli()
	userMessage.Content = message
	userMessage.Metadata = cloneAssistantAIMap(userMessage.Metadata)
	if nil == userMessage.Metadata {
		userMessage.Metadata = map[string]interface{}{}
	}
	userMessage.Metadata["editedAt"] = editedAt
	if 0 < len(attachments) {
		userMessage.Metadata["attachments"] = assistantAIInputAttachmentsToMetadata(attachments)
	} else {
		delete(userMessage.Metadata, "attachments")
	}

	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer rollbackAssistantAITx(tx)

	if err = updateAssistantAISessionProfileTx(tx, session, profile); err != nil {
		return nil, err
	}
	if err = updateAssistantAIMessageTx(tx, userMessage); err != nil {
		return nil, err
	}
	if err = deleteAssistantAISessionMessagesAfterTx(tx, session.ID, userMessage.CreatedAt, userMessageRowID); err != nil {
		return nil, err
	}
	if err = deleteAssistantAIToolAuditsAfterTx(tx, session.ID, userMessage.CreatedAt); err != nil {
		return nil, err
	}
	if err = syncAssistantAISessionStatsTx(tx, session.ID); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}

	maxContextMessages := getAssistantAIIntSetting(profile.Settings, "maxContextMessages", assistantAIDefaultContextMessages)
	contextMessages, err := listAssistantAISessionMessages(db, session.ID, maxContextMessages)
	if err != nil {
		return nil, err
	}
	maxContextTokens := getAssistantAIIntSetting(profile.Settings, "maxContextTokens", assistantAIDefaultContextTokens)
	contextMessages = trimAssistantAIContextMessages(contextMessages, maxContextTokens)

	systemPrompt := strings.TrimSpace(req.System)
	if "" == systemPrompt {
		systemPrompt = getAssistantAIStringSetting(profile.Settings, "systemPrompt", "")
	}

	editUseNativeTools := req.EnableTools && isAssistantAILegacyCompatibleProvider(profile.Provider)
	if req.EnableTools && !editUseNativeTools {
		toolPrompt := buildAssistantAIToolPrompt(profile, req.Context)
		if "" != toolPrompt {
			systemPrompt = strings.TrimSpace(firstAssistantAINonEmpty(systemPrompt, "") + "\n\n" + toolPrompt)
		}
	}
	if editUseNativeTools {
		ctxPart := buildAssistantAIToolContextSystemPart(req.Context)
		if "" != ctxPart {
			systemPrompt = strings.TrimSpace(systemPrompt + "\n\n" + ctxPart)
		}
	}

	editLoopResult, editLoopErr := runAssistantAIToolLoop(&assistantAIToolLoopParams{
		DB:              db,
		Profile:         profile,
		SessionID:       session.ID,
		Context:         req.Context,
		UserPrompt:      strings.TrimSpace(req.Message),
		SystemPrompt:    systemPrompt,
		ContextMessages: contextMessages,
		EnableTools:     req.EnableTools,
		UseNativeTools:  editUseNativeTools,
		OnDelta:         onDelta,
	})
	if nil != editLoopErr {
		return nil, editLoopErr
	}
	reply := editLoopResult.Reply
	toolResults := editLoopResult.ToolResults

	assistantMessage := &AssistantAIMessage{
		ID:                ast.NewNodeID(),
		SessionID:         session.ID,
		Role:              "assistant",
		Content:           strings.TrimSpace(reply.Content),
		ProviderMessageID: reply.ProviderMessageID,
		InputTokens:       reply.InputTokens,
		OutputTokens:      reply.OutputTokens,
		Metadata:          cloneAssistantAIMap(reply.Metadata),
		CreatedAt:         time.Now().UnixMilli(),
	}
	if nil == assistantMessage.Metadata {
		assistantMessage.Metadata = map[string]interface{}{}
	}
	if 0 < len(toolResults) {
		toolResultsJSON, marshalErr := marshalAssistantAIToolResults(toolResults)
		if nil == marshalErr {
			assistantMessage.Metadata["toolResults"] = toolResultsJSON
		}
	}

	tx, err = db.Begin()
	if err != nil {
		return nil, err
	}
	defer rollbackAssistantAITx(tx)

	if err = insertAssistantAIMessageTx(tx, assistantMessage); err != nil {
		return nil, err
	}
	if err = syncAssistantAISessionStatsTx(tx, session.ID); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}

	session, err = getAssistantAISession0(db, session.ID)
	if err != nil {
		return nil, err
	}
	messages, err := listAssistantAISessionMessages(db, session.ID, 0)
	if err != nil {
		return nil, err
	}

	return &AssistantAIChatResult{Session: session, Profile: profile, UserMessage: userMessage, AssistantMessage: assistantMessage, Messages: messages, ToolResults: toolResults}, nil
}

func AnalyzeAssistantAISession(req *AssistantAIAnalyzeRequest) (ret string, err error) {
	if nil == req {
		return "", fmt.Errorf("assistant AI analyze request is required")
	}
	sessionID := strings.TrimSpace(req.SessionID)
	if "" == sessionID {
		return "", fmt.Errorf("assistant AI session ID is required")
	}

	db, err := getAssistantAIDB()
	if err != nil {
		return "", err
	}
	session, err := getAssistantAISession0(db, sessionID)
	if err != nil {
		return "", err
	}

	profileID := strings.TrimSpace(req.ProfileID)
	if "" == profileID {
		profileID = session.ProfileID
	}
	profile, err := getAssistantAIProfile0(db, profileID)
	if err != nil {
		return "", err
	}

	messages, err := listAssistantAISessionMessages(db, sessionID, 0)
	if err != nil {
		return "", err
	}
	prompt := strings.TrimSpace(req.Prompt)
	if "" == prompt {
		prompt = "Analyze the conversation, extract the key decisions, open questions, actionable next steps, and produce a clean Markdown summary."
	}
	messages = append(messages, &AssistantAIMessage{
		ID:        ast.NewNodeID(),
		SessionID: sessionID,
		Role:      "user",
		Content:   prompt,
		CreatedAt: time.Now().UnixMilli(),
	})

	reply, err := chatWithAssistantAIProvider(profile, getAssistantAIStringSetting(profile.Settings, "systemPrompt", ""), messages, nil)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(reply.Content), nil
}

func ConfirmAssistantAITool(req *AssistantAIToolConfirmRequest) (ret *AssistantAIChatResult, err error) {
	if nil == req {
		return nil, fmt.Errorf("assistant AI tool confirm request is required")
	}
	sessionID := strings.TrimSpace(req.SessionID)
	if "" == sessionID {
		return nil, fmt.Errorf("assistant AI session ID is required")
	}

	db, err := getAssistantAIDB()
	if err != nil {
		return nil, err
	}
	session, err := getAssistantAISession0(db, sessionID)
	if err != nil {
		return nil, err
	}

	profileID := strings.TrimSpace(req.ProfileID)
	if "" == profileID {
		profileID = session.ProfileID
	}
	profile, err := getAssistantAIProfile0(db, profileID)
	if err != nil {
		return nil, err
	}

	sessionMessages, listErr := listAssistantAISessionMessages(db, session.ID, 0)
	if nil != listErr {
		return nil, listErr
	}
	userPrompt := assistantAIPrecedingUserPrompt(sessionMessages, strings.TrimSpace(req.MessageID))

	toolResult, err := confirmAssistantAITool(db, profile, session.ID, req.Context, strings.TrimSpace(req.ToolID), cloneAssistantAIMap(req.Args), userPrompt)
	if err != nil {
		return nil, err
	}
	if !toolResult.Executed {
		return nil, fmt.Errorf(firstAssistantAINonEmpty(toolResult.Error, toolResult.Summary, "assistant AI tool confirm failed"))
	}

	if updateErr := updateAssistantAIMessageToolResult(db, strings.TrimSpace(req.MessageID), strings.TrimSpace(req.AuditID), toolResult); nil != updateErr {
		return nil, updateErr
	}

	messages, err := listAssistantAISessionMessages(db, session.ID, getAssistantAIIntSetting(profile.Settings, "maxContextMessages", assistantAIDefaultContextMessages))
	if err != nil {
		return nil, err
	}
	messages = trimAssistantAIContextMessages(messages, getAssistantAIIntSetting(profile.Settings, "maxContextTokens", assistantAIDefaultContextTokens))
	messages = append(messages, &AssistantAIMessage{
		ID:        ast.NewNodeID(),
		SessionID: session.ID,
		Role:      "user",
		Content:   buildAssistantAIToolFollowupPrompt([]*AssistantAIToolResult{toolResult}),
		CreatedAt: time.Now().UnixMilli(),
	})

	reply, chatErr := chatWithAssistantAIProvider(profile, getAssistantAIStringSetting(profile.Settings, "systemPrompt", ""), messages, nil)
	if nil != chatErr {
		reply = &assistantAIProviderReply{
			Content: assistantTextForToolConfirmFallback(toolResult),
		}
	}

	assistantMessage := &AssistantAIMessage{
		ID:                ast.NewNodeID(),
		SessionID:         session.ID,
		Role:              "assistant",
		Content:           strings.TrimSpace(reply.Content),
		ProviderMessageID: reply.ProviderMessageID,
		InputTokens:       reply.InputTokens,
		OutputTokens:      reply.OutputTokens,
		Metadata:          cloneAssistantAIMap(reply.Metadata),
		CreatedAt:         time.Now().UnixMilli(),
	}
	if nil == assistantMessage.Metadata {
		assistantMessage.Metadata = map[string]interface{}{}
	}
	toolResultsJSON, marshalErr := marshalAssistantAIToolResults([]*AssistantAIToolResult{toolResult})
	if nil == marshalErr {
		assistantMessage.Metadata["toolResults"] = toolResultsJSON
	}

	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer rollbackAssistantAITx(tx)

	if err = insertAssistantAIMessageTx(tx, assistantMessage); err != nil {
		return nil, err
	}
	if err = syncAssistantAISessionStatsTx(tx, session.ID); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}

	session, err = getAssistantAISession0(db, session.ID)
	if err != nil {
		return nil, err
	}
	allMessages, err := listAssistantAISessionMessages(db, session.ID, 0)
	if err != nil {
		return nil, err
	}

	return &AssistantAIChatResult{
		Session:          session,
		Profile:          profile,
		UserMessage:      nil,
		AssistantMessage: assistantMessage,
		Messages:         allMessages,
		ToolResults:      []*AssistantAIToolResult{toolResult},
	}, nil
}

func RejectAssistantAITool(req *AssistantAIToolRejectRequest) (ret *AssistantAIChatResult, err error) {
	if nil == req {
		return nil, fmt.Errorf("assistant AI tool reject request is required")
	}
	sessionID := strings.TrimSpace(req.SessionID)
	if "" == sessionID {
		return nil, fmt.Errorf("assistant AI session ID is required")
	}

	db, err := getAssistantAIDB()
	if err != nil {
		return nil, err
	}
	session, err := getAssistantAISession0(db, sessionID)
	if err != nil {
		return nil, err
	}

	profileID := strings.TrimSpace(req.ProfileID)
	if "" == profileID {
		profileID = session.ProfileID
	}
	profile, err := getAssistantAIProfile0(db, profileID)
	if err != nil {
		return nil, err
	}

	toolResult, err := rejectAssistantAITool(db, profile, session.ID, strings.TrimSpace(req.ToolID))
	if err != nil {
		return nil, err
	}

	if updateErr := updateAssistantAIMessageToolResult(db, strings.TrimSpace(req.MessageID), strings.TrimSpace(toolResult.AuditID), toolResult); nil != updateErr {
		return nil, updateErr
	}

	session, err = getAssistantAISession0(db, session.ID)
	if err != nil {
		return nil, err
	}
	allMessages, err := listAssistantAISessionMessages(db, session.ID, 0)
	if err != nil {
		return nil, err
	}

	return &AssistantAIChatResult{
		Session:     session,
		Profile:     profile,
		Messages:    allMessages,
		ToolResults: []*AssistantAIToolResult{toolResult},
	}, nil
}

func assistantAIPrecedingUserPrompt(messages []*AssistantAIMessage, messageID string) string {
	messageID = strings.TrimSpace(messageID)
	if "" == messageID || 0 == len(messages) {
		return ""
	}
	for i, item := range messages {
		if nil == item || strings.TrimSpace(item.ID) != messageID {
			continue
		}
		for j := i - 1; 0 <= j; j-- {
			prev := messages[j]
			if nil == prev || "user" != strings.TrimSpace(prev.Role) {
				continue
			}
			return strings.TrimSpace(prev.Content)
		}
		break
	}
	return ""
}

func updateAssistantAIMessageToolResult(db *dbsql.DB, messageID, auditID string, replacement *AssistantAIToolResult) error {
	if nil == db || "" == strings.TrimSpace(messageID) || nil == replacement {
		return nil
	}

	var metadataJSON string
	if err := db.QueryRow(`SELECT metadata FROM ai_messages WHERE id = ?`, strings.TrimSpace(messageID)).Scan(&metadataJSON); err != nil {
		return err
	}

	metadata := map[string]interface{}{}
	if "" != strings.TrimSpace(metadataJSON) {
		if err := json.Unmarshal([]byte(metadataJSON), &metadata); err != nil {
			return err
		}
	}

	rawResults, _ := metadata["toolResults"].([]interface{})
	if 0 == len(rawResults) {
		return nil
	}

	replacementJSON, err := json.Marshal(replacement)
	if err != nil {
		return err
	}
	replacementRow := map[string]interface{}{}
	if err = json.Unmarshal(replacementJSON, &replacementRow); err != nil {
		return err
	}

	replaced := false
	for index, raw := range rawResults {
		row, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		if "" != auditID && strings.TrimSpace(fmt.Sprint(row["auditId"])) == strings.TrimSpace(auditID) {
			rawResults[index] = replacementRow
			replaced = true
			break
		}
	}
	if !replaced {
		for index, raw := range rawResults {
			row, ok := raw.(map[string]interface{})
			if !ok {
				continue
			}
			if strings.TrimSpace(fmt.Sprint(row["toolId"])) == replacement.ToolID && strings.TrimSpace(fmt.Sprint(row["executed"])) != "true" {
				rawResults[index] = replacementRow
				replaced = true
				break
			}
		}
	}
	if !replaced {
		rawResults = append(rawResults, replacementRow)
	}
	metadata["toolResults"] = rawResults

	metadataBytes, err := marshalAssistantAIMap(metadata)
	if err != nil {
		return err
	}
	_, err = db.Exec(`UPDATE ai_messages SET metadata = ? WHERE id = ?`, string(metadataBytes), strings.TrimSpace(messageID))
	return err
}

func assistantTextForToolConfirmFallback(result *AssistantAIToolResult) string {
	if nil == result {
		return "工具已执行。"
	}
	lines := []string{
		"工具已执行。",
		fmt.Sprintf("工具：%s", firstAssistantAINonEmpty(result.Name, result.ToolID)),
		fmt.Sprintf("结果：%s", firstAssistantAINonEmpty(result.Summary, "已完成")),
	}
	if 0 < len(result.Data) {
		if payload, err := json.MarshalIndent(result.Data, "", "  "); nil == err {
			lines = append(lines, "", string(payload))
		}
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

func getAssistantAIDB() (ret *dbsql.DB, err error) {
	assistantAIDBLock.Lock()
	defer assistantAIDBLock.Unlock()

	if nil != assistantAIDB {
		return assistantAIDB, nil
	}

	storageDir := filepath.Join(util.DataDir, "storage")
	if err = os.MkdirAll(storageDir, 0755); err != nil {
		return nil, err
	}
	dbPath := filepath.Join(storageDir, "assistant_ai.db")
	util.LogDatabaseSize(dbPath)

	dsn := dbPath + "?_journal_mode=WAL" +
		"&_synchronous=NORMAL" +
		"&_busy_timeout=7000" +
		"&_foreign_keys=ON" +
		"&_temp_store=MEMORY"
	db, err := dbsql.Open("sqlite3_extended", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxIdleConns(4)
	db.SetMaxOpenConns(4)
	db.SetConnMaxLifetime(365 * 24 * time.Hour)

	if err = initAssistantAIDBTables(db); err != nil {
		_ = db.Close()
		return nil, err
	}
	if err = bootstrapAssistantAILegacyProfile(db); err != nil {
		_ = db.Close()
		return nil, err
	}
	syncAssistantAILegacyConfig(db)

	assistantAIDB = db
	return assistantAIDB, nil
}
func initAssistantAIDBTables(db *dbsql.DB) (err error) {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS ai_profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            provider TEXT NOT NULL,
            base_url TEXT NOT NULL,
            api_key TEXT NOT NULL DEFAULT '',
            model TEXT NOT NULL,
            user_agent TEXT NOT NULL DEFAULT '',
            proxy TEXT NOT NULL DEFAULT '',
            version TEXT NOT NULL DEFAULT '',
            is_default INTEGER NOT NULL DEFAULT 0,
            settings TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )`,
		`CREATE INDEX IF NOT EXISTS idx_ai_profiles_updated_at ON ai_profiles(updated_at DESC)`,
		`CREATE TABLE IF NOT EXISTS ai_sessions (
            id TEXT PRIMARY KEY,
            profile_id TEXT NOT NULL DEFAULT '',
            mode TEXT NOT NULL DEFAULT 'chat',
            title TEXT NOT NULL,
            summary TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY(profile_id) REFERENCES ai_profiles(id) ON DELETE SET DEFAULT
        )`,
		`CREATE INDEX IF NOT EXISTS idx_ai_sessions_updated_at ON ai_sessions(updated_at DESC)`,
		`CREATE TABLE IF NOT EXISTS ai_messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            provider_message_id TEXT NOT NULL DEFAULT '',
            input_tokens INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0,
            metadata TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL,
            FOREIGN KEY(session_id) REFERENCES ai_sessions(id) ON DELETE CASCADE
        )`,
		`CREATE INDEX IF NOT EXISTS idx_ai_messages_session_id_created_at ON ai_messages(session_id, created_at)`,
		`CREATE TABLE IF NOT EXISTS ai_session_stats (
            session_id TEXT PRIMARY KEY,
            message_count INTEGER NOT NULL DEFAULT 0,
            user_message_count INTEGER NOT NULL DEFAULT 0,
            assistant_message_count INTEGER NOT NULL DEFAULT 0,
            last_message_at INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY(session_id) REFERENCES ai_sessions(id) ON DELETE CASCADE
        )`,
		`CREATE TABLE IF NOT EXISTS ai_tool_audits (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL DEFAULT '',
            profile_id TEXT NOT NULL DEFAULT '',
            tool_id TEXT NOT NULL,
            risk TEXT NOT NULL,
            decision TEXT NOT NULL,
            executed INTEGER NOT NULL DEFAULT 0,
            target_scope TEXT NOT NULL DEFAULT '',
            target_id TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT '',
            args TEXT NOT NULL DEFAULT '{}',
            result TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL
        )`,
		`CREATE INDEX IF NOT EXISTS idx_ai_tool_audits_created_at ON ai_tool_audits(created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_ai_tool_audits_session_id_created_at ON ai_tool_audits(session_id, created_at DESC)`,
	}
	for _, stmt := range statements {
		if _, err = db.Exec(stmt); err != nil {
			return err
		}
	}
	return nil
}

func bootstrapAssistantAILegacyProfile(db *dbsql.DB) (err error) {
	var count int
	if err = db.QueryRow(`SELECT COUNT(1) FROM ai_profiles`).Scan(&count); err != nil {
		return err
	}
	if 0 < count || nil == Conf || nil == Conf.AI || nil == Conf.AI.OpenAI {
		return nil
	}

	old := Conf.AI.OpenAI
	if "" == strings.TrimSpace(old.APIKey) || strings.EqualFold(strings.TrimSpace(old.APIProvider), "Azure") {
		return nil
	}

	now := time.Now().UnixMilli()
	settingsJSON, err := marshalAssistantAIMap(map[string]interface{}{
		"maxTokens":          old.APIMaxTokens,
		"temperature":        old.APITemperature,
		"timeout":            old.APITimeout,
		"maxContextMessages": old.APIMaxContexts,
	})
	if err != nil {
		return err
	}

	_, err = db.Exec(`INSERT INTO ai_profiles (id, name, provider, base_url, api_key, model, user_agent, proxy, version, is_default, settings, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
		ast.NewNodeID(), "Legacy Default", normalizeAssistantAIProvider(old.APIProvider),
		normalizeAssistantAIBaseURL(normalizeAssistantAIProvider(old.APIProvider), old.APIBaseURL), strings.TrimSpace(old.APIKey),
		firstAssistantAINonEmpty(strings.TrimSpace(old.APIModel), openai.GPT3Dot5Turbo), strings.TrimSpace(old.APIUserAgent),
		strings.TrimSpace(old.APIProxy), strings.TrimSpace(old.APIVersion), string(settingsJSON), now, now)
	return err
}

func syncAssistantAILegacyConfig(db *dbsql.DB) {
	if nil == Conf {
		return
	}
	if nil == Conf.AI {
		Conf.AI = conf.NewAI()
	}
	if nil == Conf.AI.OpenAI {
		Conf.AI.OpenAI = conf.NewAI().OpenAI
	}

	profile, err := getAssistantAIProfile0(db, "")
	if nil != err || nil == profile {
		Conf.AI.OpenAI.APIKey = ""
		Conf.Save()
		return
	}

	openAI := Conf.AI.OpenAI
	openAI.APIProvider = "OpenAI"
	openAI.APIBaseURL = profile.BaseURL
	openAI.APIUserAgent = profile.UserAgent
	openAI.APIProxy = profile.Proxy
	openAI.APIVersion = profile.Version
	openAI.APIModel = profile.Model
	openAI.APITimeout = getAssistantAIIntSetting(profile.Settings, "timeout", assistantAIDefaultTimeout)
	openAI.APIMaxTokens = getAssistantAIIntSetting(profile.Settings, "maxTokens", 0)
	openAI.APITemperature = getAssistantAIFloatSetting(profile.Settings, "temperature", assistantAIDefaultTemperature)
	openAI.APIMaxContexts = getAssistantAIIntSetting(profile.Settings, "maxContextMessages", assistantAIDefaultContextMessages)

	if isAssistantAILegacyCompatibleProvider(profile.Provider) {
		openAI.APIKey = profile.APIKey
	} else {
		// Legacy OpenAI-only entry points should fail fast instead of sending incompatible provider traffic.
		openAI.APIKey = ""
	}
	Conf.Save()
}

func isAssistantAILegacyCompatibleProvider(provider string) bool {
	switch normalizeAssistantAIProvider(provider) {
	case AssistantAIProviderOpenAICompatible,
		AssistantAIProviderVolcengine,
		AssistantAIProviderVolcenginePlan,
		AssistantAIProviderKimi,
		AssistantAIProviderGLM,
		AssistantAIProviderQwen,
		AssistantAIProviderOpenRouter,
		AssistantAIProviderDeepSeek,
		AssistantAIProviderOllama:
		return true
	default:
		return false
	}
}

func createAssistantAISession0(db *dbsql.DB, profileID, mode, title string) (ret *AssistantAISession, err error) {
	if "" == profileID {
		if profile, profileErr := getAssistantAIProfile0(db, ""); nil == profileErr && nil != profile {
			profileID = profile.ID
		}
	}
	if "" == mode {
		mode = "chat"
	}
	if "" == title {
		title = "New Chat"
	}

	now := time.Now().UnixMilli()
	ret = &AssistantAISession{
		ID:        ast.NewNodeID(),
		ProfileID: profileID,
		Mode:      mode,
		Title:     title,
		Summary:   "",
		CreatedAt: now,
		UpdatedAt: now,
	}
	_, err = db.Exec(`INSERT INTO ai_sessions (id, profile_id, mode, title, summary, created_at, updated_at) VALUES (?, ?, ?, ?, '', ?, ?)`,
		ret.ID, ret.ProfileID, ret.Mode, ret.Title, ret.CreatedAt, ret.UpdatedAt)
	return ret, err
}

func getAssistantAIProfile0(db *dbsql.DB, id string) (ret *AssistantAIProfile, err error) {
	query := `SELECT id, name, provider, base_url, api_key, model, user_agent, proxy, version, is_default, settings, created_at, updated_at FROM ai_profiles `
	args := []interface{}{}
	if "" != id {
		query += `WHERE id = ? LIMIT 1`
		args = append(args, id)
	} else {
		query += `ORDER BY is_default DESC, updated_at DESC, created_at DESC LIMIT 1`
	}

	row := db.QueryRow(query, args...)
	ret, err = scanAssistantAIProfile(row)
	if err == dbsql.ErrNoRows {
		return nil, fmt.Errorf("assistant AI profile not found")
	}
	return ret, err
}

func getAssistantAISession0(db *dbsql.DB, id string) (ret *AssistantAISession, err error) {
	row := db.QueryRow(`SELECT s.id, s.profile_id, s.mode, s.title, s.summary, s.created_at, s.updated_at,
        COALESCE(st.message_count, 0), COALESCE(st.user_message_count, 0), COALESCE(st.assistant_message_count, 0), COALESCE(st.last_message_at, 0)
        FROM ai_sessions s LEFT JOIN ai_session_stats st ON st.session_id = s.id WHERE s.id = ? LIMIT 1`, id)
	ret, err = scanAssistantAISession(row)
	if err == dbsql.ErrNoRows {
		return nil, fmt.Errorf("assistant AI session not found")
	}
	return ret, err
}

func ensureAssistantAIDefaultProfileTx(tx *dbsql.Tx) (err error) {
	var hasDefault int
	if err = tx.QueryRow(`SELECT COUNT(1) FROM ai_profiles WHERE is_default = 1`).Scan(&hasDefault); err != nil {
		return err
	}
	if 0 < hasDefault {
		return nil
	}

	var fallbackID string
	if err = tx.QueryRow(`SELECT id FROM ai_profiles ORDER BY updated_at DESC, created_at DESC LIMIT 1`).Scan(&fallbackID); err != nil {
		if err == dbsql.ErrNoRows {
			return nil
		}
		return err
	}
	_, err = tx.Exec(`UPDATE ai_profiles SET is_default = 1 WHERE id = ?`, fallbackID)
	return err
}

func updateAssistantAISessionProfileTx(tx *dbsql.Tx, session *AssistantAISession, profile *AssistantAIProfile) (err error) {
	if nil == tx || nil == session || nil == profile || profile.ID == session.ProfileID {
		return nil
	}
	if _, err = tx.Exec(`UPDATE ai_sessions SET profile_id = ?, updated_at = ? WHERE id = ?`, profile.ID, time.Now().UnixMilli(), session.ID); err != nil {
		return err
	}
	session.ProfileID = profile.ID
	return nil
}

func insertAssistantAIMessageTx(tx *dbsql.Tx, msg *AssistantAIMessage) (err error) {
	metadataJSON, err := marshalAssistantAIMap(msg.Metadata)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`INSERT INTO ai_messages (id, session_id, role, content, provider_message_id, input_tokens, output_tokens, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		msg.ID, msg.SessionID, msg.Role, msg.Content, msg.ProviderMessageID, msg.InputTokens, msg.OutputTokens, string(metadataJSON), msg.CreatedAt)
	return err
}

func updateAssistantAIMessageTx(tx *dbsql.Tx, msg *AssistantAIMessage) (err error) {
	metadataJSON, err := marshalAssistantAIMap(msg.Metadata)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`UPDATE ai_messages
        SET content = ?, provider_message_id = ?, input_tokens = ?, output_tokens = ?, metadata = ?, created_at = ?
        WHERE id = ?`,
		msg.Content, msg.ProviderMessageID, msg.InputTokens, msg.OutputTokens, string(metadataJSON), msg.CreatedAt, msg.ID)
	return err
}

func syncAssistantAISessionStatsTx(tx *dbsql.Tx, sessionID string) (err error) {
	var messageCount, userMessageCount, assistantMessageCount int
	var lastMessageAt int64
	if err = tx.QueryRow(`SELECT COUNT(1),
        COALESCE(SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END), 0),
        COALESCE(MAX(created_at), 0)
        FROM ai_messages WHERE session_id = ?`, sessionID).Scan(&messageCount, &userMessageCount, &assistantMessageCount, &lastMessageAt); err != nil {
		return err
	}
	_, err = tx.Exec(`INSERT INTO ai_session_stats (session_id, message_count, user_message_count, assistant_message_count, last_message_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
            message_count = excluded.message_count,
            user_message_count = excluded.user_message_count,
            assistant_message_count = excluded.assistant_message_count,
            last_message_at = excluded.last_message_at`,
		sessionID, messageCount, userMessageCount, assistantMessageCount, lastMessageAt)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`UPDATE ai_sessions SET updated_at = ? WHERE id = ?`, maxAssistantAIInt64(lastMessageAt, time.Now().UnixMilli()), sessionID)
	return err
}

func deleteAssistantAISessionMessagesAfterTx(tx *dbsql.Tx, sessionID string, createdAt, rowID int64) (err error) {
	if nil == tx {
		return nil
	}
	_, err = tx.Exec(`DELETE FROM ai_messages
        WHERE session_id = ? AND (created_at > ? OR (created_at = ? AND rowid > ?))`,
		sessionID, createdAt, createdAt, rowID)
	return err
}

func deleteAssistantAIToolAuditsAfterTx(tx *dbsql.Tx, sessionID string, createdAt int64) (err error) {
	if nil == tx {
		return nil
	}
	_, err = tx.Exec(`DELETE FROM ai_tool_audits WHERE session_id = ? AND created_at >= ?`, sessionID, createdAt)
	return err
}

func getAssistantAIMessagePosition0(db *dbsql.DB, sessionID, messageID string) (ret *AssistantAIMessage, rowID int64, err error) {
	row := db.QueryRow(`SELECT rowid, id, session_id, role, content, provider_message_id, input_tokens, output_tokens, metadata, created_at
        FROM ai_messages WHERE session_id = ? AND id = ? LIMIT 1`, sessionID, messageID)
	ret = &AssistantAIMessage{}
	var metadataJSON string
	if err = row.Scan(&rowID, &ret.ID, &ret.SessionID, &ret.Role, &ret.Content, &ret.ProviderMessageID, &ret.InputTokens, &ret.OutputTokens, &metadataJSON, &ret.CreatedAt); err != nil {
		if err == dbsql.ErrNoRows {
			return nil, 0, fmt.Errorf("assistant AI message not found")
		}
		return nil, 0, err
	}
	ret.Metadata = map[string]interface{}{}
	if "" != strings.TrimSpace(metadataJSON) {
		if err = json.Unmarshal([]byte(metadataJSON), &ret.Metadata); err != nil {
			return nil, 0, err
		}
	}
	if nil == ret.Metadata {
		ret.Metadata = map[string]interface{}{}
	}
	return ret, rowID, nil
}

func listAssistantAISessionMessages(db *dbsql.DB, sessionID string, limit int) (ret []*AssistantAIMessage, err error) {
	ret = []*AssistantAIMessage{}
	query := `SELECT id, session_id, role, content, provider_message_id, input_tokens, output_tokens, metadata, created_at
        FROM ai_messages WHERE session_id = ? ORDER BY created_at ASC, rowid ASC`
	args := []interface{}{sessionID}
	if 0 < limit {
		query = `SELECT id, session_id, role, content, provider_message_id, input_tokens, output_tokens, metadata, created_at
            FROM (
                SELECT id, session_id, role, content, provider_message_id, input_tokens, output_tokens, metadata, created_at, rowid
                FROM ai_messages WHERE session_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?
            ) ORDER BY created_at ASC, rowid ASC`
		args = append(args, limit)
	}

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		msg, scanErr := scanAssistantAIMessage(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		ret = append(ret, msg)
	}
	return ret, rows.Err()
}

func chatWithAssistantAIProvider(profile *AssistantAIProfile, systemPrompt string, messages []*AssistantAIMessage, opts *assistantAIChatOptions) (ret *assistantAIProviderReply, err error) {
	switch profile.Provider {
	case AssistantAIProviderAnthropic:
		return chatAssistantAIAnthropic(profile, systemPrompt, messages)
	case AssistantAIProviderGemini:
		return chatAssistantAIGemini(profile, systemPrompt, messages, opts)
	default:
		return chatAssistantAIOpenAICompatible(profile, systemPrompt, messages, opts)
	}
}

func chatWithAssistantAIProviderStream(profile *AssistantAIProfile, systemPrompt string, messages []*AssistantAIMessage, onDelta func(string) error, opts *assistantAIChatOptions) (ret *assistantAIProviderReply, err error) {
	switch profile.Provider {
	case AssistantAIProviderAnthropic:
		return chatAssistantAIAnthropicStream(profile, systemPrompt, messages, onDelta, opts)
	case AssistantAIProviderGemini:
		return chatAssistantAIGeminiStream(profile, systemPrompt, messages, onDelta, opts)
	default:
		return chatAssistantAIOpenAICompatibleStream(profile, systemPrompt, messages, onDelta, opts)
	}
}

func canStreamAssistantAIProvider(profile *AssistantAIProfile) bool {
	if nil == profile {
		return false
	}
	return true
}

func chatAssistantAIOpenAICompatible(profile *AssistantAIProfile, systemPrompt string, messages []*AssistantAIMessage, opts *assistantAIChatOptions) (ret *assistantAIProviderReply, err error) {
	client := util.NewOpenAIClient(resolveAssistantAIOpenAICompatibleAPIKey(profile), profile.Proxy, profile.BaseURL, profile.UserAgent, profile.Version, "OpenAI")

	maxTokens := getAssistantAIIntSetting(profile.Settings, "maxTokens", 0)
	temperature := float32(getAssistantAIFloatSetting(profile.Settings, "temperature", assistantAIDefaultTemperature))
	timeout := getAssistantAIIntSetting(profile.Settings, "timeout", assistantAIDefaultTimeout)

	req := openai.ChatCompletionRequest{
		Model:    profile.Model,
		Messages: buildAssistantAIOpenAICompatibleMessages(systemPrompt, messages),
	}
	if nil != opts && opts.EnableTools {
		if tools := buildAssistantAIOpenAIToolDefinitions(profile); 0 < len(tools) {
			req.Tools = tools
		}
	}
	applyAssistantAIOpenAICompatibleRequestOptions(profile, &req, maxTokens, temperature)

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout)*time.Second)
	defer cancel()

	resp, err := createAssistantAIOpenAICompatibleCompletion(ctx, client, profile, req)
	if err != nil {
		return nil, err
	}
	if 1 > len(resp.Choices) {
		return nil, fmt.Errorf("assistant AI provider returned empty choices")
	}

	choice := resp.Choices[0]
	ret = &assistantAIProviderReply{
		Content:      strings.TrimSpace(choice.Message.Content),
		InputTokens:  resp.Usage.PromptTokens,
		OutputTokens: resp.Usage.CompletionTokens,
		Metadata: map[string]interface{}{
			"provider":     profile.Provider,
			"finishReason": choice.FinishReason,
			"model":        resp.Model,
		},
	}
	if 0 < len(choice.Message.ToolCalls) {
		toolCalls := make([]map[string]interface{}, 0, len(choice.Message.ToolCalls))
		for _, tc := range choice.Message.ToolCalls {
			toolCalls = append(toolCalls, map[string]interface{}{
				"id":   tc.ID,
				"type": string(tc.Type),
				"function": map[string]interface{}{
					"name":      tc.Function.Name,
					"arguments": tc.Function.Arguments,
				},
			})
		}
		ret.ToolCalls = toolCalls
	}
	return ret, nil
}

func chatAssistantAIOpenAICompatibleStream(profile *AssistantAIProfile, systemPrompt string, messages []*AssistantAIMessage, onDelta func(string) error, opts *assistantAIChatOptions) (ret *assistantAIProviderReply, err error) {
	client := util.NewOpenAIClient(resolveAssistantAIOpenAICompatibleAPIKey(profile), profile.Proxy, profile.BaseURL, profile.UserAgent, profile.Version, "OpenAI")

	maxTokens := getAssistantAIIntSetting(profile.Settings, "maxTokens", 0)
	temperature := float32(getAssistantAIFloatSetting(profile.Settings, "temperature", assistantAIDefaultTemperature))
	timeout := getAssistantAIIntSetting(profile.Settings, "timeout", assistantAIDefaultTimeout)

	req := openai.ChatCompletionRequest{
		Model:         profile.Model,
		Messages:      buildAssistantAIOpenAICompatibleMessages(systemPrompt, messages),
		StreamOptions: &openai.StreamOptions{IncludeUsage: true},
	}
	if nil != opts && opts.EnableTools {
		if tools := buildAssistantAIOpenAIToolDefinitions(profile); 0 < len(tools) {
			req.Tools = tools
		}
	}
	applyAssistantAIOpenAICompatibleRequestOptions(profile, &req, maxTokens, temperature)

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout)*time.Second)
	defer cancel()

	stream, err := client.CreateChatCompletionStream(ctx, req)
	if nil != err {
		fallback, fallbackErr := createAssistantAIOpenAICompatibleCompletion(ctx, client, profile, req)
		if nil != fallbackErr {
			return nil, err
		}
		if 1 > len(fallback.Choices) {
			return nil, fmt.Errorf("assistant AI provider returned empty choices")
		}
		choice := fallback.Choices[0]
		ret = &assistantAIProviderReply{
			Content:      strings.TrimSpace(choice.Message.Content),
			InputTokens:  fallback.Usage.PromptTokens,
			OutputTokens: fallback.Usage.CompletionTokens,
			Metadata: map[string]interface{}{
				"provider":     profile.Provider,
				"finishReason": choice.FinishReason,
				"model":        fallback.Model,
			},
		}
		if 0 < len(choice.Message.ToolCalls) {
			toolCalls := make([]map[string]interface{}, 0, len(choice.Message.ToolCalls))
			for _, tc := range choice.Message.ToolCalls {
				toolCalls = append(toolCalls, map[string]interface{}{
					"id":   tc.ID,
					"type": string(tc.Type),
					"function": map[string]interface{}{
						"name":      tc.Function.Name,
						"arguments": tc.Function.Arguments,
					},
				})
			}
			ret.ToolCalls = toolCalls
		}
		return ret, nil
	}
	defer stream.Close()

	builder := &strings.Builder{}
	providerMessageID := ""
	modelName := profile.Model
	finishReason := ""
	inputTokens := 0
	outputTokens := 0
	var aggregatedToolCalls []map[string]interface{}

	for {
		chunk, recvErr := stream.Recv()
		if nil != recvErr {
			if io.EOF == recvErr {
				break
			}
			return nil, recvErr
		}
		if "" == providerMessageID {
			providerMessageID = chunk.ID
		}
		if "" == modelName && "" != strings.TrimSpace(chunk.Model) {
			modelName = chunk.Model
		}
		if nil != chunk.Usage {
			inputTokens = chunk.Usage.PromptTokens
			outputTokens = chunk.Usage.CompletionTokens
		}
		if 1 > len(chunk.Choices) {
			continue
		}
		choice := chunk.Choices[0]
		if "" != strings.TrimSpace(choice.Delta.Content) {
			builder.WriteString(choice.Delta.Content)
			if nil != onDelta {
				if emitErr := onDelta(choice.Delta.Content); nil != emitErr {
					return nil, emitErr
				}
			}
		}
		for _, tc := range choice.Delta.ToolCalls {
			idx := 0
			if nil != tc.Index {
				idx = *tc.Index
			}
			for len(aggregatedToolCalls) <= idx {
				aggregatedToolCalls = append(aggregatedToolCalls, map[string]interface{}{
					"id":       "",
					"type":     "function",
					"function": map[string]interface{}{"name": "", "arguments": ""},
				})
			}
			entry := aggregatedToolCalls[idx]
			if "" != tc.ID {
				entry["id"] = tc.ID
			}
			fn := entry["function"].(map[string]interface{})
			if "" != tc.Function.Name {
				fn["name"] = tc.Function.Name
			}
			if "" != tc.Function.Arguments {
				fn["arguments"] = fn["arguments"].(string) + tc.Function.Arguments
			}
		}
		if choice.FinishReason != "" && choice.FinishReason != openai.FinishReasonNull {
			finishReason = string(choice.FinishReason)
		}
	}

	ret = &assistantAIProviderReply{
		Content:           strings.TrimSpace(builder.String()),
		ProviderMessageID: providerMessageID,
		InputTokens:       inputTokens,
		OutputTokens:      outputTokens,
		Metadata: map[string]interface{}{
			"provider":     profile.Provider,
			"finishReason": finishReason,
			"model":        modelName,
		},
	}
	if 0 < len(aggregatedToolCalls) {
		ret.ToolCalls = aggregatedToolCalls
	}
	return ret, nil
}
func chatAssistantAIAnthropic(profile *AssistantAIProfile, systemPrompt string, messages []*AssistantAIMessage) (ret *assistantAIProviderReply, err error) {
	endpoint := strings.TrimRight(profile.BaseURL, "/")
	if strings.HasSuffix(endpoint, "/v1") {
		endpoint += "/messages"
	} else {
		endpoint += "/v1/messages"
	}

	reqBody := map[string]interface{}{
		"model":       profile.Model,
		"max_tokens":  maxAssistantAIInt(resolveAssistantAIRequestMaxTokens(profile, 2048), 1),
		"temperature": resolveAssistantAIRequestTemperature(profile, assistantAIDefaultTemperature),
		"messages":    buildAnthropicMessages(messages),
	}
	if "" != strings.TrimSpace(systemPrompt) {
		reqBody["system"] = systemPrompt
	}

	var resp struct {
		ID      string `json:"id"`
		Model   string `json:"model"`
		Content []struct {
			Type  string          `json:"type"`
			Text  string          `json:"text"`
			ID    string          `json:"id"`
			Name  string          `json:"name"`
			Input json.RawMessage `json:"input"`
		} `json:"content"`
		StopReason string `json:"stop_reason"`
		Usage      struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}

	headers := map[string]string{
		"x-api-key":         profile.APIKey,
		"anthropic-version": firstAssistantAINonEmpty(strings.TrimSpace(profile.Version), assistantAIDefaultAnthropicVersion),
	}
	if err = doAssistantAIJSONRequest(profile, http.MethodPost, endpoint, headers, reqBody, &resp); err != nil {
		return nil, err
	}
	if nil != resp.Error && "" != strings.TrimSpace(resp.Error.Message) {
		return nil, fmt.Errorf(resp.Error.Message)
	}

	builder := &strings.Builder{}
	var toolCalls []map[string]interface{}
	for _, item := range resp.Content {
		switch item.Type {
		case "text":
			builder.WriteString(item.Text)
		case "tool_use":
			toolCalls = append(toolCalls, map[string]interface{}{
				"id":   item.ID,
				"type": "function",
				"function": map[string]interface{}{
					"name":      item.Name,
					"arguments": string(item.Input),
				},
			})
		}
	}
	ret = &assistantAIProviderReply{
		Content:           strings.TrimSpace(builder.String()),
		ProviderMessageID: resp.ID,
		InputTokens:       resp.Usage.InputTokens,
		OutputTokens:      resp.Usage.OutputTokens,
		Metadata: map[string]interface{}{
			"provider":     profile.Provider,
			"finishReason": resp.StopReason,
			"model":        resp.Model,
		},
	}
	if 0 < len(toolCalls) {
		ret.ToolCalls = toolCalls
	}
	return ret, nil
}

func chatAssistantAIGemini(profile *AssistantAIProfile, systemPrompt string, messages []*AssistantAIMessage, opts *assistantAIChatOptions) (ret *assistantAIProviderReply, err error) {
	endpoint := strings.TrimRight(profile.BaseURL, "/")
	if strings.HasSuffix(endpoint, "/v1beta") {
		endpoint += "/models/" + url.PathEscape(profile.Model) + ":generateContent"
	} else {
		endpoint += "/v1beta/models/" + url.PathEscape(profile.Model) + ":generateContent"
	}

	reqBody := map[string]interface{}{
		"contents": buildGeminiMessages(messages),
		"generationConfig": map[string]interface{}{
			"temperature":     resolveAssistantAIRequestTemperature(profile, assistantAIDefaultTemperature),
			"maxOutputTokens": maxAssistantAIInt(resolveAssistantAIRequestMaxTokens(profile, 2048), 1),
		},
	}
	if "" != strings.TrimSpace(systemPrompt) {
		reqBody["system_instruction"] = map[string]interface{}{
			"parts": []map[string]string{{"text": systemPrompt}},
		}
	}
	if nil != opts && opts.EnableTools {
		if declarations := buildAssistantAIGeminiTools(profile); 0 < len(declarations) {
			reqBody["tools"] = []map[string]interface{}{
				{"function_declarations": declarations},
			}
		}
	}

	headers := map[string]string{
		"x-goog-api-key": profile.APIKey,
	}

	var resp struct {
		Candidates []struct {
			FinishReason string `json:"finishReason"`
			Content      struct {
				Parts []struct {
					Text         string          `json:"text"`
					FunctionCall *struct {
						Name string          `json:"name"`
						Args json.RawMessage `json:"args"`
					} `json:"functionCall"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
		UsageMetadata struct {
			PromptTokenCount     int `json:"promptTokenCount"`
			CandidatesTokenCount int `json:"candidatesTokenCount"`
		} `json:"usageMetadata"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}

	if err = doAssistantAIJSONRequest(profile, http.MethodPost, endpoint, headers, reqBody, &resp); err != nil {
		return nil, err
	}
	if nil != resp.Error && "" != strings.TrimSpace(resp.Error.Message) {
		return nil, fmt.Errorf(resp.Error.Message)
	}
	if 1 > len(resp.Candidates) {
		return nil, fmt.Errorf("assistant AI provider returned empty candidates")
	}

	builder := &strings.Builder{}
	var toolCalls []map[string]interface{}
	for _, part := range resp.Candidates[0].Content.Parts {
		if "" != strings.TrimSpace(part.Text) {
			builder.WriteString(part.Text)
		}
		if nil != part.FunctionCall {
			toolCalls = append(toolCalls, map[string]interface{}{
				"id":   fmt.Sprintf("gemini_%s", part.FunctionCall.Name),
				"type": "function",
				"function": map[string]interface{}{
					"name":      part.FunctionCall.Name,
					"arguments": string(part.FunctionCall.Args),
				},
			})
		}
	}
	ret = &assistantAIProviderReply{
		Content:      strings.TrimSpace(builder.String()),
		InputTokens:  resp.UsageMetadata.PromptTokenCount,
		OutputTokens: resp.UsageMetadata.CandidatesTokenCount,
		Metadata: map[string]interface{}{
			"provider":     profile.Provider,
			"finishReason": resp.Candidates[0].FinishReason,
			"model":        profile.Model,
		},
	}
	if 0 < len(toolCalls) {
		ret.ToolCalls = toolCalls
	}
	return ret, nil
}

func doAssistantAIJSONRequest(profile *AssistantAIProfile, method, endpoint string, headers map[string]string, reqBody interface{}, respBody interface{}) (err error) {
	data, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(context.Background(), method, endpoint, strings.NewReader(string(data)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if userAgent := resolveAssistantAIUserAgent(profile.UserAgent); "" != userAgent {
		req.Header.Set("User-Agent", userAgent)
	}
	for k, v := range headers {
		if "" != strings.TrimSpace(v) {
			req.Header.Set(k, v)
		}
	}

	client, err := newAssistantAIHTTPClient(profile)
	if err != nil {
		return err
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if 400 <= resp.StatusCode {
		var failure struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&failure)
		if "" != strings.TrimSpace(failure.Error.Message) {
			return fmt.Errorf("%s", failure.Error.Message)
		}
		return fmt.Errorf("assistant AI provider request failed with status %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(respBody)
}

func init() {
	assistantAIHTTPClients = map[string]*http.Client{}
}

func newAssistantAIHTTPClient(profile *AssistantAIProfile) (ret *http.Client, err error) {
	cacheKey := strings.TrimSpace(profile.Proxy)
	assistantAIHTTPClientsMu.Lock()
	defer assistantAIHTTPClientsMu.Unlock()

	if cached, ok := assistantAIHTTPClients[cacheKey]; ok {
		return cached, nil
	}

	transport := &http.Transport{
		MaxIdleConns:        10,
		MaxIdleConnsPerHost: 5,
		IdleConnTimeout:     90 * time.Second,
	}
	if proxyURL := strings.TrimSpace(profile.Proxy); "" != proxyURL {
		parsed, parseErr := url.Parse(proxyURL)
		if parseErr != nil {
			return nil, parseErr
		}
		transport.Proxy = http.ProxyURL(parsed)
	}
	timeout := getAssistantAIIntSetting(profile.Settings, "timeout", assistantAIDefaultTimeout)
	ret = &http.Client{Transport: transport, Timeout: time.Duration(timeout) * time.Second}
	assistantAIHTTPClients[cacheKey] = ret
	return ret, nil
}

func buildAssistantAIOpenAICompatibleMessages(systemPrompt string, messages []*AssistantAIMessage) []openai.ChatCompletionMessage {
	ret := make([]openai.ChatCompletionMessage, 0, len(messages)+1)
	if "" != strings.TrimSpace(systemPrompt) {
		ret = append(ret, openai.ChatCompletionMessage{Role: openai.ChatMessageRoleSystem, Content: systemPrompt})
	}
	for _, msg := range messages {
		attachments := assistantAIMessageAttachments(msg)
		if 0 < len(attachments) && "user" == strings.TrimSpace(msg.Role) {
			parts := []openai.ChatMessagePart{}
			if "" != strings.TrimSpace(msg.Content) {
				parts = append(parts, openai.ChatMessagePart{
					Type: openai.ChatMessagePartTypeText,
					Text: msg.Content,
				})
			}
			for _, attachment := range attachments {
				parts = append(parts, openai.ChatMessagePart{
					Type: openai.ChatMessagePartTypeImageURL,
					ImageURL: &openai.ChatMessageImageURL{
						URL:    assistantAIInputAttachmentDataURL(attachment),
						Detail: openai.ImageURLDetailAuto,
					},
				})
			}
			ret = append(ret, openai.ChatCompletionMessage{Role: msg.Role, MultiContent: parts})
			continue
		}
		ret = append(ret, openai.ChatCompletionMessage{Role: msg.Role, Content: msg.Content})
	}
	return ret
}

func buildAnthropicMessages(messages []*AssistantAIMessage) []map[string]interface{} {
	ret := make([]map[string]interface{}, 0, len(messages))
	for _, msg := range messages {
		role := msg.Role
		if "system" == role {
			role = "user"
		}
		content := make([]map[string]interface{}, 0, 1)
		if "user" == role {
			for _, attachment := range assistantAIMessageAttachments(msg) {
				content = append(content, map[string]interface{}{
					"type": "image",
					"source": map[string]string{
						"type":       "base64",
						"media_type": attachment.MimeType,
						"data":       attachment.Data,
					},
				})
			}
		}
		if "" != strings.TrimSpace(msg.Content) || 0 == len(content) {
			content = append(content, map[string]interface{}{
				"type": "text",
				"text": msg.Content,
			})
		}
		ret = append(ret, map[string]interface{}{
			"role":    role,
			"content": content,
		})
	}
	return ret
}

func buildGeminiMessages(messages []*AssistantAIMessage) []map[string]interface{} {
	ret := make([]map[string]interface{}, 0, len(messages))
	for _, msg := range messages {
		role := "user"
		if "assistant" == msg.Role {
			role = "model"
		}
		parts := make([]map[string]interface{}, 0, 1)
		if "user" == role {
			for _, attachment := range assistantAIMessageAttachments(msg) {
				parts = append(parts, map[string]interface{}{
					"inlineData": map[string]string{
						"mimeType": attachment.MimeType,
						"data":     attachment.Data,
					},
				})
			}
		}
		if "" != strings.TrimSpace(msg.Content) || 0 == len(parts) {
			parts = append(parts, map[string]interface{}{"text": msg.Content})
		}
		ret = append(ret, map[string]interface{}{
			"role":  role,
			"parts": parts,
		})
	}
	return ret
}

func normalizeAssistantAIProfile(profile *AssistantAIProfile) (ret *AssistantAIProfile, err error) {
	ret = &AssistantAIProfile{
		ID:        strings.TrimSpace(profile.ID),
		Name:      strings.TrimSpace(profile.Name),
		Provider:  normalizeAssistantAIProvider(profile.Provider),
		BaseURL:   normalizeAssistantAIBaseURL(normalizeAssistantAIProvider(profile.Provider), profile.BaseURL),
		APIKey:    strings.TrimSpace(profile.APIKey),
		Model:     strings.TrimSpace(profile.Model),
		UserAgent: strings.TrimSpace(profile.UserAgent),
		Proxy:     strings.TrimSpace(profile.Proxy),
		Version:   strings.TrimSpace(profile.Version),
		IsDefault: profile.IsDefault,
		Settings:  cloneAssistantAIMap(profile.Settings),
	}
	if "" == ret.ID {
		ret.ID = ast.NewNodeID()
	}
	if !isSupportedAssistantAIProvider(ret.Provider) {
		return nil, fmt.Errorf("unsupported assistant AI provider [%s]", ret.Provider)
	}
	if "" == ret.Model {
		return nil, fmt.Errorf("assistant AI model is required")
	}
	if "" == ret.Name {
		ret.Name = buildAssistantAIProfileName(ret.Provider, ret.Model)
	}
	if 0 == len(ret.Settings) {
		ret.Settings = map[string]interface{}{}
	}
	normalizeAssistantAIProfileSettings(ret)
	return ret, nil
}

func normalizeAssistantAIProvider(provider string) string {
	switch strings.ToLower(strings.TrimSpace(provider)) {
	case "", "openai", "openai-compatible", "openai_compatible":
		return AssistantAIProviderOpenAICompatible
	case "anthropic":
		return AssistantAIProviderAnthropic
	case "gemini", "google":
		return AssistantAIProviderGemini
	case "volcengine", "ark", "doubao":
		return AssistantAIProviderVolcengine
	case "volcengine-plan", "ark-plan", "coding-plan", "volcengine-coding-plan":
		return AssistantAIProviderVolcenginePlan
	case "kimi", "moonshot":
		return AssistantAIProviderKimi
	case "glm", "zhipu", "bigmodel":
		return AssistantAIProviderGLM
	case "qwen", "dashscope", "bailian", "alibaba":
		return AssistantAIProviderQwen
	case "openrouter":
		return AssistantAIProviderOpenRouter
	case "deepseek":
		return AssistantAIProviderDeepSeek
	case "ollama":
		return AssistantAIProviderOllama
	default:
		return strings.ToLower(strings.TrimSpace(provider))
	}
}

func normalizeAssistantAIBaseURL(provider, baseURL string) string {
	baseURL = strings.TrimSpace(baseURL)
	if "" != baseURL {
		return strings.TrimRight(baseURL, "/")
	}
	if defaultBaseURL, ok := assistantAIProviderBaseURLs[provider]; ok {
		return defaultBaseURL
	}
	return assistantAIProviderBaseURLs[AssistantAIProviderOpenAICompatible]
}

func isSupportedAssistantAIProvider(provider string) bool {
	_, ok := assistantAIProviderBaseURLs[provider]
	return ok
}

func buildAssistantAIProfileName(provider, model string) string {
	for _, item := range assistantAIProviderCatalog {
		if item.ID == provider {
			return item.Name + " · " + model
		}
	}
	return provider + " · " + model
}

func buildAssistantAISessionTitle(text string) string {
	text = strings.Join(strings.Fields(strings.ReplaceAll(strings.TrimSpace(text), "\n", " ")), " ")
	if "" == text {
		return "New Chat"
	}
	title := []rune(text)
	if 48 < len(title) {
		return string(title[:48])
	}
	return string(title)
}

func scanAssistantAIProfile(scanner interface {
	Scan(dest ...interface{}) error
}) (ret *AssistantAIProfile, err error) {
	ret = &AssistantAIProfile{}
	var settingsJSON string
	var isDefault int
	if err = scanner.Scan(&ret.ID, &ret.Name, &ret.Provider, &ret.BaseURL, &ret.APIKey, &ret.Model, &ret.UserAgent, &ret.Proxy, &ret.Version, &isDefault, &settingsJSON, &ret.CreatedAt, &ret.UpdatedAt); err != nil {
		return nil, err
	}
	ret.IsDefault = 1 == isDefault
	ret.Settings = map[string]interface{}{}
	if "" != strings.TrimSpace(settingsJSON) {
		if err = json.Unmarshal([]byte(settingsJSON), &ret.Settings); err != nil {
			return nil, err
		}
	}
	if nil == ret.Settings {
		ret.Settings = map[string]interface{}{}
	}
	normalizeAssistantAIProfileSettings(ret)
	return ret, nil
}

func scanAssistantAISession(scanner interface {
	Scan(dest ...interface{}) error
}) (ret *AssistantAISession, err error) {
	ret = &AssistantAISession{}
	err = scanner.Scan(&ret.ID, &ret.ProfileID, &ret.Mode, &ret.Title, &ret.Summary, &ret.CreatedAt, &ret.UpdatedAt, &ret.MessageCount, &ret.UserMessageCount, &ret.AssistantMessageCount, &ret.LastMessageAt)
	return ret, err
}

func scanAssistantAIMessage(scanner interface {
	Scan(dest ...interface{}) error
}) (ret *AssistantAIMessage, err error) {
	ret = &AssistantAIMessage{}
	var metadataJSON string
	if err = scanner.Scan(&ret.ID, &ret.SessionID, &ret.Role, &ret.Content, &ret.ProviderMessageID, &ret.InputTokens, &ret.OutputTokens, &metadataJSON, &ret.CreatedAt); err != nil {
		return nil, err
	}
	ret.Metadata = map[string]interface{}{}
	if "" != strings.TrimSpace(metadataJSON) {
		if err = json.Unmarshal([]byte(metadataJSON), &ret.Metadata); err != nil {
			return nil, err
		}
	}
	if nil == ret.Metadata {
		ret.Metadata = map[string]interface{}{}
	}
	return ret, nil
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

func rollbackAssistantAITx(tx *dbsql.Tx) {
	if nil != tx {
		_ = tx.Rollback()
	}
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

func maxAssistantAIInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
