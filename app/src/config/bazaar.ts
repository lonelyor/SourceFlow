import {showMessage} from "../dialog/message";
import {fetchPost} from "../util/fetch";
import {confirmDialog} from "../dialog/confirmDialog";
import {Dialog} from "../dialog";
import {highlightRender} from "../protyle/render/highlightRender";
import {saveLayout} from "../layout/util";
import {Constants} from "../constants";
/// #if !BROWSER
import * as path from "path";
/// #endif
import {getFrontend, isBrowser} from "../util/functions";
import {setStorageVal, writeText} from "../protyle/util/compatibility";
import {hasClosestByAttribute, hasClosestByClassName} from "../protyle/util/hasClosest";
import {Plugin} from "../plugin";
import {App} from "../index";
import {escapeAttr, escapeHtml} from "../util/escape";
import {uninstall} from "../plugin/uninstall";
import {afterLoadPlugin, loadPlugin, loadPlugins} from "../plugin/loader";
import {useShell} from "../util/pathName";

type TBazaarSourceKey =
    "bazaarHash" |
    "bazaarStageBaseURL" |
    "bazaarPackageBaseURL" |
    "bazaarStatBaseURL" |
    "bazaarReadmeCDNBaseURL" |
    "bazaarVersionInfoURL";

const bazaarIsZh = () => {
    const lang = `${window.sourceflow?.config?.lang || navigator.language || ""}`.toLowerCase();
    return lang.startsWith("zh");
};

const bazaarText = (zh: string, en: string) => bazaarIsZh() ? zh : en;
const bazaarDefaultAuthor = "By lonelyor";

const getBazaarSourceFields = (): Array<{key: TBazaarSourceKey, label: string, placeholder: string}> => ([
    {key: "bazaarHash", label: bazaarText("集市哈希", "Bazaar Hash"), placeholder: bazaarText("自动获取失败时使用", "Fallback when auto fetch fails")},
    {key: "bazaarVersionInfoURL", label: bazaarText("版本信息地址", "Version Info URL"), placeholder: bazaarText("留空则使用内置默认值", "Leave empty to use the built-in default")},
    {key: "bazaarStageBaseURL", label: bazaarText("清单基地址", "Stage Base URL"), placeholder: bazaarText("留空则使用内置默认值", "Leave empty to use the built-in default")},
    {key: "bazaarPackageBaseURL", label: bazaarText("包基地址", "Package Base URL"), placeholder: bazaarText("留空则使用内置默认值", "Leave empty to use the built-in default")},
    {key: "bazaarStatBaseURL", label: bazaarText("统计基地址", "Stat Base URL"), placeholder: bazaarText("留空则使用内置默认值", "Leave empty to use the built-in default")},
    {key: "bazaarReadmeCDNBaseURL", label: bazaarText("README CDN 基地址", "README CDN Base URL"), placeholder: bazaarText("留空则使用内置默认值", "Leave empty to use the built-in default")},
]);

const sourceflowGitHubBazaarPreset: Record<TBazaarSourceKey, string> = {
    bazaarHash: "",
    bazaarVersionInfoURL: "https://lonelyor.github.io/sourceflow-bazaar/version.json",
    bazaarStageBaseURL: "https://lonelyor.github.io/sourceflow-bazaar",
    bazaarPackageBaseURL: "https://lonelyor.github.io/sourceflow-bazaar",
    bazaarStatBaseURL: "https://lonelyor.github.io/sourceflow-bazaar/stat",
    bazaarReadmeCDNBaseURL: "https://cdn.jsdelivr.net/gh",
};

const validateBazaarSourceURL = (label: string, value: string) => {
    if (!value) {
        return true;
    }
    try {
        new URL(value);
        return true;
    } catch (e) {
        showMessage(bazaarText(`${label} 无效`, `${label} is invalid`));
        return false;
    }
};

const matchBazaarItem = (item: IBazaarItem, dataObj: {repoURL?: string, name?: string}) => {
    if (dataObj.repoURL) {
        return item.repoURL === dataObj.repoURL;
    }
    return item.name === dataObj.name;
};

const getBazaarInstallSourceLabel = (item: IBazaarItem) => {
    switch (`${item.installSource || ""}`) {
        case "local-zip":
            return bazaarText("本地 ZIP 导入", "Imported from local ZIP");
        case "github-bazaar":
            return bazaarText("SourceFlow 集市", "SourceFlow Bazaar");
        default:
            return "";
    }
};

const getBazaarIntegritySummary = (item: IBazaarItem) => {
    const value = `${item.installIntegrity || item.archiveSHA256 || ""}`.trim();
    if (!value) {
        return "";
    }
    if (value.length <= 24) {
        return value;
    }
    return `${value.slice(0, 12)}...${value.slice(-12)}`;
};

const getPluginPermissionInfo = (permission: string) => {
    const isZh = bazaarIsZh();
    const map: Record<string, {label: string, desc: string}> = {
        "storage": isZh ? {label: "本地存储", desc: "允许插件保存私有配置和状态。"} : {label: "Storage", desc: "Allow the plugin to store private settings and state."},
        "ui.topbar": isZh ? {label: "顶部栏", desc: "允许插件在顶部栏添加入口。"} : {label: "Top Bar", desc: "Allow the plugin to add entries to the top bar."},
        "ui.statusbar": isZh ? {label: "状态栏", desc: "允许插件在底部状态栏显示信息。"} : {label: "Status Bar", desc: "Allow the plugin to show information in the status bar."},
        "ui.command": isZh ? {label: "命令面板", desc: "允许插件注册命令面板命令。"} : {label: "Command Palette", desc: "Allow the plugin to register command palette commands."},
        "ui.dock": isZh ? {label: "侧边栏", desc: "允许插件提供侧边栏或停靠区入口。"} : {label: "Dock", desc: "Allow the plugin to provide dock/sidebar entries."},
        "ui.setting": isZh ? {label: "设置页", desc: "允许插件添加设置面板。"} : {label: "Settings", desc: "Allow the plugin to add settings panels."},
        "ui.tab": isZh ? {label: "页签", desc: "允许插件打开页签或窗口。"} : {label: "Tabs", desc: "Allow the plugin to open tabs or windows."},
        "ui.dialog": isZh ? {label: "对话框", desc: "允许插件弹出对话框。"} : {label: "Dialogs", desc: "Allow the plugin to open dialogs."},
        "ui.float": isZh ? {label: "浮窗", desc: "允许插件创建浮动界面。"} : {label: "Float UI", desc: "Allow the plugin to create floating UI."},
        "ui.notification": isZh ? {label: "通知", desc: "允许插件发送系统通知或提醒。"} : {label: "Notifications", desc: "Allow the plugin to send system notifications."},
        "workspace.read": isZh ? {label: "读取工作区", desc: "允许插件读取工作区数据。"} : {label: "Workspace Read", desc: "Allow the plugin to read workspace data."},
        "workspace.write": isZh ? {label: "修改工作区", desc: "允许插件写入或修改工作区数据。"} : {label: "Workspace Write", desc: "Allow the plugin to modify workspace data."},
        "network.http": isZh ? {label: "联网访问", desc: "允许插件主动发起网络请求。宿主默认仍保持离线。"} : {label: "Network Access", desc: "Allow the plugin to make network requests. The host remains offline by default."},
        "host.control": isZh ? {label: "宿主控制", desc: "允许插件锁屏、退出或直接控制宿主应用。"} : {label: "Host Control", desc: "Allow the plugin to lock, exit, or directly control the host app."},
    };
    return map[permission] || (isZh
        ? {label: permission, desc: "插件声明了一个宿主认识的能力。"}
        : {label: permission, desc: "The plugin declares a capability recognized by the host."});
};

const renderPluginPermissionReview = (data: {
    displayName?: Record<string, string>,
    description?: Record<string, string>,
    name?: string,
    version?: string,
    author?: string,
    url?: string,
    permissions?: string[],
    frontends?: string[],
    backends?: string[],
    integrity?: string
}) => {
    const displayName = escapeHtml(data.displayName?.[window.sourceflow.config.lang] || data.displayName?.default || data.displayName?.en_US || data.displayName?.zh_CN || data.name || "");
    const description = escapeHtml(data.description?.[window.sourceflow.config.lang] || data.description?.default || data.description?.en_US || data.description?.zh_CN || "");
    const permissions = Array.isArray(data.permissions) ? data.permissions : [];
    const permissionsHTML = permissions.map((permission) => {
        const info = getPluginPermissionInfo(permission);
        return `<li><strong>${escapeHtml(info.label)}</strong><br><span class="ft__smaller ft__on-surface">${escapeHtml(info.desc)}</span><br><code class="fn__code">${escapeHtml(permission)}</code></li>`;
    }).join("");
    const integrity = `${data.integrity || ""}`.trim();
    const integritySummary = integrity ? `${integrity.slice(0, 16)}...${integrity.slice(-16)}` : "";
    return `<div class="ft__breakword">
<div><strong>${displayName || escapeHtml(data.name || "")}</strong>${data.version ? ` <span class="ft__on-surface ft__smaller">v${escapeHtml(data.version)}</span>` : ""}</div>
<div class="ft__on-surface ft__smaller${description ? "" : " fn__none"}" style="margin-top: 8px;">${description}</div>
<div class="ft__smaller" style="margin-top: 12px;">${bazaarText("作者", "Author")}: ${escapeHtml(data.author || bazaarDefaultAuthor)}</div>
<div class="ft__smaller${data.url ? "" : " fn__none"}">${bazaarText("来源", "Source")}: <a href="${escapeAttr(data.url || "")}" target="_blank">${escapeHtml(data.url || "")}</a></div>
<div class="ft__smaller" style="margin-top: 12px;">${bazaarText("适用前端", "Frontends")}: ${escapeHtml((data.frontends || []).join(", ") || "desktop")}</div>
<div class="ft__smaller">${bazaarText("适用后端", "Backends")}: ${escapeHtml((data.backends || []).join(", ") || "all")}</div>
<div class="ft__smaller${integritySummary ? "" : " fn__none"}" style="margin-top: 12px;">SHA-256: <code class="fn__code">${escapeHtml(integritySummary)}</code></div>
<div style="margin-top: 16px;"><strong>${bazaarText("权限声明", "Declared permissions")}</strong></div>
<ul class="b3-list b3-list--background" style="margin: 8px 0 0 0; max-height: 240px; overflow: auto;">${permissionsHTML || `<li class="ft__smaller ft__on-surface">${bazaarText("未声明权限", "No permissions declared")}</li>`}</ul>
<div class="ft__on-surface ft__smaller" style="margin-top: 12px;">${bazaarText("插件安装后默认保持关闭，只有你手动启用后才会运行。", "Plugins stay disabled by default after installation and only run after you enable them manually.")}</div>
</div>`;
};

const getPluginReviewDataFromBazaarItem = (item: IBazaarItem) => ({
    displayName: {default: item.preferredName || item.name},
    description: {default: item.preferredDesc || ""},
    name: item.name,
    version: item.version,
    author: item.author,
    url: item.repoURL || item.url || "",
    permissions: item.permissions || [],
    frontends: item.frontends || [],
    backends: item.backends || [],
    integrity: item.archiveSHA256 || item.installIntegrity || "",
});

const getPluginDisabledReason = (item: IBazaarItem) => `${item.disabledReason || ""}`.trim();

const renderPluginPermissionList = (permissions?: string[]) => {
    const values = Array.isArray(permissions) ? permissions : [];
    if (!values.length) {
        return `<div class="ft__on-surface ft__smaller">${bazaarText("未声明权限", "No permissions declared")}</div>`;
    }
    return values.map((permission) => {
        const info = getPluginPermissionInfo(permission);
        return `<div class="ft__smaller" style="line-height: 18px; margin-bottom: 8px;"><strong>${escapeHtml(info.label)}</strong><br><span class="ft__on-surface">${escapeHtml(info.desc)}</span><br><code class="fn__code">${escapeHtml(permission)}</code></div>`;
    }).join("");
};

const getBazaarInstallURL = (bazaarType: TBazaarType) => {
    if (bazaarType === "themes") {
        return "/api/bazaar/installBazaarTheme";
    }
    if (bazaarType === "icons") {
        return "/api/bazaar/installBazaarIcon";
    }
    if (bazaarType === "widgets") {
        return "/api/bazaar/installBazaarWidget";
    }
    if (bazaarType === "plugins") {
        return "/api/bazaar/installBazaarPlugin";
    }
    return "/api/bazaar/installBazaarTemplate";
};

const confirmPluginBazaarInstall = (item: IBazaarItem, onConfirm: () => void, update = false) => {
    const title = update
        ? bazaarText("更新插件", "Update plugin")
        : bazaarText("安装插件", "Install plugin");
    const detailHTML = renderPluginPermissionReview(getPluginReviewDataFromBazaarItem(item));
    const intro = `<div class="ft__on-surface ft__smaller" style="margin-bottom: 12px;">${bazaarText("该插件将从 SourceFlow 集市安装。安装前请确认来源、摘要和权限声明。", "This plugin will be installed from the SourceFlow Bazaar. Review the source, integrity, and declared permissions before continuing.")}</div>`;
    confirmDialog(title, `${intro}${detailHTML}`, onConfirm);
};

const confirmPluginEnable = (item: IBazaarItem, onConfirm: () => void, onCancel?: () => void) => {
    const intro = `<div class="ft__on-surface ft__smaller" style="margin-bottom: 12px;">${bazaarText("启用插件前请再次确认它声明的权限。启用后插件才会真正运行。", "Review the declared permissions again before enabling this plugin. It will start running only after you enable it.")}</div>`;
    confirmDialog(bazaarText("启用插件", "Enable plugin"), `${intro}${renderPluginPermissionReview(getPluginReviewDataFromBazaarItem(item))}`, onConfirm, onCancel);
};

const rerenderBazaarPanel = (app: App) => {
    bazaar.element.innerHTML = bazaar.genHTML();
    bazaar.bindEvent(app);
};

const findBazaarItemByData = (bazaarType: TBazaarType, dataObj: {repoURL?: string, name?: string}) => {
    const onlineList = bazaar._data[bazaarType] || [];
    const downloadedList = bazaar._data.downloaded || [];
    return onlineList.find((item) => matchBazaarItem(item, dataObj))
        || downloadedList.find((item) => matchBazaarItem(item, dataObj));
};

const setBazaarSourceInputs = (dialog: Dialog, values: Partial<Record<TBazaarSourceKey, string>>) => {
    getBazaarSourceFields().forEach((field) => {
        const inputElement = dialog.element.querySelector(`[data-key="${field.key}"]`) as HTMLInputElement;
        inputElement.value = values[field.key] || "";
    });
};

const openBazaarSourceDialog = (app: App) => {
    const dialog = new Dialog({
        title: bazaarText("集市源", "Bazaar Source"),
        content: `<div class="b3-dialog__content">
    <div class="b3-label">
        <div>${bazaarText("集市源设置", "Bazaar source settings")}</div>
        <div class="b3-label__text">${bazaarText("任一字段留空时，将使用内置默认源。", "Leave any field empty to use the built-in default source.")}</div>
        <div class="b3-label__text">${bazaarText("集市哈希仅在自动获取失败时作为兜底使用。", "Bazaar Hash is used only when automatic hash retrieval fails.")}</div>
        <div class="b3-label__text">${window.sourceflow.languages.bazaarSourceGitHubTip}</div>
        <div class="b3-label__text"><code class="fn__code">/bazaar@&lt;hash&gt;/stage/*.json</code> · <code class="fn__code">/package/&lt;owner&gt;/&lt;repo&gt;@&lt;hash&gt;.zip</code> · <code class="fn__code">/stat/bazaar/index.json</code></div>
    </div>
    ${getBazaarSourceFields().map((field) => `<label class="b3-label">
        <div>${field.label}</div>
        <div class="b3-label__text">${field.placeholder}</div>
        <input data-key="${field.key}" class="b3-text-field fn__block" spellcheck="false">
    </label>`).join("")}
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.sourceflow.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--outline">${window.sourceflow.languages.reset}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--outline">${window.sourceflow.languages.bazaarSourcePresetGitHub}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text">${window.sourceflow.languages.save}</button>
</div>`,
        width: "720px",
    });
    setBazaarSourceInputs(dialog, window.sourceflow.config.bazaar as Record<TBazaarSourceKey, string>);
    const buttons = dialog.element.querySelectorAll(".b3-button");
    buttons[0].addEventListener("click", () => {
        dialog.destroy();
    });
    buttons[1].addEventListener("click", () => {
        setBazaarSourceInputs(dialog, {});
    });
    buttons[2].addEventListener("click", () => {
        setBazaarSourceInputs(dialog, sourceflowGitHubBazaarPreset);
    });
    buttons[3].addEventListener("click", () => {
        const bazaarSourceFields = getBazaarSourceFields();
        const nextBazaar = Object.assign({}, window.sourceflow.config.bazaar);
        for (const field of bazaarSourceFields) {
            const value = (dialog.element.querySelector(`[data-key="${field.key}"]`) as HTMLInputElement).value.trim();
            if (field.key !== "bazaarHash" && !validateBazaarSourceURL(field.label, value)) {
                return;
            }
            nextBazaar[field.key] = value;
        }
        fetchPost("/api/setting/setBazaar", nextBazaar, (response) => {
            if (response.code !== 0) {
                showMessage(response.msg);
                return;
            }
            window.sourceflow.config.bazaar = response.data;
            dialog.destroy();
            rerenderBazaarPanel(app);
            showMessage(bazaarText("集市源已保存", "Bazaar source saved"));
        });
    });
    dialog.bindInput(dialog.element.querySelector(`[data-key="${getBazaarSourceFields()[0].key}"]`) as HTMLInputElement, undefined, false);
};

export const bazaar = {
    element: undefined as Element,
    genHTML() {
        if (!window.sourceflow.config.bazaar.trust) {
            return `<div class="fn__flex-column">
<div class="fn__flex-1"></div>
<div class="b3-label">
    <div>${window.sourceflow.languages.bazaarTrust}</div>
    <div class="fn__hr--b"></div>
    <div>${window.sourceflow.languages.bazaarTrust3}</div>
</div>
<div class="fn__flex b3-label">
    <svg class="b3-label__icon"><use xlink:href="#iconEye"></use></svg>
    <div>
        ${window.sourceflow.languages.bazaarTrustCodeReview}
        <div class="b3-label__text">${window.sourceflow.languages.bazaarTrustCodeReviewTip}</div>
    </div>
</div>
<div class="fn__flex b3-label">
    <svg class="b3-label__icon"><use xlink:href="#iconGithub"></use></svg>
    <div>
        ${window.sourceflow.languages.bazaarTrustOpenSource}
        <div class="b3-label__text">${window.sourceflow.languages.bazaarTrustOpenSourceTip}</div>
    </div>
</div>
<div class="fn__flex b3-label">
    <svg class="b3-label__icon"><use xlink:href="#iconUsers"></use></svg>
    <div>
        ${window.sourceflow.languages.bazaarCommunityReview}
        <div class="b3-label__text">${window.sourceflow.languages.bazaarPeerReviewTip}</div>
    </div>
</div>
<div class="fn__flex b3-label">
    <svg class="b3-label__icon"><use xlink:href="#iconInfo"></use></svg>
    <div>
        ${window.sourceflow.languages.bazaarUserReport}
        <div class="b3-label__text">${window.sourceflow.languages.bazaarUserReportTip}</div>
    </div>
</div>
<div class="b3-label b3-label--noborder">
    <div>${window.sourceflow.languages.bazaarTrust1}</div>
    <div class="fn__hr--b"></div>
    <diiv>${window.sourceflow.languages.bazaarTrust2}</diiv>
</div>
<div class="ft__center b3-label b3-label--noborder">
    <button data-type="bazaar-source" class="b3-button b3-button--outline fn__size200">${bazaarText("集市源", "Source")}</button>
</div>
<div class="ft__center b3-label b3-label--noborder">
    <button data-type="bazaar-trust" class="b3-button fn__size200">${window.sourceflow.languages.trust}</button>
</div>
<div class="fn__flex-1"></div>
</div>`;
        }
        const localSort = window.sourceflow.storage[Constants.LOCAL_BAZAAR];
        const loadingHTML = `<div style="height: ${bazaar.element.clientHeight - 80}px;display: flex;align-items: center;justify-content: center;"><img src="/stage/loading-pure.svg"></div>`;
        return `<div class="fn__flex-column" style="height: 100%">
<div class="layout-tab-bar fn__flex">
    <div data-type="downloaded" class="item item--full item--focus"><span class="fn__flex-1"></span><span class="item__text">${window.sourceflow.languages.downloaded}</span><span class="fn__flex-1"></span></div>
    <div data-type="plugin" class="item item--full"><span class="fn__flex-1"></span><span class="item__text">${window.sourceflow.languages.plugin}</span><span class="fn__flex-1"></span></div>
    <div data-type="theme" class="item item--full"><span class="fn__flex-1"></span><span class="item__text">${window.sourceflow.languages.theme}</span><span class="fn__flex-1"></span></div>
    <div data-type="icon" class="item item--full"><span class="fn__flex-1"></span><span class="item__text">${window.sourceflow.languages.icon}</span><span class="fn__flex-1"></span></div>
    <div data-type="template" class="item item--full"><span class="fn__flex-1"></span><span class="item__text">${window.sourceflow.languages.template}</span><span class="fn__flex-1"></span></div>
    <div data-type="widget" class="item item--full"><span class="fn__flex-1"></span><span class="item__text">${window.sourceflow.languages.widget}</span><span class="fn__flex-1"></span></div>
    <div class="fn__flex-1"></div>
    <button data-type="bazaar-source" class="b3-button b3-button--outline" style="margin: 8px 8px 8px 0;">${bazaarText("集市源", "Source")}</button>
</div>
<div class="fn__flex-1">
    <div class="config-bazaar__panel" data-type="downloaded" data-init="true">
        <div data-type="downloaded-update"></div>
        <div class="fn__flex config-bazaar__title">
            <button data-type="myPlugin" class="b3-button">${window.sourceflow.languages.plugin}</button>
            <div class="fn__space"></div>
            <button data-type="import-local-plugin" class="b3-button b3-button--outline">${window.sourceflow.languages.import}</button>
            <input id="configBazaarPluginImport" class="fn__none" type="file" accept=".zip,application/zip">
            <div class="fn__space"></div>
            <button data-type="check-bazaar-updates" class="b3-button b3-button--outline">${bazaarText("检查更新", "Check updates")}</button>
            <div class="fn__space"></div>
            <button data-type="myTheme" class="b3-button b3-button--outline">${window.sourceflow.languages.theme}</button>
            <div class="fn__space"></div>
            <button data-type="myIcon" class="b3-button b3-button--outline">${window.sourceflow.languages.icon}</button>
            <div class="fn__space"></div>
            <button data-type="myTemplate" class="b3-button b3-button--outline">${window.sourceflow.languages.template}</button>
            <div class="fn__space"></div>
            <button data-type="myWidget" class="b3-button b3-button--outline">${window.sourceflow.languages.widget}</button>
            <div class="fn__space"></div>
            <div class="b3-form__icon">
                <svg class="b3-form__icon-icon"><use xlink:href="#iconSearch"></use></svg>
                <input class="b3-text-field b3-form__icon-input fn__block" placeholder="${window.sourceflow.languages.enterKey} ${window.sourceflow.languages.search}">
            </div>
            <div class="fn__space"></div>
            <div class="fn__flex-1"></div>
            <input ${window.sourceflow.config.bazaar.pluginDisabled ? "" : " checked"} data-type="plugins-enable" type="checkbox" class="b3-switch fn__flex-center" style="margin-right: 8px">
            <div class="counter counter--bg fn__none fn__flex-center ariaLabel" data-position="north" aria-label="${window.sourceflow.languages.total}"></div>
        </div>
        <div id="configBazaarDownloaded" class="config-bazaar__content">
            ${loadingHTML}
        </div>
    </div>
    <div data-type="theme" class="config-bazaar__panel fn__none">
        <div class="fn__flex config-bazaar__title">
            <svg class="svg ft__on-surface fn__flex-center"><use xlink:href="#iconSort"></use></svg>
            <div class="fn__space"></div>
            <select class="b3-select">
                <option ${localSort.theme === "0" ? "selected" : ""} value="0">${window.sourceflow.languages.sortByUpdateTimeDesc}</option>
                <option ${localSort.theme === "1" ? "selected" : ""} value="1">${window.sourceflow.languages.sortByUpdateTimeAsc}</option>
                <option ${localSort.theme === "2" ? "selected" : ""} value="2">${window.sourceflow.languages.sortByDownloadsDesc}</option>
                <option ${localSort.theme === "3" ? "selected" : ""} value="3">${window.sourceflow.languages.sortByDownloadsAsc}</option>
            </select>
            <div class="fn__space"></div>
            <select id="bazaarSelect" class="b3-select">
                <option selected value="2">${window.sourceflow.languages.all}</option>
                <option value="0">${window.sourceflow.languages.themeLight}</option>
                <option value="1">${window.sourceflow.languages.themeDark}</option>
            </select>
            <div class="fn__space"></div>
            <div class="b3-form__icon">
                <svg class="b3-form__icon-icon"><use xlink:href="#iconSearch"></use></svg>
                <input class="b3-text-field b3-form__icon-input fn__block" placeholder="${window.sourceflow.languages.enterKey} ${window.sourceflow.languages.search}">
            </div>
            <div class="fn__space"></div>
            <div class="fn__flex-1"></div>
            <div class="counter counter--bg fn__flex-center ariaLabel" data-position="north" aria-label="${window.sourceflow.languages.total}"></div>
        </div>
        <div id="configBazaarTheme" class="config-bazaar__content">
            ${loadingHTML}
        </div>
    </div>
    <div class="fn__none config-bazaar__panel" data-type="template">
        <div class="fn__flex config-bazaar__title">
            <svg class="svg ft__on-surface fn__flex-center"><use xlink:href="#iconSort"></use></svg>
            <div class="fn__space"></div>
            <select class="b3-select">
                <option ${localSort.template === "0" ? "selected" : ""} value="0">${window.sourceflow.languages.sortByUpdateTimeDesc}</option>
                <option ${localSort.template === "1" ? "selected" : ""} value="1">${window.sourceflow.languages.sortByUpdateTimeAsc}</option>
                <option ${localSort.template === "2" ? "selected" : ""} value="2">${window.sourceflow.languages.sortByDownloadsDesc}</option>
                <option ${localSort.template === "3" ? "selected" : ""} value="3">${window.sourceflow.languages.sortByDownloadsAsc}</option>
            </select>
            <div class="fn__space"></div>
            <div class="b3-form__icon">
                <svg class="b3-form__icon-icon"><use xlink:href="#iconSearch"></use></svg>
                <input class="b3-text-field b3-form__icon-input fn__block" placeholder="${window.sourceflow.languages.enterKey} ${window.sourceflow.languages.search}">
            </div>
            <div class="fn__space"></div>
            <div class="fn__flex-1"></div>
            <div class="counter counter--bg fn__flex-center ariaLabel" data-position="north" aria-label="${window.sourceflow.languages.total}"></div>
        </div>
        <div id="configBazaarTemplate" class="config-bazaar__content">
            ${loadingHTML}
        </div>
    </div>
    <div class="fn__none config-bazaar__panel" data-type="plugin">
        <div class="fn__flex config-bazaar__title">
            <svg class="svg ft__on-surface fn__flex-center"><use xlink:href="#iconSort"></use></svg>
            <div class="fn__space"></div>
            <select class="b3-select">
                <option ${localSort.plugin === "0" ? "selected" : ""} value="0">${window.sourceflow.languages.sortByUpdateTimeDesc}</option>
                <option ${localSort.plugin === "1" ? "selected" : ""} value="1">${window.sourceflow.languages.sortByUpdateTimeAsc}</option>
                <option ${localSort.plugin === "2" ? "selected" : ""} value="2">${window.sourceflow.languages.sortByDownloadsDesc}</option>
                <option ${localSort.plugin === "3" ? "selected" : ""} value="3">${window.sourceflow.languages.sortByDownloadsAsc}</option>
            </select>
            <div class="fn__space"></div>
            <div class="b3-form__icon">
                <svg class="b3-form__icon-icon"><use xlink:href="#iconSearch"></use></svg>
                <input class="b3-text-field b3-form__icon-input fn__block" placeholder="${window.sourceflow.languages.enterKey} ${window.sourceflow.languages.search}">
            </div>
            <div class="fn__space"></div>
            <div class="fn__flex-1"></div>
            <div class="counter counter--bg fn__flex-center ariaLabel" data-position="north" aria-label="${window.sourceflow.languages.total}"></div>
        </div>
        <div id="configBazaarPlugin" class="config-bazaar__content">
            ${loadingHTML}
        </div>
    </div>
    <div class="fn__none config-bazaar__panel" data-type="icon">
        <div class="fn__flex config-bazaar__title">
            <svg class="svg ft__on-surface fn__flex-center"><use xlink:href="#iconSort"></use></svg>
            <div class="fn__space"></div>
            <select class="b3-select">
                <option ${localSort.icon === "0" ? "selected" : ""} value="0">${window.sourceflow.languages.sortByUpdateTimeDesc}</option>
                <option ${localSort.icon === "1" ? "selected" : ""} value="1">${window.sourceflow.languages.sortByUpdateTimeAsc}</option>
                <option ${localSort.icon === "2" ? "selected" : ""} value="2">${window.sourceflow.languages.sortByDownloadsDesc}</option>
                <option ${localSort.icon === "3" ? "selected" : ""} value="3">${window.sourceflow.languages.sortByDownloadsAsc}</option>
            </select>
            <div class="fn__space"></div>
            <div class="b3-form__icon">
                <svg class="b3-form__icon-icon"><use xlink:href="#iconSearch"></use></svg>
                <input class="b3-text-field b3-form__icon-input fn__block" placeholder="${window.sourceflow.languages.enterKey} ${window.sourceflow.languages.search}">
            </div>
            <div class="fn__space"></div>
            <div class="fn__flex-1"></div>
            <div class="counter counter--bg fn__flex-center ariaLabel" data-position="north" aria-label="${window.sourceflow.languages.total}"></div>
        </div>
        <div id="configBazaarIcon" class="config-bazaar__content">
            ${loadingHTML}
        </div>
    </div>
    <div class="fn__none config-bazaar__panel" data-type="widget">
        <div class="fn__flex config-bazaar__title">
            <svg class="svg ft__on-surface fn__flex-center"><use xlink:href="#iconSort"></use></svg>
            <div class="fn__space"></div>
            <select class="b3-select">
                <option ${localSort.widget === "0" ? "selected" : ""} value="0">${window.sourceflow.languages.sortByUpdateTimeDesc}</option>
                <option ${localSort.widget === "1" ? "selected" : ""} value="1">${window.sourceflow.languages.sortByUpdateTimeAsc}</option>
                <option ${localSort.widget === "2" ? "selected" : ""} value="2">${window.sourceflow.languages.sortByDownloadsDesc}</option>
                <option ${localSort.widget === "3" ? "selected" : ""} value="3">${window.sourceflow.languages.sortByDownloadsAsc}</option>
            </select>
            <div class="fn__space"></div>
            <div class="b3-form__icon">
                <svg class="b3-form__icon-icon"><use xlink:href="#iconSearch"></use></svg>
                <input class="b3-text-field b3-form__icon-input fn__block" placeholder="${window.sourceflow.languages.enterKey} ${window.sourceflow.languages.search}">
            </div>
            <div class="fn__space"></div>
            <div class="fn__flex-1"></div>
            <div class="counter counter--bg fn__flex-center ariaLabel" data-position="north" aria-label="${window.sourceflow.languages.total}"></div>
        </div>
        <div id="configBazaarWidget" class="config-bazaar__content">
            ${loadingHTML}
        </div>
    </div>
</div>
<div id="configBazaarReadme" class="config-bazaar__readme"></div>
</div>`;
    },
    _genFundingHTML(funding: string): string {
        if (!funding) {
            return "";
        }
        try {
            new URL(funding);
            return `<a target="_blank" href="${escapeAttr(funding)}" class="block__icon block__icon--show ariaLabel" data-position="north" aria-label="${window.sourceflow.languages.sponsor} ${escapeAttr(funding)}"><svg class="ft__pink"><use xlink:href="#iconHeart"></use></svg></a>`;
        } catch (e) {
            return `<span data-type="copy-funding" data-funding="${escapeAttr(funding)}" class="block__icon block__icon--show ariaLabel" data-position="north" aria-label="${window.sourceflow.languages.sponsor} ${escapeAttr(funding)}"><svg class="ft__pink"><use xlink:href="#iconHeart"></use></svg></span>`;
        }
    },
    _genCardHTML(item: IBazaarItem, bazaarType: TBazaarType) {
        let hide = false;
        let themeMode = "";
        if (bazaarType === "themes") {
            const themeValue = (bazaar.element.querySelector("#bazaarSelect") as HTMLSelectElement).value;
            if ((themeValue === "0" && item.modes?.includes("dark")) ||
                themeValue === "1" && item.modes?.includes("light")) {
                hide = true;
            }
            themeMode = item.modes?.toString() || "";
        }
        let showSwitch = false;
        if (["icons", "themes"].includes(bazaarType)) {
            showSwitch = true;
        }
        const dataObj = {
            bazaarType,
            themeMode: themeMode,
            updated: item.updated,
            name: item.name,
            repoURL: item.repoURL,
            repoHash: item.repoHash,
            downloads: item.downloads,
            downloaded: false,
        };
        return `<div data-obj='${JSON.stringify(dataObj)}' class="b3-card b3-card--wrap${hide ? " fn__none" : ""}${item.current ? " b3-card--current" : ""}">
    <div class="b3-card__img">
        <img src="${item.iconURL}" loading="lazy" onerror="this.src='/stage/images/icon.png'"/>
    </div>
    <div class="fn__flex-1 fn__flex-column">
        <div class="b3-card__info fn__flex-1">
            ${item.preferredName}${item.preferredName !== item.name ? ` <span class="ft__on-surface ft__smaller">${item.name}</span>` : ""}
            <div class="b3-card__desc" title="${escapeAttr(item.preferredDesc) || ""}">
                ${item.preferredDesc || ""}
            </div>
        </div>
        <div class="b3-card__actions">
            <span class="block__icon block__icon--show ft__primary">
                <svg><use xlink:href="#iconDownload"></use></svg>
                <span class="fn__space"></span>
                ${item.downloads}
            </span>
            <span class="fn__space"></span>
            ${bazaar._genFundingHTML(item.preferredFunding)}
            <span class="fn__space"></span>
            <div class="fn__flex-1"></div>
            <span data-position="north" class="ariaLabel block__icon block__icon--show${item.installed ? "" : " fn__none"}" data-type="uninstall" aria-label="${window.sourceflow.languages.uninstall}">
                <svg><use xlink:href="#iconTrashcan"></use></svg>
            </span>
            <div class="fn__space${!item.current && item.installed && showSwitch ? "" : " fn__none"}"></div>
            <span data-position="north" class="ariaLabel block__icon block__icon--show${!item.current && item.installed && showSwitch ? "" : " fn__none"}" data-type="switch" aria-label="${window.sourceflow.languages.use}">
                <svg><use xlink:href="#iconSelect"></use></svg>
            </span>
            <div class="fn__space${item.outdated ? "" : " fn__none"}"></div>
            <span data-type="install-t" ${item.disallowUpdate ? "disabled" : ""} aria-label="${item.disallowUpdate ? window.sourceflow.languages.bazaarNeedVersion.replace("${x}", item.updateRequiredMinAppVer) : window.sourceflow.languages.update}" data-position="north" class="ariaLabel block__icon block__icon--show${item.outdated ? "" : " fn__none"}">
                <svg class="ft__primary"><use xlink:href="#iconRefresh"></use></svg>
            </span>
        </div>
    </div>
</div>`;
    },
    _genUpdateItemHTML(item: IBazaarItem, bazaarType: TBazaarType) {
        const dataObj = {
            bazaarType,
            themeMode: item.modes?.toString(),
            updated: item.updated,
            name: item.name,
            repoURL: item.repoURL,
            repoHash: item.repoHash,
            downloaded: true
        };
        return `<div class="b3-card" data-obj='${JSON.stringify(dataObj)}'>
    <div class="b3-card__img"><img src="${item.iconURL}" loading="lazy" onerror="this.src='/stage/images/icon.png'"/></div>
    <div class="fn__flex-1 fn__flex-column">
        <div class="b3-card__info b3-card__info--left fn__flex-1">
            ${item.preferredName}${item.preferredName !== item.name ? ` <span class="ft__on-surface ft__smaller">${item.name}</span>` : ""}
            <div class="b3-card__desc" title="${escapeAttr(item.preferredDesc) || ""}">${item.preferredDesc || ""}</div>
        </div>
    </div>
    <div class="b3-card__actions b3-card__actions--right">
        ${item.incompatible ? `<span class="fn__space"></span><span data-position="north" class="fn__flex-center ariaLabel b3-chip b3-chip--error b3-chip--small" aria-label="${window.sourceflow.languages.incompatiblePluginTip}">${window.sourceflow.languages.incompatible}</span>` : ""}
        ${bazaar._genFundingHTML(item.preferredFunding)}
        <span data-position="north" class="ariaLabel block__icon block__icon--show${isBrowser() ? " fn__none" : ""}" data-type="open" aria-label="${window.sourceflow.languages.showInFolder}">
            <svg><use xlink:href="#iconFolder"></use></svg>
        </span>
        <span data-position="north" data-type="install-t" ${item.disallowUpdate ? "disabled" : ""} aria-label="${item.disallowUpdate ? window.sourceflow.languages.bazaarNeedVersion.replace("${x}", item.updateRequiredMinAppVer) : window.sourceflow.languages.update}" class="ariaLabel block__icon block__icon--show">
            <svg class="ft__primary"><use xlink:href="#iconRefresh"></use></svg>
        </span>
    </div>
</div>`;
    },
    _getUpdate() {
        fetchPost("/api/bazaar/getUpdatedPackage", {frontend: getFrontend()}, (response) => {
            let html = "";
            response.data.plugins.forEach((item: IBazaarItem) => {
                html += this._genUpdateItemHTML(item, "plugins");
            });
            response.data.themes.forEach((item: IBazaarItem) => {
                html += this._genUpdateItemHTML(item, "themes");
            });
            response.data.icons.forEach((item: IBazaarItem) => {
                html += this._genUpdateItemHTML(item, "icons");
            });
            response.data.templates.forEach((item: IBazaarItem) => {
                html += this._genUpdateItemHTML(item, "templates");
            });
            response.data.widgets.forEach((item: IBazaarItem) => {
                html += this._genUpdateItemHTML(item, "widgets");
            });
            this._data.update = response.data;
            const allCount = response.data.themes.length + response.data.icons.length + response.data.widgets.length + response.data.plugins.length + response.data.templates.length;
            if (allCount === 0) {
                this.element.querySelector('[data-type="downloaded-update"]').innerHTML = "";
                return;
            }
            this.element.querySelector('[data-type="downloaded-update"]').innerHTML = `<div class="fn__flex config-bazaar__title">
    <div class="fn__flex-1"></div>
    <button class="b3-button" data-type="install-all">${window.sourceflow.languages.updateAll}</button>
    <span class="fn__space"></span>
    <div class="counter counter--bg fn__flex-center ariaLabel" data-position="north" aria-label="${window.sourceflow.languages.total}">${allCount}</div>
</div>
<div class="config-bazaar__content">${html}</div>`;
        });
    },
    _genMyHTML(bazaarType: TBazaarType, app: App, updateUpdate = false) {
        if (updateUpdate) {
            this._getUpdate();
        }
        const contentElement = bazaar.element.querySelector("#configBazaarDownloaded");
        if (contentElement.getAttribute("data-loading") === "true" ||
            contentElement.previousElementSibling.querySelector(`[data-type="my${bazaarType.replace(bazaarType[0], bazaarType[0].toUpperCase()).substring(0, bazaarType.length - 1)}"]`).classList.contains("b3-button--outline")) {
            return;
        }
        contentElement.setAttribute("data-loading", "true");
        let url = "/api/bazaar/getInstalledTheme";
        if (bazaarType === "icons") {
            url = "/api/bazaar/getInstalledIcon";
        } else if (bazaarType === "widgets") {
            url = "/api/bazaar/getInstalledWidget";
        } else if (bazaarType === "templates") {
            url = "/api/bazaar/getInstalledTemplate";
        } else if (bazaarType === "plugins") {
            url = "/api/bazaar/getInstalledPlugin";
        }
        fetchPost(url, {
            frontend: getFrontend(),
            keyword: (contentElement.previousElementSibling.querySelector(".b3-text-field") as HTMLInputElement)?.value || "",
        }, response => {
            contentElement.removeAttribute("data-loading");
            let html = "";
            let showSwitch = false;
            if (["icons", "themes"].includes(bazaarType)) {
                showSwitch = true;
            }
            const counterElement = contentElement.previousElementSibling.querySelector(".counter");
            if (response.data.packages.length === 0) {
                counterElement.classList.add("fn__none");
            } else {
                counterElement.classList.remove("fn__none");
                counterElement.textContent = response.data.packages.length;
                response.data.packages.forEach((item: IBazaarItem) => {
                    const dataObj = {
                        bazaarType,
                        themeMode: item.modes?.toString(),
                        updated: item.updated,
                        name: item.name,
                        repoURL: item.repoURL,
                        repoHash: item.repoHash,
                        downloaded: true
                    };
                    let hasSetting = false;
                    if (bazaarType === "plugins") {
                        app.plugins.find((item: Plugin) => {
                            if (item.name === dataObj.name) {
                                // @ts-ignore
                                hasSetting = item.setting || item.__proto__.hasOwnProperty("openSetting");
                                return true;
                            }
                        });
                    }
                    html += `<div data-obj='${JSON.stringify(dataObj)}' class="b3-card${item.current ? " b3-card--current" : ""}${(window.sourceflow.config.bazaar.pluginDisabled && bazaarType === "plugins") ? " b3-card--disabled" : ""}">
    <div class="b3-card__img"><img src="${item.iconURL}" loading="lazy" onerror="this.src='/stage/images/icon.png'"/></div>
    <div class="fn__flex-1 fn__flex-column">
        <div class="b3-card__info b3-card__info--left fn__flex-1">
            ${item.preferredName}${item.preferredName !== item.name ? ` <span class="ft__on-surface ft__smaller">${item.name}</span>` : ""}
            <div class="b3-card__desc" title="${escapeAttr(item.preferredDesc) || ""}">${item.preferredDesc || ""}</div>
        </div>
    </div>
    <div class="b3-card__actions b3-card__actions--right">
        ${item.incompatible ? `<span class="fn__space"></span><span data-position="north" class="fn__flex-center ariaLabel b3-chip b3-chip--error b3-chip--small" aria-label="${window.sourceflow.languages.incompatiblePluginTip}">${window.sourceflow.languages.incompatible}</span>` : ""}
        ${bazaar._genFundingHTML(item.preferredFunding)}
        <span data-position="north" class="ariaLabel block__icon block__icon--show${hasSetting ? "" : " fn__none"}" data-type="setting" aria-label="${window.sourceflow.languages.config}">
            <svg><use xlink:href="#iconSettings"></use></svg>
        </span>
        <span data-position="north" class="ariaLabel block__icon block__icon--show" data-type="uninstall" aria-label="${window.sourceflow.languages.uninstall}">
            <svg><use xlink:href="#iconTrashcan"></use></svg>
        </span>
        <span data-position="north" class="ariaLabel block__icon block__icon--show${isBrowser() ? " fn__none" : ""}" data-type="open" aria-label="${window.sourceflow.languages.showInFolder}">
            <svg><use xlink:href="#iconFolder"></use></svg>
        </span>
        <span data-position="north" class="ariaLabel block__icon block__icon--show${!item.current && showSwitch ? "" : " fn__none"}" data-type="switch" aria-label="${window.sourceflow.languages.use}">
            <svg><use xlink:href="#iconSelect"></use></svg>
        </span>
        <span data-position="north" data-type="install-t" ${item.disallowUpdate ? "disabled" : ""} aria-label="${item.disallowUpdate ? window.sourceflow.languages.bazaarNeedVersion.replace("${x}", item.updateRequiredMinAppVer) : window.sourceflow.languages.update}" class="ariaLabel block__icon block__icon--show${item.outdated ? "" : " fn__none"}">
            <svg class="ft__primary"><use xlink:href="#iconRefresh"></use></svg>
        </span>
        <span data-position="north" class="ariaLabel fn__flex-center b3-chip b3-chip--error b3-chip--small${(bazaarType === "plugins" && getPluginDisabledReason(item)) ? "" : " fn__none"}" aria-label="${escapeAttr(getPluginDisabledReason(item))}">${bazaarText("需重确认", "Reconfirm")}</span>
        <span class="fn__space${bazaarType === "plugins" ? "" : " fn__none"}"></span>
        <span class="fn__space${bazaarType === "plugins" ? "" : " fn__none"}"></span>
        <input ${((item.disallowInstall && !item.enabled) || item.incompatible) ? "disabled" : ""} 
aria-label="${escapeAttr(getPluginDisabledReason(item) || ((item.disallowInstall && !item.enabled) ? window.sourceflow.languages.bazaarNeedVersion.replace("${x}", item.minAppVersion) : ""))}" 
data-position="north" class="ariaLabel b3-switch fn__flex-center${bazaarType === "plugins" ? "" : " fn__none"}" 
${item.enabled ? "checked" : ""} 
data-type="plugin-enable" 
data-disabletip="${escapeAttr(getPluginDisabledReason(item) || (item.disallowInstall ? window.sourceflow.languages.bazaarNeedVersion.replace("${x}", item.minAppVersion) : ""))}"
type="checkbox">
    </div>
</div>`;
                });
            }
            bazaar._data.downloaded = response.data.packages;
            const checkElement = contentElement.parentElement.querySelector(".b3-switch");
            if (bazaarType === "plugins") {
                checkElement.classList.remove("fn__none");
            } else {
                checkElement.classList.add("fn__none");
            }
            contentElement.innerHTML = html ? html : `<div class="fn__hr"></div><ul class="b3-list b3-list--background"><li class="b3-list--empty">${window.sourceflow.languages.emptyContent}</li></ul>`;
        });
    },
    _data: {
        themes: [] as IBazaarItem[],
        templates: [] as IBazaarItem[],
        icons: [] as IBazaarItem[],
        widgets: [] as IBazaarItem[],
        plugins: [] as IBazaarItem[],
        downloaded: [] as IBazaarItem[],
        update: {
            themes: [] as IBazaarItem[],
            templates: [] as IBazaarItem[],
            icons: [] as IBazaarItem[],
            widgets: [] as IBazaarItem[],
            plugins: [] as IBazaarItem[],
        }
    },
    _renderReadme(bazaarType: TBazaarType, data: IBazaarItem, downloaded: boolean) {
        const readmeElement = bazaar.element.querySelector("#configBazaarReadme") as HTMLElement;
        const urls = data.repoURL ? data.repoURL.split("/") : [];
        urls.pop();
        const sourceLabel = getBazaarInstallSourceLabel(data);
        const integritySummary = getBazaarIntegritySummary(data);
        const disabledReason = getPluginDisabledReason(data);
        const permissionsHTML = bazaarType === "plugins" ? renderPluginPermissionList(data.permissions) : "";
        const titleHTML = data.repoURL
            ? `<a href="${data.repoURL}" target="_blank" class="item__title" title="GitHub Repo">${data.preferredName}</a>`
            : `<div class="item__title">${data.preferredName}</div>`;
        const nameHTML = data.repoURL
            ? `<a href="${data.repoURL}" target="_blank" class="ft__on-surface ft__smaller" title="GitHub Repo">${data.name}</a>`
            : `<div class="ft__on-surface ft__smaller">${data.name}</div>`;
        const authorHTML = data.repoURL
            ? `<a href="${urls.join("/")}" target="_blank" title="Creator">${data.author}</a>`
            : `<span>${data.author}</span>`;
        const feedbackHTML = data.repoURL
            ? `<div class="fn__hr--b"></div>
    <div>
        <a href="${data.repoURL}/issues" target="_blank" title="Feedback via GitHub Issues" class="b3-button b3-button--success" style="width: 168px" data-type="feedback">${window.sourceflow.languages.feedback}</a>
    </div>`
            : "";
        const repoStatsHTML = data.repoURL && !downloaded
            ? `<div class="fn__hr--b"></div>
    <div class="fn__hr--b"></div>
    <div class="fn__flex" style="justify-content: center;">
        <svg class="svg ft__on-surface fn__flex-center"><use xlink:href="#iconGithub"></use></svg>
        <span class="fn__space"></span>
        <a href="${data.repoURL}" target="_blank" title="GitHub Repo">Repo</a>
        <span class="fn__space"></span>
        <span class="fn__space"></span>
        <svg class="svg ft__on-surface fn__flex-center"><use xlink:href="#iconStar"></use></svg>
        <span class="fn__space"></span>
        <a href="${data.repoURL}/stargazers" target="_blank" title="Stars">${data.stars}</a>
        <span class="fn__space"></span>
        <span class="fn__space"></span>
        <svg class="svg ft__on-surface fn__flex-center"><use xlink:href="#iconGitHubI"></use></svg>
        <span class="fn__space"></span>
        <a href="${data.repoURL}/issues" target="_blank" title="Open issues">${data.openIssues}</a>
        <span class="fn__space"></span>
        <span class="fn__space"></span>
        <svg class="svg ft__on-surface fn__flex-center"><use xlink:href="#iconDownload"></use></svg>
        <span class="fn__space"></span>
        ${data.downloads}
    </div>`
            : "";
        let navTitle = window.sourceflow.languages.icon;
        if (bazaarType === "themes") {
            navTitle = window.sourceflow.languages.theme;
        } else if (bazaarType === "widgets") {
            navTitle = window.sourceflow.languages.widget;
        } else if (bazaarType === "templates") {
            navTitle = window.sourceflow.languages.template;
        } else if (bazaarType === "plugins") {
            navTitle = window.sourceflow.languages.plugin;
        }
        const dataObj1 = {
            bazaarType,
            themeMode: data.modes?.toString(),
            name: data.name,
            repoURL: data.repoURL,
            repoHash: data.repoHash,
            downloaded
        };
        readmeElement.innerHTML = ` <div class="item__side" data-obj='${JSON.stringify(dataObj1)}'>
    <div class="fn__flex">
        <div style="padding-right: 8px" class="block__icon block__icon--show ariaLabel" data-position="north" data-type="goBack" aria-label="${window.sourceflow.languages.back}">
            <svg><use xlink:href="#iconLeft"></use></svg>
            <span class="fn__space"></span>
            ${navTitle}
        </div>
    </div>
    <img class="item__img" src="${data.iconURL}" loading="lazy" onerror="this.src='/stage/images/icon.png'">
    <div>
        ${titleHTML}
    </div>
    <div class="fn__hr"></div>
    <div>
        ${nameHTML}
    </div>
    <div class="block__icons">
        <span class="fn__flex-1"></span>
        ${data.preferredFunding ?
            bazaar._genFundingHTML(data.preferredFunding) :
            `<span data-position="north" class="ariaLabel block__icon block__icon--show ft__primary" aria-label="${window.sourceflow.languages.author}" style="cursor: default"><svg><use xlink:href="#iconAccount"></use></svg></span>`
        }
        <span class="fn__space"></span>
        ${authorHTML}
        <span class="fn__flex-1"></span>
    </div>
    <div class="fn__hr--b"></div>
    <div class="fn__hr--b"></div>
    <div class="ft__on-surface ft__smaller" style="line-height: 20px;">${window.sourceflow.languages.currentVer}<br>v${data.version}</div>
    <div class="fn__hr"></div>
    <div class="ft__on-surface ft__smaller" style="line-height: 20px;">${downloaded ? window.sourceflow.languages.installDate : window.sourceflow.languages.releaseDate}<br>${downloaded ? data.hInstallDate : data.hUpdated}</div>
    <div class="fn__hr${downloaded ? " fn__none" : ""}"></div>
    <div class="ft__on-surface ft__smaller${downloaded ? " fn__none" : ""}" style="line-height: 20px;">${window.sourceflow.languages.pkgSize}<br>${data.hSize}</div>
    <div class="fn__hr"></div>
    <div class="ft__on-surface ft__smaller" style="line-height: 20px;">${window.sourceflow.languages.installSize}<br>${data.hInstallSize}</div>
    <div class="fn__hr${sourceLabel ? "" : " fn__none"}"></div>
    <div class="ft__on-surface ft__smaller${sourceLabel ? "" : " fn__none"}" style="line-height: 20px;">${bazaarText("来源", "Source")}<br>${sourceLabel}</div>
    <div class="fn__hr${integritySummary ? "" : " fn__none"}"></div>
    <div class="ft__on-surface ft__smaller${integritySummary ? "" : " fn__none"}" style="line-height: 20px;">SHA-256<br><code class="fn__code">${integritySummary}</code></div>
    <div class="fn__hr${disabledReason ? "" : " fn__none"}"></div>
    <div class="ft__on-surface ft__smaller${disabledReason ? "" : " fn__none"}" style="line-height: 20px;">${bazaarText("禁用原因", "Disabled reason")}<br>${escapeHtml(disabledReason)}</div>
    <div class="fn__hr${bazaarType === "plugins" ? "" : " fn__none"}"></div>
    <div class="ft__on-surface ft__smaller${bazaarType === "plugins" ? "" : " fn__none"}" style="line-height: 20px;">${bazaarText("权限声明", "Declared permissions")}</div>
    <div class="${bazaarType === "plugins" ? "" : " fn__none"}" style="margin-top: 8px;">${permissionsHTML}</div>
    <div class="fn__hr--b"></div>
    <div class="fn__hr--b"></div>
    <div${(data.installed || downloaded) ? ' class="fn__none"' : ""}>
        <button ${data.disallowInstall ? `disabled aria-label="${window.sourceflow.languages.bazaarNeedVersion.replace("${x}", data.minAppVersion)}" data-position="north"` : ""} class="b3-button ariaLabel" style="width: 168px"  data-type="install">${window.sourceflow.languages.download}</button>
    </div>
    <div${(data.outdated && (data.installed || downloaded)) ? "" : ' class="fn__none"'}>
        <button ${data.disallowUpdate ? `disabled aria-label="${window.sourceflow.languages.bazaarNeedVersion.replace("${x}", data.updateRequiredMinAppVer)}" data-position="north"` : ""} class="b3-button ariaLabel" style="width: 168px" data-type="install-t">${window.sourceflow.languages.update}</button>
    </div>
    ${feedbackHTML}
    ${repoStatsHTML}
    <div class="fn__hr--b"></div>
    <div class="fn__hr--b"></div>
    <div class="fn__flex-1"></div>
</div>
<div class="item__main">
    <div class="item__preview" style="background-image: url(${data.previewURL})"></div>
    <div class="b3-typography${data.preferredDesc ? "" : " fn__none"}">
        <blockquote>
            <p>
                ${data.preferredDesc || ""}
            </p>
         </blockquote>
    </div>
    <div class="item__readme b3-typography b3-typography--default">
        <img data-type="img-loading" style="height: 64px;width: 100%;padding: 16px 0;" src="/stage/loading-pure.svg">
    </div>
</div>`;
        if (downloaded && data.preferredReadme) {
            const mdElement = readmeElement.querySelector(".item__readme");
            mdElement.innerHTML = data.preferredReadme;
            highlightRender(mdElement);
        } else if (!data.repoURL || !data.repoHash) {
            const mdElement = readmeElement.querySelector(".item__readme");
            mdElement.innerHTML = `<p>${bazaarText("该插件来自本地导入，未提供远程 README。", "This plugin was imported locally and does not provide a remote README.")}</p>`;
        } else {
            fetchPost("/api/bazaar/getBazaarPackageREADME", {
                repoURL: data.repoURL,
                repoHash: data.repoHash,
                packageType: bazaarType
            }, response => {
                const mdElement = readmeElement.querySelector(".item__readme");
                mdElement.innerHTML = response.data.html;
                highlightRender(mdElement);
            });
        }
        readmeElement.classList.add("config-bazaar__readme--show");
    },
    bindEvent(app: App) {
        if (!window.sourceflow.config.bazaar.trust) {
            bazaar.element.querySelector('[data-type="bazaar-trust"]').addEventListener("click", () => {
                const nextBazaar = Object.assign({}, window.sourceflow.config.bazaar, {trust: true});
                fetchPost("/api/setting/setBazaar", nextBazaar, (response) => {
                    window.sourceflow.config.bazaar = response.data;
                    bazaar.element.innerHTML = bazaar.genHTML();
                    bazaar.bindEvent(app);
                });
            });
            bazaar.element.querySelector('[data-type="bazaar-source"]')?.addEventListener("click", () => {
                openBazaarSourceDialog(app);
            });
            return;
        }
        this._genMyHTML("plugins", app);
        const importInputElement = bazaar.element.querySelector("#configBazaarPluginImport") as HTMLInputElement;
        importInputElement?.addEventListener("change", () => {
            const file = importInputElement.files?.[0];
            if (!file) {
                return;
            }
            const formData = new FormData();
            formData.append("file", file);
            fetchPost("/api/plugins/inspectLocalPlugin", formData, (response) => {
                if (response.code !== 0) {
                    importInputElement.value = "";
                    showMessage(response.msg);
                    return;
                }
                const reviewHTML = renderPluginPermissionReview(response.data || {});
                confirmDialog(
                    bazaarText("导入插件", "Import plugin"),
                    reviewHTML,
                    () => {
                        const installFormData = new FormData();
                        installFormData.append("file", file);
                        fetchPost("/api/plugins/installLocalPlugin", installFormData, (installResponse) => {
                            importInputElement.value = "";
                            if (installResponse.code !== 0) {
                                showMessage(installResponse.msg);
                                return;
                            }
                            showMessage(`${window.sourceflow.languages.imported} · ${bazaarText("默认保持关闭", "disabled by default")}`);
                            this._genMyHTML("plugins", app, false);
                        });
                    },
                    () => {
                        importInputElement.value = "";
                    }
                );
            });
        });
        bazaar.element.firstElementChild.addEventListener("click", (event) => {
            let target = event.target as HTMLElement;
            const dataElement = hasClosestByAttribute(target, "data-obj", null);
            let dataObj: IObject;
            if (dataElement) {
                dataObj = JSON.parse(dataElement.getAttribute("data-obj"));
            }
            while (target && !target.isEqualNode(bazaar.element)) {
                const type = target.getAttribute("data-type");
                if (target.tagName === "A") {
                    break;
                }
                if (type === "copy-funding") {
                    const funding = target.getAttribute("data-funding");
                    if (funding) {
                        writeText(funding);
                        showMessage(window.sourceflow.languages.copied);
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    break;
                } else if (type === "bazaar-source") {
                    openBazaarSourceDialog(app);
                    event.preventDefault();
                    event.stopPropagation();
                    break;
                } else if (type === "open" && dataObj) {
                    /// #if !BROWSER
                    const dirName = dataObj.bazaarType;
                    if (dirName === "icons" || dirName === "themes") {
                        useShell("openPath", path.join(window.sourceflow.config.system.confDir, "appearance", dirName, dataObj.name));
                    } else {
                        useShell("openPath", path.join(window.sourceflow.config.system.dataDir, dirName, dataObj.name));
                    }
                    /// #endif
                    event.preventDefault();
                    event.stopPropagation();
                    break;
                } else if (["myTheme", "myTemplate", "myIcon", "myWidget", "myPlugin"].includes(type)) {
                    if (target.classList.contains("b3-button--outline") &&
                        !bazaar.element.querySelector("#configBazaarDownloaded").getAttribute("data-loading")) {
                        target.parentElement.childNodes.forEach((item: HTMLElement) => {
                            if (item.nodeType !== 3 && item.classList.contains("b3-button")) {
                                item.classList.add("b3-button--outline");
                            }
                        });
                        target.classList.remove("b3-button--outline");
                        this._genMyHTML(type.replace("my", "").toLowerCase() + "s" as TBazaarType, app, false);
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    break;
                } else if (type === "import-local-plugin") {
                    importInputElement?.click();
                    event.preventDefault();
                    event.stopPropagation();
                    break;
                } else if (type === "check-bazaar-updates") {
                    this._getUpdate();
                    event.preventDefault();
                    event.stopPropagation();
                    break;
                } else if (type === "goBack") {
                    bazaar.element.querySelector("#configBazaarReadme").classList.remove("config-bazaar__readme--show");
                    event.preventDefault();
                    event.stopPropagation();
                    break;
                } else if (type === "install") {
                    if (!target.classList.contains("b3-button--progress") && !target.hasAttribute("disabled")) {
                        const bazaarType = dataObj.bazaarType as TBazaarType;
                        const runInstall = () => {
                            fetchPost(getBazaarInstallURL(bazaarType), {
                                keyword: (bazaar.element.querySelector(".config-bazaar__panel:not(.fn__none) .b3-form__icon-input") as HTMLInputElement).value,
                                repoURL: dataObj.repoURL,
                                packageName: dataObj.name,
                                repoHash: dataObj.repoHash,
                                mode: dataObj.themeMode === "dark" ? 1 : 0,
                                frontend: getFrontend()
                            }, response => {
                                bazaar._onBazaar(response, bazaarType);
                                if (response.code !== 0) {
                                    return;
                                }
                                bazaar._genMyHTML(bazaarType, app, false);
                                if (bazaarType === "plugins") {
                                    if (window.sourceflow.config.bazaar.pluginDisabled) {
                                        confirmDialog(window.sourceflow.languages.confirm, window.sourceflow.languages.enablePluginTip2);
                                    } else {
                                        confirmDialog("💡 " + window.sourceflow.languages.enablePlugin, window.sourceflow.languages.enablePluginTip, () => {
                                            fetchPost("/api/plugins/setPluginEnabled", {
                                                packageName: dataObj.name,
                                                enabled: true,
                                                frontend: getFrontend(),
                                                app: Constants.SOURCEFLOW_APPID,
                                            }, (response) => {
                                                loadPlugin(app, response.data);
                                                bazaar._genMyHTML(bazaarType, app, false);
                                            });
                                        });
                                    }
                                }
                            });
                        };
                        if (bazaarType === "plugins") {
                            const pluginItem = findBazaarItemByData(bazaarType, dataObj);
                            confirmPluginBazaarInstall(pluginItem || {
                                name: dataObj.name,
                                preferredName: dataObj.name,
                                preferredDesc: "",
                                author: bazaarDefaultAuthor,
                                repoURL: dataObj.repoURL,
                                url: dataObj.repoURL,
                                version: "",
                                permissions: [],
                                frontends: [],
                                backends: [],
                                archiveSHA256: "",
                            } as IBazaarItem, runInstall, false);
                        } else {
                            runInstall();
                        }
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    break;
                } else if (type === "install-all") {
                    confirmDialog("⬆️ " + window.sourceflow.languages.updateAll, window.sourceflow.languages.confirmUpdateAll, () => {
                        fetchPost("/api/bazaar/batchUpdatePackage", {frontend: getFrontend()});
                    });
                    event.preventDefault();
                    event.stopPropagation();
                    break;
                } else if (type === "feedback") {
                    event.preventDefault();
                    event.stopPropagation();
                    break;
                } else if (type === "install-t") {
                    if (!target.classList.contains("b3-button--progress") && !target.hasAttribute("disabled")) {
                        const bazaarType = dataObj.bazaarType as TBazaarType;
                        const runUpdate = () => {
                            if (!target.classList.contains("b3-button")) {
                                target.parentElement.insertAdjacentHTML("afterend", '<img data-type="img-loading" style="position: absolute;top: 0;left: 0;height: 100%;width: 100%;padding: 16px;box-sizing: border-box;" src="/stage/loading-pure.svg">');
                            }
                            fetchPost(getBazaarInstallURL(bazaarType), {
                                keyword: (bazaar.element.querySelector(".config-bazaar__panel:not(.fn__none) .b3-form__icon-input") as HTMLInputElement).value,
                                repoURL: dataObj.repoURL,
                                packageName: dataObj.name,
                                repoHash: dataObj.repoHash,
                                mode: dataObj.themeMode === "dark" ? 1 : 0,
                                frontend: getFrontend()
                            }, response => {
                                this._genMyHTML(bazaarType, app);
                                bazaar._onBazaar(response, bazaarType);
                            });
                        };
                        if (bazaarType === "plugins") {
                            const pluginItem = findBazaarItemByData(bazaarType, dataObj);
                            confirmPluginBazaarInstall(pluginItem || {
                                name: dataObj.name,
                                preferredName: dataObj.name,
                                preferredDesc: "",
                                author: bazaarDefaultAuthor,
                                repoURL: dataObj.repoURL,
                                url: dataObj.repoURL,
                                version: "",
                                permissions: [],
                                frontends: [],
                                backends: [],
                                archiveSHA256: "",
                            } as IBazaarItem, runUpdate, true);
                        } else {
                            confirmDialog("⬆️ " + window.sourceflow.languages.update, window.sourceflow.languages.confirmUpdate, runUpdate);
                        }
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    break;
                } else if (type === "uninstall") {
                    const bazaarType = dataObj.bazaarType as TBazaarType;
                    let url = "/api/bazaar/uninstallBazaarTemplate";
                    if (bazaarType === "themes") {
                        url = "/api/bazaar/uninstallBazaarTheme";
                    } else if (bazaarType === "icons") {
                        url = "/api/bazaar/uninstallBazaarIcon";
                    } else if (bazaarType === "widgets") {
                        url = "/api/bazaar/uninstallBazaarWidget";
                    } else if (bazaarType === "plugins") {
                        url = "/api/bazaar/uninstallBazaarPlugin";
                    }

                    const packageName = dataObj.name;
                    if (window.sourceflow.config.appearance.themeDark === packageName ||
                        window.sourceflow.config.appearance.themeLight === packageName ||
                        window.sourceflow.config.appearance.icon === packageName) {
                        showMessage(window.sourceflow.languages.uninstallTip);
                    } else {
                        confirmDialog("⚠️ " + window.sourceflow.languages.uninstall, window.sourceflow.languages.confirmUninstall.replace("${name}", packageName), () => {
                            fetchPost(url, {
                                packageName,
                                keyword: (bazaar.element.querySelector(".config-bazaar__panel:not(.fn__none) .b3-form__icon-input") as HTMLInputElement).value,
                                frontend: getFrontend()
                            }, response => {
                                this._genMyHTML(bazaarType, app);
                                bazaar._onBazaar(response, bazaarType);
                            });
                        });
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    break;
                } else if (type === "switch") {
                    const bazaarType = dataObj.bazaarType as TBazaarType;
                    const packageName = dataObj.name;
                    const mode = dataObj.themeMode === "dark" ? 1 : 0;
                    if (bazaarType === "icons") {
                        fetchPost("/api/setting/setAppearance", Object.assign({}, window.sourceflow.config.appearance, {
                            icon: packageName,
                        }), (appearanceResponse) => {
                            this._genMyHTML(bazaarType, app, false);
                            fetchPost("/api/bazaar/getBazaarIcon", {}, response => {
                                response.data.appearance = appearanceResponse.data;
                                bazaar._onBazaar(response, "icons");
                                bazaar._data.icons = response.data.packages;
                            });
                        });
                    } else if (bazaarType === "themes") {
                        fetchPost("/api/setting/setAppearance", Object.assign({}, window.sourceflow.config.appearance, {
                            mode,
                            modeOS: false,
                            themeDark: mode === 1 ? packageName : window.sourceflow.config.appearance.themeDark,
                            themeLight: mode === 0 ? packageName : window.sourceflow.config.appearance.themeLight,
                        }), (appearanceResponse) => {
                            this._genMyHTML("themes", app, false);
                            fetchPost("/api/bazaar/getBazaarTheme", {}, response => {
                                response.data.appearance = appearanceResponse.data;
                                bazaar._onBazaar(response, "themes");
                                bazaar._data.themes = response.data.packages;
                            });
                        });
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    break;
                } else if (type === "setting") {
                    app.plugins.find((item: Plugin) => {
                        if (item.name === dataObj.name) {
                            item.openSetting();
                            return true;
                        }
                    });
                    event.preventDefault();
                    event.stopPropagation();
                    break;
                } else if (type === "plugins-enable") {
                    if (!target.getAttribute("disabled")) {
                        target.setAttribute("disabled", "disabled");
                        window.sourceflow.config.bazaar.pluginDisabled = !(target as HTMLInputElement).checked;
                        fetchPost("/api/setting/setBazaar", window.sourceflow.config.bazaar, () => {
                            target.removeAttribute("disabled");
                            if (window.sourceflow.config.bazaar.pluginDisabled) {
                                bazaar.element.querySelectorAll("#configBazaarDownloaded .b3-card").forEach(item => {
                                    item.classList.add("b3-card--disabled");
                                    uninstall(app, JSON.parse(item.getAttribute("data-obj")).name, true);
                                });
                            } else {
                                bazaar.element.querySelectorAll("#configBazaarDownloaded .b3-card").forEach(item => {
                                    item.classList.remove("b3-card--disabled");
                                });
                                loadPlugins(app, null, false).then(() => {
                                    app.plugins.forEach(item => {
                                        afterLoadPlugin(item);
                                    });
                                });
                                saveLayout();
                            }
                        });
                    }
                    event.stopPropagation();
                    break;
                } else if (type === "plugin-enable") {
                    if (!target.hasAttribute("disabled")) {
                        target.setAttribute("disabled", "disabled");
                        const enabled = (target as HTMLInputElement).checked;
                        const runToggle = () => {
                            fetchPost("/api/plugins/setPluginEnabled", {
                                packageName: dataObj.name,
                                enabled,
                                frontend: getFrontend(),
                                app: Constants.SOURCEFLOW_APPID,
                            }, (response) => {
                                target.removeAttribute("disabled");
                                if (enabled) {
                                    loadPlugin(app, response.data).then((plugin: Plugin) => {
                                        // @ts-ignore
                                        if (plugin.setting || plugin.__proto__.hasOwnProperty("openSetting")) {
                                            target.parentElement.querySelector('[data-type="setting"]').classList.remove("fn__none");
                                        } else {
                                            target.parentElement.querySelector('[data-type="setting"]').classList.add("fn__none");
                                        }
                                    });
                                } else {
                                    uninstall(app, dataObj.name, true);
                                    target.parentElement.querySelector('[data-type="setting"]').classList.add("fn__none");
                                    const disableTip = target.getAttribute("data-disabletip");
                                    if (disableTip) {
                                        target.setAttribute("disabled", "disabled");
                                        target.setAttribute("aria-label", disableTip);
                                    }
                                }
                            });
                        };
                        if (enabled) {
                            const pluginItem = findBazaarItemByData("plugins", dataObj) || {
                                name: dataObj.name,
                                preferredName: dataObj.name,
                                preferredDesc: "",
                                author: bazaarDefaultAuthor,
                                repoURL: dataObj.repoURL,
                                url: dataObj.repoURL,
                                version: "",
                                permissions: [],
                                frontends: [],
                                backends: [],
                                archiveSHA256: "",
                            } as IBazaarItem;
                            confirmPluginEnable(pluginItem, runToggle, () => {
                                target.removeAttribute("disabled");
                                (target as HTMLInputElement).checked = false;
                            });
                        } else {
                            runToggle();
                        }
                    }
                    event.stopPropagation();
                    break;
                } else if (target.classList.contains("b3-card")) {
                    if (!hasClosestByClassName(event.target as HTMLElement, "b3-card__actions--right")) {
                        const dataObj = JSON.parse(target.getAttribute("data-obj"));
                        const bazaarType = (dataObj.bazaarType) as TBazaarType;
                        let data;
                        if (hasClosestByAttribute(target, "data-type", "downloaded-update")) {
                            data = bazaar._data.update[(dataObj.bazaarType) as TBazaarType].find((item: IBazaarItem) => matchBazaarItem(item, dataObj));
        } else {
            data = (dataObj.downloaded ? bazaar._data.downloaded : bazaar._data[bazaarType]).find((item: IBazaarItem) => matchBazaarItem(item, dataObj));
        }
                        bazaar._renderReadme(bazaarType, data, dataObj.downloaded);
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    break;
                } else if (target.classList.contains("item") && !target.classList.contains("item--focus")) {
                    // switch tab
                    bazaar.element.querySelector(".layout-tab-bar .item--focus").classList.remove("item--focus");
                    target.classList.add("item--focus");
                    bazaar.element.querySelectorAll(".config-bazaar__panel").forEach(item => {
                        if (type === item.getAttribute("data-type")) {
                            item.classList.remove("fn__none");
                            if (!item.getAttribute("data-init")) {
                                if (type === "template") {
                                    fetchPost("/api/bazaar/getBazaarTemplate", {}, response => {
                                        bazaar._onBazaar(response, "templates");
                                        bazaar._data.templates = response.data.packages;
                                    });
                                } else if (type === "icon") {
                                    fetchPost("/api/bazaar/getBazaarIcon", {}, response => {
                                        bazaar._onBazaar(response, "icons");
                                        bazaar._data.icons = response.data.packages;
                                    });
                                } else if (type === "widget") {
                                    fetchPost("/api/bazaar/getBazaarWidget", {}, response => {
                                        bazaar._onBazaar(response, "widgets");
                                        bazaar._data.widgets = response.data.packages;
                                    });
                                } else if (type === "theme") {
                                    fetchPost("/api/bazaar/getBazaarTheme", {}, response => {
                                        bazaar._onBazaar(response, "themes");
                                        bazaar._data.themes = response.data.packages;
                                    });
                                } else if (type === "plugin") {
                                    fetchPost("/api/bazaar/getBazaarPlugin", {
                                        frontend: getFrontend()
                                    }, response => {
                                        bazaar._onBazaar(response, "plugins");
                                        bazaar._data.plugins = response.data.packages;
                                    });
                                }
                                item.setAttribute("data-init", "true");
                            }
                        } else {
                            item.classList.add("fn__none");
                        }
                    });
                    event.preventDefault();
                    event.stopPropagation();
                    break;
                } else if (target.classList.contains("item__preview")) {
                    target.classList.toggle("item__preview--fullscreen");
                    event.preventDefault();
                    event.stopPropagation();
                    break;
                }
                target = target.parentElement;
            }
        });

        bazaar.element.querySelectorAll(".config-bazaar__panel .b3-form__icon > .b3-text-field").forEach((inputElement: HTMLInputElement) => {
            inputElement.addEventListener("keydown", (event) => {
                if (event.isComposing) {
                    return;
                }
                if (event.key === "Enter") {
                    const keyword = inputElement.value.trim();
                    const type = (hasClosestByClassName(inputElement, "config-bazaar__panel") as HTMLElement).getAttribute("data-type");
                    if (type === "template") {
                        fetchPost("/api/bazaar/getBazaarTemplate", {keyword}, response => {
                            bazaar._onBazaar(response, "templates");
                            bazaar._data.templates = response.data.packages;
                        });
                    } else if (type === "icon") {
                        fetchPost("/api/bazaar/getBazaarIcon", {keyword}, response => {
                            bazaar._onBazaar(response, "icons");
                            bazaar._data.icons = response.data.packages;
                        });
                    } else if (type === "widget") {
                        fetchPost("/api/bazaar/getBazaarWidget", {keyword}, response => {
                            bazaar._onBazaar(response, "widgets");
                            bazaar._data.widgets = response.data.packages;
                        });
                    } else if (type === "theme") {
                        fetchPost("/api/bazaar/getBazaarTheme", {keyword}, response => {
                            bazaar._onBazaar(response, "themes");
                            bazaar._data.themes = response.data.packages;
                        });
                    } else if (type === "plugin") {
                        fetchPost("/api/bazaar/getBazaarPlugin", {
                            frontend: getFrontend(),
                            keyword
                        }, response => {
                            bazaar._onBazaar(response, "plugins");
                            bazaar._data.plugins = response.data.packages;
                        });
                    } else if (type === "downloaded") {
                        const bazaarType = inputElement.parentElement.parentElement.querySelector(".b3-button:not(.b3-button--outline)").getAttribute("data-type").replace("my", "").toLowerCase() + "s" as TBazaarType;
                        this._genMyHTML(bazaarType, app);
                    }
                    event.preventDefault();
                    return;
                }
            });
        });

        bazaar.element.querySelectorAll(".b3-select").forEach((selectElement: HTMLSelectElement) => {
            selectElement.addEventListener("change", (event) => {
                if (selectElement.id === "bazaarSelect") {
                    // theme select
                    bazaar.element.querySelectorAll("#configBazaarTheme .b3-card").forEach((item) => {
                        const dataObj = JSON.parse(item.getAttribute("data-obj"));
                        if (selectElement.value === "0") {
                            if (dataObj.themeMode.indexOf("light") > -1) {
                                item.classList.remove("fn__none");
                            } else {
                                item.classList.add("fn__none");
                            }
                        } else if (selectElement.value === "1") {
                            if (dataObj.themeMode.indexOf("dark") > -1) {
                                item.classList.remove("fn__none");
                            } else {
                                item.classList.add("fn__none");
                            }
                        } else {
                            item.classList.remove("fn__none");
                        }
                    });
                    (event.target as HTMLElement).parentElement.querySelector(".counter").textContent = bazaar.element.querySelectorAll("#configBazaarTheme .b3-card:not(.fn__none)").length.toString();
                } else {
                    // sort
                    const localSort = window.sourceflow.storage[Constants.LOCAL_BAZAAR];
                    const panelElement = selectElement.parentElement.parentElement;
                    let html = "";
                    const cardElements = Array.from(panelElement.querySelectorAll(".b3-card"));
                    if (selectElement.value === "0") { // 更新时间降序
                        cardElements.sort((a, b) => {
                            return JSON.parse(b.getAttribute("data-obj")).updated < JSON.parse(a.getAttribute("data-obj")).updated ? -1 : 1;
                        }).forEach((item) => {
                            html += item.outerHTML;
                        });
                    } else if (selectElement.value === "1") { // 更新时间升序
                        cardElements.sort((a, b) => {
                            return JSON.parse(b.getAttribute("data-obj")).updated < JSON.parse(a.getAttribute("data-obj")).updated ? 1 : -1;
                        }).forEach((item) => {
                            html += item.outerHTML;
                        });
                    } else if (selectElement.value === "2") { // 下载次数降序
                        cardElements.sort((a, b) => {
                            return JSON.parse(b.getAttribute("data-obj")).downloads < JSON.parse(a.getAttribute("data-obj")).downloads ? -1 : 1;
                        }).forEach((item) => {
                            html += item.outerHTML;
                        });
                    } else if (selectElement.value === "3") { // 下载次数升序
                        cardElements.sort((a, b) => {
                            return JSON.parse(b.getAttribute("data-obj")).downloads < JSON.parse(a.getAttribute("data-obj")).downloads ? 1 : -1;
                        }).forEach((item) => {
                            html += item.outerHTML;
                        });
                    }
                    localSort[selectElement.parentElement.parentElement.getAttribute("data-type")] = selectElement.value;
                    setStorageVal(Constants.LOCAL_BAZAAR, window.sourceflow.storage[Constants.LOCAL_BAZAAR]);
                    if (cardElements.length > 1) {
                        html += '<div class="fn__flex-1" style="margin-left: 15px;min-width: 342px;"></div><div class="fn__flex-1" style="margin-left: 15px;min-width: 342px;"></div>';
                    }
                    panelElement.querySelector(".b3-cards").innerHTML = html;
                }
            });
        });
    },
    _onBazaar(response: IWebSocketData, bazaarType: TBazaarType) {
        let id = "#configBazaarTemplate";
        if (bazaarType === "themes") {
            id = "#configBazaarTheme";
        } else if (bazaarType === "icons") {
            id = "#configBazaarIcon";
        } else if (bazaarType === "widgets") {
            id = "#configBazaarWidget";
        } else if (bazaarType === "plugins") {
            id = "#configBazaarPlugin";
        }
        const element = bazaar.element.querySelector(id);
        if (response.code === 1) {
            // 安装集市包 /api/bazaar/installBazaar* 失败
            showMessage(response.msg);
            element.querySelectorAll("img[data-type='img-loading']").forEach((item) => {
                item.remove();
            });
            return;
        }
        if (bazaar.element.querySelector("#configBazaarReadme").classList.contains("config-bazaar__readme--show")) {
            const dataObj = JSON.parse(bazaar.element.querySelector("#configBazaarReadme > .item__side").getAttribute("data-obj"));
            bazaar._renderReadme((dataObj.bazaarType) as TBazaarType,
                response.data.packages.find((item: IBazaarItem) => matchBazaarItem(item, dataObj)),
                dataObj.downloaded);
        }
        let html = "";
        response.data.packages.forEach((item: IBazaarItem) => {
            html += this._genCardHTML(item, bazaarType);
        });
        bazaar._data[bazaarType] = response.data.packages;
        element.innerHTML = `<div class="b3-cards">${html}</div>`;
        element.parentElement.querySelector(".counter").textContent = element.querySelectorAll(".b3-card:not(.fn__none)").length.toString();
        const localSort = window.sourceflow.storage[Constants.LOCAL_BAZAAR];
        if (localSort[bazaarType.replace("s", "")] === "1") {
            html = "";
            Array.from(element.querySelectorAll(".b3-card")).sort((a, b) => {
                return JSON.parse(b.getAttribute("data-obj")).updated < JSON.parse(a.getAttribute("data-obj")).updated ? 1 : -1;
            }).forEach((item) => {
                html += item.outerHTML;
            });
        } else if (localSort[bazaarType.replace("s", "")] === "2") { // 下载次数降序
            html = "";
            Array.from(element.querySelectorAll(".b3-card")).sort((a, b) => {
                return JSON.parse(b.getAttribute("data-obj")).downloads < JSON.parse(a.getAttribute("data-obj")).downloads ? -1 : 1;
            }).forEach((item) => {
                html += item.outerHTML;
            });
        } else if (localSort[bazaarType.replace("s", "")] === "3") { // 下载次数升序
            html = "";
            Array.from(element.querySelectorAll(".b3-card")).sort((a, b) => {
                return JSON.parse(b.getAttribute("data-obj")).downloads < JSON.parse(a.getAttribute("data-obj")).downloads ? 1 : -1;
            }).forEach((item) => {
                html += item.outerHTML;
            });
        }
        if (response.data.packages.length > 1) {
            html += '<div class="fn__flex-1" style="margin-left: 15px;min-width: 342px;"></div><div class="fn__flex-1" style="margin-left: 15px;min-width: 342px;"></div>';
        }
        element.innerHTML = `<div class="b3-cards">${html}</div>`;
    }
};
