import {App} from "../index";
import {HOMEPAGE_MARK, homepageText} from "./constants";
import {escapeHTML} from "./html";
import {ensureDefaultHomepageTemplate, loadHomepageNoteBundle, loadHomepageTemplateBundle} from "./loader";
import {getHomepageState, resetHomepageToDefault} from "./state";
import {runHomepageTemplateScript} from "./templateScriptRuntime";
import {parseHomepageTemplateConfig} from "./templateConfig";
import {getHomepageToolbarHTML} from "./toolbar";
import {runHomepageBuiltinAction, openHomepageExternal} from "./actions";

const getHomepageScriptSourceURL = (sourceType: string, noteId: string, templatePath: string) => {
    const identity = sourceType === "note" && noteId ? noteId : templatePath || "default";
    return `sourceflow://homepage/${encodeURIComponent(identity)}.js`;
};

const renderHomepage = async (app: App, container: HTMLElement) => {
    const state = getHomepageState();
    await ensureDefaultHomepageTemplate();
    let bundle = await loadHomepageNoteBundle(state);
    if (!bundle) {
        if (state.sourceType === "note" && state.noteId) {
            const nextState = resetHomepageToDefault();
            state.sourceType = nextState.sourceType;
            state.noteId = nextState.noteId;
            state.templatePath = nextState.templatePath;
        }
        bundle = await loadHomepageTemplateBundle(state.templatePath);
    }

    let configData: Record<string, any> = {};
    try {
        configData = parseHomepageTemplateConfig(bundle.config);
    } catch (error) {
        console.warn("parse homepage config failed", error);
    }

    container.innerHTML = `${getHomepageToolbarHTML(state)}<div class="homepage-page__canvas">${bundle.html}</div>`;
    const styleElement = document.createElement("style");
    styleElement.setAttribute("data-role", "homepage-style");
    styleElement.textContent = bundle.css;
    container.prepend(styleElement);

    const refresh = async () => {
        await renderHomepage(app, container);
    };

    container.onclick = (event) => {
        let target = event.target as HTMLElement;
        while (target && !target.isEqualNode(container)) {
            const url = target.getAttribute("data-homepage-url");
            if (url) {
                openHomepageExternal(url);
                event.preventDefault();
                return;
            }
            const action = target.getAttribute("data-homepage-action");
            if (action) {
                void runHomepageBuiltinAction(app, action, refresh, state);
                event.preventDefault();
                return;
            }
            target = target.parentElement;
        }
    };

    try {
        runHomepageTemplateScript({
            source: bundle.script,
            sourceURL: getHomepageScriptSourceURL(state.sourceType, state.noteId, state.templatePath),
            container,
            api: {
                config: configData,
                escape: escapeHTML,
                escapeAttr: escapeHTML,
                openExternal: openHomepageExternal,
                searchWeb: (keyword: string, searchURL: string) => {
                    const queryURL = `${searchURL || "https://www.google.com/search?q=%s"}`.replace("%s", encodeURIComponent(keyword));
                    openHomepageExternal(queryURL);
                },
                invoke: (action: string) => runHomepageBuiltinAction(app, action, refresh, state),
            },
            state,
        });
    } catch (error) {
        console.error("render homepage script failed", error);
        container.insertAdjacentHTML("beforeend", `<div class="ft__error" style="padding:16px;">${escapeHTML(homepageText("主页模板脚本执行失败", "Homepage template script failed"))}</div>`);
    }
};

const renderHomepageFailure = (container: HTMLElement, error: unknown) => {
    const message = error instanceof Error ? error.message : `${error || ""}`;
    container.innerHTML = `<div class="homepage-page__canvas">
    <div class="ft__error" style="max-width:720px;margin:32px auto;padding:24px;border-radius:20px;line-height:1.8;">
        <div style="font-weight:700;margin-bottom:8px;">${escapeHTML(homepageText("主页加载失败", "Homepage failed to load"))}</div>
        <div style="font-size:13px;opacity:.78;">${escapeHTML(message || homepageText("请检查主页模板文件或恢复默认主页。", "Check the homepage source files or reset the homepage to the default template."))}</div>
    </div>
</div>`;
};

export const mountHomepageIntoContainer = async (app: App, container: HTMLElement) => {
    if (!container) {
        return;
    }
    container.setAttribute("data-homepage-tab", HOMEPAGE_MARK);
    container.classList.add("homepage-page");
    container.innerHTML = `<div class="homepage-page__loading">${escapeHTML(homepageText("正在加载主页…", "Loading homepage..."))}</div>`;
    try {
        await renderHomepage(app, container);
    } catch (error) {
        console.error("render homepage failed", error);
        renderHomepageFailure(container, error);
    }
};
