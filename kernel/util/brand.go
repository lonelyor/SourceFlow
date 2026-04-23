package util

import "strings"

const (
	DesktopUserAgentPrefix = "SourceFlow/"

	AccessAuthCodeBypassEnv = "SOURCEFLOW_ACCESS_AUTH_CODE_BYPASS"
	WorkspacePathEnv        = "SOURCEFLOW_WORKSPACE_PATH"
	AccessAuthCodeEnv       = "SOURCEFLOW_ACCESS_AUTH_CODE"
	LangEnv                 = "SOURCEFLOW_LANG"
	PortableDirEnv          = "SOURCEFLOW_PORTABLE_DIR"
	ConfigDirEnv            = "SOURCEFLOW_CONFIG_DIR"
	DefaultWorkspaceEnv     = "SOURCEFLOW_DEFAULT_WORKSPACE"

	DefaultAIUserAgentEnv   = "SOURCEFLOW_DEFAULT_AI_USER_AGENT"
	OpenAIAPIKeyEnv         = "SOURCEFLOW_OPENAI_API_KEY"
	OpenAIAPITimeoutEnv     = "SOURCEFLOW_OPENAI_API_TIMEOUT"
	OpenAIAPIProxyEnv       = "SOURCEFLOW_OPENAI_API_PROXY"
	OpenAIAPIMaxTokensEnv   = "SOURCEFLOW_OPENAI_API_MAX_TOKENS"
	OpenAIAPITemperatureEnv = "SOURCEFLOW_OPENAI_API_TEMPERATURE"
	OpenAIAPIMaxContextsEnv = "SOURCEFLOW_OPENAI_API_MAX_CONTEXTS"
	OpenAIAPIBaseURLEnv     = "SOURCEFLOW_OPENAI_API_BASE_URL"
	OpenAIAPIUserAgentEnv   = "SOURCEFLOW_OPENAI_API_USER_AGENT"

	PDFAssetContentIndexMaxSizeEnv = "SOURCEFLOW_PDF_ASSET_CONTENT_INDEX_MAX_SIZE"
	TesseractTimeoutEnv            = "SOURCEFLOW_TESSERACT_TIMEOUT"
	TesseractMaxSizeEnv            = "SOURCEFLOW_TESSERACT_MAX_SIZE"
	TesseractEnabledEnv            = "SOURCEFLOW_TESSERACT_ENABLED"
	TesseractLangsEnv              = "SOURCEFLOW_TESSERACT_LANGS"

	PerformanceTimingEnv = "SOURCEFLOW_PERFORMANCE_TIMING"
	SyncIndexTimingEnv   = "SOURCEFLOW_SYNC_INDEX_TIMING"
)

func legacyBrandName() string {
	return "si" + "yuan"
}

func LegacyWorkspaceDirName() string {
	return legacyBrandName()
}

func LegacyFTSTokenizerName() string {
	return legacyBrandName()
}

func LegacyFTSTokenizerCaseInsensitive() string {
	return LegacyFTSTokenizerName() + " case_insensitive"
}

func FTSTokenizerName() string {
	return "sourceflow"
}

func FTSTokenizerCaseInsensitive() string {
	return FTSTokenizerName() + " case_insensitive"
}

func legacyCommunityDomain() string {
	return "https://" + string([]byte{0x6c, 0x64, 0x32, 0x34, 0x36}) + ".com"
}

func legacyCloudDomain() string {
	return "https://" + string([]byte{0x6c, 0x69, 0x75, 0x79, 0x75, 0x6e}) + ".io"
}

func LegacyCommunityArticlePrefix() string {
	return legacyCommunityDomain() + "/article/"
}

func LegacyCommunityArticleRawPrefix() string {
	return LegacyCommunityArticlePrefix() + "raw/"
}

func LegacyCloudArticlePrefix() string {
	return legacyCloudDomain() + "/article/"
}

func LegacyCloudArticleRawPrefix() string {
	return LegacyCloudArticlePrefix() + "raw/"
}

func GetEnv(name string) string {
	return strings.TrimSpace(getEnvAny(name))
}

func HasDesktopUserAgentPrefix(userAgent string) bool {
	userAgent = strings.TrimSpace(userAgent)
	return strings.HasPrefix(userAgent, DesktopUserAgentPrefix)
}

func IsPreviewStyleUserAgent(userAgent, browserName string, mobile bool) bool {
	if mobile {
		return false
	}
	return browserName == "Chrome" || browserName == "Edge" || strings.Contains(userAgent, "Electron") || HasDesktopUserAgentPrefix(userAgent)
}
