import {Constants} from "../../constants";
import {App} from "../../index";
/// #if !BROWSER
import {ipcRenderer} from "electron";
/// #endif

export const sendGlobalShortcut = (app: App) => {
    /// #if !BROWSER
    const hotkeys = [window.sourceflow.config.keymap.general.toggleWin.custom];
    app.plugins.forEach(plugin => {
        plugin.commands.forEach(command => {
            if (command.globalCallback) {
                hotkeys.push(command.customHotkey);
            }
        });
    });
    ipcRenderer.send(Constants.SOURCEFLOW_HOTKEY, {
        languages: window.sourceflow.languages["_trayMenu"],
        hotkeys
    });
    /// #endif
};

export const sendUnregisterGlobalShortcut = (app: App) => {
    /// #if !BROWSER
    ipcRenderer.send(Constants.SOURCEFLOW_CMD, {
        cmd: "unregisterGlobalShortcut",
        accelerator: window.sourceflow.config.keymap.general.toggleWin.custom
    });
    app.plugins.forEach(plugin => {
        plugin.commands.forEach(command => {
            if (command.globalCallback) {
                ipcRenderer.send(Constants.SOURCEFLOW_CMD, {
                    cmd: "unregisterGlobalShortcut",
                    accelerator: command.customHotkey
                });
            }
        });
    });
    /// #endif
};
