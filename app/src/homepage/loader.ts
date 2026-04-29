import {Constants} from "../constants";
import {fetchSyncPost} from "../util/fetch";
import {DEFAULT_TEMPLATE_PATH} from "./constants";
import {getHomepageTemplateMode, readWorkspaceText, writeWorkspaceText} from "./io";
import {normalizeTemplatePath} from "./state";
import {createMarkdownHomepageBundle} from "./templates/markdown";
import {createNoteHomepageBundle} from "./templates/note";
import {getDefaultTemplateBundle, isUpgradeableDefaultHomepageTemplate} from "./templates/defaultTemplate";
import {extractStandaloneHomepageHTML} from "./templates/standalone";
import {IHomepageState, IHomepageTemplateBundle} from "./types";

const loadHomepageWorkspaceBundle = async (templatePath: string, defaults: IHomepageTemplateBundle): Promise<IHomepageTemplateBundle> => {
    const [html, markdown, css, script, config] = await Promise.all([
        readWorkspaceText(`${templatePath}/index.html`),
        readWorkspaceText(`${templatePath}/index.md`),
        readWorkspaceText(`${templatePath}/style.css`),
        readWorkspaceText(`${templatePath}/script.js`),
        readWorkspaceText(`${templatePath}/config.json`),
    ]);
    if (!html.trim() && markdown.trim()) {
        return createMarkdownHomepageBundle(markdown, css, script, config.trim() ? config : "{}");
    }
    return {
        html: html.trim() ? html : defaults.html,
        css: css.trim() ? css : defaults.css,
        script: script.trim() ? script : defaults.script,
        config: config.trim() ? config : defaults.config,
    };
};

export const ensureDefaultHomepageTemplate = async () => {
    if (window.sourceflow.config.readonly || window.sourceflow.isPublish) {
        return;
    }
    const defaults = getDefaultTemplateBundle();
    const currentBundle = await loadHomepageWorkspaceBundle(DEFAULT_TEMPLATE_PATH, defaults);
    const upgradeLegacyDefault = isUpgradeableDefaultHomepageTemplate(DEFAULT_TEMPLATE_PATH, currentBundle);
    const entries: Array<[string, string, string]> = [
        ["index.html", defaults.html, "text/html"],
        ["style.css", defaults.css, "text/css"],
        ["script.js", defaults.script, "application/javascript"],
        ["config.json", defaults.config, "application/json"],
    ];
    for (const [fileName, content, mime] of entries) {
        const targetPath = `${DEFAULT_TEMPLATE_PATH}/${fileName}`;
        const existing = await readWorkspaceText(targetPath);
        if (existing.trim() && !upgradeLegacyDefault) {
            continue;
        }
        await writeWorkspaceText(targetPath, content, mime);
    }
};

export const loadHomepageTemplateBundle = async (templatePath: string): Promise<IHomepageTemplateBundle> => {
    const defaults = getDefaultTemplateBundle();
    if (normalizeTemplatePath(templatePath) === DEFAULT_TEMPLATE_PATH) {
        return defaults;
    }
    const templateMode = getHomepageTemplateMode(templatePath);
    if (templateMode === "html") {
        const htmlFile = await readWorkspaceText(templatePath);
        if (!htmlFile.trim()) {
            return defaults;
        }
        return extractStandaloneHomepageHTML(htmlFile);
    }
    if (templateMode === "markdown") {
        const markdownFile = await readWorkspaceText(templatePath);
        if (!markdownFile.trim()) {
            return defaults;
        }
        return createMarkdownHomepageBundle(markdownFile);
    }
    return loadHomepageWorkspaceBundle(templatePath, defaults);
};

export const hasHomepageTemplateSource = async (templatePath: string) => {
    const templateMode = getHomepageTemplateMode(templatePath);
    if (templateMode === "html" || templateMode === "markdown") {
        return !!(await readWorkspaceText(templatePath)).trim();
    }
    const [html, markdown] = await Promise.all([
        readWorkspaceText(`${templatePath}/index.html`),
        readWorkspaceText(`${templatePath}/index.md`),
    ]);
    return !!html.trim() || !!markdown.trim();
};

export const loadHomepageNoteBundle = async (state: IHomepageState): Promise<IHomepageTemplateBundle | undefined> => {
    if (state.sourceType !== "note" || !state.noteId) {
        return undefined;
    }
    const [docInfoResponse, docResponse] = await Promise.all([
        fetchSyncPost("/api/block/getDocInfo", {id: state.noteId}),
        fetchSyncPost("/api/filetree/getDoc", {
            id: state.noteId,
            mode: 0,
            size: Constants.SIZE_GET_MAX,
            highlight: false,
        }),
    ]);
    if (docInfoResponse.code !== 0 || docResponse.code !== 0) {
        return undefined;
    }
    const content = `${docResponse.data?.content || ""}`.trim();
    if (!content) {
        return undefined;
    }
    return createNoteHomepageBundle(docInfoResponse.data?.name || "", content);
};
