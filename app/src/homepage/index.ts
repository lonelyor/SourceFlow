import {App} from "../index";
import {Constants} from "../constants";
import {fetchPost, fetchSyncPost} from "../util/fetch";
import {setStorageVal, openByMobile} from "../protyle/util/compatibility";
import {showMessage} from "../dialog/message";
import {newFile} from "../util/newFile";
import {mountHelp, newNotebook} from "../util/mount";
import {openHistory} from "../history/history";
/// #if MOBILE
import {popSearch} from "../mobile/menu/search";
import {getRecentDocs as openMobileRecentDocs} from "../mobile/menu/getRecentDocs";
import {openMobileFileById} from "../mobile/editor";
/// #else
import {Tab} from "../layout/Tab";
import {getAllTabs} from "../layout/getAll";
import {getInstanceById, getWndByLayout} from "../layout/util";
import {Wnd} from "../layout/Wnd";
import {openSearch} from "../search/spread";
import {openRecentDocs as openDesktopRecentDocs} from "../business/openRecentDocs";
import {openBy} from "../editor/util";
import {openFileById} from "../editor/util";
/// #endif
/// #if !BROWSER
import {shell} from "electron";
/// #endif
import {setLute} from "../protyle/render/setLute";

const DEFAULT_TEMPLATE_PATH = "/data/storage/homepage/default";
const DEFAULT_TEMPLATE_VERSION = 9;
const HOMEPAGE_MARK = "true";
const homepageText = (zh: string, en: string) => window.sourceflow.config.lang === "zh_CN" ? zh : en;
const loadWorkbenchDialogModule = () => import("../workbench/dialog");
const loadCommandPanelModule = () => import("../boot/globalEvent/command/panel");
const loadConfigModule = () => import("../config");

interface IHomepageState {
    templatePath: string;
    sourceType: THomepageSourceType;
    noteId: string;
}

interface IHomepageTemplateBundle {
    html: string;
    css: string;
    script: string;
    config: string;
}

type THomepageTemplateMode = "bundle" | "html" | "markdown";
type THomepageSourceType = "template" | "note";

const normalizeTemplatePath = (value?: string) => {
    const text = `${value || ""}`.trim().replace(/\\/g, "/");
    if (!text) {
        return DEFAULT_TEMPLATE_PATH;
    }
    return text.startsWith("/") ? text.replace(/\/+$/, "") : `/${text.replace(/^\/+/, "").replace(/\/+$/, "")}`;
};

const normalizeHomepageState = (state?: Partial<IHomepageState>): IHomepageState => {
    const noteId = `${state?.noteId || ""}`.trim();
    const sourceType: THomepageSourceType = state?.sourceType === "note" && noteId ? "note" : "template";
    return {
        templatePath: normalizeTemplatePath(state?.templatePath),
        sourceType,
        noteId: sourceType === "note" ? noteId : "",
    };
};

const getHomepageState = (): IHomepageState => {
    const stored = window.sourceflow.storage[Constants.LOCAL_HOMEPAGE] || {};
    return normalizeHomepageState(stored);
};

const saveHomepageState = (state: IHomepageState) => {
    const normalized = normalizeHomepageState(state);
    window.sourceflow.storage[Constants.LOCAL_HOMEPAGE] = normalized;
    setStorageVal(Constants.LOCAL_HOMEPAGE, normalized);
};

export const setHomepageSourceToNote = (noteId: string) => {
    const state = getHomepageState();
    state.sourceType = "note";
    state.noteId = `${noteId || ""}`.trim();
    saveHomepageState(state);
    return getHomepageState();
};

export const resetHomepageToDefault = () => {
    const state = getHomepageState();
    state.sourceType = "template";
    state.noteId = "";
    state.templatePath = normalizeTemplatePath(state.templatePath || DEFAULT_TEMPLATE_PATH);
    saveHomepageState(state);
    return getHomepageState();
};

const getHomepageTemplateMode = (templatePath: string): THomepageTemplateMode => {
    const normalized = normalizeTemplatePath(templatePath).toLowerCase();
    if (normalized.endsWith(".md") || normalized.endsWith(".markdown")) {
        return "markdown";
    }
    if (normalized.endsWith(".html") || normalized.endsWith(".htm")) {
        return "html";
    }
    return "bundle";
};

const readWorkspaceText = (pathString: string) => {
    return new Promise<string>((resolve) => {
        fetchPost("/api/file/getFile", {path: pathString}, (response) => {
            resolve(typeof response === "string" ? response : "");
        }, null, () => {
            resolve("");
        });
    });
};

const writeWorkspaceText = async (pathString: string, content: string, mime = "text/plain") => {
    const fileName = pathString.split("/").pop() || "index.txt";
    const file = new File([new Blob([content], {type: mime})], fileName);
    const formData = new FormData();
    formData.append("path", pathString);
    formData.append("file", file);
    formData.append("isDir", "false");
    return fetchSyncPost("/api/file/putFile", formData);
};

const extractStandaloneHomepageHTML = (content: string): IHomepageTemplateBundle => {
    const cssBlocks: string[] = [];
    const scriptBlocks: string[] = [];
    let html = `${content || ""}`.trim();
    html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, css: string) => {
        cssBlocks.push(css);
        return "";
    });
    html = html.replace(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi, (_, script: string) => {
        scriptBlocks.push(script);
        return "";
    });
    const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
        html = bodyMatch[1];
    }
    html = html
        .replace(/<!doctype[^>]*>/gi, "")
        .replace(/<\/?(?:html|head|body)\b[^>]*>/gi, "")
        .trim();
    return {
        html,
        css: cssBlocks.join("\n"),
        script: scriptBlocks.join("\n"),
        config: "{}",
    };
};

const getMarkdownHomepageCSS = () => `.homepage-note{max-width:980px;margin:0 auto;padding:28px 24px 48px;box-sizing:border-box}.homepage-note__surface{position:relative;padding:24px 0;border-radius:28px;background:linear-gradient(180deg,color-mix(in srgb,var(--b3-theme-surface) 96%,transparent),color-mix(in srgb,var(--b3-theme-background) 98%,transparent));border:1px solid color-mix(in srgb,var(--b3-border-color) 82%,transparent);box-shadow:0 22px 46px rgba(15,23,42,.08);overflow:hidden}.homepage-note__surface::before{content:"";position:absolute;left:-80px;top:-120px;width:240px;height:240px;border-radius:999px;background:radial-gradient(circle,rgba(255,136,179,.18),rgba(255,136,179,0) 72%);pointer-events:none}.homepage-note__surface::after{content:"";position:absolute;right:-60px;top:12px;width:220px;height:220px;border-radius:999px;background:radial-gradient(circle,rgba(79,195,255,.14),rgba(79,195,255,0) 72%);pointer-events:none}.homepage-note .protyle-content{padding:0 28px}.homepage-note .protyle-wysiwyg{padding:0 !important;max-width:none}@media (max-width:720px){.homepage-note{padding:16px 14px 30px}.homepage-note__surface{padding:18px 0;border-radius:22px}.homepage-note .protyle-content{padding:0 18px}}`;

const renderMarkdownHomepageHTML = (markdown: string) => {
    const lute = setLute({
        emojis: {},
        emojiSite: "/emojis",
        headingAnchor: false,
        sanitize: true,
        listStyle: false,
        paragraphBeginningSpace: !!window.sourceflow.config.export.paragraphBeginningSpace,
    });
    const blockDOM = lute.Md2BlockDOM(`${markdown || ""}`);
    return `<div class="homepage-note">
    <div class="homepage-note__surface">
        <div class="protyle-content">
            <div class="protyle-wysiwyg" data-readonly="true">${blockDOM}</div>
        </div>
    </div>
</div>`;
};

const createMarkdownHomepageBundle = (markdown: string, css = "", script = "", config = "{}"): IHomepageTemplateBundle => ({
    html: renderMarkdownHomepageHTML(markdown),
    css: `${getMarkdownHomepageCSS()}\n${css || ""}`.trim(),
    script,
    config,
});

const getDefaultTemplateConfig = () => JSON.stringify({
    templateVersion: DEFAULT_TEMPLATE_VERSION,
    brand: homepageText("SOURCEFLOW / 源流笔记", "SOURCEFLOW"),
    signal: homepageText("LOCAL-FIRST · SELF-HOSTED · AI-READY", "LOCAL-FIRST · SELF-HOSTED · AI-READY"),
    title: homepageText("文档、任务与 AI，同屏协作。", "Docs, tasks, and AI in one workspace."),
    description: homepageText("源流把写作、任务、检索、备份、终端和扩展能力收束到同一套本地数据之上，让知识库与工作流真正共用一个界面。", "SourceFlow brings writing, tasks, retrieval, backup, terminal sessions, and extensions onto the same local data, so your knowledge base and workflow share one surface."),
    searchPlaceholder: homepageText("输入网址或搜索关键词", "Enter a URL or search keyword"),
    searchURL: "https://www.google.com/search?q=%s",
    searchButton: homepageText("打开", "Open"),
    featureTitle: homepageText("能力矩阵", "Capability Matrix"),
    featureLead: homepageText("它不只是笔记编辑器，而是一套围绕文档、任务、检索、备份和扩展能力组织起来的本地工作空间。", "It is not only a note editor, but a local workspace organized around documents, tasks, retrieval, backup, and extensibility."),
    pillars: [
        {
            label: homepageText("本地优先", "Local-First"),
            text: homepageText("默认把数据握在自己手里，再决定如何备份、同步与托管。", "Keep your data local by default, then decide how to back it up, sync it, or host it."),
        },
        {
            label: homepageText("结构化工作流", "Structured Workflow"),
            text: homepageText("文档、任务、事件、项目和视图共用一套信息模型，不必在多个工具之间来回切换。", "Documents, tasks, events, projects, and views share one model, so the workflow stays inside one tool."),
        },
        {
            label: homepageText("可扩展系统", "Extensible System"),
            text: homepageText("从 AI 到插件、终端和主页模板，都可以按你的工作方式继续生长。", "AI, plugins, terminal sessions, and homepage templates can all grow with your own workflow."),
        },
    ],
    quickActions: [
        {label: homepageText("全局搜索", "Search"), action: "search"},
        {label: homepageText("工作台", "Workbench"), action: "workbench"},
        {label: homepageText("最近文档", "Recent"), action: "recent"},
        {label: homepageText("新建笔记", "New Note"), action: "new-file"},
        {label: homepageText("备份设置", "Backup"), action: "backup"},
        {label: homepageText("命令面板", "Command"), action: "command"},
        {label: homepageText("帮助", "Help"), action: "help"},
    ],
    features: [
        {
            title: homepageText("收集中心", "Capture Center"),
            text: homepageText("统一收纳快速记录、网页导入、任务、事件、项目和附件，先进入收件箱，后续再整理。", "Collect quick notes, URL imports, tasks, events, projects, and attachments into one inbox-first workflow."),
        },
        {
            title: homepageText("块级链接", "Block References"),
            text: homepageText("直接引用段落、嵌入内容和建立双向关联，让笔记不再困在单篇文档里。", "Reference paragraphs, embed blocks, and create bidirectional links so notes are no longer trapped in isolated pages."),
        },
        {
            title: homepageText("工作台", "Workbench"),
            text: homepageText("把文档、任务、事件和项目放进同一视图，支持查询、分组、筛选、时间线与动态视图。", "Bring documents, tasks, events, and projects into one view with query, grouping, timeline, and live view support."),
        },
        {
            title: homepageText("检索与跳转", "Search and Navigation"),
            text: homepageText("支持全局搜索、反向链接、关系跳转和最近文档回溯，适合在大工作区里快速定位上下文。", "Use global search, backlinks, navigation jumps, and recent history to locate context quickly inside a large workspace."),
        },
        {
            title: homepageText("备份同步系统", "Backup Sync"),
            text: homepageText("支持整目录备份、自托管同步与恢复，以及 Cloudflare R2 / S3 / WebDAV / Local File System 等备份路径。", "Use full-directory backups, self-hosted sync and restore, plus Cloudflare R2 / S3 / WebDAV / Local File System as practical backup targets."),
        },
        {
            title: homepageText("AI 助手", "AI Assistant"),
            text: homepageText("统一管理模型配置、对话和内置 AI 功能，用于总结、润色、继续写作和日常问答。", "Manage model profiles, conversations, and built-in AI features in one place for summarizing, rewriting, drafting, and everyday assistance."),
        },
        {
            title: homepageText("终端集成", "Terminal Integration"),
            text: homepageText("把 PTY 会话直接放进工作台，一边记笔记一边跑命令、查输出、整理脚本流程。", "Run PTY sessions inside the workspace so you can take notes, execute commands, inspect output, and document your scripts side by side."),
        },
        {
            title: homepageText("插件与集市", "Plugins and Bazaar"),
            text: homepageText("支持插件运行时、独立集市与包管理，让工作流可以继续长出自己的工具层。", "Extend the workspace with the plugin runtime, independent bazaar, and package workflow."),
        },
        {
            title: homepageText("笔记外观", "Note Appearance"),
            text: homepageText("支持看板娘、启动页图片、笔记背景图和自定义光标，让工作区更有辨识度。", "Personalize the workspace with a mascot, startup image, note background, and custom cursor without changing the note content itself."),
        },
        {
            title: homepageText("主页定制", "Custom Homepage"),
            text: homepageText("右键笔记即可设为主页，也支持自定义 HTML / Markdown 模板，把常用文档做成个人首页。", "Set any note as the homepage from the context menu, or load custom HTML / Markdown templates to build a personal landing page."),
        },
    ],
}, null, 2);

const isBundledDefaultHomepageTemplate = (bundle: IHomepageTemplateBundle) => {
    return bundle.html.includes("sourceflow-default-homepage") ||
        bundle.css.includes(".sourceflow-home__shell{") ||
        bundle.css.includes(".sourceflow-home__surface{") ||
        bundle.html.includes("homepage-start__hero") ||
        bundle.html.includes("homepage-shell") ||
        bundle.html.includes("homepage-simple__hero") ||
        bundle.html.includes("homepage-default__panel") ||
        bundle.css.includes(".homepage-start__hero{position:relative;display:flex;") ||
        bundle.css.includes(".homepage-hero{position:relative;display:grid;") ||
        bundle.css.includes(".homepage-simple__hero,.homepage-simple__section{") ||
        bundle.css.includes(".homepage-default__panel{");
};

const isUpgradeableDefaultHomepageTemplate = (templatePath: string, bundle: IHomepageTemplateBundle) => {
    if (normalizeTemplatePath(templatePath) !== DEFAULT_TEMPLATE_PATH) {
        return false;
    }
    let configData: Record<string, any> = {};
    try {
        configData = bundle.config ? JSON.parse(bundle.config) : {};
    } catch (error) {
        return false;
    }
    if (Number(configData.templateVersion) >= DEFAULT_TEMPLATE_VERSION) {
        return false;
    }
    return isBundledDefaultHomepageTemplate(bundle);
};

const getDefaultTemplateBundle = (): IHomepageTemplateBundle => ({
    html: `<div class="sourceflow-default-homepage">
    <div class="sourceflow-home__shell">
        <div class="sourceflow-home__halo sourceflow-home__halo--rose" aria-hidden="true"></div>
        <div class="sourceflow-home__halo sourceflow-home__halo--cyan" aria-hidden="true"></div>
        <section class="sourceflow-home__surface">
            <div class="sourceflow-home__layout">
                <section class="sourceflow-home__hero">
                    <div class="sourceflow-home__brand" data-role="brand"></div>
                    <div class="sourceflow-home__signal" data-role="signal"></div>
                    <h1 class="sourceflow-home__title" data-role="title"></h1>
                    <p class="sourceflow-home__description" data-role="description"></p>
                    <div class="sourceflow-home__pillars" data-role="pillars"></div>
                    <form class="sourceflow-home__search" data-role="search-form">
                        <span class="sourceflow-home__prompt" aria-hidden="true">~/</span>
                        <input class="sourceflow-home__input" data-role="search-input" type="search" autocomplete="off" spellcheck="false">
                        <button class="sourceflow-home__submit" data-role="search-submit" type="submit"></button>
                    </form>
                    <div class="sourceflow-home__actions" data-role="quick-actions"></div>
                </section>
                <aside class="sourceflow-home__panel">
                    <div class="sourceflow-home__panel-head">
                        <h2 class="sourceflow-home__section-title" data-role="feature-title"></h2>
                        <span class="sourceflow-home__panel-meta" data-role="feature-count"></span>
                    </div>
                    <p class="sourceflow-home__section-lead" data-role="feature-lead"></p>
                    <div class="sourceflow-home__stack" data-role="features"></div>
                </aside>
            </div>
        </section>
    </div>
</div>`,
    css: `.sourceflow-default-homepage{min-height:100%;display:flex;align-items:flex-start;justify-content:center;padding:28px 18px 40px;box-sizing:border-box;color:var(--b3-theme-on-surface);font-family:"IBM Plex Sans","Avenir Next","Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}.sourceflow-home__shell{position:relative;width:min(1080px,100%)}.sourceflow-home__halo{position:absolute;border-radius:999px;filter:blur(12px);pointer-events:none;opacity:.82}.sourceflow-home__halo--rose{width:260px;height:260px;left:-40px;top:-18px;background:radial-gradient(circle,rgba(255,132,167,.16),rgba(255,132,167,0) 72%)}.sourceflow-home__halo--cyan{width:320px;height:320px;right:-78px;top:28px;background:radial-gradient(circle,rgba(67,198,255,.15),rgba(67,198,255,0) 72%)}.sourceflow-home__surface{position:relative;overflow:hidden;padding:28px;border-radius:30px;background:linear-gradient(180deg,color-mix(in srgb,var(--b3-theme-surface) 96%,transparent),color-mix(in srgb,var(--b3-theme-background) 94%,transparent));border:1px solid color-mix(in srgb,var(--b3-border-color) 84%,transparent);box-shadow:0 28px 64px rgba(15,23,42,.08),inset 0 1px 0 rgba(255,255,255,.05)}.sourceflow-home__surface::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,0) 22%),repeating-linear-gradient(90deg,rgba(148,163,184,.05) 0,rgba(148,163,184,.05) 1px,transparent 1px,transparent 96px);mask-image:linear-gradient(180deg,rgba(0,0,0,.38),transparent 78%);pointer-events:none}.sourceflow-home__layout,.sourceflow-home__hero,.sourceflow-home__panel{position:relative;z-index:1}.sourceflow-home__layout{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(320px,.85fr);gap:18px;align-items:stretch}.sourceflow-home__hero{display:flex;flex-direction:column;gap:14px;padding:6px 8px 4px}.sourceflow-home__brand,.sourceflow-home__signal,.sourceflow-home__prompt,.sourceflow-home__panel-meta,.sourceflow-home__stack-index,.sourceflow-home__pillar-label{font-family:"IBM Plex Mono","JetBrains Mono","SFMono-Regular","Cascadia Mono","Consolas",monospace}.sourceflow-home__brand{display:inline-flex;align-items:center;justify-content:center;width:max-content;padding:8px 12px;border-radius:999px;background:color-mix(in srgb,var(--b3-theme-background) 90%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--b3-theme-primary) 18%,transparent);font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}.sourceflow-home__signal{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--b3-theme-on-surface-light)}.sourceflow-home__title{margin:2px 0 0;max-width:14ch;font-size:clamp(30px,3.6vw,46px);line-height:1.08;letter-spacing:-.045em;font-weight:700}.sourceflow-home__description{max-width:58ch;margin:0;font-size:14px;line-height:1.88;color:var(--b3-theme-on-surface-light)}.sourceflow-home__pillars{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;max-width:760px}.sourceflow-home__pillar{padding:12px 12px 10px;border-radius:16px;background:linear-gradient(180deg,color-mix(in srgb,var(--b3-theme-surface) 90%,transparent),color-mix(in srgb,var(--b3-theme-background) 94%,transparent));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--b3-border-color) 68%,transparent)}.sourceflow-home__pillar-label{font-size:11px;letter-spacing:.14em;color:var(--b3-theme-primary);text-transform:uppercase}.sourceflow-home__pillar-text{margin-top:6px;font-size:12px;line-height:1.7;color:var(--b3-theme-on-surface-light)}.sourceflow-home__search{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;max-width:680px;margin-top:2px;padding:8px;border-radius:18px;background:color-mix(in srgb,var(--b3-theme-background) 90%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--b3-border-color) 88%,transparent)}.sourceflow-home__prompt{padding:0 8px;font-size:14px;color:var(--b3-theme-primary)}.sourceflow-home__input{height:46px;padding:0;border:0;background:transparent;color:var(--b3-theme-on-surface);font-size:15px;outline:0}.sourceflow-home__input::placeholder{color:var(--b3-theme-on-surface-light)}.sourceflow-home__submit{height:46px;min-width:92px;padding:0 16px;border:0;border-radius:12px;background:linear-gradient(135deg,color-mix(in srgb,var(--b3-theme-primary) 86%,#0f172a),color-mix(in srgb,var(--b3-theme-primary) 62%,#38bdf8));color:#fff;font-size:13px;font-weight:700;letter-spacing:.04em;cursor:pointer;transition:transform .18s ease,opacity .18s ease,box-shadow .18s ease;box-shadow:0 10px 24px rgba(15,23,42,.15)}.sourceflow-home__submit:hover{transform:translateY(-1px);opacity:.96}.sourceflow-home__actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:2px}.sourceflow-home__action{height:34px;padding:0 12px;border:0;border-radius:999px;background:color-mix(in srgb,var(--b3-theme-surface) 88%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--b3-border-color) 74%,transparent);color:var(--b3-theme-on-surface);font-size:12px;font-weight:600;cursor:pointer;transition:var(--b3-transition)}.sourceflow-home__action:hover{background:color-mix(in srgb,var(--b3-theme-background-light) 92%,transparent);transform:translateY(-1px)}.sourceflow-home__panel{display:flex;flex-direction:column;gap:10px;padding:18px;border-radius:22px;background:linear-gradient(180deg,color-mix(in srgb,var(--b3-theme-surface) 84%,transparent),color-mix(in srgb,var(--b3-theme-background) 94%,transparent));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--b3-border-color) 72%,transparent)}.sourceflow-home__panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.sourceflow-home__panel-meta{font-size:11px;letter-spacing:.14em;color:var(--b3-theme-on-surface-light)}.sourceflow-home__section-title{margin:0;font-size:18px;line-height:1.4}.sourceflow-home__section-lead{margin:0;font-size:13px;line-height:1.8;color:var(--b3-theme-on-surface-light)}.sourceflow-home__stack{display:grid;gap:8px;margin-top:4px}.sourceflow-home__stack-item{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;padding:12px 0;border-top:1px solid color-mix(in srgb,var(--b3-border-color) 56%,transparent)}.sourceflow-home__stack-item:first-child{border-top:0;padding-top:6px}.sourceflow-home__stack-index{padding-top:1px;font-size:11px;letter-spacing:.14em;color:var(--b3-theme-primary)}.sourceflow-home__stack-body{min-width:0}.sourceflow-home__stack-title{font-size:14px;font-weight:700;line-height:1.45}.sourceflow-home__stack-text{margin-top:4px;font-size:12px;line-height:1.75;color:var(--b3-theme-on-surface-light)}@media (max-width:900px){.sourceflow-home__layout{grid-template-columns:1fr}.sourceflow-home__pillars{grid-template-columns:1fr}.sourceflow-home__panel{padding:16px}.sourceflow-home__title{max-width:18ch}}@media (max-width:720px){.sourceflow-default-homepage{padding:14px 12px 24px}.sourceflow-home__surface{padding:18px;border-radius:22px}.sourceflow-home__hero{padding:2px 0 0}.sourceflow-home__title{font-size:clamp(26px,9vw,36px)}.sourceflow-home__search{grid-template-columns:auto minmax(0,1fr)}.sourceflow-home__submit{grid-column:1 / -1;width:100%}.sourceflow-home__actions{gap:8px}.sourceflow-home__action{flex:1 1 calc(50% - 8px);justify-content:center}}`,
    script: `(function () {
    const config = api.config || {};
    const brand = container.querySelector('[data-role="brand"]');
    const signal = container.querySelector('[data-role="signal"]');
    const title = container.querySelector('[data-role="title"]');
    const description = container.querySelector('[data-role="description"]');
    const pillarsElement = container.querySelector('[data-role="pillars"]');
    const searchForm = container.querySelector('[data-role="search-form"]');
    const searchInput = container.querySelector('[data-role="search-input"]');
    const searchSubmit = container.querySelector('[data-role="search-submit"]');
    const featureTitle = container.querySelector('[data-role="feature-title"]');
    const featureLead = container.querySelector('[data-role="feature-lead"]');
    const featureCount = container.querySelector('[data-role="feature-count"]');
    const featuresElement = container.querySelector('[data-role="features"]');
    const quickActionsElement = container.querySelector('[data-role="quick-actions"]');
    if (brand) brand.textContent = config.brand || '';
    if (signal) signal.textContent = config.signal || '';
    if (title) title.textContent = config.title || '';
    if (description) description.textContent = config.description || '';
    const pillars = Array.isArray(config.pillars) ? config.pillars : [];
    if (pillarsElement) {
        pillarsElement.innerHTML = pillars.map((item) => {
            return '<article class="sourceflow-home__pillar"><div class="sourceflow-home__pillar-label">' + api.escape(item.label || '') + '</div><div class="sourceflow-home__pillar-text">' + api.escape(item.text || '') + '</div></article>';
        }).join('');
    }
    if (searchInput) searchInput.placeholder = config.searchPlaceholder || '';
    if (searchSubmit) searchSubmit.textContent = config.searchButton || 'Open';
    if (featureTitle) featureTitle.textContent = config.featureTitle || '';
    if (featureLead) featureLead.textContent = config.featureLead || '';
    const features = Array.isArray(config.features) ? config.features : [];
    if (featureCount) featureCount.textContent = String(features.length || 0).padStart(2, '0');
    if (featuresElement) {
        featuresElement.innerHTML = features.map((item, index) => {
            return '<article class="sourceflow-home__stack-item"><div class="sourceflow-home__stack-index">' + String(index + 1).padStart(2, '0') + '</div><div class="sourceflow-home__stack-body"><div class="sourceflow-home__stack-title">' + api.escape(item.title || '') + '</div><div class="sourceflow-home__stack-text">' + api.escape(item.text || '') + '</div></div></article>';
        }).join('');
    }
    const quickActions = Array.isArray(config.quickActions) ? config.quickActions : [];
    if (quickActionsElement) {
        quickActionsElement.innerHTML = quickActions.map((item) => {
            return '<button class="sourceflow-home__action" type="button" data-homepage-action="' + api.escapeAttr(item.action || '') + '">' + api.escape(item.label || '') + '</button>';
        }).join('');
    }
    const openSearchTarget = (rawValue) => {
        const keyword = (rawValue || '').trim();
        if (!keyword) {
            return;
        }
        const looksLikeURL = /^(?:[a-z][a-z0-9+.-]*:|localhost(?::\\d+)?(?:[/?#]|$)|(?:\\d{1,3}\\.){3}\\d{1,3}(?::\\d+)?(?:[/?#]|$))/i.test(keyword) || (!/\\s/.test(keyword) && /[./]/.test(keyword));
        if (looksLikeURL) {
            api.openExternal(keyword);
            return;
        }
        api.searchWeb(keyword, config.searchURL || 'https://www.google.com/search?q=%s');
    };
    if (searchForm) {
        searchForm.addEventListener('submit', function (event) {
            event.preventDefault();
            openSearchTarget(searchInput && searchInput.value);
        });
    }
})();`,
    config: getDefaultTemplateConfig(),
});

const ensureDefaultHomepageTemplate = async () => {
    if (window.sourceflow.config.readonly || window.sourceflow.isPublish) {
        return;
    }
    const defaults = getDefaultTemplateBundle();
    const currentBundle = await loadHomepageTemplateBundle(DEFAULT_TEMPLATE_PATH);
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

const loadHomepageTemplateBundle = async (templatePath: string): Promise<IHomepageTemplateBundle> => {
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

const escapeHTML = (text: string) => `${text || ""}`.replace(/[&<>"']/g, (match) => {
    switch (match) {
        case "&":
            return "&amp;";
        case "<":
            return "&lt;";
        case ">":
            return "&gt;";
        case "\"":
            return "&quot;";
        default:
            return "&#39;";
    }
});

const getNoteHomepageCSS = () => `.homepage-note__meta{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:0 28px 18px;margin-bottom:18px;border-bottom:1px solid color-mix(in srgb,var(--b3-border-color) 72%,transparent)}.homepage-note__info{display:flex;flex-direction:column;gap:6px;min-width:0}.homepage-note__eyebrow{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--b3-theme-primary)}.homepage-note__title{font-size:24px;font-weight:700;line-height:1.3;color:var(--b3-theme-on-surface);word-break:break-word}@media (max-width:720px){.homepage-note__meta{padding:0 18px 16px;flex-direction:column;align-items:stretch}.homepage-note__title{font-size:20px}}`;

const createNoteHomepageBundle = (title: string, content: string): IHomepageTemplateBundle => ({
    html: `<div class="homepage-note">
    <div class="homepage-note__surface">
        <div class="homepage-note__meta">
            <div class="homepage-note__info">
                <div class="homepage-note__eyebrow">${escapeHTML(homepageText("主页笔记", "Homepage Note"))}</div>
                <div class="homepage-note__title">${escapeHTML(title || homepageText("未命名主页笔记", "Untitled Homepage Note"))}</div>
            </div>
        </div>
        <div class="protyle-content">
            <div class="protyle-wysiwyg" data-readonly="true">${content}</div>
        </div>
    </div>
</div>`,
    css: `${getMarkdownHomepageCSS()}\n${getNoteHomepageCSS()}`.trim(),
    script: "",
    config: "{}",
});

const normalizeExternalURL = (url: string) => /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;

const getHomepageToolbarHTML = (state: IHomepageState) => {
    const actions: string[] = [];
    if (state.sourceType === "note" && state.noteId) {
        actions.push(`<button class="homepage-page__chip" type="button" data-homepage-action="open-homepage-source">${escapeHTML(homepageText("编辑主页笔记", "Edit Homepage Note"))}</button>`);
    }
    actions.push(`<button class="homepage-page__chip" type="button" data-homepage-action="reset-default-homepage">${escapeHTML(homepageText("恢复默认主页", "Reset Default Homepage"))}</button>`);
    return `<div class="homepage-page__toolbar"><div class="homepage-page__toolbar-inner"><div class="homepage-page__toolbar-actions">${actions.join("")}</div></div></div>`;
};

const openHomepageExternal = (url: string) => {
    const text = `${url || ""}`.trim();
    if (!text) {
        return;
    }
    const link = normalizeExternalURL(text);
    /// #if !BROWSER
    shell.openExternal(link).catch((error) => {
        showMessage(error instanceof Error ? error.message : `${error}`, 5000, "error");
    });
    /// #else
    openByMobile(link);
    /// #endif
};

const openTemplateFolder = (templatePath: string) => {
    /// #if !BROWSER
    const relativeDataPath = templatePath.replace(/^\/data\/?/, "");
    const absolute = `${window.sourceflow.config.system.dataDir.replace(/[\\\/]+$/, "").replace(/\\/g, "/")}/${relativeDataPath}`;
    openBy(`file://${absolute}`, "folder");
    /// #else
    showMessage(templatePath);
    /// #endif
};

const openHomepageSource = (app: App, state: IHomepageState) => {
    if (state.sourceType === "note" && state.noteId) {
        /// #if MOBILE
        openMobileFileById(app, state.noteId, [Constants.CB_GET_SCROLL]);
        /// #else
        void openFileById({app, id: state.noteId, action: [Constants.CB_GET_SCROLL]});
        /// #endif
        return;
    }
    openTemplateFolder(state.templatePath);
};

const hasHomepageTemplateSource = async (templatePath: string) => {
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

const loadHomepageNoteBundle = async (state: IHomepageState): Promise<IHomepageTemplateBundle | undefined> => {
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

const openHomepageSearch = (app: App) => {
    /// #if MOBILE
    popSearch(app);
    /// #else
    openSearch({
        app,
        hotkey: Constants.DIALOG_GLOBALSEARCH,
    });
    /// #endif
};

const openHomepageRecentDocs = (app: App) => {
    /// #if MOBILE
    openMobileRecentDocs(app);
    /// #else
    openDesktopRecentDocs();
    /// #endif
};

const openHomepageWorkbench = async (app: App) => {
    const {openWorkbenchDialog} = await loadWorkbenchDialogModule();
    openWorkbenchDialog(app);
};

const openHomepageCommandPanel = async (app: App) => {
    const {commandPanel} = await loadCommandPanelModule();
    commandPanel(app);
};

const openHomepageSettings = async (app: App) => {
    const {openSetting} = await loadConfigModule();
    openSetting(app);
};

const openHomepageBackupSetting = async (app: App) => {
    const {openSetting} = await loadConfigModule();
    /// #if MOBILE
    openSetting(app);
    /// #else
    const dialog = openSetting(app);
    dialog?.element.querySelector('.b3-tab-bar [data-name="repos"]')?.dispatchEvent(new CustomEvent("click"));
    /// #endif
};

const runHomepageBuiltinAction = async (app: App, action: string, refresh: () => Promise<void>, state: IHomepageState) => {
    switch (`${action || ""}`.trim()) {
        case "open-homepage-source":
        case "edit-note-source":
            openHomepageSource(app, state);
            break;
        case "search":
            openHomepageSearch(app);
            break;
        case "workbench":
            await openHomepageWorkbench(app);
            break;
        case "command":
            await openHomepageCommandPanel(app);
            break;
        case "config":
            await openHomepageSettings(app);
            break;
        case "backup":
            await openHomepageBackupSetting(app);
            break;
        case "recent":
            openHomepageRecentDocs(app);
            break;
        case "history":
            openHistory(app);
            break;
        case "new-file":
            if (!window.sourceflow.config.readonly) {
                newFile({app, useSavePath: true});
            }
            break;
        case "new-notebook":
            if (!window.sourceflow.config.readonly) {
                newNotebook();
            }
            break;
        case "help":
            mountHelp();
            break;
        case "open-template-folder":
            openTemplateFolder(state.templatePath);
            break;
        case "switch-template": {
            const nextPath = window.prompt(homepageText("请输入主页模板目录，或单个 html/md 文件路径", "Enter the homepage template folder path, or a single html/md file path"), state.templatePath);
            if (!nextPath) {
                break;
            }
            const normalized = normalizeTemplatePath(nextPath);
            if (!await hasHomepageTemplateSource(normalized)) {
                showMessage(homepageText("主页入口不存在，请确认目录里有 index.html / index.md，或直接指定单个 html/md 文件", "Homepage source is missing. Make sure the folder contains index.html / index.md, or point to a single html/md file"), 5000, "error");
                break;
            }
            state.templatePath = normalized;
            saveHomepageState(state);
            await refresh();
            break;
        }
        case "refresh":
            await refresh();
            break;
        case "reset-default-homepage": {
            const nextState = resetHomepageToDefault();
            state.sourceType = nextState.sourceType;
            state.noteId = nextState.noteId;
            state.templatePath = nextState.templatePath;
            await refresh();
            break;
        }
    }
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
        configData = bundle.config ? JSON.parse(bundle.config) : {};
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
        // Execute template logic with a narrow helper surface.
        new Function("container", "api", "state", bundle.script)(container, {
            config: configData,
            escape: escapeHTML,
            escapeAttr: escapeHTML,
            openExternal: openHomepageExternal,
            searchWeb: (keyword: string, searchURL: string) => {
                const queryURL = `${searchURL || "https://www.google.com/search?q=%s"}`.replace("%s", encodeURIComponent(keyword));
                openHomepageExternal(queryURL);
            },
            invoke: (action: string) => runHomepageBuiltinAction(app, action, refresh, state),
        }, state);
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

/// #if !MOBILE
const createHomepageTab = (app: App, titleless = false) => new Tab({
    ...(titleless ? {} : {
        icon: "iconLayout",
        title: homepageText("主页", "Home"),
    }),
    panel: `<div class="homepage-page"></div>`,
    callback(tab: Tab) {
        tab.panelElement.setAttribute("data-homepage-tab", HOMEPAGE_MARK);
        if (tab.headElement) {
            tab.headElement.setAttribute("data-homepage-tab", HOMEPAGE_MARK);
        }
        void mountHomepageIntoContainer(app, tab.panelElement);
    }
});

const findHomepageTab = () => {
    return getAllTabs().find((item) => item.panelElement?.getAttribute("data-homepage-tab") === HOMEPAGE_MARK);
};
/// #endif

export const newHomepageEmptyTab = (app: App) => {
    /// #if MOBILE
    void app;
    return null as never;
    /// #else
    return createHomepageTab(app, true);
    /// #endif
};

export const openHomepageTab = (app: App) => {
    /// #if MOBILE
    void app;
    return null as never;
    /// #else
    const existingTab = findHomepageTab();
    if (existingTab) {
        if (existingTab.headElement) {
            existingTab.parent.switchTab(existingTab.headElement, true);
            existingTab.parent.showHeading();
        }
        return existingTab;
    }
    let wnd: Wnd = undefined;
    const activeWndElement = document.querySelector(".layout__wnd--active");
    if (activeWndElement) {
        wnd = getInstanceById(activeWndElement.getAttribute("data-id")) as Wnd;
    }
    if (!wnd) {
        wnd = getWndByLayout(window.sourceflow.layout.centerLayout);
    }
    const tab = createHomepageTab(app, false);
    wnd.addTab(tab);
    return tab;
    /// #endif
};

const hasAnyRealTabs = () => {
    /// #if MOBILE
    return false;
    /// #else
    return getAllTabs().some((item) => !!item?.headElement);
    /// #endif
};

export const openStartupHomepage = (app: App) => {
    /// #if MOBILE
    void app;
    return;
    /// #else
    try {
        if (findHomepageTab() || hasAnyRealTabs()) {
            return;
        }
        openHomepageTab(app);
    } catch (error) {
        console.error("open startup homepage failed", error);
    }
    /// #endif
};
