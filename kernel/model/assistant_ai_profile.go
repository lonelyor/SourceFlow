package model

import (
	dbsql "database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
)

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

func SanitizeAssistantAIProfile(profile *AssistantAIProfile) *AssistantAIProfile {
	if nil == profile {
		return nil
	}
	ret := *profile
	ret.HasAPIKey = "" != strings.TrimSpace(profile.APIKey)
	ret.APIKey = ""
	ret.APIKeyAction = ""
	ret.Settings = cloneAssistantAIMap(profile.Settings)
	return &ret
}

func SanitizeAssistantAIProfiles(profiles []*AssistantAIProfile) []*AssistantAIProfile {
	ret := make([]*AssistantAIProfile, 0, len(profiles))
	for _, profile := range profiles {
		ret = append(ret, SanitizeAssistantAIProfile(profile))
	}
	return ret
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
	if err = applyAssistantAIProfileAPIKeyActionTx(tx, normalized, 0 < exists); err != nil {
		return nil, err
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
	return normalized, nil
}

func applyAssistantAIProfileAPIKeyActionTx(tx *dbsql.Tx, profile *AssistantAIProfile, exists bool) error {
	if nil == profile {
		return fmt.Errorf("assistant AI profile is required")
	}
	switch profile.APIKeyAction {
	case AssistantAPIKeyActionKeep:
		if exists {
			if err := tx.QueryRow(`SELECT api_key FROM ai_profiles WHERE id = ?`, profile.ID).Scan(&profile.APIKey); err != nil {
				return err
			}
		} else {
			profile.APIKey = ""
		}
	case AssistantAPIKeyActionReplace:
		if "" == strings.TrimSpace(profile.APIKey) {
			return fmt.Errorf("assistant AI API key is required when replacing")
		}
	case AssistantAPIKeyActionClear:
		profile.APIKey = ""
	default:
		return fmt.Errorf("unsupported API key action [%s]", profile.APIKeyAction)
	}
	profile.APIKey = strings.TrimSpace(profile.APIKey)
	profile.HasAPIKey = "" != profile.APIKey
	profile.APIKeyAction = ""
	return nil
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
	return nil
}

func normalizeAssistantAIProfile(profile *AssistantAIProfile) (ret *AssistantAIProfile, err error) {
	apiKeyAction, err := NormalizeAssistantAPIKeyAction(profile.APIKeyAction, profile.APIKey)
	if err != nil {
		return nil, err
	}
	ret = &AssistantAIProfile{
		ID:           strings.TrimSpace(profile.ID),
		Name:         strings.TrimSpace(profile.Name),
		Provider:     normalizeAssistantAIProvider(profile.Provider),
		BaseURL:      normalizeAssistantAIBaseURL(normalizeAssistantAIProvider(profile.Provider), profile.BaseURL),
		APIKey:       strings.TrimSpace(profile.APIKey),
		APIKeyAction: apiKeyAction,
		HasAPIKey:    profile.HasAPIKey,
		Model:        strings.TrimSpace(profile.Model),
		UserAgent:    strings.TrimSpace(profile.UserAgent),
		Proxy:        strings.TrimSpace(profile.Proxy),
		Version:      strings.TrimSpace(profile.Version),
		IsDefault:    profile.IsDefault,
		Settings:     cloneAssistantAIMap(profile.Settings),
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
	case "fake", "sourceflow-fake", "sourceflow_fake":
		return AssistantAIProviderFake
	default:
		return strings.ToLower(strings.TrimSpace(provider))
	}
}

func normalizeAssistantAIBaseURL(provider, baseURL string) string {
	baseURL = strings.TrimSpace(baseURL)
	if "" != baseURL {
		return strings.TrimRight(baseURL, "/")
	}
	if defaultBaseURL, ok := assistantAIProviderBaseURL(provider); ok {
		return defaultBaseURL
	}
	fallback, _ := assistantAIProviderBaseURL(AssistantAIProviderOpenAICompatible)
	return fallback
}

func isSupportedAssistantAIProvider(provider string) bool {
	_, ok := assistantAIProviderBaseURL(provider)
	return ok
}

func isAssistantAINativeToolProvider(provider string) bool {
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

func buildAssistantAIProfileName(provider, model string) string {
	for _, item := range assistantAIProviderCatalog {
		if item.ID == provider {
			return item.Name + " · " + model
		}
	}
	return provider + " · " + model
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
	ret.HasAPIKey = "" != strings.TrimSpace(ret.APIKey)
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
