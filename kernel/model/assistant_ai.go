package model

import (
	dbsql "database/sql"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "github.com/lonelyor/sourceflow/kernel/sql"
	"github.com/lonelyor/sourceflow/kernel/util"
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
	AssistantAIProviderFake             = "fake"

	assistantAIDefaultTimeout          = 60
	assistantAIDefaultTemperature      = 0.7
	assistantAIDefaultContextMessages  = 24
	assistantAIDefaultContextTokens    = 256 * 1024
	assistantAIDefaultAnthropicVersion = "2023-06-01"
	assistantAISessionPinnedAtColumn   = "pinned_at"
	assistantAISessionSelectClause     = `s.id, s.profile_id, s.mode, s.title, s.summary, s.` + assistantAISessionPinnedAtColumn + `, s.created_at, s.updated_at,
        COALESCE(st.message_count, 0), COALESCE(st.user_message_count, 0), COALESCE(st.assistant_message_count, 0), COALESCE(st.last_message_at, 0)`
	assistantAISessionOrderClause = `CASE WHEN s.` + assistantAISessionPinnedAtColumn + ` > 0 THEN 0 ELSE 1 END, s.` + assistantAISessionPinnedAtColumn + ` DESC, s.updated_at DESC, s.created_at DESC`
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
	{ID: AssistantAIProviderFake, Name: "SourceFlow Fake", BaseURL: "sourceflow://fake", DefaultModel: "sourceflow-fake-chat", RecommendedSettings: map[string]interface{}{"temperature": 0.0, "maxTokens": 1024, "maxContextTokens": 32768, "maxContextMessages": 8}},
}

func assistantAIProviderBaseURL(provider string) (string, bool) {
	for _, item := range assistantAIProviderCatalog {
		if item.ID == provider {
			return item.BaseURL, true
		}
	}
	return "", false
}

type AssistantAIProviderType struct {
	ID                  string                 `json:"id"`
	Name                string                 `json:"name"`
	BaseURL             string                 `json:"baseURL"`
	DefaultModel        string                 `json:"defaultModel"`
	RecommendedSettings map[string]interface{} `json:"recommendedSettings"`
}

type AssistantAIProfile struct {
	ID           string                 `json:"id"`
	Name         string                 `json:"name"`
	Provider     string                 `json:"provider"`
	BaseURL      string                 `json:"baseURL"`
	APIKey       string                 `json:"apiKey"`
	APIKeyAction string                 `json:"apiKeyAction,omitempty"`
	HasAPIKey    bool                   `json:"hasAPIKey"`
	Model        string                 `json:"model"`
	UserAgent    string                 `json:"userAgent"`
	Proxy        string                 `json:"proxy"`
	Version      string                 `json:"version"`
	IsDefault    bool                   `json:"isDefault"`
	Settings     map[string]interface{} `json:"settings"`
	CreatedAt    int64                  `json:"createdAt"`
	UpdatedAt    int64                  `json:"updatedAt"`
}

type AssistantAISession struct {
	ID                    string `json:"id"`
	ProfileID             string `json:"profileId"`
	Mode                  string `json:"mode"`
	Title                 string `json:"title"`
	Summary               string `json:"summary"`
	PinnedAt              int64  `json:"pinnedAt"`
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

type AssistantAISourceCitation struct {
	ID       string                      `json:"id"`
	Type     string                      `json:"type"`
	Title    string                      `json:"title"`
	Notebook string                      `json:"notebook,omitempty"`
	Path     string                      `json:"path,omitempty"`
	HPath    string                      `json:"hPath,omitempty"`
	Children []AssistantAISourceCitation `json:"children,omitempty"`
}

type AssistantAIChatRequest struct {
	ProfileID    string                       `json:"profileId"`
	SessionID    string                       `json:"sessionId"`
	Mode         string                       `json:"mode"`
	Title        string                       `json:"title"`
	Message      string                       `json:"message"`
	System       string                       `json:"system"`
	EnableTools  bool                         `json:"enableTools"`
	SecurityMode AISecurityMode               `json:"securityMode"`
	Context      *AssistantAINoteContext      `json:"context"`
	Attachments  []AssistantAIInputAttachment `json:"attachments"`
	Sources      []AssistantAISourceCitation  `json:"sources"`
}

type AssistantAIMessageEditRequest struct {
	ProfileID    string                       `json:"profileId"`
	SessionID    string                       `json:"sessionId"`
	MessageID    string                       `json:"messageId"`
	Message      string                       `json:"message"`
	System       string                       `json:"system"`
	EnableTools  bool                         `json:"enableTools"`
	SecurityMode AISecurityMode               `json:"securityMode"`
	Context      *AssistantAINoteContext      `json:"context"`
	Attachments  []AssistantAIInputAttachment `json:"attachments"`
	Sources      []AssistantAISourceCitation  `json:"sources"`
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
	ProfileID    string                  `json:"profileId"`
	SessionID    string                  `json:"sessionId"`
	MessageID    string                  `json:"messageId"`
	AuditID      string                  `json:"auditId"`
	SecurityMode AISecurityMode          `json:"securityMode"`
	Context      *AssistantAINoteContext `json:"context"`
	ToolID       string                  `json:"toolId"`
	Args         map[string]interface{}  `json:"args"`
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
		ret = append(ret, &AssistantAIProviderType{
			ID:                  item.ID,
			Name:                item.Name,
			BaseURL:             item.BaseURL,
			DefaultModel:        item.DefaultModel,
			RecommendedSettings: cloneAssistantAIMap(item.RecommendedSettings),
		})
	}
	return ret
}

func EnsureAssistantAIStore() error {
	_, err := getAssistantAIDB()
	return err
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
            pinned_at INTEGER NOT NULL DEFAULT 0,
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
	if err = ensureAssistantAISessionPinnedAtColumn(db); err != nil {
		return err
	}
	if _, err = db.Exec(`CREATE INDEX IF NOT EXISTS idx_ai_sessions_pinned_at ON ai_sessions(` + assistantAISessionPinnedAtColumn + ` DESC, updated_at DESC)`); err != nil {
		return err
	}
	return nil
}

func ensureAssistantAISessionPinnedAtColumn(db *dbsql.DB) (err error) {
	rows, err := db.Query(`PRAGMA table_info(ai_sessions)`)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var cid int
		var name string
		var columnType string
		var notNull int
		var defaultValue interface{}
		var pk int
		if err = rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &pk); err != nil {
			return err
		}
		if name == assistantAISessionPinnedAtColumn {
			return rows.Err()
		}
	}
	if err = rows.Err(); err != nil {
		return err
	}
	_, err = db.Exec(`ALTER TABLE ai_sessions ADD COLUMN ` + assistantAISessionPinnedAtColumn + ` INTEGER NOT NULL DEFAULT 0`)
	return err
}

func canStreamAssistantAIProvider(profile *AssistantAIProfile) bool {
	if nil == profile {
		return false
	}
	switch normalizeAssistantAIProvider(profile.Provider) {
	case AssistantAIProviderOpenAICompatible,
		AssistantAIProviderAnthropic,
		AssistantAIProviderGemini,
		AssistantAIProviderVolcengine,
		AssistantAIProviderVolcenginePlan,
		AssistantAIProviderKimi,
		AssistantAIProviderGLM,
		AssistantAIProviderQwen,
		AssistantAIProviderOpenRouter,
		AssistantAIProviderDeepSeek,
		AssistantAIProviderOllama,
		AssistantAIProviderFake:
		return true
	default:
		return false
	}
}

func init() {
	assistantAIHTTPClients = map[string]*http.Client{}
}
