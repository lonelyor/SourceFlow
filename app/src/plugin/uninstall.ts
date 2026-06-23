import {App} from "../index";
import {Plugin} from "./index";
/// #if !MOBILE
import {getAllModels} from "../layout/getAll";
import {resizeTopBar} from "../layout/util";
/// #endif
import {Constants} from "../constants";
import {setStorageVal} from "../protyle/util/compatibility";
import {getAllEditor} from "../layout/getAll";

export const uninstall = (app: App, name: string, isReload: boolean) => {
    app.plugins.find((plugin: Plugin, index) => {
        if (plugin.name === name) {
            try {
                plugin.onunload();
            } catch (e) {
                console.error(`plugin ${plugin.name} onunload error:`, e);
            }
            if (!isReload) {
                try {
                    plugin.uninstall();
                } catch (e) {
                    console.error(`plugin ${plugin.name} uninstall error:`, e);
                }
                window.sourceflow.storage[Constants.LOCAL_PLUGIN_DOCKS][plugin.name] = {};
                setStorageVal(Constants.LOCAL_PLUGIN_DOCKS, window.sourceflow.storage[Constants.LOCAL_PLUGIN_DOCKS]);
            }
            // rm tab
            /// #if !MOBILE
            const modelsKeys = Object.keys(plugin.models);
            getAllModels().custom.forEach(custom => {
                if (modelsKeys.includes(custom.type)) {
                    if (isReload) {
                        if (custom.update) {
                            custom.update();
                        }
                    } else {
                        custom.parent.parent.removeTab(custom.parent.id);
                    }
                }
            });
            /// #endif
            // rm topBar
            for (let i = 0; i < plugin.topBarIcons.length; i++) {
                const item = plugin.topBarIcons[i];
                item.remove();
                plugin.topBarIcons.splice(i, 1);
                i--;
            }
            /// #if !MOBILE
            resizeTopBar();
            // rm statusBar
            plugin.statusBarIcons.forEach(item => {
                item.remove();
            });
            // rm dock
            const docksKeys = Object.keys(plugin.docks);
            docksKeys.forEach(key => {
                let dockIconElement;
                if (window.sourceflow.storage[Constants.LOCAL_PLUGIN_DOCKS][plugin.name] &&
                    window.sourceflow.storage[Constants.LOCAL_PLUGIN_DOCKS][plugin.name][key]) {
                    dockIconElement = document.querySelector(`.dock__item[data-type="${key}"]`);
                    if (dockIconElement) {
                        let index = 0;
                        let previousElement = dockIconElement;
                        while (previousElement.previousElementSibling) {
                            index++;
                            previousElement = previousElement.previousElementSibling;
                        }
                        window.sourceflow.storage[Constants.LOCAL_PLUGIN_DOCKS][plugin.name][key].index = index;
                        window.sourceflow.storage[Constants.LOCAL_PLUGIN_DOCKS][plugin.name][key].show = dockIconElement.classList.contains("dock__item--active");
                        window.sourceflow.storage[Constants.LOCAL_PLUGIN_DOCKS][plugin.name][key].size = {
                            height: parseInt(dockIconElement.getAttribute("data-height")) || null,
                            width: parseInt(dockIconElement.getAttribute("data-width")) || null
                        };
                    }
                }

                if (Object.keys(window.sourceflow.layout.leftDock.data).includes(key)) {
                    window.sourceflow.layout.leftDock.remove(key);
                    if (dockIconElement) {
                        window.sourceflow.storage[Constants.LOCAL_PLUGIN_DOCKS][plugin.name][key].position =
                            "Left" + (dockIconElement.getAttribute("data-index") === "0" ? "Top" : "Bottom");
                    }
                } else if (Object.keys(window.sourceflow.layout.rightDock.data).includes(key)) {
                    window.sourceflow.layout.rightDock.remove(key);
                    if (dockIconElement) {
                        window.sourceflow.storage[Constants.LOCAL_PLUGIN_DOCKS][plugin.name][key].position =
                            "Right" + (dockIconElement.getAttribute("data-index") === "0" ? "Top" : "Bottom");
                    }
                } else if (Object.keys(window.sourceflow.layout.bottomDock.data).includes(key)) {
                    window.sourceflow.layout.bottomDock.remove(key);
                    if (dockIconElement) {
                        window.sourceflow.storage[Constants.LOCAL_PLUGIN_DOCKS][plugin.name][key].position =
                            "Bottom" + (dockIconElement.getAttribute("data-index") === "0" ? "Left" : "Right");
                    }
                }
                if (dockIconElement) {
                    setStorageVal(Constants.LOCAL_PLUGIN_DOCKS, window.sourceflow.storage[Constants.LOCAL_PLUGIN_DOCKS]);
                }
            });
            /// #endif
            // rm listen
            Array.from(document.childNodes).find(item => {
                if (item.nodeType === 8 && item.textContent === name) {
                    item.remove();
                    return true;
                }
            });
            // rm plugin
            app.plugins.splice(index, 1);
            // rm icons
            document.querySelector(`svg[data-name="${plugin.name}"]`)?.remove();
            // rm protyle toolbar
            getAllEditor().forEach(editor => {
                editor.protyle.toolbar.update(editor.protyle);
            });
            // rm style
            document.getElementById("pluginsStyle" + name)?.remove();
            return true;
        }
    });
};
