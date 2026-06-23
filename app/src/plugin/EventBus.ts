import {MenuItem, subMenu} from "../menus/Menu";

type Listener<DetailType> = (detail: DetailType) => boolean | void;

export class EventBus<DetailType = any> {
    private listeners: Map<TEventBus, Set<Listener<DetailType>>> = new Map();

    constructor(_name = "") {
    }

    on(type: TEventBus, listener: (event: CustomEvent<DetailType>) => void) {
        const wrappedListener = (detail: DetailType) => {
            listener(new CustomEvent(type, {detail}));
        };
        if (!this.listeners.has(type)) {
            this.listeners.set(type, new Set());
        }
        this.listeners.get(type).add(wrappedListener as Listener<DetailType>);
    }

    once(type: TEventBus, listener: (event: CustomEvent<DetailType>) => void) {
        const wrappedListener = (detail: DetailType) => {
            listener(new CustomEvent(type, {detail}));
        };
        const onceWrapper: Listener<DetailType> = ((detail: DetailType) => {
            wrappedListener(detail);
            this.listeners.get(type)?.delete(onceWrapper);
        }) as Listener<DetailType>;
        if (!this.listeners.has(type)) {
            this.listeners.set(type, new Set());
        }
        this.listeners.get(type).add(onceWrapper);
    }

    off(type: TEventBus, listener: (event: CustomEvent<DetailType>) => void) {
        const set = this.listeners.get(type);
        if (set) {
            set.forEach((wrappedListener) => {
                if (wrappedListener.toString().includes(listener.toString())) {
                    set.delete(wrappedListener);
                }
            });
        }
    }

    emit(type: TEventBus, detail?: DetailType) {
        const set = this.listeners.get(type);
        if (!set) {
            return true;
        }
        for (const listener of set) {
            const result = listener(detail);
            if (result === false) {
                return false;
            }
        }
        return true;
    }

    hasListeners(type: TEventBus): boolean {
        const set = this.listeners.get(type);
        return !!set && set.size > 0;
    }
}

export const emitOpenMenu = (options: {
    plugins: import("./index").Plugin[],
    type: TEventBus,
    detail: any,
    separatorPosition?: "top" | "bottom",
}) => {
    const pluginSubMenu = new subMenu();
    options.detail.menu = pluginSubMenu;
    options.plugins.forEach((plugin) => {
        plugin.eventBus.emit(options.type, options.detail);
    });
    if (pluginSubMenu.menus.length > 0) {
        if (options.separatorPosition === "top") {
            window.sourceflow.menus.menu.append(new MenuItem({id: "separator_pluginTop", type: "separator"}).element);
        }
        window.sourceflow.menus.menu.append(new MenuItem({
            id: "plugin",
            label: window.sourceflow.languages.plugin,
            icon: "iconPlugin",
            type: "submenu",
            submenu: pluginSubMenu.menus,
        }).element);
        if (options.separatorPosition === "bottom") {
            window.sourceflow.menus.menu.append(new MenuItem({id: "separator_pluginBottom", type: "separator"}).element);
        }
    }
};
