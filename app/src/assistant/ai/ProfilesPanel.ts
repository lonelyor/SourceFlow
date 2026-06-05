import {confirmDialog} from "../../dialog/confirmDialog";
import {showMessage} from "../../dialog/message";
import {assistantText} from "../constants";
import {escapeAttr, escapeHTML, providerDisplayName} from "../common/dom";
import {
    deleteAssistantAIProfile,
    IAssistantAIProfile,
    IAssistantAIProviderType,
    IAssistantAIToolCatalogResult,
    IAssistantAIToolDefinition,
    IAssistantAIModelEntry,
    listAssistantAIProfiles,
    listAssistantAIProviders,
    getAssistantAIToolCatalog,
    saveAssistantAIProfile,
    testAssistantAIConnection,
    listAssistantAIModels,
} from "./api";
import {applyAssistantAIRecommendedSettings, assistantAISettingDefaults} from "./presets";
import {
    ASSISTANT_SECRET_MASK,
    clearAssistantSecretMaskBeforeEdit,
    getAssistantSecretInputValue,
    getAssistantSecretPayload,
    normalizeAssistantSecretInputAfterEdit,
    shouldClearAssistantSecretMaskForKey,
} from "../secrets";

export interface IAssistantAIProfilesPanelOptions {
    compact?: boolean;
    embedded?: boolean;
    selectedId?: string;
    onSaved?: (profile?: IAssistantAIProfile) => void;
}

interface IAssistantAIProfilesPanelState {
    providers: IAssistantAIProviderType[];
    profiles: IAssistantAIProfile[];
    toolCatalog: IAssistantAIToolDefinition[];
    selectedId: string;
    draft: Partial<IAssistantAIProfile>;
    saving: boolean;
    loading: boolean;
    showAdvanced: boolean;
    showToolPermissions: boolean;
    modelCandidates: IAssistantAIModelEntry[];
    testResult: { ok: boolean; message: string; latency: number } | null;
    testing: boolean;
    loadingModels: boolean;
}

const assistantAIToolModeOptions = [
    {value: "auto", label: assistantText("自动执行", "Auto")},
    {value: "confirm", label: assistantText("需要确认", "Confirm")},
    {value: "deny", label: assistantText("禁止", "Deny")},
];

const assistantAIToolReadScopeOptions = [
    {value: "current-note", label: assistantText("当前笔记", "Current note")},
    {value: "current-notebook", label: assistantText("当前笔记本", "Current notebook")},
    {value: "workspace", label: assistantText("整个工作区", "Workspace")},
];

const assistantAIToolWriteScopeOptions = [
    {value: "current-note", label: assistantText("仅当前笔记", "Current note only")},
    {value: "current-notebook", label: assistantText("当前笔记本", "Current notebook")},
    {value: "workspace", label: assistantText("整个工作区", "Workspace")},
];

const assistantAIToolTraceOptions = [
    {value: "audit-only", label: assistantText("仅内部审计", "Audit only")},
    {value: "markdown", label: assistantText("正文留痕 + 审计", "Markdown trace + audit")},
];

const assistantAIToolRiskOrder = ["L1", "L2", "L3", "L4"];

const getProviderDefaultBaseURL = (providers: IAssistantAIProviderType[], provider: string) => {
    return providers.find((item) => item.id === provider)?.baseURL || "";
};

const getStringSetting = (settings: Record<string, unknown> | undefined, key: string, fallback: string) => {
    const raw = settings?.[key];
    const value = `${raw ?? ""}`.trim();
    return value || fallback;
};

const cloneToolModes = (settings?: Record<string, unknown>) => {
    const raw = settings?.toolModes;
    if (!raw || typeof raw !== "object") {
        return {};
    }
    return {...(raw as Record<string, string>)};
};

const cloneSettings = (settings?: Record<string, unknown>) => {
    return {
        ...settings,
        timeout: getIntSetting(settings, "timeout", assistantAISettingDefaults.timeout),
        temperature: getFloatSetting(settings, "temperature", assistantAISettingDefaults.temperature),
        maxTokens: getIntSetting(settings, "maxTokens", assistantAISettingDefaults.maxTokens),
        maxContextTokens: getIntSetting(settings, "maxContextTokens", assistantAISettingDefaults.maxContextTokens),
        maxContextMessages: getIntSetting(settings, "maxContextMessages", assistantAISettingDefaults.maxContextMessages),
        personaPrompt: getStringSetting(settings, "personaPrompt", ""),
        toolReadScope: getStringSetting(settings, "toolReadScope", "workspace"),
        toolWriteScope: getStringSetting(settings, "toolWriteScope", "current-notebook"),
        toolTraceMode: getStringSetting(settings, "toolTraceMode", "audit-only"),
        toolModes: cloneToolModes(settings),
    };
};

const createDraft = (providers: IAssistantAIProviderType[], profile?: IAssistantAIProfile): Partial<IAssistantAIProfile> => {
    const provider = profile?.provider || providers[0]?.id || "openai-compatible";
    const providerInfo = providers.find((item) => item.id === provider);
    const model = profile?.model || providerInfo?.defaultModel || "";
    const settings = cloneSettings(profile?.settings);
    if (!profile && providerInfo?.recommendedSettings) {
        const settingsMap = settings as Record<string, unknown>;
        Object.entries(providerInfo.recommendedSettings).forEach(([key, value]) => {
            if (settingsMap[key] === assistantAISettingDefaults[key as keyof typeof assistantAISettingDefaults] || !settingsMap[key]) {
                settingsMap[key] = value;
            }
        });
    }
    return {
        id: profile?.id || "",
        name: profile?.name || "",
        provider,
        baseURL: profile?.baseURL || providerInfo?.baseURL || "",
        apiKey: getAssistantSecretInputValue(!!profile?.hasAPIKey),
        hasAPIKey: !!profile?.hasAPIKey,
        model,
        userAgent: profile?.userAgent || "",
        proxy: profile?.proxy || "",
        version: profile?.version || "",
        isDefault: !!profile?.isDefault,
        settings: applyAssistantAIRecommendedSettings(settings, provider, model),
    };
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

const renderSelectOptions = (options: Array<{value: string, label: string}>, selected: string) => {
    return options.map((item) => `<option value="${escapeAttr(item.value)}"${item.value === selected ? " selected" : ""}>${escapeHTML(item.label)}</option>`).join("");
};

const getToolRiskLabel = (risk: string) => {
    switch (risk) {
        case "L1":
            return assistantText("L1 只读", "L1 Read only");
        case "L2":
            return assistantText("L2 低风险写入", "L2 Low-risk write");
        case "L3":
            return assistantText("L3 中风险写入", "L3 Medium-risk write");
        case "L4":
            return assistantText("L4 高风险操作", "L4 High-risk action");
        default:
            return risk;
    }
};

const getToolTargetLabel = (target: string) => {
    switch (target) {
        case "current-note":
            return assistantText("当前笔记", "Current note");
        case "current-notebook":
            return assistantText("当前笔记本", "Current notebook");
        case "workspace":
            return assistantText("工作区", "Workspace");
        default:
            return target;
    }
};

const renderToolRows = (state: IAssistantAIProfilesPanelState, settings: Record<string, unknown>) => {
    const toolModes = cloneToolModes(settings);
    if (!state.toolCatalog.length) {
        return `<div class="assistant-profiles__empty">${escapeHTML(assistantText("工具目录加载中...", "Loading tool catalog..."))}</div>`;
    }
    return assistantAIToolRiskOrder.map((risk) => {
        const tools = state.toolCatalog.filter((tool) => tool.risk === risk);
        if (!tools.length) {
            return "";
        }
        return `<div class="assistant-profiles__tool-group">
    <div class="assistant-profiles__tool-group-title">${escapeHTML(getToolRiskLabel(risk))}</div>
    ${tools.map((tool) => `
<div class="assistant-profiles__tool-item">
    <div class="assistant-profiles__tool-copy">
        <div class="assistant-profiles__tool-name">${escapeHTML(tool.name)}</div>
        <div class="assistant-profiles__tool-meta">${escapeHTML(getToolTargetLabel(tool.target))} · ${escapeHTML(tool.description)}</div>
    </div>
    <select class="b3-select fn__block assistant-profiles__tool-mode" data-tool-mode="${escapeAttr(tool.id)}">
        ${renderSelectOptions(assistantAIToolModeOptions, `${toolModes[tool.id] || tool.defaultMode || "confirm"}`)}
    </select>
</div>`).join("")}
</div>`;
    }).join("");
};

const renderProfileList = (state: IAssistantAIProfilesPanelState) => {
    if (!state.profiles.length) {
        return `<div class="assistant-profiles__empty">${escapeHTML(assistantText("还没有 AI 配置", "No AI profiles yet"))}</div>`;
    }
    return state.profiles.map((profile) => `
<button type="button" class="assistant-profiles__item${profile.id === state.selectedId ? " assistant-profiles__item--active" : ""}" data-profile-id="${escapeAttr(profile.id)}">
    <span class="assistant-profiles__item-name">${escapeHTML(profile.name || providerDisplayName(profile.provider))}</span>
    <span class="assistant-profiles__item-meta">${escapeHTML(providerDisplayName(profile.provider))}${profile.isDefault ? ` · ${escapeHTML(assistantText("默认", "Default"))}` : ""}</span>
</button>`).join("");
};

const renderProviderOptions = (state: IAssistantAIProfilesPanelState) => {
    return state.providers.map((provider) => `
<option value="${escapeAttr(provider.id)}"${provider.id === state.draft.provider ? " selected" : ""}>${escapeHTML(provider.name)}</option>`).join("");
};

const renderPanelContent = (state: IAssistantAIProfilesPanelState, options: IAssistantAIProfilesPanelOptions) => {
    const settings = cloneSettings(state.draft.settings as Record<string, unknown> | undefined);
    const apiKeyValue = `${state.draft.apiKey || ""}`;
    const apiKeyMasked = !!state.draft.hasAPIKey && apiKeyValue === ASSISTANT_SECRET_MASK;
    const advancedSummary = assistantText("无响应超时、输出长度、Temperature 和上下文预算。", "No-response timeout, output size, temperature, and context budget.");
    const toolSummary = assistantText("读取/写入范围、留痕和各工具权限。", "Read/write scope, trace mode, and per-tool permissions.");
    const wrapperClasses = ["assistant-profiles", "fn__flex"];
    if (options.compact) {
        wrapperClasses.push("assistant-profiles--compact");
    }
    if (options.embedded) {
        wrapperClasses.push("assistant-profiles--embedded");
    }
    return `<div class="${wrapperClasses.join(" ")}">
    <div class="assistant-profiles__sidebar fn__flex-column">
        <div class="assistant-profiles__sidebar-header">
            <div>
                <div class="assistant-profiles__title">${escapeHTML(assistantText("AI 配置", "AI Profiles"))}</div>
                ${options.embedded ? `<div class="assistant-profiles__summary">${escapeHTML(assistantText("默认配置会作为统一配置源，同步供 AI 助手和内置 AI 功能使用。", "The default profile is the single source of truth for both the AI assistant and built-in AI features."))}</div>` : ""}
            </div>
            <button type="button" class="b3-button b3-button--text" data-action="new-profile">${escapeHTML(assistantText("新建", "New"))}</button>
        </div>
        <div class="assistant-profiles__list fn__flex-1">${renderProfileList(state)}</div>
    </div>
    <div class="assistant-profiles__editor fn__flex-1 fn__flex-column">
        <div class="assistant-profiles__form fn__flex-column">
            <div class="assistant-profiles__grid">
                <label class="fn__flex-column assistant-profiles__field">
                    <span>${escapeHTML(assistantText("名称", "Name"))}</span>
                    <input class="b3-text-field" data-field="name" value="${escapeAttr(state.draft.name || "")}" placeholder="${escapeAttr(assistantText("例如：DeepSeek 开发", "Example: DeepSeek Dev"))}">
                </label>
                <label class="fn__flex-column assistant-profiles__field">
                    <span>${escapeHTML(assistantText("提供商", "Provider"))}</span>
                    <select class="b3-select fn__block" data-field="provider">${renderProviderOptions(state)}</select>
                </label>
            </div>
            <div class="assistant-profiles__grid">
                <label class="fn__flex-column assistant-profiles__field">
                    <span>${escapeHTML(assistantText("模型", "Model"))}</span>
                    <div class="fn__flex">
                        <input class="b3-text-field fn__flex-1" data-field="model" value="${escapeAttr(state.draft.model || "")}" placeholder="gpt-4.1 / claude-sonnet-4 / deepseek-chat">
                        <button type="button" class="b3-button b3-button--text fn__flex-shrink" data-action="load-models"${state.loadingModels || !state.draft.baseURL ? " disabled" : ""}>${escapeHTML(state.loadingModels ? assistantText("加载中...", "Loading...") : assistantText("选择模型", "Pick model"))}</button>
                    </div>
                    ${state.modelCandidates.length ? `<select class="b3-select fn__block assistant-profiles__model-select" data-field="model-select">
                        <option value="">${escapeHTML(assistantText("-- 选择模型 --", "-- Pick a model --"))}</option>
                        ${state.modelCandidates.map((m) => `<option value="${escapeAttr(m.id)}">${escapeHTML(m.name || m.id)}</option>`).join("")}
                    </select>` : ""}
                </label>
                <label class="fn__flex-column assistant-profiles__field">
                    <span>API Key</span>
                    <input type="password" class="b3-text-field" data-field="apiKey" data-secret-masked="${apiKeyMasked ? "true" : "false"}" autocomplete="off" value="${escapeAttr(apiKeyValue)}" placeholder="sk-...">
                </label>
            </div>
            <label class="fn__flex-column assistant-profiles__field assistant-profiles__field--wide">
                <span>Base URL</span>
                <input class="b3-text-field" data-field="baseURL" value="${escapeAttr(state.draft.baseURL || "")}" placeholder="https://api.example.com/v1">
            </label>
            <div class="assistant-profiles__grid">
                <label class="fn__flex-column assistant-profiles__field">
                    <span>${escapeHTML(assistantText("代理", "Proxy"))}</span>
                    <input class="b3-text-field" data-field="proxy" value="${escapeAttr(state.draft.proxy || "")}" placeholder="http://127.0.0.1:7890">
                </label>
                <label class="fn__flex-column assistant-profiles__field">
                    <span>${escapeHTML(assistantText("版本", "Version"))}</span>
                    <input class="b3-text-field" data-field="version" value="${escapeAttr(state.draft.version || "")}" placeholder="${escapeAttr(assistantText("可留空", "Optional"))}">
                </label>
            </div>
            <label class="fn__flex-column assistant-profiles__field assistant-profiles__field--wide">
                <span>User-Agent</span>
                <input class="b3-text-field" data-field="userAgent" value="${escapeAttr(state.draft.userAgent || "")}" placeholder="${escapeAttr(assistantText("留空则使用默认 Chromium/Chrome UA", "Leave empty to use the default Chromium/Chrome UA"))}">
            </label>
            <div class="assistant-profiles__test-row fn__flex">
                <button type="button" class="b3-button b3-button--outline" data-action="test-connection"${state.testing || !state.draft.baseURL ? " disabled" : ""}>${escapeHTML(state.testing ? assistantText("测试中...", "Testing...") : assistantText("测试连通", "Test connection"))}</button>
                ${state.testResult ? `<span class="assistant-profiles__test-result${state.testResult.ok ? " assistant-profiles__test-result--ok" : " assistant-profiles__test-result--fail"}">${escapeHTML(state.testResult.ok ? assistantText(`连通成功 (${state.testResult.latency}ms)`, `OK (${state.testResult.latency}ms)`) : state.testResult.message)}</span>` : ""}
            </div>
            <div class="assistant-profiles__section">
                <button type="button" class="assistant-profiles__section-head" data-action="toggle-advanced">
                    <span class="assistant-profiles__section-title">${escapeHTML(assistantText("高级参数", "Advanced"))}</span>
                    <span class="assistant-profiles__section-meta">${escapeHTML(state.showAdvanced ? assistantText("收起", "Collapse") : assistantText("展开", "Expand"))}</span>
                </button>
                <div class="assistant-profiles__summary">${escapeHTML(advancedSummary)}</div>
                ${state.showAdvanced ? `<div class="assistant-profiles__section-body">
                    <div class="assistant-profiles__grid">
                        <label class="fn__flex-column assistant-profiles__field">
                            <span>${escapeHTML(assistantText("无响应超时（秒）", "No-response timeout (s)"))}</span>
                            <input class="b3-text-field" type="number" min="1" step="1" data-setting="timeout" value="${escapeAttr(`${settings.timeout}`)}">
                        </label>
                        <label class="fn__flex-column assistant-profiles__field">
                            <span>${escapeHTML(assistantText("最大输出 Tokens", "Max Output Tokens"))}</span>
                            <input class="b3-text-field" type="number" min="0" step="1" data-setting="maxTokens" value="${escapeAttr(`${settings.maxTokens}`)}">
                        </label>
                    </div>
                    <div class="assistant-profiles__grid">
                        <label class="fn__flex-column assistant-profiles__field">
                            <span>${escapeHTML(assistantText("Temperature", "Temperature"))}</span>
                            <input class="b3-text-field" type="number" min="0" max="2" step="0.1" data-setting="temperature" value="${escapeAttr(`${settings.temperature}`)}">
                        </label>
                        <label class="fn__flex-column assistant-profiles__field">
                            <span>${escapeHTML(assistantText("上下文预算（Tokens）", "Context Budget (Tokens)"))}</span>
                            <input class="b3-text-field" type="number" min="256" step="256" data-setting="maxContextTokens" value="${escapeAttr(`${settings.maxContextTokens}`)}">
                        </label>
                    </div>
                    <div class="assistant-profiles__grid">
                        <label class="fn__flex-column assistant-profiles__field assistant-profiles__field--wide">
                            <span>${escapeHTML(assistantText("上下文消息上限", "Context Message Limit"))}</span>
                            <input class="b3-text-field" type="number" min="1" step="1" data-setting="maxContextMessages" value="${escapeAttr(`${settings.maxContextMessages}`)}">
                        </label>
                    </div>
                    <div class="assistant-profiles__grid">
                        <label class="fn__flex-column assistant-profiles__field assistant-profiles__field--wide">
                            <span>${escapeHTML(assistantText("AI 人设", "AI Persona"))}</span>
                            <div class="fn__flex" style="gap:4px;flex-wrap:wrap;margin-bottom:4px;">
                                ${["student", "professional", "designer", "developer", "creative"].map((p) => {
                                    const labels: Record<string, [string, string]> = {
                                        student: [assistantText("学生", "Student"), assistantText("简洁易懂，适合学习场景", "Simple and clear, for learning")],
                                        professional: [assistantText("职场", "Professional"), assistantText("正式严谨，适合工作文档", "Formal and precise, for work docs")],
                                        designer: [assistantText("设计师", "Designer"), assistantText("视觉导向，注重排版和美感", "Visual-focused, layout-aware")],
                                        developer: [assistantText("程序员", "Developer"), assistantText("技术精确，代码友好", "Technical and code-friendly")],
                                        creative: [assistantText("二次元", "Creative"), assistantText("活泼有趣，想象力丰富", "Playful and imaginative")],
                                    };
                                    const [label, title] = labels[p] || [p, p];
                                    return `<button type="button" class="b3-button b3-button--text${(settings.personaPrompt || "").includes(`[${p}]`) ? " b3-button--primary" : ""}" data-persona="${escapeAttr(p)}" title="${escapeAttr(title)}" style="padding:2px 8px;font-size:12px;">${escapeHTML(label)}</button>`;
                                }).join("")}
                            </div>
                            <textarea class="b3-text-field" rows="2" data-setting="personaPrompt" placeholder="${escapeAttr(assistantText("选择预设或自定义人设描述，如：你是一个经验丰富的技术写作者...", "Pick a preset or describe a custom persona, e.g.: You are an experienced technical writer..."))}">${escapeHTML(settings.personaPrompt || "")}</textarea>
                        </label>
                    </div>
                </div>` : ""}
            </div>
            <div class="assistant-profiles__section">
                <button type="button" class="assistant-profiles__section-head" data-action="toggle-tool-permissions">
                    <span class="assistant-profiles__section-title">${escapeHTML(assistantText("笔记工具权限", "Note Tool Permissions"))}</span>
                    <span class="assistant-profiles__section-meta">${escapeHTML(state.showToolPermissions ? assistantText("收起", "Collapse") : assistantText("展开", "Expand"))}</span>
                </button>
                <div class="assistant-profiles__summary">${escapeHTML(toolSummary)}</div>
                ${state.showToolPermissions ? `<div class="assistant-profiles__section-body">
                    <div class="assistant-profiles__summary">${escapeHTML(assistantText("默认自动执行读取类工具，写入类工具建议保留“需要确认”或按需改成“自动执行”。", "Read tools run automatically by default. Keep write tools as confirm, or switch them to auto only if you trust the profile."))}</div>
                    <div class="assistant-profiles__policy-actions">
                        <button type="button" class="b3-button b3-button--outline" data-action="apply-tool-policy-recommended">${escapeHTML(assistantText("推荐安全策略", "Recommended safety"))}</button>
                        <button type="button" class="b3-button b3-button--outline" data-action="apply-tool-policy-readonly">${escapeHTML(assistantText("只读模式", "Read-only mode"))}</button>
                        <button type="button" class="b3-button b3-button--outline" data-action="apply-tool-policy-confirm-write">${escapeHTML(assistantText("写入改为确认", "Confirm writes"))}</button>
                    </div>
                    <div class="assistant-profiles__grid">
                        <label class="fn__flex-column assistant-profiles__field">
                            <span>${escapeHTML(assistantText("读取范围", "Read Scope"))}</span>
                            <select class="b3-select fn__block" data-policy="toolReadScope">${renderSelectOptions(assistantAIToolReadScopeOptions, `${settings.toolReadScope || "workspace"}`)}</select>
                        </label>
                        <label class="fn__flex-column assistant-profiles__field">
                            <span>${escapeHTML(assistantText("写入范围", "Write Scope"))}</span>
                            <select class="b3-select fn__block" data-policy="toolWriteScope">${renderSelectOptions(assistantAIToolWriteScopeOptions, `${settings.toolWriteScope || "current-notebook"}`)}</select>
                        </label>
                    </div>
                    <div class="assistant-profiles__grid">
                        <label class="fn__flex-column assistant-profiles__field assistant-profiles__field--wide">
                            <span>${escapeHTML(assistantText("AI 留痕", "AI Trace"))}</span>
                            <select class="b3-select fn__block" data-policy="toolTraceMode">${renderSelectOptions(assistantAIToolTraceOptions, `${settings.toolTraceMode || "audit-only"}`)}</select>
                        </label>
                    </div>
                    <div class="assistant-profiles__tool-list">${renderToolRows(state, settings)}</div>
                </div>` : ""}
            </div>
            <label class="fn__flex assistant-profiles__checkbox">
                <input type="checkbox" class="b3-switch fn__flex-center" data-field="isDefault"${state.draft.isDefault ? " checked" : ""}>
                <span>${escapeHTML(assistantText("设为默认配置", "Set as default profile"))}</span>
            </label>
        </div>
        <div class="assistant-profiles__footer fn__flex">
            <button type="button" class="b3-button b3-button--outline" data-action="delete-profile"${state.draft.id ? "" : " disabled"}>${escapeHTML(assistantText("删除", "Delete"))}</button>
            <div class="fn__flex-1"></div>
            <button type="button" class="b3-button b3-button--text" data-action="save-profile"${state.saving || state.loading ? " disabled" : ""}>${escapeHTML(state.saving ? assistantText("保存中...", "Saving...") : assistantText("保存", "Save"))}</button>
        </div>
    </div>
</div>`;
};

export class AssistantAIProfilesPanel {
    private readonly element: HTMLElement;
    private readonly options: IAssistantAIProfilesPanelOptions;
    private readonly state: IAssistantAIProfilesPanelState = {
        providers: [],
        profiles: [],
        toolCatalog: [],
        selectedId: "",
        draft: createDraft([]),
        saving: false,
        loading: true,
        showAdvanced: false,
        showToolPermissions: false,
        modelCandidates: [],
        testResult: null,
        testing: false,
        loadingModels: false,
    };

    constructor(element: HTMLElement, options: IAssistantAIProfilesPanelOptions = {}) {
        this.element = element;
        this.options = options;
        this.state.showAdvanced = !options.compact;
        this.state.showToolPermissions = !options.compact;
        this.bindEvents();
        void this.refresh();
    }

    public destroy() {
        this.element.innerHTML = "";
    }

    public async refresh(selectedId = this.state.selectedId || this.options.selectedId || "") {
        this.state.loading = true;
        this.render();
        try {
            this.state.providers = await listAssistantAIProviders();
            this.state.profiles = await listAssistantAIProfiles();
            const active = this.state.profiles.find((item) => item.id === selectedId) || this.state.profiles[0];
            this.state.selectedId = active?.id || "";
            this.state.draft = createDraft(this.state.providers, active);
            let toolCatalog: IAssistantAIToolCatalogResult | null = null;
            try {
                toolCatalog = await getAssistantAIToolCatalog(active?.id || "");
            } catch (error) {
                toolCatalog = null;
            }
            this.state.toolCatalog = toolCatalog?.tools || [];
            if (toolCatalog?.policy) {
                this.state.draft.settings = {
                    ...cloneSettings(this.state.draft.settings as Record<string, unknown> | undefined),
                    toolReadScope: toolCatalog.policy.readScope,
                    toolWriteScope: toolCatalog.policy.writeScope,
                    toolTraceMode: toolCatalog.policy.traceMode,
                    toolModes: {...toolCatalog.policy.toolModes},
                };
            }
        } catch (error) {
            showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
        } finally {
            this.state.loading = false;
            this.render();
        }
    }

    private bindEvents() {
        this.element.addEventListener("click", async (event: MouseEvent) => {
            let target = event.target as HTMLElement;
            while (target && !target.isEqualNode(this.element)) {
                const profileId = target.getAttribute("data-profile-id");
                if (profileId) {
                    this.state.selectedId = profileId;
                    this.state.draft = createDraft(this.state.providers, this.state.profiles.find((item) => item.id === profileId));
                    this.render();
                    return;
                }
                const action = target.getAttribute("data-action");
                if (action) {
                    await this.handleAction(action);
                    return;
                }
                const persona = target.getAttribute("data-persona");
                if (persona) {
                    this.applyPersonaPreset(persona);
                    return;
                }
                target = target.parentElement;
            }
        });

        this.element.addEventListener("keydown", (event: KeyboardEvent) => {
            this.prepareSecretInputEdit(event);
        });

        this.element.addEventListener("paste", (event: ClipboardEvent) => {
            const target = event.target as HTMLInputElement;
            if (target?.getAttribute("data-field") !== "apiKey") {
                return;
            }
            if (clearAssistantSecretMaskBeforeEdit(target)) {
                this.syncField("apiKey", "");
            }
        });

        this.element.addEventListener("input", (event: Event) => {
            this.syncFromEvent(event.target as HTMLInputElement | HTMLSelectElement);
        });

        this.element.addEventListener("change", (event: Event) => {
            this.syncFromEvent(event.target as HTMLInputElement | HTMLSelectElement);
        });
    }

    private prepareSecretInputEdit(event: KeyboardEvent) {
        const target = event.target as HTMLInputElement;
        if (target?.getAttribute("data-field") !== "apiKey" || !shouldClearAssistantSecretMaskForKey(event)) {
            return;
        }
        if (!clearAssistantSecretMaskBeforeEdit(target)) {
            return;
        }
        this.syncField("apiKey", "");
        if (event.key === "Backspace" || event.key === "Delete") {
            event.preventDefault();
        }
    }

    private syncFromEvent(target: HTMLInputElement | HTMLSelectElement) {
        const modelSelect = target.getAttribute("data-field") === "model-select";
        if (modelSelect && target instanceof HTMLSelectElement && target.value) {
            this.syncField("model", target.value);
            this.render();
            return;
        }
        const toolMode = target.getAttribute("data-tool-mode");
        if (toolMode) {
            this.syncToolMode(toolMode, target.value);
            return;
        }
        const policy = target.getAttribute("data-policy");
        if (policy) {
            this.syncPolicy(policy, target.value);
            return;
        }
        const setting = target.getAttribute("data-setting");
        if (setting) {
            this.syncSetting(setting, target.value);
            return;
        }
        const field = target.getAttribute("data-field");
        if (!field) {
            return;
        }
        if (field === "apiKey" && target instanceof HTMLInputElement) {
            this.syncField(field, normalizeAssistantSecretInputAfterEdit(target));
            return;
        }
        if (target instanceof HTMLInputElement && target.type === "checkbox") {
            this.syncField(field, target.checked);
            return;
        }
        this.syncField(field, target.value);
    }

    private syncField(field: string, value: string | boolean) {
        if (field === "provider") {
            const previousBaseURL = `${this.state.draft.baseURL || ""}`.trim();
            const previousProvider = `${this.state.draft.provider || ""}`.trim();
            const previousModel = `${this.state.draft.model || ""}`.trim();
            this.state.draft.provider = `${value}`;
            const providerInfo = this.state.providers.find((item) => item.id === this.state.draft.provider);
            const previousDefault = getProviderDefaultBaseURL(this.state.providers, previousProvider);
            if (!previousBaseURL || previousBaseURL === previousDefault) {
                this.state.draft.baseURL = providerInfo?.baseURL || "";
            }
            if (!previousModel || previousModel === (this.state.providers.find((item) => item.id === previousProvider)?.defaultModel || "")) {
                this.state.draft.model = providerInfo?.defaultModel || "";
            }
            if (providerInfo?.recommendedSettings) {
                const settings = cloneSettings(this.state.draft.settings as Record<string, unknown> | undefined);
                const settingsMap = settings as Record<string, unknown>;
                Object.entries(providerInfo.recommendedSettings).forEach(([key, val]) => {
                    settingsMap[key] = val;
                });
                this.state.draft.settings = settings;
            }
            this.state.draft.settings = applyAssistantAIRecommendedSettings(
                this.state.draft.settings as Record<string, unknown> | undefined,
                `${this.state.draft.provider || ""}`,
                `${this.state.draft.model || ""}`,
                previousProvider,
                previousModel,
            );
            this.state.modelCandidates = [];
            this.state.testResult = null;
            this.render();
            return;
        }
        if (field === "isDefault") {
            this.state.draft.isDefault = !!value;
            return;
        }
        const previousModel = `${this.state.draft.model || ""}`;
        (this.state.draft as Record<string, string | boolean>)[field] = `${value}`;
        if (field === "model") {
            this.state.draft.settings = applyAssistantAIRecommendedSettings(
                this.state.draft.settings as Record<string, unknown> | undefined,
                `${this.state.draft.provider || ""}`,
                `${value}`,
                `${this.state.draft.provider || ""}`,
                previousModel,
            );
        }
    }

    private syncPolicy(field: string, value: string) {
        if (!this.state.draft.settings) {
            this.state.draft.settings = {};
        }
        this.state.draft.settings[field] = value;
    }

    private syncToolMode(toolId: string, value: string) {
        if (!this.state.draft.settings) {
            this.state.draft.settings = {};
        }
        const toolModes = cloneToolModes(this.state.draft.settings as Record<string, unknown> | undefined);
        toolModes[toolId] = value;
        this.state.draft.settings.toolModes = toolModes;
    }

    private syncSetting(setting: string, value: string) {
        if (!this.state.draft.settings) {
            this.state.draft.settings = {};
        }
        const trimmed = value.trim();
        if (setting === "temperature") {
            const parsed = parseFloat(trimmed);
            this.state.draft.settings[setting] = Number.isFinite(parsed) ? parsed : assistantAISettingDefaults.temperature;
            return;
        }
        if (setting === "personaPrompt") {
            this.state.draft.settings[setting] = trimmed;
            return;
        }
        const parsed = parseInt(trimmed, 10);
        this.state.draft.settings[setting] = Number.isFinite(parsed) ? parsed : assistantAISettingDefaults[setting as keyof typeof assistantAISettingDefaults];
    }

    private applyPersonaPreset(persona: string) {
        if (!this.state.draft.settings) {
            this.state.draft.settings = {};
        }
        const prompts: Record<string, [string, string]> = {
            student: [
                "你是一位耐心、善于举例的学习助手。用简洁易懂的语言回答，遇到复杂概念用类比说明，适当使用列表和表格整理要点。偏好中文回答，关键技术术语保留英文。",
                "You are a patient, example-driven learning assistant. Use simple, clear language. Explain complex concepts with analogies. Organize key points with lists and tables.",
            ],
            professional: [
                "你是一位严谨的职场助手。输出正式、专业、条理清晰，适合直接用于工作文档。避免口语化表达，使用结构化格式（标题、列表、表格），注意逻辑性和完整性。",
                "You are a precise, professional assistant. Output formal, well-structured content suitable for work documents. Avoid colloquialisms. Use structured formats: headings, lists, tables.",
            ],
            designer: [
                "你是一位注重视觉表达的创意助手。在内容中关注排版、配色和美感，善于用比喻和视觉描述，适当建议使用图表、思维导图和视觉元素增强表达。",
                "You are a visually-oriented creative assistant. Focus on layout, color, and aesthetics. Use vivid descriptions and suggest charts, mind maps, and visual elements.",
            ],
            developer: [
                "你是一位技术精确的编程助手。回答技术问题时准确使用术语，代码块标注语言类型，优先给出可运行的示例，注意边界条件和错误处理。",
                "You are a technically precise coding assistant. Use accurate terminology, annotate code blocks with language, provide runnable examples, and consider edge cases and error handling.",
            ],
            creative: [
                "你是一位活泼有趣、富有想象力的创意助手。回答风格轻松愉快，善于用故事、比喻和创意表达，适当使用 emoji 增加趣味性，鼓励发散思维。",
                "You are a playful, imaginative creative assistant. Use a lively tone, stories, metaphors, and creative expressions. Use emojis for fun. Encourage divergent thinking.",
            ],
        };
        const [zh, en] = prompts[persona] || ["", ""];
        const isZH = `${window.sourceflow?.config?.lang || navigator.language || ""}`.toLowerCase().startsWith("zh");
        this.state.draft.settings.personaPrompt = `[${persona}] ${isZH ? zh : en}`;
        this.render();
    }

    private async handleAction(action: string) {
        switch (action) {
            case "new-profile":
                this.state.selectedId = "";
                this.state.draft = createDraft(this.state.providers);
                this.render();
                return;
            case "save-profile":
                await this.saveProfile();
                return;
            case "delete-profile":
                await this.deleteProfile();
                return;
            case "apply-tool-policy-recommended":
                this.applyToolPolicyPreset("recommended");
                return;
            case "apply-tool-policy-readonly":
                this.applyToolPolicyPreset("readonly");
                return;
            case "apply-tool-policy-confirm-write":
                this.applyToolPolicyPreset("confirm-write");
                return;
            case "toggle-advanced":
                this.state.showAdvanced = !this.state.showAdvanced;
                this.render();
                return;
            case "toggle-tool-permissions":
                this.state.showToolPermissions = !this.state.showToolPermissions;
                this.render();
                return;
            case "test-connection":
                await this.testConnection();
                return;
            case "load-models":
                await this.loadModels();
                return;
            default:
                return;
        }
    }

    private applyToolPolicyPreset(mode: "recommended" | "readonly" | "confirm-write") {
        if (!this.state.draft.settings) {
            this.state.draft.settings = {};
        }
        const nextModes: Record<string, string> = {};
        this.state.toolCatalog.forEach((tool) => {
            if (mode === "readonly") {
                nextModes[tool.id] = tool.category === "read" ? "auto" : "deny";
                return;
            }
            if (mode === "confirm-write") {
                nextModes[tool.id] = tool.category === "read" ? "auto" : "confirm";
                return;
            }
            if (tool.risk === "L1") {
                nextModes[tool.id] = "auto";
            } else if (tool.risk === "L2") {
                nextModes[tool.id] = "confirm";
            } else {
                nextModes[tool.id] = "deny";
            }
        });
        this.state.draft.settings.toolModes = nextModes;
        this.render();
    }

    private async saveProfile() {
        this.state.saving = true;
        this.render();
        try {
            const secret = getAssistantSecretPayload(!!this.state.draft.hasAPIKey, `${this.state.draft.apiKey || ""}`);
            const saved = await saveAssistantAIProfile({
                ...this.state.draft,
                ...secret,
                settings: cloneSettings(this.state.draft.settings as Record<string, unknown> | undefined),
            });
            this.state.saving = false;
            await this.refresh(saved.id);
            showMessage(assistantText("AI 配置已保存", "AI profile saved"));
            this.options.onSaved?.(saved);
        } catch (error) {
            this.state.saving = false;
            this.render();
            showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
        }
    }

    private async deleteProfile() {
        if (!this.state.draft.id) {
            return;
        }
        confirmDialog(window.sourceflow.languages.deleteOpConfirm || assistantText("删除", "Delete"), assistantText("确定删除当前 AI 配置吗？", "Delete the current AI profile?"), async () => {
            try {
                await deleteAssistantAIProfile(this.state.draft.id as string);
                await this.refresh();
                showMessage(assistantText("AI 配置已删除", "AI profile deleted"));
                this.options.onSaved?.(undefined);
            } catch (error) {
                showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
            }
        }, true);
    }

    private async testConnection() {
        this.state.testing = true;
        this.state.testResult = null;
        this.render();
        try {
            const secret = getAssistantSecretPayload(!!this.state.draft.hasAPIKey, `${this.state.draft.apiKey || ""}`);
            const result = await testAssistantAIConnection({
                id: this.state.draft.id || "",
                provider: this.state.draft.provider || "",
                baseURL: this.state.draft.baseURL || "",
                apiKey: secret.apiKey,
                apiKeyAction: secret.apiKeyAction,
                proxy: this.state.draft.proxy || "",
                userAgent: this.state.draft.userAgent || "",
            });
            this.state.testResult = result;
        } catch (error) {
            this.state.testResult = {ok: false, message: error instanceof Error ? error.message : String(error), latency: 0};
        } finally {
            this.state.testing = false;
            this.render();
        }
    }

    private async loadModels() {
        this.state.loadingModels = true;
        this.state.modelCandidates = [];
        this.render();
        try {
            const secret = getAssistantSecretPayload(!!this.state.draft.hasAPIKey, `${this.state.draft.apiKey || ""}`);
            const data = await listAssistantAIModels({
                id: this.state.draft.id || "",
                provider: this.state.draft.provider || "",
                baseURL: this.state.draft.baseURL || "",
                apiKey: secret.apiKey,
                apiKeyAction: secret.apiKeyAction,
                proxy: this.state.draft.proxy || "",
                userAgent: this.state.draft.userAgent || "",
            });
            if (data.error) {
                showMessage(data.error, 5000, "error");
            }
            this.state.modelCandidates = data.models || [];
            if (!this.state.modelCandidates.length && !data.error) {
                showMessage(assistantText("没有获取到可选模型", "No models were returned"), 4000, "error");
            }
        } catch (error) {
            showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
        } finally {
            this.state.loadingModels = false;
            this.render();
        }
    }

    private render() {
        if (this.state.loading && !this.state.providers.length && !this.state.profiles.length) {
            this.element.innerHTML = `<div class="assistant-profiles assistant-profiles--embedded fn__flex fn__flex-center">${escapeHTML(assistantText("加载 AI 配置中...", "Loading AI profiles..."))}</div>`;
            return;
        }
        this.element.innerHTML = renderPanelContent(this.state, this.options);
    }
}

export const mountAssistantAIProfilesPanel = (element: HTMLElement, options: IAssistantAIProfilesPanelOptions = {}) => {
    return new AssistantAIProfilesPanel(element, options);
};
