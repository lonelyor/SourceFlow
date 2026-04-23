import {Plugin} from "../plugin";
import {App} from "../index";
import {Custom} from "../layout/dock/Custom";
import {isStartupFuseEnabled} from "../stability/startupGuard";
import {assistantDockPosition, assistantDockSizes, assistantText, ASSISTANT_AI_DOCK_KEY, ASSISTANT_PLUGIN_NAME, ASSISTANT_RESULTS_DOCK_KEY, ASSISTANT_TERMINAL_DOCK_KEY, getAssistantDockTitles} from "./constants";
import {reportAssistantRuntimeError} from "./runtime";

type TAssistantDockKey = typeof ASSISTANT_AI_DOCK_KEY | typeof ASSISTANT_RESULTS_DOCK_KEY | typeof ASSISTANT_TERMINAL_DOCK_KEY;

type TAssistantDockModule = {
    mount: (custom: Custom, app: App) => void;
    destroy: () => void;
    resize: () => void;
    update: () => void;
};

const dockModuleLoaders: Record<TAssistantDockKey, () => Promise<TAssistantDockModule>> = {
    [ASSISTANT_AI_DOCK_KEY]: () => import("./ai/AIDock").then((module) => ({
        mount: module.mountAssistantAIDock,
        destroy: module.destroyAssistantAIDock,
        resize: module.resizeAssistantAIDock,
        update: module.updateAssistantAIDock,
    })),
    [ASSISTANT_RESULTS_DOCK_KEY]: () => import("./results/ResultsDock").then((module) => ({
        mount: module.mountAssistantResultsDock,
        destroy: module.destroyAssistantResultsDock,
        resize: module.resizeAssistantResultsDock,
        update: module.updateAssistantResultsDock,
    })),
    [ASSISTANT_TERMINAL_DOCK_KEY]: () => import("./terminal/TerminalDock").then((module) => ({
        mount: module.mountAssistantTerminalDock,
        destroy: module.destroyAssistantTerminalDock,
        resize: module.resizeAssistantTerminalDock,
        update: module.updateAssistantTerminalDock,
    })),
};

export class BuiltinAssistantPlugin extends Plugin {
    private readonly dockTitles = getAssistantDockTitles();
    private readonly disabledDocks = new Set<TAssistantDockKey>();
    private readonly dockCustomMap = new Map<TAssistantDockKey, Custom>();
    private readonly dockModules = new Map<TAssistantDockKey, Promise<TAssistantDockModule>>();

    constructor(options: { app: App, name: string, displayName: string, i18n: IObject, manifest: IPluginManifest }) {
        super(options);
        this.addDock({
            type: ASSISTANT_AI_DOCK_KEY,
            data: {},
            config: {
                position: assistantDockPosition.ai,
                size: assistantDockSizes.ai,
                icon: "iconSparkles",
                title: this.dockTitles.ai,
                show: false,
            },
            init: (...args: [Custom?]) => {
                if (args[0]) {
                    this.initDock(ASSISTANT_AI_DOCK_KEY, args[0], (module) => {
                        module.mount(args[0], options.app);
                    });
                }
            },
            destroy: () => this.runDockLifecycle(ASSISTANT_AI_DOCK_KEY, (module) => module.destroy()),
            resize: () => this.runDockLifecycle(ASSISTANT_AI_DOCK_KEY, (module) => module.resize()),
            update: () => this.runDockLifecycle(ASSISTANT_AI_DOCK_KEY, (module) => module.update()),
        });
        this.addDock({
            type: ASSISTANT_RESULTS_DOCK_KEY,
            data: {},
            config: {
                position: assistantDockPosition.results,
                size: assistantDockSizes.results,
                icon: "iconList",
                title: this.dockTitles.results,
                show: false,
            },
            init: (...args: [Custom?]) => {
                if (args[0]) {
                    this.initDock(ASSISTANT_RESULTS_DOCK_KEY, args[0], (module) => {
                        module.mount(args[0], options.app);
                    });
                }
            },
            destroy: () => this.runDockLifecycle(ASSISTANT_RESULTS_DOCK_KEY, (module) => module.destroy()),
            resize: () => this.runDockLifecycle(ASSISTANT_RESULTS_DOCK_KEY, (module) => module.resize()),
            update: () => this.runDockLifecycle(ASSISTANT_RESULTS_DOCK_KEY, (module) => module.update()),
        });
        if (!isStartupFuseEnabled("terminal")) {
            this.addDock({
                type: ASSISTANT_TERMINAL_DOCK_KEY,
                data: {},
                config: {
                    position: assistantDockPosition.terminal,
                    size: assistantDockSizes.terminal,
                    icon: "iconTerminal",
                    title: this.dockTitles.terminal,
                    show: false,
                },
                init: (...args: [Custom?]) => {
                    if (args[0]) {
                        this.initDock(ASSISTANT_TERMINAL_DOCK_KEY, args[0], (module) => {
                            module.mount(args[0], options.app);
                        });
                    }
                },
                destroy: () => this.runDockLifecycle(ASSISTANT_TERMINAL_DOCK_KEY, (module) => module.destroy()),
                resize: () => this.runDockLifecycle(ASSISTANT_TERMINAL_DOCK_KEY, (module) => module.resize()),
                update: () => this.runDockLifecycle(ASSISTANT_TERMINAL_DOCK_KEY, (module) => module.update()),
            });
        }
    }

    private getDockModule(key: TAssistantDockKey) {
        let promise = this.dockModules.get(key);
        if (!promise) {
            promise = dockModuleLoaders[key]();
            this.dockModules.set(key, promise);
        }
        return promise;
    }

    private initDock(key: TAssistantDockKey, custom: Custom, runner: (module: TAssistantDockModule) => void | Promise<void>) {
        this.dockCustomMap.set(key, custom);
        if (this.disabledDocks.has(key)) {
            this.renderDockIsolation(custom, key);
            return;
        }
        void this.runDockTask(key, runner, custom);
    }

    private runDockLifecycle(key: TAssistantDockKey, runner: (module: TAssistantDockModule) => void | Promise<void>) {
        if (this.disabledDocks.has(key)) {
            return;
        }
        void this.runDockTask(key, runner);
    }

    private async runDockTask(key: TAssistantDockKey, runner: (module: TAssistantDockModule) => void | Promise<void>, custom?: Custom) {
        try {
            const module = await this.getDockModule(key);
            if (this.disabledDocks.has(key)) {
                return;
            }
            await runner(module);
        } catch (error) {
            this.disableDock(key, error, custom);
        }
    }

    private disableDock(key: TAssistantDockKey, error: unknown, custom?: Custom) {
        if (this.disabledDocks.has(key)) {
            return;
        }
        this.disabledDocks.add(key);
        reportAssistantRuntimeError(`dock:${key}`, error);
        const targetCustom = custom || this.dockCustomMap.get(key);
        if (targetCustom) {
            this.renderDockIsolation(targetCustom, key);
        }
    }

    private renderDockIsolation(custom: Custom, key: TAssistantDockKey) {
        const title = key === ASSISTANT_AI_DOCK_KEY
            ? this.dockTitles.ai
            : (key === ASSISTANT_RESULTS_DOCK_KEY ? this.dockTitles.results : this.dockTitles.terminal);
        (custom.element as HTMLElement).innerHTML = `<div class="fn__flex-1 fn__flex-column fn__flex-center" style="padding: 16px; text-align: center; gap: 8px;">
    <div>${title}</div>
    <div class="ft__secondary ft__smaller">${assistantText("该面板初始化失败，已自动隔离，不影响笔记使用。", "This panel failed to initialize and has been isolated. Notes remain usable.")}</div>
</div>`;
    }
}

export const builtinAssistantPluginName = ASSISTANT_PLUGIN_NAME;
