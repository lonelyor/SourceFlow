export const assistantAISettingDefaults = {
    timeout: 60,
    temperature: 0.7,
    maxTokens: 0,
    maxContextTokens: 256 * 1024,
    maxContextMessages: 24,
    personaPrompt: "",
};

export const getAssistantAIRecommendedSettings = (provider: string, model: string) => {
    const normalizedProvider = `${provider || ""}`.trim().toLowerCase();
    const normalizedModel = `${model || ""}`.trim().toLowerCase();
    switch (normalizedProvider) {
        case "anthropic":
            return {temperature: 1};
        case "gemini":
            if (normalizedModel.startsWith("gemini-3")) {
                return {temperature: 1};
            }
            return {};
        case "volcengine":
            return {temperature: 0.1, maxTokens: 4096};
        case "volcengine-plan":
            return {temperature: 0.1, maxTokens: 4096};
        case "kimi":
            if (normalizedModel.startsWith("kimi-k2.5")) {
                return {temperature: 1};
            }
            return {};
        case "glm":
            if (normalizedModel.startsWith("glm-4.5")) {
                return {temperature: 0.6, maxTokens: 4096};
            }
            if (normalizedModel.startsWith("glm-4.6") || normalizedModel.startsWith("glm-4.7") || normalizedModel.startsWith("glm-4.8") || normalizedModel.startsWith("glm-5")) {
                return {temperature: 1, maxTokens: 4096};
            }
            return {};
        case "qwen":
            if (normalizedModel.startsWith("qwq")) {
                return {temperature: 1, maxTokens: 8192};
            }
            if (normalizedModel.startsWith("qwen-max") || normalizedModel.startsWith("qwen-plus") || normalizedModel.startsWith("qwen-turbo") || normalizedModel.startsWith("qwen-long")) {
                return {temperature: 0.7, maxTokens: 8192};
            }
            return {};
        case "openrouter":
            return {temperature: 1};
        case "deepseek":
            if (normalizedModel.includes("reasoner")) {
                return {temperature: 1, maxTokens: 32768};
            }
            return {temperature: 1, maxTokens: 4096};
        default:
            return {};
    }
};

export const applyAssistantAIRecommendedSettings = (
    settings: Record<string, unknown> | undefined,
    provider: string,
    model: string,
    previousProvider = provider,
    previousModel = model,
) => {
    const nextSettings: Record<string, unknown> = {
        ...settings,
        timeout: getIntSetting(settings, "timeout", assistantAISettingDefaults.timeout),
        temperature: getFloatSetting(settings, "temperature", assistantAISettingDefaults.temperature),
        maxTokens: getIntSetting(settings, "maxTokens", assistantAISettingDefaults.maxTokens),
        maxContextTokens: getIntSetting(settings, "maxContextTokens", assistantAISettingDefaults.maxContextTokens),
        maxContextMessages: getIntSetting(settings, "maxContextMessages", assistantAISettingDefaults.maxContextMessages),
    };
    const previousRecommended = getAssistantAIRecommendedSettings(previousProvider, previousModel);
    const nextRecommended = getAssistantAIRecommendedSettings(provider, model);

    Object.entries(nextRecommended).forEach(([key, value]) => {
        const currentValue = Number(nextSettings[key] ?? assistantAISettingDefaults[key as keyof typeof assistantAISettingDefaults]);
        const previousValue = Number(previousRecommended[key as keyof typeof previousRecommended] ?? NaN);
        const fallbackValue = Number(assistantAISettingDefaults[key as keyof typeof assistantAISettingDefaults]);
        if (Number.isNaN(currentValue) || currentValue === fallbackValue || currentValue === previousValue) {
            nextSettings[key] = value;
        }
    });

    return nextSettings;
};

const getIntSetting = (settings: Record<string, unknown> | undefined, key: string, fallback: number) => {
    const raw = settings?.[key];
    const value = typeof raw === "number" ? raw : parseInt(`${raw || fallback}`, 10);
    return Number.isFinite(value) ? value : fallback;
};

const getFloatSetting = (settings: Record<string, unknown> | undefined, key: string, fallback: number) => {
    const raw = settings?.[key];
    const value = typeof raw === "number" ? raw : parseFloat(`${raw || fallback}`);
    return Number.isFinite(value) ? value : fallback;
};

// --- Dynamic context budgeting ------------------------------------------------
// Modern models ship 256k–1M windows; we must size note context to the actual
// model instead of the legacy hardcoded 20000-char cap. See
// plans/20260812-AI上下文动态预算.md (C1–C3).

const ASSISTANT_AI_FALLBACK_CONTEXT_WINDOW = 256 * 1024;
const ASSISTANT_AI_MIN_NOTE_TOKENS = 2000;
const ASSISTANT_AI_SYSTEM_OVERHEAD_TOKENS = 1500;

/**
 * Resolve the effective model context window (tokens) for a profile.
 * Priority: model-resolved contextWindow → profile budget (maxContextTokens,
 * which already inherits the provider catalog default at profile creation) →
 * conservative fallback. Never returns 0.
 */
export const resolveAssistantAIContextWindow = (profile: { settings?: Record<string, unknown> } | null | undefined): number => {
    const settings = profile?.settings;
    const modelWindow = getIntSetting(settings, "contextWindow", 0);
    if (modelWindow > 0) {
        return modelWindow;
    }
    const budget = getIntSetting(settings, "maxContextTokens", 0);
    if (budget > 0) {
        return budget;
    }
    return ASSISTANT_AI_FALLBACK_CONTEXT_WINDOW;
};

/**
 * Compute the note-body token budget, derived from the model's real context
 * window minus reserves for output, system prompt and conversation history.
 * Replaces the old fixed cap so large models are not truncated needlessly
 * while small models are not overfed. The budget is in estimated tokens
 * (CJK-aware, same yardstick as the backend estimator), NOT runes — a CJK
 * rune costs ~1 token, so a naive runes×4 conversion would overfeed small
 * windows by 4x for Chinese content.
 */
export const computeAssistantAINoteTokenAllowance = (
    contextWindow: number,
    settings?: Record<string, unknown> | null,
): number => {
    const maxTokens = getIntSetting(settings, "maxTokens", 0);
    const maxContextMessages = getIntSetting(settings, "maxContextMessages", assistantAISettingDefaults.maxContextMessages);
    const outputReserve = maxTokens > 0 ? maxTokens : 4096;
    const historyReserve = Math.min(maxContextMessages * 512, Math.floor(contextWindow * 0.5));
    let noteTokens = contextWindow - outputReserve - ASSISTANT_AI_SYSTEM_OVERHEAD_TOKENS - historyReserve;
    if (noteTokens < ASSISTANT_AI_MIN_NOTE_TOKENS) {
        noteTokens = ASSISTANT_AI_MIN_NOTE_TOKENS;
    }
    return noteTokens;
};

/** Convenience: profile → token allowance for the note body, in one call. */
export const getAssistantAINoteTokenAllowance = (profile: { settings?: Record<string, unknown> } | null | undefined): number => {
    return computeAssistantAINoteTokenAllowance(resolveAssistantAIContextWindow(profile), profile?.settings);
};
