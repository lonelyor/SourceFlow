import {ensureAssistantFeatureAvailable, reportAssistantRuntimeError} from "../assistant/runtime";
import {assistantText} from "../assistant/constants";
import {escapeAttr, escapeHTML} from "../assistant/common/dom";
import {fetchPost} from "../util/fetch";
import {showMessage} from "../dialog/message";
import type {ISecurityConfig, ISecurityCapabilities} from "../assistant/security/types";
import {getSecurityConfig, setSecurityConfig} from "../assistant/security/api";
import {
    clearAssistantSecretMaskBeforeEdit,
    getAssistantSecretInputValue,
    getAssistantSecretPayloadFromInput,
    normalizeAssistantSecretInputAfterEdit,
    shouldClearAssistantSecretMaskForKey,
} from "../assistant/secrets";
import type {TAssistantAPIKeyAction} from "../assistant/secrets";

type TAssistantAIProfilesPanelLike = {
    destroy: () => void;
};

type TAssistantEmbeddingConfig = {
    provider: string;
    baseURL: string;
    apiKey: string;
    apiKeyAction?: TAssistantAPIKeyAction;
    model: string;
    enabled: boolean;
    hasAPIKey?: boolean;
};

let panel: TAssistantAIProfilesPanelLike | null = null;
let bindToken = 0;
let embeddingConfig: TAssistantEmbeddingConfig | null = null;
let securityConfig: ISecurityConfig | null = null;
let securityConfigError = "";

const embeddingSectionHTML = () => {
    const cfg = embeddingConfig || {provider: "", baseURL: "", apiKey: "", model: "", enabled: false};
    const apiKeyValue = getAssistantSecretInputValue(!!cfg.hasAPIKey);
    return `<div class="assistant-config__section b3-label fn__flex-column">
    <div class="fn__flex config__item">
        <div class="fn__flex-1">
            ${escapeHTML(assistantText("语义搜索", "Semantic Search"))}
            <div class="b3-label__text">${escapeHTML(assistantText("配置 Embedding 服务以启用语义搜索；索引会把笔记正文发送给所配置服务。", "Configure an embedding service for semantic search; indexing sends note content to the configured service."))}</div>
        </div>
        <span class="fn__space"></span>
        <input type="checkbox" id="embeddingEnabled" class="b3-switch fn__flex-center"${cfg.enabled ? " checked" : ""}>
    </div>
    <div class="fn__hr"></div>
    <div class="fn__flex config__item">
        <div class="fn__flex-center fn__flex-1">${escapeHTML(assistantText("Embedding 服务地址", "Embedding Service URL"))}</div>
        <span class="fn__space"></span>
        <input class="b3-text-field fn__flex-center fn__size200" id="embeddingBaseURL" placeholder="http://127.0.0.1:11434/v1" value="${escapeAttr(cfg.baseURL || "")}">
    </div>
    <div class="fn__hr"></div>
    <div class="fn__flex config__item">
        <div class="fn__flex-center fn__flex-1">${escapeHTML(assistantText("Embedding 模型", "Embedding Model"))}</div>
        <span class="fn__space"></span>
        <input class="b3-text-field fn__flex-center fn__size200" id="embeddingModel" placeholder="nomic-embed-text" value="${escapeAttr(cfg.model || "")}">
    </div>
    <div class="fn__hr"></div>
    <div class="fn__flex config__item">
        <div class="fn__flex-center fn__flex-1">${escapeHTML(assistantText("API Key（可选）", "API Key (optional)"))}</div>
        <span class="fn__space"></span>
        <input type="password" class="b3-text-field fn__flex-center fn__size200" id="embeddingApiKey" data-secret-masked="${cfg.hasAPIKey ? "true" : "false"}" autocomplete="off" placeholder="sk-..." value="${escapeAttr(apiKeyValue)}">
    </div>
    <div class="fn__hr"></div>
    <div class="fn__flex config__item">
        <div class="fn__flex-center fn__flex-1">${escapeHTML(assistantText("索引所有笔记", "Index All Notes"))}</div>
        <span class="fn__space"></span>
        <button class="b3-button b3-button--outline fn__flex-center fn__size200" id="embeddingIndexAll">${escapeHTML(assistantText("开始索引", "Start Indexing"))}</button>
    </div>
    <div class="fn__hr"></div>
    <div class="fn__flex config__item">
        <div class="fn__flex-center fn__flex-1">${escapeHTML(assistantText("保存 Embedding 配置", "Save Embedding Config"))}</div>
        <span class="fn__space"></span>
        <button class="b3-button b3-button--outline fn__flex-center fn__size200" id="embeddingSave">${escapeHTML(assistantText("保存", "Save"))}</button>
    </div>
</div>`;
};

const loadEmbeddingConfig = (container: HTMLElement) => {
    fetchPost("/api/assistant/embedding/config", {}, (response: {code: number; data?: TAssistantEmbeddingConfig}) => {
        if (response.code === 0 && response.data) {
            embeddingConfig = response.data;
        } else {
            embeddingConfig = {provider: "ollama", baseURL: "", apiKey: "", model: "", enabled: false};
        }
        renderEmbeddingSection(container);
        bindEmbeddingEvents(container);
    });
};

const renderEmbeddingSection = (container: HTMLElement) => {
    const section = container.querySelector("#embeddingConfigSection");
    if (section) {
        section.innerHTML = embeddingSectionHTML();
    }
};

const bindEmbeddingEvents = (container: HTMLElement) => {
    const apiKeyInput = container.querySelector("#embeddingApiKey") as HTMLInputElement | null;
    if (apiKeyInput) {
        apiKeyInput.addEventListener("keydown", (event: KeyboardEvent) => {
            if (!shouldClearAssistantSecretMaskForKey(event)) {
                return;
            }
            if (clearAssistantSecretMaskBeforeEdit(apiKeyInput) && (event.key === "Backspace" || event.key === "Delete")) {
                event.preventDefault();
            }
        });
        apiKeyInput.addEventListener("paste", () => {
            clearAssistantSecretMaskBeforeEdit(apiKeyInput);
        });
        apiKeyInput.addEventListener("input", () => {
            normalizeAssistantSecretInputAfterEdit(apiKeyInput);
        });
    }

    const saveBtn = container.querySelector("#embeddingSave");
    if (saveBtn) {
        saveBtn.addEventListener("click", () => {
            const enabled = (container.querySelector("#embeddingEnabled") as HTMLInputElement)?.checked || false;
            const baseURL = (container.querySelector("#embeddingBaseURL") as HTMLInputElement)?.value || "";
            const model = (container.querySelector("#embeddingModel") as HTMLInputElement)?.value || "";
            const secret = getAssistantSecretPayloadFromInput(!!embeddingConfig?.hasAPIKey, apiKeyInput);
            const config: TAssistantEmbeddingConfig = {
                provider: "openai-compatible",
                baseURL,
                apiKey: secret.apiKey,
                apiKeyAction: secret.apiKeyAction,
                model,
                enabled,
            };
            fetchPost("/api/assistant/embedding/setConfig", {config}, (response: {code: number; msg?: string; data?: TAssistantEmbeddingConfig}) => {
                if (response.code === 0) {
                    embeddingConfig = response.data || {
                        ...config,
                        apiKey: "",
                        hasAPIKey: secret.apiKeyAction === "replace" || (secret.apiKeyAction === "keep" && !!embeddingConfig?.hasAPIKey),
                    };
                    renderEmbeddingSection(container);
                    bindEmbeddingEvents(container);
                    showMessage(assistantText("Embedding 配置已保存", "Embedding config saved"));
                } else {
                    showMessage(response.msg || assistantText("保存失败", "Save failed"), 5000, "error");
                }
            });
        });
    }

    const indexAllBtn = container.querySelector("#embeddingIndexAll");
    if (indexAllBtn) {
        indexAllBtn.addEventListener("click", () => {
            const btn = indexAllBtn as HTMLButtonElement;
            btn.disabled = true;
            btn.textContent = assistantText("索引中...", "Indexing...");
            fetchPost("/api/assistant/embedding/indexAll", {}, (response: {code: number; msg?: string; data?: {indexed?: number; total?: number}}) => {
                btn.disabled = false;
                btn.textContent = assistantText("开始索引", "Start Indexing");
                if (response.code === 0) {
                    const indexed = response.data?.indexed || 0;
                    const total = response.data?.total || 0;
                    showMessage(assistantText(`已索引 ${indexed}/${total} 篇笔记`, `Indexed ${indexed}/${total} notes`));
                } else {
                    showMessage(response.msg || assistantText("索引失败", "Indexing failed"), 5000, "error");
                }
            }, undefined, () => {
                btn.disabled = false;
                btn.textContent = assistantText("开始索引", "Start Indexing");
                showMessage(assistantText("索引失败", "Indexing failed"), 5000, "error");
            });
        });
    }
};

const securitySectionHTML = () => {
    if (!securityConfig) {
        return `<div class="assistant-config__section b3-label fn__flex-column">
    <div class="fn__flex config__item">
        <div class="fn__flex-1">
            ${escapeHTML(assistantText("AI 安全与权限", "AI Security & Permissions"))}
            <div class="b3-label__text">${escapeHTML(securityConfigError || assistantText("正在从后端加载安全配置。", "Loading security config from backend."))}</div>
        </div>
    </div>
</div>`;
    }
    const cfg = securityConfig;
    const cap = cfg.capabilities;
    const capSwitch = (id: string, checked: boolean, label: string, labelEn: string) =>
        `<div class="fn__flex config__item">
        <div class="fn__flex-center fn__flex-1">${escapeHTML(assistantText(label, labelEn))}</div>
        <span class="fn__space"></span>
        <input type="checkbox" class="b3-switch fn__flex-center security-cap-switch" data-cap="${id}"${checked ? " checked" : ""}>
    </div><div class="fn__hr"></div>`;

    return `<div class="assistant-config__section b3-label fn__flex-column">
    <div class="fn__flex config__item">
        <div class="fn__flex-1">
            ${escapeHTML(assistantText("AI 安全与权限", "AI Security & Permissions"))}
            <div class="b3-label__text">${escapeHTML(assistantText("配置 AI 操作权限、黑白名单和能力限制。黑名单中的内容 AI 永远无法操作。", "Configure AI operation permissions, blacklist/whitelist, and capability limits. AI can never operate on blacklisted items."))}</div>
        </div>
    </div>
    <div class="fn__hr"></div>
    <div class="fn__flex config__item">
        <div class="fn__flex-center fn__flex-1">${escapeHTML(assistantText("默认权限模式", "Default Permission Mode"))}</div>
        <span class="fn__space"></span>
        <select class="b3-select fn__flex-center fn__size200" id="securityDefaultMode">
            <option value="default"${cfg.defaultMode === "default" ? " selected" : ""}>${escapeHTML(assistantText("默认权限（只读）", "Default (Read-only)"))}</option>
            <option value="autoReview"${cfg.defaultMode === "autoReview" ? " selected" : ""}>${escapeHTML(assistantText("自动审查", "Auto Review"))}</option>
            <option value="fullAccess"${cfg.defaultMode === "fullAccess" ? " selected" : ""}>${escapeHTML(assistantText("完全访问", "Full Access"))}</option>
        </select>
    </div>
    <div class="fn__hr"></div>
    <div class="fn__flex config__item">
        <div class="fn__flex-center fn__flex-1">${escapeHTML(assistantText("批量操作阈值", "Batch Operation Threshold"))}</div>
        <span class="fn__space"></span>
        <input class="b3-text-field fn__flex-center fn__size200" id="securityBatchThreshold" type="number" min="1" max="100" value="${cfg.batchThreshold}">
    </div>
    <div class="fn__hr"></div>
    <div class="config__item__title fn__flex">${escapeHTML(assistantText("能力开关", "Capability Switches"))}</div>
    ${capSwitch("read", cap.read, "可读", "Read")}
    ${capSwitch("write", cap.write, "可写", "Write")}
    ${capSwitch("execute", cap.execute, "可执行命令", "Execute Commands")}
    ${capSwitch("create", cap.create, "可创建笔记", "Create Notes")}
    ${capSwitch("deleteBlock", cap.deleteBlock, "可删除块", "Delete Blocks")}
    ${capSwitch("deleteNote", cap.deleteNote, "可删除笔记", "Delete Notes")}
    ${capSwitch("move", cap.move, "可移动笔记", "Move Notes")}
    <div class="fn__flex config__item">
        <div class="fn__flex-center fn__flex-1">${escapeHTML(assistantText("黑名单（AI 永远无法操作）", "Blacklist (AI can never operate)"))}</div>
        <span class="fn__space"></span>
        <input class="b3-text-field fn__flex-1" id="securityBlacklistInput" placeholder="${escapeAttr(assistantText("输入笔记本/文件夹/笔记 ID", "Enter notebook/folder/note ID"))}">
        <span class="fn__space"></span>
        <button class="b3-button b3-button--outline" id="securityBlacklistAdd">${escapeHTML(assistantText("添加", "Add"))}</button>
    </div>
    <div class="fn__hr"></div>
    <div id="securityBlacklistList" class="assistant-config__rule-list fn__flex-column">
        ${(cfg.blacklist || []).map((rule, i) => `<div class="assistant-config__rule-item fn__flex fn__flex-center">
            <span>${escapeHTML(rule.type)}: ${escapeHTML(rule.name || rule.id)}</span>
            <button class="b3-button b3-button--outline assistant-config__rule-remove" data-action="remove-blacklist" data-index="${i}">${escapeHTML(assistantText("移除", "Remove"))}</button>
        </div>`).join("")}
    </div>
    <div class="fn__hr"></div>
    <div class="fn__flex config__item">
        <div class="fn__flex-center fn__flex-1">${escapeHTML(assistantText("保存安全配置", "Save Security Config"))}</div>
        <span class="fn__space"></span>
        <button class="b3-button b3-button--outline fn__flex-center fn__size200" id="securitySave">${escapeHTML(assistantText("保存", "Save"))}</button>
    </div>
</div>`;
};

const loadSecurityConfig = (container: HTMLElement) => {
    void getSecurityConfig().then((cfg) => {
        securityConfig = cfg;
        securityConfigError = "";
        renderSecuritySection(container);
        bindSecurityEvents(container);
    }).catch((error) => {
        securityConfig = null;
        securityConfigError = error instanceof Error ? error.message : assistantText("安全配置加载失败", "Failed to load security config");
        renderSecuritySection(container);
        bindSecurityEvents(container);
    });
};

const renderSecuritySection = (container: HTMLElement) => {
    const section = container.querySelector("#securityConfigSection");
    if (section) {
        section.innerHTML = securitySectionHTML();
    }
};

const bindSecurityEvents = (container: HTMLElement) => {
    const saveBtn = container.querySelector("#securitySave");
    if (saveBtn) {
        saveBtn.addEventListener("click", () => {
            if (!securityConfig) return;
            const cfg = {...securityConfig, capabilities: {...securityConfig.capabilities}};
            cfg.defaultMode = ((container.querySelector("#securityDefaultMode") as HTMLSelectElement)?.value || "default") as ISecurityConfig["defaultMode"];
            cfg.batchThreshold = parseInt((container.querySelector("#securityBatchThreshold") as HTMLInputElement)?.value || "10", 10) || 10;
            container.querySelectorAll(".security-cap-switch").forEach((el) => {
                const input = el as HTMLInputElement;
                const cap = input.getAttribute("data-cap") as keyof ISecurityCapabilities;
                if (cap) {
                    cfg.capabilities[cap] = input.checked;
                }
            });
            void setSecurityConfig(cfg).then((saved) => {
                securityConfig = saved;
                renderSecuritySection(container);
                bindSecurityEvents(container);
                showMessage(assistantText("安全配置已保存", "Security config saved"));
            }).catch((err) => {
                showMessage(err instanceof Error ? err.message : assistantText("保存失败", "Save failed"), 5000, "error");
            });
        });
    }

    const addBlacklistBtn = container.querySelector("#securityBlacklistAdd");
    if (addBlacklistBtn) {
        addBlacklistBtn.addEventListener("click", () => {
            if (!securityConfig) return;
            const input = container.querySelector("#securityBlacklistInput") as HTMLInputElement;
            const id = input?.value?.trim();
            if (!id) return;
            if (securityConfig.blacklist.some((r) => r.id === id)) return;
            securityConfig.blacklist.push({type: "note", id, name: id});
            input.value = "";
            renderSecuritySection(container);
            bindSecurityEvents(container);
        });
    }

    container.querySelectorAll('[data-action="remove-blacklist"]').forEach((btn) => {
        btn.addEventListener("click", () => {
            if (!securityConfig) return;
            const idx = parseInt((btn as HTMLElement).getAttribute("data-index") || "0", 10);
            securityConfig.blacklist.splice(idx, 1);
            renderSecuritySection(container);
            bindSecurityEvents(container);
        });
    });
};

export const ai = {
    element: undefined as Element,
    genHTML: () => {
        return `<div class="assistant-config assistant-config--settings fn__flex-column">
    <div class="assistant-config__body"></div>
    <div class="assistant-config__sections">
        <div id="embeddingConfigSection"></div>
        <div id="securityConfigSection"></div>
    </div>
</div>`;
    },
    bindEvent: () => {
        panel?.destroy();
        panel = null;
        const body = ai.element.querySelector(".assistant-config__body") as HTMLElement;
        const embeddingSection = ai.element.querySelector("#embeddingConfigSection") as HTMLElement;
        if (!ensureAssistantFeatureAvailable()) {
            body.innerHTML = `<div class="fn__flex-1 fn__flex-column fn__flex-center ft__secondary">${window.sourceflow.languages.unavailable}</div>`;
            return;
        }
        body.innerHTML = `<div class="fn__flex-1 fn__flex-column fn__flex-center ft__secondary">${window.sourceflow.languages.loading}</div>`;
        const currentToken = ++bindToken;
        void import("../assistant/ai/ProfilesPanel").then(({AssistantAIProfilesPanel}) => {
            if (currentToken !== bindToken) {
                return;
            }
            panel = new AssistantAIProfilesPanel(body, {
                embedded: false,
                compact: false,
            });
        }).catch((error) => {
            reportAssistantRuntimeError("config:ai", error);
            if (currentToken === bindToken) {
                body.innerHTML = `<div class="fn__flex-1 fn__flex-column fn__flex-center ft__secondary">${window.sourceflow.languages.unavailable}</div>`;
            }
        });

        if (embeddingSection) {
            loadEmbeddingConfig(embeddingSection);
        }

        const securitySection = ai.element.querySelector("#securityConfigSection") as HTMLElement;
        if (securitySection) {
            loadSecurityConfig(securitySection);
        }
    },
};
