import {App} from "../index";
import {EventBus} from "./EventBus";
import {fetchPost} from "../util/fetch";
import {isMobile, isWindow} from "../util/functions";
/// #if !MOBILE
import {Custom} from "../layout/dock/Custom";
import {getAllEditor, getAllModels} from "../layout/getAll";
import {Tab} from "../layout/Tab";
import {resizeTopBar, setPanelFocus} from "../layout/util";
import {getDockByType} from "../layout/tabUtil";
///#else
import {MobileCustom} from "../mobile/dock/MobileCustom";
/// #endif
import {hasClosestByAttribute} from "../protyle/util/hasClosest";
import {BlockPanel} from "../block/Panel";
import {Setting} from "./Setting";
import {clearOBG} from "../layout/dock/util";
import {Constants} from "../constants";
import {showMessage} from "../dialog/message";
import {uninstall} from "./uninstall";
import {afterLoadPlugin, loadPlugins} from "./loader";
import {normalizeStoragePath} from "../util/pathName";

const shouldHideUnifiedTopAction = () => document.body.classList.contains("body--activitybar-unified");

export class Plugin {
    private app: App;
    private runtimeDisabled = false;
    public manifest: IPluginManifest;
    public i18n: IObject;
    public eventBus: EventBus;
    public data: any = {};
    public displayName: string;
    public readonly name: string;
    public protyleSlash: {
        filter: string[],
        html: string,
        id: string,
        callback: (protyle: import("../protyle").Protyle, nodeElement: HTMLElement) => void
    }[] = [];
    // TODO
    public customBlockRenders: {
        [key: string]: {
            icon: string,
            action: "edit" | "more"[],
            genCursor: boolean,
            render: (options: { app: App, element: Element }) => void
        }
    } = {};
    public topBarIcons: Element[] = [];
    public setting: Setting;
    public statusBarIcons: Element[] = [];
    public commands: ICommand[] = [];
    public models: { [key: string]: any } = {};
    public docks: {
        [key: string]: {
            config: IPluginDockTab,
            model?: (options: { tab: import("../layout/Tab").Tab }) => import("../layout/dock/Custom").Custom,
            mobileModel?: (element: Element) => import("../mobile/dock/MobileCustom").MobileCustom,
        }
    } = {};
    private protyleOptionsValue: IProtyleOptions;

    constructor(options: {
        app: App,
        name: string,
        displayName: string,
        i18n: IObject,
        manifest: IPluginManifest
    }) {
        this.app = options.app;
        this.i18n = options.i18n;
        this.displayName = options.displayName;
        this.manifest = options.manifest;
        this.eventBus = new EventBus(options.name);

        // https://github.com/lonelyor/SourceFlow/issues/9943
        Object.defineProperty(this, "name", {
            value: options.name,
            writable: false,
        });

        this.updateProtyleToolbar([]).forEach(toolbarItem => {
            if (typeof toolbarItem === "string" || Constants.INLINE_TYPE.concat("|").includes(toolbarItem.name)) {
                return;
            }
            if (typeof toolbarItem.hotkey !== "string") {
                toolbarItem.hotkey = "";
            }
            if (!window.sourceflow.config.keymap.plugin) {
                window.sourceflow.config.keymap.plugin = {};
            }
            if (!window.sourceflow.config.keymap.plugin[options.name]) {
                window.sourceflow.config.keymap.plugin[options.name] = {
                    [toolbarItem.name]: {
                        default: toolbarItem.hotkey,
                        custom: toolbarItem.hotkey,
                    }
                };
            }
            if (!window.sourceflow.config.keymap.plugin[options.name][toolbarItem.name]) {
                window.sourceflow.config.keymap.plugin[options.name][toolbarItem.name] = {
                    default: toolbarItem.hotkey,
                    custom: toolbarItem.hotkey,
                };
            } else {
                window.sourceflow.config.keymap.plugin[options.name][toolbarItem.name].default = toolbarItem.hotkey;
            }
        });
    }

    public onload(): Promise<void> | void {
        // 加载
    }

    public onunload() {
        // 禁用/关闭
    }

    public uninstall() {
        // 卸载
    }

    public onDataChanged() {
        // 存储数据变更
        // 兼容 3.4.1 以前同步数据使用重载插件的问题
        uninstall(this.app, this.name, true);
        loadPlugins(this.app, [this.name], false).then(() => {
            afterLoadPlugin(this);
            /// #if !MOBILE
            getAllEditor().forEach(editor => {
                editor.protyle.toolbar.update(editor.protyle);
            });
            /// #endif
        });
    }

    public async updateCards(options: ICardData) {
        return options;
    }

    public onLayoutReady() {
        // 布局加载完成
    }

    public addCommand(command: ICommand) {
        if (!this.ensurePermission("ui.command", "addCommand")) {
            return;
        }
        command.callback = this.wrapRuntimeCallback(`command:${command.langKey}:callback`, command.callback);
        command.globalCallback = this.wrapRuntimeCallback(`command:${command.langKey}:global`, command.globalCallback);
        command.fileTreeCallback = this.wrapRuntimeCallback(`command:${command.langKey}:filetree`, command.fileTreeCallback);
        command.editorCallback = this.wrapRuntimeCallback(`command:${command.langKey}:editor`, command.editorCallback);
        command.dockCallback = this.wrapRuntimeCallback(`command:${command.langKey}:dock`, command.dockCallback);
        if (typeof command.hotkey !== "string") {
            command.hotkey = "";
        }
        if (!window.sourceflow.config.keymap.plugin) {
            window.sourceflow.config.keymap.plugin = {};
        }
        if (!window.sourceflow.config.keymap.plugin[this.name]) {
            command.customHotkey = command.hotkey;
            window.sourceflow.config.keymap.plugin[this.name] = {
                [command.langKey]: {
                    default: command.hotkey,
                    custom: command.hotkey,
                }
            };
        } else if (!window.sourceflow.config.keymap.plugin[this.name][command.langKey]) {
            command.customHotkey = command.hotkey;
            window.sourceflow.config.keymap.plugin[this.name][command.langKey] = {
                default: command.hotkey,
                custom: command.hotkey,
            };
        } else if (window.sourceflow.config.keymap.plugin[this.name][command.langKey]) {
            if (typeof window.sourceflow.config.keymap.plugin[this.name][command.langKey].custom === "string") {
                command.customHotkey = window.sourceflow.config.keymap.plugin[this.name][command.langKey].custom;
            } else {
                command.customHotkey = command.hotkey;
            }
            window.sourceflow.config.keymap.plugin[this.name][command.langKey]["default"] = command.hotkey;
        }
        if (typeof command.customHotkey !== "string") {
            console.error(`${this.name} - commands data is error and has been removed.`);
        } else {
            this.commands.push(command);
        }
    }

    public addIcons(svg: string) {
        const svgElement = document.querySelector(`svg[data-name="${this.name}"] defs`);
        if (svgElement) {
            svgElement.insertAdjacentHTML("afterbegin", svg);
        } else {
            const lastSvgElement = document.querySelector("body > svg:last-of-type");
            if (lastSvgElement) {
                lastSvgElement.insertAdjacentHTML("afterend", `<svg data-name="${this.name}" style="position: absolute; width: 0; height: 0; overflow: hidden;" xmlns="http://www.w3.org/2000/svg">
<defs>${svg}</defs></svg>`);
            } else {
                document.body.insertAdjacentHTML("afterbegin", `<svg data-name="${this.name}" style="position: absolute; width: 0; height: 0; overflow: hidden;" xmlns="http://www.w3.org/2000/svg">
<defs>${svg}</defs></svg>`);
            }
        }
    }

    public addTopBar(options: {
        icon: string,
        title: string,
        position?: "south" | "left",
        callback: (evt: MouseEvent) => void
    }) {
        if (!this.ensurePermission("ui.topbar", "addTopBar")) {
            return;
        }
        options.icon = options.icon.trim();
        if (!options.icon.startsWith("icon") && !options.icon.startsWith("<svg")) {
            console.error(`plugin ${this.name} addTopBar error: icon must be svg id or svg tag`);
            return;
        }
        const safeCallback = this.wrapRuntimeCallback(`topbar:${options.title || this.topBarIcons.length}`, options.callback);
        const iconElement = document.createElement("div");
        iconElement.setAttribute("data-menu", "true");
        if (safeCallback) {
            iconElement.addEventListener("click", safeCallback);
        }
        iconElement.id = `plugin_${this.name}_${this.topBarIcons.length}`;
        if (isMobile()) {
            iconElement.className = "b3-menu__item";
            iconElement.innerHTML = (options.icon.startsWith("icon") ? `<svg class="b3-menu__icon"><use xlink:href="#${options.icon}"></use></svg>` : options.icon) +
                `<span class="b3-menu__label">${options.title}</span>`;
        } else if (!isWindow()) {
            iconElement.className = "toolbar__item ariaLabel";
            iconElement.setAttribute("aria-label", options.title);
            iconElement.innerHTML = options.icon.startsWith("icon") ? `<svg><use xlink:href="#${options.icon}"></use></svg>` : options.icon;
            iconElement.setAttribute("data-location", options.position || "right");
            if (shouldHideUnifiedTopAction()) {
                iconElement.classList.add("fn__none");
            }
            /// #if !MOBILE
            resizeTopBar();
            /// #endif
        }
        if (isMobile() && window.sourceflow.storage) {
            if (!window.sourceflow.storage[Constants.LOCAL_PLUGINTOPUNPIN].includes(iconElement.id)) {
                document.querySelector("#menuAbout")?.after(iconElement);
            }
        } else if (!isWindow() && window.sourceflow.storage) {
            if (window.sourceflow.storage[Constants.LOCAL_PLUGINTOPUNPIN].includes(iconElement.id)) {
                iconElement.classList.add("fn__none");
            }
            document.querySelector("#" + (iconElement.getAttribute("data-location") === "right" ? "barPlugins" : "drag"))?.before(iconElement);
        }
        this.topBarIcons.push(iconElement);
        return iconElement;
    }

    public addStatusBar(options: {
        element: HTMLElement,
        position?: "right" | "left",
    }) {
        if (!this.ensurePermission("ui.statusbar", "addStatusBar")) {
            return;
        }
        /// #if !MOBILE
        options.element.setAttribute("data-location", options.position || "right");
        this.statusBarIcons.push(options.element);
        const statusElement = document.getElementById("status");
        if (statusElement) {
            if (options.element.getAttribute("data-location") === "right") {
                statusElement.insertAdjacentElement("beforeend", options.element);
            } else {
                statusElement.insertAdjacentElement("afterbegin", options.element);
            }
        }
        return options.element;
        /// #endif
    }

    public openSetting() {
        if (!this.ensurePermission("ui.setting", "openSetting")) {
            return;
        }
        if (!this.setting) {
            return;
        }
        this.setting.open(this.displayName || this.name);
    }

    public loadData(storageName: string): Promise<any> {
        if (!this.ensurePermission("storage", "loadData")) {
            return Promise.resolve("");
        }
        if (typeof this.data[storageName] === "undefined") {
            this.data[storageName] = "";
        }
        return new Promise((resolve) => {
            fetchPost("/api/file/getFile", {
                path: `/data/storage/plugins/${this.name}/${normalizeStoragePath(storageName)}`
            }, (response) => {
                this.data[storageName] = response;
                resolve(this.data[storageName]);
            }, null, () => {
                resolve(this.data[storageName]);
            });
        });
    }

    public saveData(storageName: string, data: any): Promise<any | IWebSocketData> {
        if (!this.ensurePermission("storage", "saveData")) {
            return Promise.reject({
                code: 403,
                msg: `Plugin ${this.name} does not declare storage permission`,
                data: null
            });
        }
        if (window.sourceflow.config.readonly || window.sourceflow.isPublish) {
            return Promise.reject({
                code: 403,
                msg: "Readonly mode or publish mode",
                data: null
            });
        }
        return new Promise((resolve, reject) => {
            const pathString = `/data/storage/plugins/${this.name}/${normalizeStoragePath(storageName)}`;
            let file: File;
            try {
                const fileName = pathString.split("/").pop();
                if (typeof data === "object") {
                    file = new File([new Blob([JSON.stringify(data)], {
                        type: "application/json"
                    })], fileName);
                } else {
                    file = new File([new Blob([data])], fileName);
                }
            } catch (e) {
                reject({
                    code: 400,
                    msg: e instanceof Error ? e.message : String(e),
                    data: null
                });
                return;
            }
            const formData = new FormData();
            formData.append("path", pathString);
            formData.append("file", file);
            formData.append("isDir", "false");
            fetchPost("/api/file/putFile", formData, (response) => {
                this.data[storageName] = data;
                resolve(response);
            });
        });
    }

    public removeData(storageName: string): Promise<IWebSocketData> {
        if (!this.ensurePermission("storage", "removeData")) {
            return Promise.reject({
                code: 403,
                msg: `Plugin ${this.name} does not declare storage permission`,
                data: null
            } as IWebSocketData);
        }
        if (window.sourceflow.config.readonly || window.sourceflow.isPublish) {
            return Promise.reject({
                code: 403,
                msg: "Readonly mode or publish mode",
                data: null
            } as IWebSocketData);
        }
        return new Promise((resolve) => {
            if (!this.data) {
                this.data = {};
            }
            fetchPost("/api/file/removeFile", {path: `/data/storage/plugins/${this.name}/${normalizeStoragePath(storageName)}`}, (response) => {
                delete this.data[storageName];
                resolve(response);
            });
        });
    }

    public getOpenedTab() {
        const tabs: { [key: string]: import("../layout/dock/Custom").Custom[] } = {};
        const modelKeys = Object.keys(this.models);
        modelKeys.forEach(item => {
            tabs[item.replace(this.name, "")] = [];
        });
        /// #if !MOBILE
        getAllModels().custom.find(item => {
            if (modelKeys.includes(item.type)) {
                tabs[item.type.replace(this.name, "")].push(item);
            }
        });
        /// #endif
        return tabs;
    }

    public addTab(options: {
        type: string,
        destroy?: () => void,
        beforeDestroy?: () => void,
        resize?: () => void,
        update?: () => void,
        init: () => void
    }) {
        if (!this.ensurePermission("ui.tab", "addTab")) {
            return;
        }
        /// #if !MOBILE
        const type2 = this.name + options.type;
        const safeInit = this.wrapRuntimeCallback(`tab:${type2}:init`, options.init);
        const safeBeforeDestroy = this.wrapRuntimeCallback(`tab:${type2}:beforeDestroy`, options.beforeDestroy);
        const safeDestroy = this.wrapRuntimeCallback(`tab:${type2}:destroy`, options.destroy);
        const safeResize = this.wrapRuntimeCallback(`tab:${type2}:resize`, options.resize);
        const safeUpdate = this.wrapRuntimeCallback(`tab:${type2}:update`, options.update);
        this.models[type2] = (arg: { data: any, tab: Tab }) => {
            const customObj = new Custom({
                app: this.app,
                tab: arg.tab,
                type: type2,
                data: arg.data,
                init: safeInit,
                beforeDestroy: safeBeforeDestroy,
                destroy: safeDestroy,
                resize: safeResize,
                update: safeUpdate,
            });
            customObj.element.addEventListener("click", () => {
                clearOBG();
                setPanelFocus(customObj.element.parentElement.parentElement);
            });
            return customObj;
        };
        return this.models[type2];
        /// #endif
    }

    public addDock(options: {
        config: IPluginDockTab,
        data: any,
        type: string,
        destroy?: () => void,
        resize?: () => void,
        update?: () => void,
        init: () => void
    }) {
        if (!this.ensurePermission("ui.dock", "addDock")) {
            return;
        }
        const type2 = this.name + options.type;
        const safeInit = this.wrapRuntimeCallback(`dock:${type2}:init`, options.init);
        const safeDestroy = this.wrapRuntimeCallback(`dock:${type2}:destroy`, options.destroy);
        const safeResize = this.wrapRuntimeCallback(`dock:${type2}:resize`, options.resize);
        const safeUpdate = this.wrapRuntimeCallback(`dock:${type2}:update`, options.update);
        if (typeof options.config.index === "undefined") {
            options.config.index = 1000;
        }
        this.docks[type2] = {
            config: options.config,
            /// #if MOBILE
            mobileModel: (element) => {
                const customObj = new MobileCustom({
                    element,
                    type: type2,
                    data: options.data,
                    init: safeInit,
                    update: safeUpdate,
                    destroy: safeDestroy,
                });
                return customObj;
            },
            /// #else
            model: (arg: { tab: Tab }) => {
                const customObj = new Custom({
                    app: this.app,
                    tab: arg.tab,
                    type: type2,
                    data: options.data,
                    init: safeInit,
                    destroy: safeDestroy,
                    resize: safeResize,
                    update: safeUpdate,
                });
                customObj.element.addEventListener("click", (event: MouseEvent) => {
                    setPanelFocus(customObj.element);
                    if (hasClosestByAttribute(event.target as HTMLElement, "data-type", "min")) {
                        getDockByType(type2).toggleModel(type2);
                    }
                });
                customObj.element.classList.add("sf__" + type2, "dockPanel");
                return customObj;
            }
            /// #endif
        };
        if (!window.sourceflow.config.keymap.plugin) {
            window.sourceflow.config.keymap.plugin = {};
        }
        if (!window.sourceflow.config.keymap.plugin[this.name]) {
            window.sourceflow.config.keymap.plugin[this.name] = {};
        }
        const hotkey = typeof options.config.hotkey === "string" ? options.config.hotkey : "";
        if (!window.sourceflow.config.keymap.plugin[this.name][type2]) {
            window.sourceflow.config.keymap.plugin[this.name][type2] = {
                default: hotkey,
                custom: hotkey,
            };
        } else {
            if (typeof window.sourceflow.config.keymap.plugin[this.name][type2].custom !== "string") {
                window.sourceflow.config.keymap.plugin[this.name][type2].custom = hotkey;
            }
            window.sourceflow.config.keymap.plugin[this.name][type2]["default"] = hotkey;
        }
        return this.docks[type2];
    }

    public addFloatLayer = (options: {
        refDefs: IRefDefs[],
        x?: number,
        y?: number,
        targetElement?: HTMLElement,
        originalRefBlockIDs?: IObject,
        isBacklink: boolean,
    }) => {
        if (!this.ensurePermission("ui.float", "addFloatLayer")) {
            return;
        }
        window.sourceflow.blockPanels.push(new BlockPanel({
            app: this.app,
            originalRefBlockIDs: options.originalRefBlockIDs,
            targetElement: options.targetElement,
            isBacklink: options.isBacklink,
            x: options.x,
            y: options.y,
            refDefs: options.refDefs,
        }));
    };

    public updateProtyleToolbar(toolbar: Array<string | IMenuItem>) {
        return toolbar;
    }

    set protyleOptions(options: IProtyleOptions) {
        this.protyleOptionsValue = options;
    }

    get protyleOptions() {
        return this.protyleOptionsValue;
    }

    public getApp() {
        return this.app;
    }

    private getRuntimeErrorMessage() {
        const isZh = `${window.sourceflow?.config?.lang || navigator.language || ""}`.toLowerCase().startsWith("zh");
        return isZh
            ? `插件 ${this.displayName || this.name} 因异常已被自动禁用，不影响笔记使用。`
            : `Plugin ${this.displayName || this.name} was disabled automatically after an error. Notes remain usable.`;
    }

    private handleRuntimeError(stage: string, error: unknown) {
        if (this.runtimeDisabled) {
            return;
        }
        this.runtimeDisabled = true;
        console.error(`plugin ${this.name} runtime error [${stage}]:`, error);
        showMessage(this.getRuntimeErrorMessage(), 7000, "error");
        uninstall(this.app, this.name, true);
    }

    private wrapRuntimeCallback<T extends (...args: any[]) => any>(stage: string, callback?: T): T | undefined {
        if (!callback) {
            return callback;
        }
        return ((...args: any[]) => {
            if (this.runtimeDisabled) {
                return;
            }
            try {
                return callback(...args);
            } catch (error) {
                this.handleRuntimeError(stage, error);
            }
        }) as T;
    }

    private ensurePermission(permission: string, action: string) {
        if (Array.isArray(this.manifest?.permissions) && this.manifest.permissions.includes(permission)) {
            return true;
        }
        const isZh = `${window.sourceflow?.config?.lang || navigator.language || ""}`.toLowerCase().startsWith("zh");
        showMessage(isZh
            ? `插件 ${this.displayName || this.name} 未声明权限 ${permission}，无法执行 ${action}`
            : `Plugin ${this.displayName || this.name} is missing permission ${permission}, cannot run ${action}`, 5000, "error");
        return false;
    }
}
