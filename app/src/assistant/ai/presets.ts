export const assistantAISettingDefaults = {
    timeout: 60,
    temperature: 0.7,
    maxTokens: 0,
    maxContextTokens: 256 * 1024,
    maxContextMessages: 24,
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
            if (normalizedModel.startsWith("glm-4.6") || normalizedModel.startsWith("glm-4.7") || normalizedModel.startsWith("glm-5")) {
                return {temperature: 1, maxTokens: 4096};
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
