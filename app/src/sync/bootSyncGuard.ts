export type TBootSyncGuardInfo = {
    reason?: string;
    summary?: string;
    detail?: string;
    primaryAction?: "retry" | "settings";
    primaryLabel?: string;
    primaryTarget?: "repos" | "about";
};

const flashAndFocusSettingElement = (root: ParentNode | null, selectors: string[]) => {
    if (!root) {
        return;
    }
    for (const selector of selectors) {
        const element = root.querySelector(selector) as HTMLElement;
        if (!element || element.classList.contains("fn__none") || element.getClientRects().length === 0) {
            continue;
        }
        element.scrollIntoView({behavior: "smooth", block: "center"});
        if ("focus" in element) {
            window.setTimeout(() => {
                (element as HTMLInputElement | HTMLButtonElement | HTMLSelectElement).focus?.();
            }, 80);
        }
        const previousOutline = element.style.outline;
        const previousOutlineOffset = element.style.outlineOffset;
        element.style.outline = "2px solid var(--b3-theme-primary)";
        element.style.outlineOffset = "3px";
        window.setTimeout(() => {
            element.style.outline = previousOutline;
            element.style.outlineOffset = previousOutlineOffset;
        }, 2200);
        return;
    }
};

const getBootSyncSettingSelectors = (target: "repos" | "about", reason?: string) => {
    if (target === "repos") {
        return ["#syncProvider", "#reposCloudSyncSwitch", "#syncDiagnostics"];
    }
    if (reason === "repo-key") {
        return ["#importKey", "#copyKey", "#initKey", "#initKeyByPW"];
    }
    if (reason === "repo") {
        return ["#resetRepo", "#purgeRepo", "#copyKey", "#importKey"];
    }
    return ["#importKey", "#copyKey", "#resetRepo"];
};

export const openBootSyncSettingTarget = (target: "repos" | "about" = "repos", reason?: string) => {
    const selectors = getBootSyncSettingSelectors(target, reason);
    /// #if MOBILE
    if (target === "about") {
        void import("../mobile/settings/about").then(({initAbout}) => {
            initAbout();
            window.setTimeout(() => {
                flashAndFocusSettingElement(document.getElementById("modelMain"), selectors);
            }, 80);
        });
        return;
    }
    void Promise.all([
        import("../config/repos"),
        import("../mobile/menu/model")
    ]).then(([{repos}, {openModel}]) => {
        openModel({
            title: window.sourceflow.languages.backup,
            icon: "iconCloud",
            html: repos.genHTML(),
            bindEvent(modelMainElement: HTMLElement) {
                repos.element = modelMainElement;
                repos.bindEvent();
            }
        });
        window.setTimeout(() => {
            flashAndFocusSettingElement(document.getElementById("modelMain"), selectors);
        }, 80);
    });
    /// #else
    void import("../config").then(({openSettingTab}) => {
        const dialog = openSettingTab(window.sourceflow.ws.app, target);
        window.setTimeout(() => {
            const root = dialog?.element?.querySelector(`.config__tab-container[data-name="${target}"]`) || dialog?.element;
            flashAndFocusSettingElement(root, selectors);
        }, 100);
    });
    /// #endif
};
