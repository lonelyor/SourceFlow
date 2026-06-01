import {ensureAssistantFeatureAvailable, reportAssistantRuntimeError} from "../assistant/runtime";
import {assistantText} from "../assistant/constants";
import {escapeAttr, escapeHTML} from "../assistant/common/dom";
import {fetchPost} from "../util/fetch";
import {showMessage} from "../dialog/message";

type TAssistantAIProfilesPanelLike = {
    destroy: () => void;
};

type TAssistantEmbeddingConfig = {
    provider: string;
    baseURL: string;
    apiKey: string;
    model: string;
    enabled: boolean;
    hasAPIKey?: boolean;
};

let panel: TAssistantAIProfilesPanelLike | null = null;
let bindToken = 0;
let embeddingConfig: TAssistantEmbeddingConfig | null = null;

const embeddingSectionHTML = () => {
    const cfg = embeddingConfig || {provider: "", baseURL: "", apiKey: "", model: "", enabled: false};
    return `<div class="b3-label fn__flex-column" style="margin-top:24px">
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
        <input type="password" class="b3-text-field fn__flex-center fn__size200" id="embeddingApiKey" placeholder="${escapeAttr(cfg.hasAPIKey ? assistantText("留空保持已有密钥", "Leave blank to keep existing key") : "sk-...")}" value="">
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
    const saveBtn = container.querySelector("#embeddingSave");
    if (saveBtn) {
        saveBtn.addEventListener("click", () => {
            const enabled = (container.querySelector("#embeddingEnabled") as HTMLInputElement)?.checked || false;
            const baseURL = (container.querySelector("#embeddingBaseURL") as HTMLInputElement)?.value || "";
            const model = (container.querySelector("#embeddingModel") as HTMLInputElement)?.value || "";
            const apiKey = (container.querySelector("#embeddingApiKey") as HTMLInputElement)?.value || "";
            const config: TAssistantEmbeddingConfig = {
                provider: "openai-compatible",
                baseURL,
                apiKey,
                model,
                enabled,
            };
            fetchPost("/api/assistant/embedding/setConfig", {config}, (response: {code: number; msg?: string; data?: TAssistantEmbeddingConfig}) => {
                if (response.code === 0) {
                    embeddingConfig = response.data || {...config, apiKey: "", hasAPIKey: !!apiKey || !!embeddingConfig?.hasAPIKey};
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
            });
        });
    }
};

export const ai = {
    element: undefined as Element,
    genHTML: () => {
        return `<div class="assistant-config assistant-config--settings fn__flex-column">
    <div class="assistant-config__body fn__flex-1"></div>
    <div id="embeddingConfigSection"></div>
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
    },
};
