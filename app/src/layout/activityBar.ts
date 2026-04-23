import {App} from "../index";
import {Constants} from "../constants";
import {setStorageVal, updateHotkeyTip} from "../protyle/util/compatibility";
import {getDockByType} from "./tabUtil";
import {showMessage} from "../dialog/message";
import {ASSISTANT_AI_DOCK_TYPE, ASSISTANT_TERMINAL_DOCK_TYPE} from "../assistant/constants";
import {toggleFullscreenWithZenModeAlias} from "../editor/zenMode";

const loadSearchSpreadModule = () => import("../search/spread");
const loadCommandPanelModule = () => import("../boot/globalEvent/command/panel");
const loadCaptureDialogModule = () => import("../capture/dialog");
const loadTopBarMenuModule = () => import("../plugin/openTopBarMenu");
const loadWorkbenchDialogModule = () => import("../workbench/dialog");
const loadConfigModule = () => import("../config");
const loadMountModule = () => import("../util/mount");
const loadPomodoroDialogModule = () => import("../focus/pomodoroDialog");
const loadHomepageModule = () => import("../homepage");

type TActivityAction = "search" | "command" | "capture" | "more" | "homepage" | "workbench" | "focusTimer" | "zenMode" | "config" | "backup" | "plugin" | "help";
type TDockSource = "left" | "right" | "bottom";
type TActivityGroup = "rail" | "more";

interface IActivityDockButton {
    type: string;
    icon: string;
    title: string;
    hotkey: string;
    source: TDockSource;
    sortKey: string;
    defaultGroup: TActivityGroup;
}

interface IActivityActionButton {
    action: TActivityAction;
    icon: string;
    title: string;
    hotkey: string;
    source: TDockSource;
    sortKey: string;
    defaultGroup: TActivityGroup;
}

type TActivityItem = IActivityDockButton | IActivityActionButton;

let currentApp: App;
let morePanelVisible = false;
let activityBarGlobalEventsBound = false;
let dragActivityBarElement: HTMLElement;
let dragActivityBarSortKey = "";
let dragActivityBarDroppedInside = false;
const ACTIVITY_BAR_STORAGE_VERSION = 5;
const ACTIVITY_BAR_MORE_DEFAULT_KEYS = new Set(["action:plugin", "action:backup", "action:config", "action:help"]);
const ACTIVITY_BAR_FIXED_ACTION_KEYS = new Set(["action:backup", "action:config"]);
const ACTIVITY_BAR_RAIL_PIN_KEYS = new Set([
    "dock:outline",
    "action:command",
    `dock:${ASSISTANT_TERMINAL_DOCK_TYPE}`,
    `dock:${ASSISTANT_AI_DOCK_TYPE}`,
]);

const enforceActivityBarPinnedKeys = (storage: {rail: string[]; more: string[]}) => {
    const rail = normalizeStoredActivityBarKeys(storage?.rail).filter((item) => !ACTIVITY_BAR_FIXED_ACTION_KEYS.has(item));
    const more = normalizeStoredActivityBarKeys(storage?.more)
        .filter((item) => !ACTIVITY_BAR_FIXED_ACTION_KEYS.has(item) && !ACTIVITY_BAR_RAIL_PIN_KEYS.has(item));
    ACTIVITY_BAR_RAIL_PIN_KEYS.forEach((item) => {
        if (!rail.includes(item)) {
            rail.push(item);
        }
    });
    return {rail, more};
};

const escapeAttr = (value: string | undefined | null) => `${value ?? ""}`.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const activityBarText = (zh: string, en: string) => window.sourceflow.config.lang === "zh_CN" ? zh : en;

const getActivityBarElement = () => document.getElementById("activityBar");
const setUnifiedActivityBarEnabled = (enabled: boolean) => {
    document.body.classList.toggle("body--activitybar-unified", enabled);
    getActivityBarElement()?.setAttribute("data-unified-ready", enabled ? "true" : "false");
};
const normalizeStoredActivityBarKeys = (value: unknown) => {
    return Array.isArray(value) ? value.filter((item: unknown) => typeof item === "string") : [];
};
const migrateActivityBarStorage = (stored: {rail?: unknown; more?: unknown}) => {
    const originalRail = normalizeStoredActivityBarKeys(stored?.rail);
    const originalMore = normalizeStoredActivityBarKeys(stored?.more);
    const rail = originalRail.filter((item) => !ACTIVITY_BAR_MORE_DEFAULT_KEYS.has(item) && !ACTIVITY_BAR_FIXED_ACTION_KEYS.has(item));
    const more = originalMore.filter((item) => !ACTIVITY_BAR_FIXED_ACTION_KEYS.has(item) && !ACTIVITY_BAR_RAIL_PIN_KEYS.has(item));
    originalRail.forEach((item) => {
        if (!ACTIVITY_BAR_MORE_DEFAULT_KEYS.has(item) || ACTIVITY_BAR_FIXED_ACTION_KEYS.has(item) || more.includes(item)) {
            return;
        }
        more.push(item);
    });
    ACTIVITY_BAR_RAIL_PIN_KEYS.forEach((item) => {
        if (!rail.includes(item)) {
            rail.push(item);
        }
    });
    return {rail, more};
};
const getActivityBarStorage = () => {
    const stored = window.sourceflow.storage[Constants.LOCAL_ACTIVITYBAR] || {};
    if (stored.version === ACTIVITY_BAR_STORAGE_VERSION) {
        return enforceActivityBarPinnedKeys({
            rail: normalizeStoredActivityBarKeys(stored.rail),
            more: normalizeStoredActivityBarKeys(stored.more),
        });
    }
    if (stored.version === 1 || stored.version === 3) {
        return migrateActivityBarStorage(stored);
    }
    if (stored.version !== ACTIVITY_BAR_STORAGE_VERSION) {
        return {
            rail: [],
            more: [],
        };
    }
};

const saveActivityBarStorage = (storage: {rail: string[]; more: string[]}) => {
    const normalized = enforceActivityBarPinnedKeys(storage);
    const nextStorage = {
        version: ACTIVITY_BAR_STORAGE_VERSION,
        rail: normalized.rail,
        more: normalized.more,
    };
    window.sourceflow.storage[Constants.LOCAL_ACTIVITYBAR] = nextStorage;
    setStorageVal(Constants.LOCAL_ACTIVITYBAR, nextStorage);
};

const resetActivityBarOrder = () => {
    saveActivityBarStorage({rail: [], more: []});
};

const escapeSelectorValue = (value: string) => {
    const text = `${value || ""}`;
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
        return CSS.escape(text);
    }
    return text.replace(/["\\]/g, "\\$&");
};

const getDockButtons = (selector: string, source: TDockSource) => {
    const result: IActivityDockButton[] = [];
    document.querySelectorAll(`${selector} .dock__item[data-type]`).forEach((item: HTMLElement) => {
        const type = item.getAttribute("data-type");
        if (!type) {
            return;
        }
        const useElement = item.querySelector("use");
        if (!useElement) {
            return;
        }
        const defaultGroup: TActivityGroup = type === ASSISTANT_AI_DOCK_TYPE || type === ASSISTANT_TERMINAL_DOCK_TYPE || source === "left"
            ? "rail"
            : "more";
        result.push({
            type,
            icon: useElement.getAttribute("xlink:href")?.replace("#", "") || "iconList",
            title: item.getAttribute("data-title") || type,
            hotkey: item.getAttribute("data-hotkey") || "",
            source,
            sortKey: `dock:${type}`,
            defaultGroup,
        });
    });
    return result;
};

const getUnifiedDockButtons = () => {
    const exists = new Set<string>();
    const domButtons = [...getDockButtons("#dockLeft", "left"), ...getDockButtons("#dockRight", "right"), ...getDockButtons("#dockBottom", "bottom")];
    const pluginFallbackButtons: IActivityDockButton[] = [];
    currentApp?.plugins?.forEach((plugin: any) => {
        Object.keys(plugin?.docks || {}).forEach((type) => {
            if (domButtons.find((item) => item.type === type)) {
                return;
            }
            const dock = plugin?.docks?.[type];
            if (!dock?.config) {
                return;
            }
            const position = `${dock.config.position || ""}`;
            const source: TDockSource = position.startsWith("Left")
                ? "left"
                : position.startsWith("Right")
                    ? "right"
                    : "bottom";
            const hotkey = window.sourceflow.config.keymap.plugin?.[plugin.name]?.[type]?.custom || "";
            pluginFallbackButtons.push({
                type,
                icon: dock.config.icon || "iconList",
                title: dock.config.title || type,
                hotkey,
                source,
                sortKey: `dock:${type}`,
                defaultGroup: type === ASSISTANT_AI_DOCK_TYPE || type === ASSISTANT_TERMINAL_DOCK_TYPE || source === "left"
                    ? "rail"
                    : "more",
            });
        });
    });
    const buttons = [...domButtons, ...pluginFallbackButtons];
    return buttons.filter((item) => {
        if (exists.has(item.type)) {
            return false;
        }
        exists.add(item.type);
        return true;
    });
};

const extractDockButton = (items: IActivityDockButton[], type: string) => {
    const index = items.findIndex((item) => item.type === type);
    if (index < 0) {
        return undefined;
    }
    return items.splice(index, 1)[0];
};

const getActionLabel = (action: TActivityAction) => {
    switch (action) {
        case "search":
            return `${window.sourceflow.languages.globalSearch || activityBarText("搜索", "Search")} ${updateHotkeyTip(window.sourceflow.config.keymap.general.globalSearch.custom)}`.trim();
        case "command":
            return `${window.sourceflow.languages.commandPanel || activityBarText("命令面板", "Command Panel")} ${updateHotkeyTip(window.sourceflow.config.keymap.general.commandPanel.custom)}`.trim();
        case "capture":
            return window.sourceflow.languages.urlImport || activityBarText("网页导入", "Web Import");
        case "more":
            return window.sourceflow.languages.more || activityBarText("更多", "More");
        case "homepage":
            return activityBarText("主页", "Home");
        case "workbench":
            return window.sourceflow.languages.workbench || activityBarText("工作台", "Workbench");
        case "focusTimer":
            return activityBarText("番茄闹钟", "Pomodoro Timer");
        case "zenMode":
            return window.sourceflow.languages.zMode || activityBarText("Z 模式", "Z Mode");
        case "config":
            return window.sourceflow.languages.config || activityBarText("设置", "Settings");
        case "backup":
            return window.sourceflow.languages.backup || activityBarText("备份", "Backup");
        case "plugin":
            return window.sourceflow.languages.plugin || activityBarText("插件", "Plugins");
        case "help":
            return window.sourceflow.languages.help || activityBarText("帮助", "Help");
    }
};

const getActionIcon = (action: TActivityAction) => {
    switch (action) {
        case "search":
            return "iconSearch";
        case "command":
            return "iconKeymap";
        case "capture":
            return "iconUpload";
        case "more":
            return "iconMore";
        case "homepage":
            return "iconLayout";
        case "workbench":
            return "iconTable";
        case "focusTimer":
            return "iconClock";
        case "zenMode":
            return "iconFocus";
        case "config":
            return "iconSettings";
        case "backup":
            return "iconCloud";
        case "plugin":
            return "iconPlugin";
        case "help":
            return "iconHelp";
    }
};

const getDefaultActionButtons = (): IActivityActionButton[] => [
    {
        action: "search",
        icon: getActionIcon("search"),
        title: getActionLabel("search"),
        hotkey: "",
        source: "left",
        sortKey: "action:search",
        defaultGroup: "rail",
    },
    {
        action: "homepage",
        icon: getActionIcon("homepage"),
        title: getActionLabel("homepage"),
        hotkey: "",
        source: "left",
        sortKey: "action:homepage",
        defaultGroup: "rail",
    },
    {
        action: "focusTimer",
        icon: getActionIcon("focusTimer"),
        title: getActionLabel("focusTimer"),
        hotkey: "",
        source: "left",
        sortKey: "action:focusTimer",
        defaultGroup: "rail",
    },
    {
        action: "zenMode",
        icon: getActionIcon("zenMode"),
        title: getActionLabel("zenMode"),
        hotkey: "",
        source: "left",
        sortKey: "action:zenMode",
        defaultGroup: "rail",
    },
    {
        action: "plugin",
        icon: getActionIcon("plugin"),
        title: getActionLabel("plugin"),
        hotkey: "",
        source: "left",
        sortKey: "action:plugin",
        defaultGroup: "more",
    },
    {
        action: "backup",
        icon: getActionIcon("backup"),
        title: getActionLabel("backup"),
        hotkey: "",
        source: "left",
        sortKey: "action:backup",
        defaultGroup: "more",
    },
    {
        action: "config",
        icon: getActionIcon("config"),
        title: getActionLabel("config"),
        hotkey: "",
        source: "left",
        sortKey: "action:config",
        defaultGroup: "more",
    },
    {
        action: "workbench",
        icon: getActionIcon("workbench"),
        title: getActionLabel("workbench"),
        hotkey: "",
        source: "left",
        sortKey: "action:workbench",
        defaultGroup: "more",
    },
    {
        action: "capture",
        icon: getActionIcon("capture"),
        title: getActionLabel("capture"),
        hotkey: "",
        source: "left",
        sortKey: "action:capture",
        defaultGroup: "more",
    },
    {
        action: "command",
        icon: getActionIcon("command"),
        title: getActionLabel("command"),
        hotkey: "",
        source: "left",
        sortKey: "action:command",
        defaultGroup: "rail",
    },
    {
        action: "help",
        icon: getActionIcon("help"),
        title: getActionLabel("help"),
        hotkey: "",
        source: "left",
        sortKey: "action:help",
        defaultGroup: "more",
    },
];

const getDefaultOrderedItems = (): TActivityItem[] => {
    const dockButtons = getUnifiedDockButtons();
    const fileButton = extractDockButton(dockButtons, "file");
    const outlineButton = extractDockButton(dockButtons, "outline");
    const assistantAIButton = extractDockButton(dockButtons, ASSISTANT_AI_DOCK_TYPE);
    const assistantTerminalButton = extractDockButton(dockButtons, ASSISTANT_TERMINAL_DOCK_TYPE);
    const leftDockButtons = dockButtons.filter((item) => item.source === "left");
    const externalDockButtons = dockButtons.filter((item) => item.source !== "left");
    const actions = getDefaultActionButtons().filter((item) => item.action !== "capture" || !window.sourceflow.config.readonly);
    const searchAction = actions.find((item) => item.action === "search");
    const homepageAction = actions.find((item) => item.action === "homepage");
    const focusTimerAction = actions.find((item) => item.action === "focusTimer");
    const zenModeAction = actions.find((item) => item.action === "zenMode");
    const pluginAction = actions.find((item) => item.action === "plugin");
    const workbenchAction = actions.find((item) => item.action === "workbench");
    const captureAction = actions.find((item) => item.action === "capture");
    const commandAction = actions.find((item) => item.action === "command");
    const helpAction = actions.find((item) => item.action === "help");
    return [
        ...(fileButton ? [fileButton] : []),
        ...(searchAction ? [searchAction] : []),
        ...(outlineButton ? [outlineButton] : []),
        ...(commandAction ? [commandAction] : []),
        ...(homepageAction ? [homepageAction] : []),
        ...(focusTimerAction ? [focusTimerAction] : []),
        ...(zenModeAction ? [zenModeAction] : []),
        ...(assistantAIButton ? [assistantAIButton] : []),
        ...(assistantTerminalButton ? [assistantTerminalButton] : []),
        ...(pluginAction ? [pluginAction] : []),
        ...leftDockButtons,
        ...externalDockButtons,
        ...(workbenchAction ? [workbenchAction] : []),
        ...(captureAction ? [captureAction] : []),
        ...(helpAction ? [helpAction] : []),
    ];
};

const getFixedActionButtons = () => {
    const actions = getDefaultActionButtons().filter((item) => item.action === "backup" || item.action === "config");
    const backupAction = actions.find((item) => item.action === "backup");
    const configAction = actions.find((item) => item.action === "config");
    return [
        ...(backupAction ? [backupAction] : []),
        ...(configAction ? [configAction] : []),
    ];
};

const isDockItem = (item: TActivityItem): item is IActivityDockButton => (item as IActivityDockButton).type !== undefined;

const arrangeActivityItems = (items: TActivityItem[], storage: {rail: string[]; more: string[]}) => {
    const itemMap = new Map(items.map((item) => [item.sortKey, item]));
    const used = new Set<string>();
    const rail: TActivityItem[] = [];
    const more: TActivityItem[] = [];

    storage.rail.forEach((key) => {
        const item = itemMap.get(key);
        if (!item || used.has(key)) {
            return;
        }
        rail.push(item);
        used.add(key);
    });
    storage.more.forEach((key) => {
        const item = itemMap.get(key);
        if (!item || used.has(key)) {
            return;
        }
        more.push(item);
        used.add(key);
    });

    items.forEach((item) => {
        if (used.has(item.sortKey)) {
            return;
        }
        if (item.defaultGroup === "rail") {
            rail.push(item);
        } else {
            more.push(item);
        }
    });

    const normalized = enforceActivityBarPinnedKeys({
        rail: rail.map((item) => item.sortKey).filter((sortKey) => sortKey !== "action:more"),
        more: more.map((item) => item.sortKey).filter((sortKey) => sortKey !== "action:more"),
    });
    return {
        rail: normalized.rail.map((sortKey) => itemMap.get(sortKey)).filter((item): item is TActivityItem => !!item),
        more: normalized.more.map((sortKey) => itemMap.get(sortKey)).filter((item): item is TActivityItem => !!item),
    };
};

const renderSafely = (key: string, render: () => string) => {
    try {
        return render();
    } catch (error) {
        console.error(`[activityBar] render failed: ${key}`, error);
        return "";
    }
};

const renderSortAttrs = (sortKey: string, sortGroup: TActivityGroup) => ` draggable="true" data-sort-key="${escapeAttr(sortKey)}" data-sort-group="${sortGroup}"`;

const renderActionButton = (action: TActivityAction, extraClass = "", sortKey?: string, sortGroup?: TActivityGroup) => {
    const sortAttrs = sortKey && sortGroup ? renderSortAttrs(sortKey, sortGroup) : "";
    return `<button type="button" class="activity-bar__item ariaLabel${extraClass}" data-action="${action}" aria-label="${escapeAttr(getActionLabel(action))}"${sortAttrs}>
    <svg><use xlink:href="#${getActionIcon(action)}"></use></svg>
</button>`;
};

const renderPanelActionButton = (action: TActivityAction, sortKey: string) => {
    const label = getActionLabel(action);
    return `<button type="button" class="activity-bar__panel-item ariaLabel" data-action="${action}" aria-label="${escapeAttr(label)}"${renderSortAttrs(sortKey, "more")}>
    <span class="activity-bar__panel-icon"><svg><use xlink:href="#${getActionIcon(action)}"></use></svg></span>
    <span class="activity-bar__panel-label">${escapeAttr(label.replace(/\s+\((.*?)\)$/, ""))}</span>
</button>`;
};

const renderDockButton = (item: IActivityDockButton, sortGroup?: TActivityGroup) => {
    const hotkey = item.hotkey ? ` ${updateHotkeyTip(item.hotkey)}` : "";
    const sortAttrs = sortGroup ? renderSortAttrs(item.sortKey, sortGroup) : "";
    return `<button type="button" class="activity-bar__item activity-bar__item--dock ariaLabel" data-dock-type="${escapeAttr(item.type)}" aria-label="${escapeAttr(item.title + hotkey)}"${sortAttrs}>
    <svg><use xlink:href="#${item.icon}"></use></svg>
</button>`;
};

const renderPanelDockButton = (item: IActivityDockButton) => {
    const hotkey = item.hotkey ? ` ${updateHotkeyTip(item.hotkey)}` : "";
    return `<button type="button" class="activity-bar__panel-item activity-bar__item--dock ariaLabel" data-dock-type="${escapeAttr(item.type)}" aria-label="${escapeAttr(item.title + hotkey)}"${renderSortAttrs(item.sortKey, "more")}>
    <span class="activity-bar__panel-icon"><svg><use xlink:href="#${item.icon}"></use></svg></span>
    <span class="activity-bar__panel-label">${escapeAttr(item.title)}</span>
</button>`;
};

const openBackupSetting = async () => {
    const {openSetting} = await loadConfigModule();
    /// #if MOBILE
    openSetting(currentApp);
    /// #else
    const dialog = openSetting(currentApp);
    dialog?.element.querySelector('.b3-tab-bar [data-name="repos"]')?.dispatchEvent(new CustomEvent("click"));
    /// #endif
};

const setMorePanelVisible = (visible: boolean) => {
    morePanelVisible = visible;
    const activityBarElement = getActivityBarElement();
    if (!activityBarElement) {
        return;
    }
    activityBarElement.setAttribute("data-more-open", visible ? "true" : "false");
    const moreButton = activityBarElement.querySelector('[data-action="more"]') as HTMLButtonElement;
    const morePanel = activityBarElement.querySelector(".activity-bar__more-panel") as HTMLElement;
    if (moreButton) {
        moreButton.setAttribute("aria-expanded", visible ? "true" : "false");
    }
    if (morePanel) {
        morePanel.setAttribute("aria-hidden", visible ? "false" : "true");
    }
    syncActivityBarState();
};

const toggleMorePanel = () => {
    setMorePanelVisible(!morePanelVisible);
};

const clearActivityBarDragState = () => {
    dragActivityBarElement?.classList.remove("activity-bar__sort-item--dragging");
    document.querySelectorAll(".activity-bar__sort-item--over").forEach((item) => item.classList.remove("activity-bar__sort-item--over"));
    dragActivityBarElement = undefined;
    dragActivityBarSortKey = "";
    dragActivityBarDroppedInside = false;
};

const persistActivityBarDragOrder = (fallbackToMoreSortKey?: string) => {
    const activityBarElement = getActivityBarElement();
    if (!activityBarElement) {
        return false;
    }
    const rail = Array.from(activityBarElement.querySelectorAll<HTMLElement>('[data-sort-group="rail"] [data-sort-key]'))
        .map((item) => item.dataset.sortKey)
        .filter(Boolean);
    const more = Array.from(activityBarElement.querySelectorAll<HTMLElement>('[data-sort-group="more"] [data-sort-key]'))
        .map((item) => item.dataset.sortKey)
        .filter(Boolean);
    if (fallbackToMoreSortKey) {
        const nextRail = rail.filter((item) => item !== fallbackToMoreSortKey);
        const nextMore = more.filter((item) => item !== fallbackToMoreSortKey);
        nextMore.push(fallbackToMoreSortKey);
        saveActivityBarStorage({rail: nextRail, more: nextMore});
        return true;
    }
    saveActivityBarStorage({rail, more});
    return false;
};

const handleAction = async (action: TActivityAction, target: HTMLElement) => {
    if (!currentApp) {
        return;
    }
    try {
        switch (action) {
            case "search": {
                const {openSearch} = await loadSearchSpreadModule();
                openSearch({
                    app: currentApp,
                    hotkey: Constants.DIALOG_GLOBALSEARCH,
                });
                break;
            }
            case "command": {
                const {commandPanel} = await loadCommandPanelModule();
                commandPanel(currentApp);
                break;
            }
            case "capture": {
                if (window.sourceflow.config.readonly) {
                    return;
                }
                const {openCaptureDialog} = await loadCaptureDialogModule();
                openCaptureDialog(currentApp, "url");
                break;
            }
            case "more":
                toggleMorePanel();
                break;
            case "homepage": {
                const {openHomepageTab} = await loadHomepageModule();
                openHomepageTab(currentApp);
                break;
            }
            case "workbench": {
                const {openWorkbenchDialog} = await loadWorkbenchDialogModule();
                openWorkbenchDialog(currentApp);
                break;
            }
            case "focusTimer":
                void loadPomodoroDialogModule().then(({openPomodoroDialog}) => {
                    openPomodoroDialog();
                });
                break;
            case "zenMode": {
                if (!toggleFullscreenWithZenModeAlias()) {
                    showMessage(activityBarText("请先聚焦一个笔记编辑器", "Focus an editor first"), 4000, "error");
                    return;
                }
                break;
            }
            case "backup":
                await openBackupSetting();
                break;
            case "config": {
                const {openSetting} = await loadConfigModule();
                openSetting(currentApp);
                break;
            }
            case "plugin": {
                const {openTopBarMenu} = await loadTopBarMenuModule();
                openTopBarMenu(currentApp, (target.closest(".activity-bar__item, .toolbar__item") as HTMLElement) || target);
                break;
            }
            case "help": {
                const {mountHelp} = await loadMountModule();
                mountHelp();
                break;
            }
        }
    } catch (error) {
        console.error(`[activityBar] action failed: ${action}`, error);
        showMessage(activityBarText(`功能暂时不可用：${getActionLabel(action)}`, `${getActionLabel(action)} is temporarily unavailable`), 5000, "error");
    }
};

const getDockState = (type: string) => {
    const actual = document.querySelector(`.dock .dock__item[data-type="${escapeSelectorValue(type)}"]`) as HTMLElement;
    return {
        active: !!actual?.classList.contains("dock__item--active"),
        focus: !!actual?.classList.contains("dock__item--activefocus"),
    };
};

export const syncActivityBarState = () => {
    const activityBarElement = getActivityBarElement();
    if (!activityBarElement) {
        return;
    }
    activityBarElement.querySelectorAll("[data-dock-type]").forEach((item: HTMLElement) => {
        const {active, focus} = getDockState(item.getAttribute("data-dock-type"));
        item.classList.toggle("activity-bar__item--active", active || focus);
        item.classList.toggle("activity-bar__item--activefocus", focus);
    });
    activityBarElement.querySelectorAll('[data-action="more"]').forEach((item: HTMLElement) => {
        item.classList.toggle("activity-bar__item--active", morePanelVisible);
        item.classList.toggle("activity-bar__item--activefocus", false);
        item.setAttribute("aria-expanded", morePanelVisible ? "true" : "false");
    });
};

export const refreshActivityBar = () => {
    const activityBarElement = getActivityBarElement();
    if (!activityBarElement || !currentApp) {
        setUnifiedActivityBarEnabled(false);
        return;
    }
    try {
        const items = getDefaultOrderedItems();
        const fixedActions = getFixedActionButtons();
        const storage = getActivityBarStorage();
        const {rail, more} = arrangeActivityItems(items, storage);
        const railMarkup = rail.map((item) => renderSafely(item.sortKey, () => {
            if (isDockItem(item)) {
                return renderDockButton(item, "rail");
            }
            return renderActionButton(item.action, "", item.sortKey, "rail");
        })).join("");
        const moreMarkup = more.map((item) => renderSafely(item.sortKey, () => {
            if (isDockItem(item)) {
                return renderPanelDockButton(item);
            }
            return renderPanelActionButton(item.action, item.sortKey);
        })).join("");
        const fixedMarkup = fixedActions.map((item) => renderSafely(item.sortKey, () => renderActionButton(item.action))).join("");
        const moreButtonMarkup = renderSafely("action:more", () => renderActionButton("more"));
        if (!railMarkup.trim() && !fixedMarkup.trim() && !moreButtonMarkup.trim()) {
            activityBarElement.innerHTML = "";
            morePanelVisible = false;
            setUnifiedActivityBarEnabled(false);
            return;
        }

        activityBarElement.innerHTML = `
<div class="activity-bar__rail">
    <div class="activity-bar__section activity-bar__section--rail" data-sort-group="rail">
        ${railMarkup}
    </div>
    <div class="activity-bar__section activity-bar__section--fixed">
        <div class="activity-bar__divider"></div>
        ${fixedMarkup}
        ${moreButtonMarkup}
    </div>
</div>
<div class="activity-bar__more-panel" aria-hidden="${morePanelVisible ? "false" : "true"}">
    <div class="activity-bar__more-head">
        <div class="activity-bar__more-title">${escapeAttr(activityBarText("更多功能", "More"))}</div>
        <div class="activity-bar__more-detail">${escapeAttr(activityBarText("支持拖拽排序，也可以把按钮拖到左侧栏或“更多”。", "Drag to reorder, and move buttons between the rail and More."))}</div>
        <button type="button" class="activity-bar__reset" data-action="activityBarReset">${escapeAttr(activityBarText("恢复默认", "Reset"))}</button>
    </div>
    <div class="activity-bar__more-section">
        <div class="activity-bar__more-list" data-sort-group="more">${moreMarkup}</div>
    </div>
</div>`;
        activityBarElement.setAttribute("data-more-open", morePanelVisible ? "true" : "false");
        setUnifiedActivityBarEnabled(true);
        syncActivityBarState();
    } catch (error) {
        console.error("[activityBar] refresh failed", error);
        morePanelVisible = false;
        activityBarElement.innerHTML = "";
        setUnifiedActivityBarEnabled(false);
    }
};

export const initActivityBar = (app: App) => {
    currentApp = app;
    const activityBarElement = getActivityBarElement();
    if (!activityBarElement) {
        return;
    }
    setUnifiedActivityBarEnabled(false);
    activityBarElement.addEventListener("click", (event) => {
        let target = event.target as HTMLElement;
        while (target && !target.isEqualNode(activityBarElement)) {
            const action = target.getAttribute("data-action");
            if (action === "activityBarReset") {
                resetActivityBarOrder();
                refreshActivityBar();
                event.preventDefault();
                return;
            }
            if (action) {
                void handleAction(action as TActivityAction, target);
                event.preventDefault();
                return;
            }
            const dockType = target.getAttribute("data-dock-type");
            if (dockType) {
                getDockByType(dockType)?.toggleModel(dockType);
                event.preventDefault();
                return;
            }
            target = target.parentElement;
        }
    });
    activityBarElement.addEventListener("dragstart", (event: DragEvent) => {
        const target = (event.target as HTMLElement)?.closest("[data-sort-key]") as HTMLElement;
        if (!target) {
            return;
        }
        dragActivityBarElement = target;
        dragActivityBarSortKey = target.dataset.sortKey || "";
        dragActivityBarDroppedInside = false;
        target.classList.add("activity-bar__sort-item--dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", target.dataset.sortKey || "");
    });
    activityBarElement.addEventListener("dragover", (event: DragEvent) => {
        if (!dragActivityBarElement) {
            return;
        }
        const container = (event.target as HTMLElement)?.closest("[data-sort-group]") as HTMLElement;
        if (!container) {
            return;
        }
        event.preventDefault();
        const target = (event.target as HTMLElement)?.closest("[data-sort-key]") as HTMLElement;
        document.querySelectorAll(".activity-bar__sort-item--over").forEach((item) => item.classList.remove("activity-bar__sort-item--over"));
        dragActivityBarElement.dataset.sortGroup = container.dataset.sortGroup;
        if (!target || target === dragActivityBarElement) {
            container.appendChild(dragActivityBarElement);
            return;
        }
        const rect = target.getBoundingClientRect();
        const insertAfter = event.clientY > rect.top + rect.height / 2;
        target.classList.add("activity-bar__sort-item--over");
        container.insertBefore(dragActivityBarElement, insertAfter ? target.nextElementSibling : target);
    });
    activityBarElement.addEventListener("drop", (event: DragEvent) => {
        if (!dragActivityBarElement) {
            return;
        }
        const container = (event.target as HTMLElement)?.closest("[data-sort-group]") as HTMLElement;
        event.preventDefault();
        dragActivityBarDroppedInside = !!container;
        const recoveredToMore = persistActivityBarDragOrder(container ? undefined : dragActivityBarSortKey);
        clearActivityBarDragState();
        refreshActivityBar();
        if (recoveredToMore) {
            setMorePanelVisible(true);
        }
    });
    activityBarElement.addEventListener("dragend", () => {
        if (dragActivityBarElement) {
            const recoveredToMore = persistActivityBarDragOrder(dragActivityBarDroppedInside ? undefined : dragActivityBarSortKey);
            clearActivityBarDragState();
            refreshActivityBar();
            if (recoveredToMore) {
                setMorePanelVisible(true);
            }
        }
    });
    if (!activityBarGlobalEventsBound) {
        document.addEventListener("mousedown", (event) => {
            if (!morePanelVisible) {
                return;
            }
            const activityBar = getActivityBarElement();
            const target = event.target as Node;
            if (activityBar && !activityBar.contains(target)) {
                setMorePanelVisible(false);
            }
        });
        window.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && morePanelVisible) {
                setMorePanelVisible(false);
            }
        });
        activityBarGlobalEventsBound = true;
    }
    refreshActivityBar();
    [160, 800, 2400].forEach((delay) => {
        window.setTimeout(() => {
            if (!currentApp) {
                return;
            }
            refreshActivityBar();
        }, delay);
    });
};
