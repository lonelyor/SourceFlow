import {ensureAssistantFeatureAvailable, reportAssistantRuntimeError} from "../assistant/runtime";

type TAssistantAIProfilesPanelLike = {
    destroy: () => void;
};

let panel: TAssistantAIProfilesPanelLike | null = null;
let bindToken = 0;

export const ai = {
    element: undefined as Element,
    genHTML: () => {
        return `<div class="assistant-config assistant-config--settings fn__flex-column">
    <div class="assistant-config__body fn__flex-1"></div>
</div>`;
    },
    bindEvent: () => {
        panel?.destroy();
        panel = null;
        const body = ai.element.querySelector(".assistant-config__body") as HTMLElement;
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
    },
};
