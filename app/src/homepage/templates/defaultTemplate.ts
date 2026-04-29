import {DEFAULT_TEMPLATE_PATH, DEFAULT_TEMPLATE_VERSION, homepageText} from "../constants";
import {parseHomepageTemplateConfig} from "../templateConfig";
import {IHomepageTemplateBundle} from "../types";
import {normalizeTemplatePath} from "../state";

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

export const isBundledDefaultHomepageTemplate = (bundle: IHomepageTemplateBundle) => {
    return bundle.html.includes("sourceflow-default-homepage") ||
        bundle.css.includes(".sourceflow-home__shell") ||
        bundle.css.includes(".sourceflow-home__surface") ||
        bundle.html.includes("homepage-start__hero") ||
        bundle.html.includes("homepage-shell") ||
        bundle.html.includes("homepage-simple__hero") ||
        bundle.html.includes("homepage-default__panel") ||
        bundle.css.includes(".homepage-start__hero") ||
        bundle.css.includes(".homepage-hero") ||
        bundle.css.includes(".homepage-simple__hero") ||
        bundle.css.includes(".homepage-default__panel");
};

export const isUpgradeableDefaultHomepageTemplate = (templatePath: string, bundle: IHomepageTemplateBundle) => {
    if (normalizeTemplatePath(templatePath) !== DEFAULT_TEMPLATE_PATH) {
        return false;
    }
    let configData: Record<string, any> = {};
    try {
        configData = parseHomepageTemplateConfig(bundle.config);
    } catch (error) {
        return false;
    }
    if (Number(configData.templateVersion) >= DEFAULT_TEMPLATE_VERSION) {
        return false;
    }
    return isBundledDefaultHomepageTemplate(bundle);
};

export const getDefaultTemplateBundle = (): IHomepageTemplateBundle => ({
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
    css: `
.sourceflow-default-homepage {
    min-height: 100%;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 28px 18px 40px;
    box-sizing: border-box;
    color: var(--b3-theme-on-surface);
    font-family: "IBM Plex Sans", "Avenir Next", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}

.sourceflow-home__shell {
    position: relative;
    width: min(1080px, 100%);
}

.sourceflow-home__halo {
    position: absolute;
    border-radius: 999px;
    filter: blur(12px);
    pointer-events: none;
    opacity: 0.82;
}

.sourceflow-home__halo--rose {
    width: 260px;
    height: 260px;
    left: -40px;
    top: -18px;
    background: radial-gradient(circle, rgba(255, 132, 167, 0.16), rgba(255, 132, 167, 0) 72%);
}

.sourceflow-home__halo--cyan {
    width: 320px;
    height: 320px;
    right: -78px;
    top: 28px;
    background: radial-gradient(circle, rgba(67, 198, 255, 0.15), rgba(67, 198, 255, 0) 72%);
}

.sourceflow-home__surface {
    position: relative;
    overflow: hidden;
    padding: 28px;
    border-radius: 30px;
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--b3-theme-surface) 96%, transparent),
        color-mix(in srgb, var(--b3-theme-background) 94%, transparent)
    );
    border: 1px solid color-mix(in srgb, var(--b3-border-color) 84%, transparent);
    box-shadow: 0 28px 64px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.sourceflow-home__surface::before {
    content: "";
    position: absolute;
    inset: 0;
    background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0) 22%),
        repeating-linear-gradient(
            90deg,
            rgba(148, 163, 184, 0.05) 0,
            rgba(148, 163, 184, 0.05) 1px,
            transparent 1px,
            transparent 96px
        );
    mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.38), transparent 78%);
    pointer-events: none;
}

.sourceflow-home__layout,
.sourceflow-home__hero,
.sourceflow-home__panel {
    position: relative;
    z-index: 1;
}

.sourceflow-home__layout {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
    gap: 18px;
    align-items: stretch;
}

.sourceflow-home__hero {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 6px 8px 4px;
}

.sourceflow-home__brand,
.sourceflow-home__signal,
.sourceflow-home__prompt,
.sourceflow-home__panel-meta,
.sourceflow-home__stack-index,
.sourceflow-home__pillar-label {
    font-family: "IBM Plex Mono", "JetBrains Mono", "SFMono-Regular", "Cascadia Mono", "Consolas", monospace;
}

.sourceflow-home__brand {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: max-content;
    padding: 8px 12px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--b3-theme-background) 90%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--b3-theme-primary) 18%, transparent);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
}

.sourceflow-home__signal {
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--b3-theme-on-surface-light);
}

.sourceflow-home__title {
    margin: 2px 0 0;
    max-width: 14ch;
    font-size: clamp(30px, 3.6vw, 46px);
    line-height: 1.08;
    letter-spacing: -0.045em;
    font-weight: 700;
}

.sourceflow-home__description {
    max-width: 58ch;
    margin: 0;
    font-size: 14px;
    line-height: 1.88;
    color: var(--b3-theme-on-surface-light);
}

.sourceflow-home__pillars {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    max-width: 760px;
}

.sourceflow-home__pillar {
    padding: 12px 12px 10px;
    border-radius: 16px;
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--b3-theme-surface) 90%, transparent),
        color-mix(in srgb, var(--b3-theme-background) 94%, transparent)
    );
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--b3-border-color) 68%, transparent);
}

.sourceflow-home__pillar-label {
    font-size: 11px;
    letter-spacing: 0.14em;
    color: var(--b3-theme-primary);
    text-transform: uppercase;
}

.sourceflow-home__pillar-text {
    margin-top: 6px;
    font-size: 12px;
    line-height: 1.7;
    color: var(--b3-theme-on-surface-light);
}

.sourceflow-home__search {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    max-width: 680px;
    margin-top: 2px;
    padding: 8px;
    border-radius: 18px;
    background: color-mix(in srgb, var(--b3-theme-background) 90%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--b3-border-color) 88%, transparent);
}

.sourceflow-home__prompt {
    padding: 0 8px;
    font-size: 14px;
    color: var(--b3-theme-primary);
}

.sourceflow-home__input {
    height: 46px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--b3-theme-on-surface);
    font-size: 15px;
    outline: 0;
}

.sourceflow-home__input::placeholder {
    color: var(--b3-theme-on-surface-light);
}

.sourceflow-home__submit {
    height: 46px;
    min-width: 92px;
    padding: 0 16px;
    border: 0;
    border-radius: 12px;
    background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--b3-theme-primary) 86%, #0f172a),
        color-mix(in srgb, var(--b3-theme-primary) 62%, #38bdf8)
    );
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: transform 0.18s ease, opacity 0.18s ease, box-shadow 0.18s ease;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.15);
}

.sourceflow-home__submit:hover {
    transform: translateY(-1px);
    opacity: 0.96;
}

.sourceflow-home__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 2px;
}

.sourceflow-home__action {
    height: 34px;
    padding: 0 12px;
    border: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--b3-theme-surface) 88%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--b3-border-color) 74%, transparent);
    color: var(--b3-theme-on-surface);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: var(--b3-transition);
}

.sourceflow-home__action:hover {
    background: color-mix(in srgb, var(--b3-theme-background-light) 92%, transparent);
    transform: translateY(-1px);
}

.sourceflow-home__panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 18px;
    border-radius: 22px;
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--b3-theme-surface) 84%, transparent),
        color-mix(in srgb, var(--b3-theme-background) 94%, transparent)
    );
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--b3-border-color) 72%, transparent);
}

.sourceflow-home__panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.sourceflow-home__panel-meta {
    font-size: 11px;
    letter-spacing: 0.14em;
    color: var(--b3-theme-on-surface-light);
}

.sourceflow-home__section-title {
    margin: 0;
    font-size: 18px;
    line-height: 1.4;
}

.sourceflow-home__section-lead {
    margin: 0;
    font-size: 13px;
    line-height: 1.8;
    color: var(--b3-theme-on-surface-light);
}

.sourceflow-home__stack {
    display: grid;
    gap: 8px;
    margin-top: 4px;
}

.sourceflow-home__stack-item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 12px;
    padding: 12px 0;
    border-top: 1px solid color-mix(in srgb, var(--b3-border-color) 56%, transparent);
}

.sourceflow-home__stack-item:first-child {
    border-top: 0;
    padding-top: 6px;
}

.sourceflow-home__stack-index {
    padding-top: 1px;
    font-size: 11px;
    letter-spacing: 0.14em;
    color: var(--b3-theme-primary);
}

.sourceflow-home__stack-body {
    min-width: 0;
}

.sourceflow-home__stack-title {
    font-size: 14px;
    font-weight: 700;
    line-height: 1.45;
}

.sourceflow-home__stack-text {
    margin-top: 4px;
    font-size: 12px;
    line-height: 1.75;
    color: var(--b3-theme-on-surface-light);
}

@media (max-width: 900px) {
    .sourceflow-home__layout {
        grid-template-columns: 1fr;
    }

    .sourceflow-home__pillars {
        grid-template-columns: 1fr;
    }

    .sourceflow-home__panel {
        padding: 16px;
    }

    .sourceflow-home__title {
        max-width: 18ch;
    }
}

@media (max-width: 720px) {
    .sourceflow-default-homepage {
        padding: 14px 12px 24px;
    }

    .sourceflow-home__surface {
        padding: 18px;
        border-radius: 22px;
    }

    .sourceflow-home__hero {
        padding: 2px 0 0;
    }

    .sourceflow-home__title {
        font-size: clamp(26px, 9vw, 36px);
    }

    .sourceflow-home__search {
        grid-template-columns: auto minmax(0, 1fr);
    }

    .sourceflow-home__submit {
        grid-column: 1 / -1;
        width: 100%;
    }

    .sourceflow-home__actions {
        gap: 8px;
    }

    .sourceflow-home__action {
        flex: 1 1 calc(50% - 8px);
        justify-content: center;
    }
}
`.trim(),
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
