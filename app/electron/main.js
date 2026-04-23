// SourceFlow - Make knowledge flow
// Copyright (c) 2020-present, By lonelyor
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

const {
    net,
    app,
    BrowserWindow,
    Notification,
    shell,
    Menu,
    MenuItem,
    screen,
    ipcMain,
    clipboard,
    globalShortcut,
    Tray,
    dialog,
    systemPreferences,
    powerMonitor
} = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const gNet = require("net");
const {pathToFileURL} = require("url");
const remote = require("@electron/remote/main");

const appPath = app.getAppPath();
const appDir = app.isPackaged ? process.resourcesPath : path.dirname(appPath);
const resolveAppFile = (...segments) => {
    const candidates = [
        path.join(appDir, "app", ...segments),
        path.join(appDir, ...segments),
        path.join(appPath, ...segments),
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[candidates.length - 1];
};
const {migrateWorkspace} = require(resolveAppFile("electron", "workspaceMigration.js"));
const isDevEnv = process.env.NODE_ENV === "development";
const appVer = app.getVersion();
const appBrandName = "SourceFlow";
const appBrandNameCN = "源流";
const appBrandShort = "SF";
const appProtocol = "sf";
const appGithubURL = "https://github.com/lonelyor/SourceFlow";
const appUserModelId = "io.github.lonelyor.sourceflow";
const appConfigDirName = "sourceflow";
const defaultBootStartupImage = () => pathToFileURL(resolveAppFile("electron", "startup-logo.png")).toString();
const appUserDataDirName = `${appBrandName}-Electron`;
const portableMarkerName = `.${appBrandShort.toLowerCase()}-portable`;
const kernelBinaryBaseName = `${appBrandName}-Kernel`;
const supportedImageMimeByExtension = {
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
};
const getPreferredConfigRootDir = (homeDir) => {
    return path.join(homeDir, ".config", appConfigDirName);
};
const isAppProtocolURL = (value = "") => {
    return value.startsWith(`${appProtocol}://`);
};
const findProtocolArg = (argv = []) => {
    return argv.find((arg) => isAppProtocolURL(arg));
};
const onBrandedIPC = (channel, listener) => {
    ipcMain.on(channel, listener);
};
const handleBrandedIPC = (channel, listener) => {
    ipcMain.handle(channel, listener);
};
const removeBrandedIPCListener = (channel, listener) => {
    ipcMain.removeListener(channel, listener);
};
const sendBrandedIPC = (target, channel, ...args) => {
    if (!target || typeof target.send !== "function") {
        return;
    }
    target.send(channel, ...args);
};
const stripElectronToken = (userAgent) => {
    return (userAgent || "").replace(/\sElectron\/[^\s]+/g, "").trim();
};
const getDefaultAIUserAgent = () => {
    const fallbackUserAgent = stripElectronToken(app.userAgentFallback || "");
    if (fallbackUserAgent) {
        return fallbackUserAgent;
    }
    const chromeVersion = process.versions.chrome || "0.0.0.0";
    if ("darwin" === process.platform) {
        return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
    }
    if ("win32" === process.platform) {
        return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
    }
    return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
};
const defaultAIUserAgent = getDefaultAIUserAgent();
const hasPortableDataDir = (rootDir) => {
    if (!rootDir) {
        return false;
    }
    return fs.existsSync(path.join(rootDir, portableMarkerName)) ||
        fs.existsSync(path.join(rootDir, "workspace")) ||
        fs.existsSync(path.join(rootDir, "userdata"));
};
const detectPortableRootDir = () => {
    const portableRootEnv = process.env.SOURCEFLOW_PORTABLE_DIR || process.env.PORTABLE_EXECUTABLE_DIR;
    if (portableRootEnv) {
        return path.resolve(portableRootEnv);
    }
    if (isDevEnv || !app.isPackaged) {
        return "";
    }

    const candidateRoots = [];
    const addCandidateRoot = (candidateRoot) => {
        if (!candidateRoot) {
            return;
        }
        candidateRoot = path.resolve(candidateRoot);
        if (!candidateRoots.includes(candidateRoot)) {
            candidateRoots.push(candidateRoot);
        }
    };

    if ("darwin" === process.platform) {
        addCandidateRoot(path.resolve(process.execPath, "..", "..", ".."));
        addCandidateRoot(path.resolve(appDir, "..", "..", ".."));
    } else {
        addCandidateRoot(path.dirname(process.execPath));
        addCandidateRoot(path.resolve(appDir, ".."));
    }
    if ("linux" === process.platform && process.env.APPIMAGE) {
        addCandidateRoot(path.dirname(process.env.APPIMAGE));
    }

    return candidateRoots.find(hasPortableDataDir) || "";
};
const runWorkspaceMigration = async (sourceWorkspace, targetWorkspace) => {
    try {
        const result = await migrateWorkspace({sourceWorkspace, targetWorkspace});
        return {ok: true, message: "", ...result};
    } catch (error) {
        return {ok: false, message: error.message || String(error)};
    }
};
const portableRootDir = detectPortableRootDir();
const isPortableMode = !!portableRootDir;
const portableWorkspaceStateDir = isPortableMode ? path.join(getPreferredConfigRootDir(app.getPath("home")), "portable") : "";
const getPortableRelativePath = (portablePath, fallbackPath) => {
    const normalizedPath = (portablePath || fallbackPath).trim();
    if (!normalizedPath) {
        return fallbackPath;
    }
    if (!path.isAbsolute(normalizedPath)) {
        return normalizedPath.replace(/\\/g, "/");
    }
    const relativePath = path.relative(portableRootDir, normalizedPath);
    if (!relativePath || path.isAbsolute(relativePath)) {
        return fallbackPath;
    }
    return relativePath.replace(/\\/g, "/");
};
const portableConfigPath = isPortableMode ? getPortableRelativePath(process.env.SOURCEFLOW_CONFIG_DIR, "userdata") : "";
const portableWorkspacePath = isPortableMode ? getPortableRelativePath(process.env.SOURCEFLOW_DEFAULT_WORKSPACE, "workspace") : "";
const portableConfigDir = isPortableMode ? path.resolve(portableRootDir, portableConfigPath) : "";
const portableWorkspaceDir = isPortableMode ? path.resolve(portableRootDir, portableWorkspacePath) : "";
const safeSetOptionalAppPath = (name, targetPath) => {
    try {
        app.setPath(name, targetPath);
    } catch (e) {
        console.error(`set path [${name}] failed`, e);
    }
};

if (isPortableMode) {
    process.env.SOURCEFLOW_PORTABLE_DIR = portableRootDir;
    process.env.SOURCEFLOW_CONFIG_DIR = portableConfigPath;
    process.env.SOURCEFLOW_DEFAULT_WORKSPACE = portableWorkspacePath;
    app.setPath("appData", portableConfigDir);
    app.setPath("userData", path.join(portableConfigDir, appUserDataDirName));
    safeSetOptionalAppPath("sessionData", path.join(portableConfigDir, "session"));
    safeSetOptionalAppPath("logs", path.join(portableConfigDir, "logs"));
    safeSetOptionalAppPath("crashDumps", path.join(portableConfigDir, "crashDumps"));
} else {
    app.setPath("userData", path.join(app.getPath("appData"), appUserDataDirName)); // `~/.config` 下 Electron 相关文件夹名称改为品牌独立目录
    fs.rmSync(path.join(app.getPath("appData"), app.name), {recursive: true, force: true}); // 删除自动创建的应用目录 https://github.com/lonelyor/SourceFlow/issues/13150
}

const confDir = isPortableMode ? portableConfigDir : getPreferredConfigRootDir(app.getPath("home"));
const workspaceStatePath = isPortableMode ? path.join(portableWorkspaceStateDir, "workspace.json") : path.join(confDir, "workspace.json");
const windowStatePath = path.join(confDir, "windowState.json");
let bootWindow;
let latestActiveWindow;
let firstOpen = false;
let workspaces = []; // workspaceDir, id, browserWindow, tray, hideShortcut
let kernelPort = 6806;
let resetWindowStateOnRestart = false;
let openAsHidden = false;
let isQuittingApp = false;
const closingWindowIds = new Set();
const reminderStateDir = path.join(confDir, "reminders");
const startupGuardPath = path.join(confDir, "startupGuard.json");
const workbenchReminderStates = new Map();
const REMINDER_SWEEP_INTERVAL = 30 * 1000;
const REMINDER_RETENTION = 7 * 24 * 60 * 60 * 1000;
let reminderSweepTimer = 0;
const STARTUP_SAFE_MODE_FUSES = Object.freeze({
    assistant: true,
    terminal: true,
    plugins: true,
    richRender: true,
    reminders: true,
});
const STARTUP_SAFE_MODE_EMPTY_FUSES = Object.freeze({
    assistant: false,
    terminal: false,
    plugins: false,
    richRender: false,
    reminders: false,
});
const CRITICAL_STARTUP_FAILURE_TYPES = new Set(["did-fail-load", "render-process-gone", "previous-startup-failure"]);
const isOpenAsHidden = function () {
    return 1 === workspaces.length && openAsHidden;
};

const getDefaultStartupGuardState = () => ({
    currentSession: null,
    lastFailure: null,
    nextBootSafeMode: null,
});

const getStartupSafeModeFuses = (reason) => {
    const normalizedReason = `${reason || ""}`.trim().toLowerCase();
    if (CRITICAL_STARTUP_FAILURE_TYPES.has(normalizedReason)) {
        return Object.assign({}, STARTUP_SAFE_MODE_FUSES);
    }
    return Object.assign({}, STARTUP_SAFE_MODE_EMPTY_FUSES);
};

const normalizeStartupSafeMode = (value) => {
    const reason = `${value?.reason || ""}`.trim();
    const fuses = getStartupSafeModeFuses(reason);
    const active = !!value?.active && Object.values(fuses).some(Boolean);
    return {
        active,
        reason,
        detail: `${value?.detail || ""}`.trim(),
        triggeredAt: Number(value?.triggeredAt) || 0,
        fuses,
    };
};

const createStartupSafeMode = (reason, detail) => normalizeStartupSafeMode({
    active: true,
    reason: reason || "startup-failure",
    detail: `${detail || ""}`.trim(),
    triggeredAt: Date.now(),
});

const readStartupGuardState = () => {
    if (!fs.existsSync(startupGuardPath)) {
        return getDefaultStartupGuardState();
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(startupGuardPath).toString());
        return Object.assign(getDefaultStartupGuardState(), parsed || {});
    } catch (e) {
        writeLog(`read startup guard failed: ${e.message}`);
        return getDefaultStartupGuardState();
    }
};

const writeStartupGuardState = (state) => {
    try {
        fs.writeFileSync(startupGuardPath, JSON.stringify(state, null, 2));
    } catch (e) {
        writeLog(`write startup guard failed: ${e.message}`);
    }
};

const updateStartupGuardState = (updater) => {
    const state = readStartupGuardState();
    updater(state);
    writeStartupGuardState(state);
    return state;
};

const prepareStartupGuardForLaunch = () => {
    updateStartupGuardState((state) => {
        const previousSession = state.currentSession;
        if (previousSession && !previousSession.readyAt && previousSession.failedAt) {
            const nextBootSafeMode = createStartupSafeMode(previousSession.failureType || "previous-startup-failure", previousSession.failureDetail || "Previous startup failed before renderer ready");
            state.nextBootSafeMode = nextBootSafeMode.active ? nextBootSafeMode : null;
            if (state.nextBootSafeMode) {
                writeLog(`startup safe mode armed [${state.nextBootSafeMode.reason}]`);
            }
        }
        state.currentSession = null;
    });
};

const beginStartupGuardSession = () => {
    updateStartupGuardState((state) => {
        state.currentSession = {
            id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            startedAt: Date.now(),
            readyAt: 0,
            failedAt: 0,
            failureType: "",
            failureDetail: "",
        };
    });
};

const recordStartupGuardFailure = (type, detail) => {
    const detailText = `${detail || ""}`.trim();
    updateStartupGuardState((state) => {
        if (!state.currentSession || state.currentSession.readyAt) {
            return;
        }
        if (state.currentSession.failedAt && state.currentSession.failureType === type && state.currentSession.failureDetail === detailText) {
            return;
        }
        state.currentSession.failedAt = Date.now();
        state.currentSession.failureType = type;
        state.currentSession.failureDetail = detailText;
        state.lastFailure = {
            at: state.currentSession.failedAt,
            type,
            detail: detailText,
            sessionId: state.currentSession.id,
        };
        const nextBootSafeMode = createStartupSafeMode(type, detailText);
        state.nextBootSafeMode = nextBootSafeMode.active ? nextBootSafeMode : null;
    });
};

const markStartupGuardReady = () => {
    updateStartupGuardState((state) => {
        if (!state.currentSession || state.currentSession.readyAt) {
            return;
        }
        state.currentSession.readyAt = Date.now();
        state.nextBootSafeMode = null;
    });
    writeLog("startup guard ready");
};

const getStartupSafeModeState = () => {
    const state = readStartupGuardState();
    if (state.nextBootSafeMode) {
        return normalizeStartupSafeMode(state.nextBootSafeMode);
    }
    return normalizeStartupSafeMode({
        active: false,
        reason: "",
        detail: "",
        triggeredAt: 0,
    });
};

const ensureReminderStateDir = () => {
    if (!fs.existsSync(reminderStateDir)) {
        fs.mkdirSync(reminderStateDir, {recursive: true});
    }
};

const getWorkspaceReminderKey = (workspaceDir) => {
    const normalized = path.resolve(workspaceDir || "").replace(/\\/g, "/").toLowerCase();
    return crypto.createHash("sha1").update(normalized).digest("hex");
};

const getWorkspaceReminderState = (workspaceDir) => {
    if (!workspaceDir) {
        return null;
    }
    const key = getWorkspaceReminderKey(workspaceDir);
    if (workbenchReminderStates.has(key)) {
        return workbenchReminderStates.get(key);
    }
    ensureReminderStateDir();
    const filePath = path.join(reminderStateDir, `${key}.json`);
    const state = {
        key,
        workspaceDir,
        filePath,
        reminders: [],
        updatedAt: 0,
    };
    if (fs.existsSync(filePath)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(filePath).toString());
            state.reminders = Array.isArray(parsed?.reminders) ? parsed.reminders : [];
            state.updatedAt = Number(parsed?.updatedAt) || 0;
        } catch (e) {
            writeLog(`load workbench reminder state failed [${workspaceDir}]: ${e.message}`);
        }
    }
    workbenchReminderStates.set(key, state);
    return state;
};

const saveWorkspaceReminderState = (workspaceDir) => {
    const state = getWorkspaceReminderState(workspaceDir);
    if (!state) {
        return;
    }
    ensureReminderStateDir();
    try {
        fs.writeFileSync(state.filePath, JSON.stringify({
            workspaceDir: state.workspaceDir,
            updatedAt: state.updatedAt,
            reminders: state.reminders,
        }, null, 2));
    } catch (e) {
        writeLog(`save workbench reminder state failed [${workspaceDir}]: ${e.message}`);
    }
};

const normalizeReminderEntry = (reminder) => {
    const id = `${reminder?.id || ""}`.trim();
    const rootID = `${reminder?.rootID || id}`.trim();
    const title = `${reminder?.title || ""}`.trim();
    const fireAt = Number(reminder?.fireAt) || 0;
    if (!id || !rootID || !title || !fireAt) {
        return null;
    }
    return {
        id,
        rootID,
        title,
        body: `${reminder?.body || ""}`.trim(),
        fireAt,
        kind: reminder?.kind === "task" ? "task" : "event",
        path: `${reminder?.path || ""}`.trim(),
        project: `${reminder?.project || ""}`.trim(),
        notifiedAt: Number(reminder?.notifiedAt) || 0,
    };
};

const showWorkbenchReminderNotification = (workspaceDir, reminder) => {
    const notification = new Notification({
        title: reminder.title,
        body: reminder.body || reminder.title,
        timeoutType: process.platform === "darwin" ? "default" : "never",
    });
    notification.on("click", () => {
        const workspace = workspaces.find((item) => item.workspaceDir === workspaceDir);
        const mainWindow = workspace?.browserWindow;
        if (!mainWindow || mainWindow.isDestroyed()) {
            return;
        }
        showWindow(mainWindow);
        mainWindow.focus();
        sendBrandedIPC(mainWindow.webContents, "sourceflow-workbench-reminder-open", reminder);
    });
    notification.show();
};

const sweepWorkspaceReminderState = (workspaceDir) => {
    const state = getWorkspaceReminderState(workspaceDir);
    if (!state) {
        return;
    }
    const now = Date.now();
    let changed = false;
    state.reminders.forEach((reminder) => {
        if (reminder.notifiedAt || reminder.fireAt > now) {
            return;
        }
        reminder.notifiedAt = now;
        changed = true;
        showWorkbenchReminderNotification(workspaceDir, reminder);
    });
    const filtered = state.reminders.filter((reminder) => {
        if (!reminder.notifiedAt) {
            return true;
        }
        return now - reminder.notifiedAt < REMINDER_RETENTION;
    });
    if (filtered.length !== state.reminders.length) {
        state.reminders = filtered;
        changed = true;
    }
    if (changed) {
        state.updatedAt = now;
        saveWorkspaceReminderState(workspaceDir);
    }
};

const sweepAllReminderStates = () => {
    workbenchReminderStates.forEach((state) => {
        sweepWorkspaceReminderState(state.workspaceDir);
    });
};

const syncWorkbenchReminderState = (workspaceDir, reminders) => {
    const state = getWorkspaceReminderState(workspaceDir);
    if (!state) {
        return;
    }
    const previous = new Map(state.reminders.map((item) => [item.id, item]));
    const nextReminders = Array.isArray(reminders) ? reminders.map(normalizeReminderEntry).filter(Boolean).map((item) => {
        const prev = previous.get(item.id);
        if (prev && prev.fireAt === item.fireAt && prev.title === item.title && prev.body === item.body && prev.kind === item.kind) {
            item.notifiedAt = prev.notifiedAt || 0;
        }
        return item;
    }) : [];
    state.reminders = nextReminders.sort((a, b) => a.fireAt - b.fireAt);
    state.updatedAt = Date.now();
    saveWorkspaceReminderState(workspaceDir);
    sweepWorkspaceReminderState(workspaceDir);
};

const markWindowClosing = (wnd) => {
    if (wnd && !wnd.isDestroyed()) {
        closingWindowIds.add(wnd.id);
    }
};

const clearWindowClosing = (wnd) => {
    if (wnd) {
        closingWindowIds.delete(wnd.id);
    }
};

const canWindowCloseDirectly = (wnd) => {
    return isQuittingApp || (wnd && closingWindowIds.has(wnd.id));
};

remote.initialize();

if (process.platform === "win32") {
    // Windows 需要设置 AppUserModelId 才能正确显示应用名称和应用图标 https://github.com/lonelyor/SourceFlow/issues/17022
    app.setAppUserModelId(appUserModelId);
}

const allowMultiInstance = process.env.SOURCEFLOW_ALLOW_MULTI_INSTANCE === "1";
if (!allowMultiInstance && !app.requestSingleInstanceLock()) {
    app.quit();
    return;
}

if (process.platform === "linux") {
    app.commandLine.appendSwitch("enable-wayland-ime");
    app.commandLine.appendSwitch("wayland-text-input-version", "3");
}

if (!isPortableMode || "win32" === process.platform) {
    app.setAsDefaultProtocolClient(appProtocol);
}

app.commandLine.appendSwitch("disable-web-security");
app.commandLine.appendSwitch("auto-detect", "false");
app.commandLine.appendSwitch("no-proxy-server");
app.commandLine.appendSwitch("enable-features", "PlatformHEVCDecoderSupport");
app.commandLine.appendSwitch("xdg-portal-required-version", "4");

// Support set Chromium command line arguments on the desktop https://github.com/lonelyor/SourceFlow/issues/9696
writeLog("app is packaged [" + app.isPackaged + "], command line args [" + process.argv.join(", ") + "]");
let argStart = 1;
if (!app.isPackaged) {
    argStart = 2;
}

for (let i = argStart; i < process.argv.length; i++) {
    let arg = process.argv[i];
    if (arg.startsWith("--workspace=") || arg.startsWith("--openAsHidden") || arg.startsWith("--port=") || isAppProtocolURL(arg)) {
        // 跳过内置参数
        if (arg.startsWith("--openAsHidden")) {
            openAsHidden = true;
            writeLog("open as hidden");
        }
        continue;
    }

    app.commandLine.appendSwitch(arg);
    writeLog("command line switch [" + arg + "]");
}

try {
    firstOpen = (() => {
        if (!fs.existsSync(workspaceStatePath)) {
            return true;
        }
        try {
            const parsed = JSON.parse(fs.readFileSync(workspaceStatePath).toString());
            let entries = [];
            if (Array.isArray(parsed)) {
                entries = parsed;
            } else if (Array.isArray(parsed?.workspaces)) {
                entries = parsed.workspaces;
            } else if ("string" === typeof parsed?.workspace) {
                entries = [parsed.workspace];
            }
            return entries.filter((item) => "string" === typeof item && item.trim()).length === 0;
        } catch (e) {
            writeLog(`read workspace state during startup failed: ${e.message}`);
            return true;
        }
    })();
    if (!fs.existsSync(confDir)) {
        fs.mkdirSync(confDir, {mode: 0o755, recursive: true});
    }
    prepareStartupGuardForLaunch();
} catch (e) {
    console.error(e);
    const configDirHint = isPortableMode ? confDir : `~/.config/${appConfigDirName}`;
    require("electron").dialog.showErrorBox("创建配置目录失败 Failed to create config directory", `${appBrandNameCN}需要创建配置文件夹（${configDirHint}），请确保该路径具有写入权限。\n\n${appBrandName} needs to create a configuration folder (${configDirHint}). Please make sure that the path has write permissions.`);
    app.exit();
}

const windowNavigate = (currentWindow, windowType) => {
    currentWindow.webContents.on("will-navigate", (event) => {
        const url = event.url;
        if (url.startsWith(localServer)) {
            try {
                const pathname = new URL(url).pathname;
                // 所有窗口都允许认证页面
                if (pathname === "/check-auth" || pathname === "/") {
                    return;
                }
                if (pathname === "/stage/build/app/" && windowType === "app") {
                    return;
                }
                if (pathname === "/stage/build/app/window.html" && windowType === "window") {
                    return;
                }
                if (pathname.startsWith("/export/temp/") && windowType === "export") {
                    return;
                }
            } catch (e) {
                return;
            }
        }
        // 其他链接使用浏览器打开
        event.preventDefault();
        shell.openExternal(url);
    });
};

const setProxy = (proxyURL, webContents) => {
    if (proxyURL.startsWith("://")) {
        console.log("network proxy [system]");
        return webContents.session.setProxy({mode: "system"});
    }
    console.log("network proxy [" + proxyURL + "]");
    return webContents.session.setProxy({proxyRules: proxyURL});
};

const hotKey2Electron = (key) => {
    if (!key) {
        return key;
    }
    let electronKey = "";
    if (key.indexOf("⌘") > -1) {
        electronKey += "CommandOrControl+";
    }
    if (key.indexOf("⌃") > -1) {
        electronKey += "Control+";
    }
    if (key.indexOf("⇧") > -1) {
        electronKey += "Shift+";
    }
    if (key.indexOf("⌥") > -1) {
        electronKey += "Alt+";
    }
    return electronKey + key.replace("⌘", "").replace("⇧", "").replace("⌥", "").replace("⌃", "")
        .replace("←", "Left").replace("→", "Right").replace("↑", "Up").replace("↓", "Down").replace(" ", "Space")
        .replace("+", "Plus").replace("⇥", "Tab").replace("⌫", "Backspace").replace("⌦", "Delete").replace("↩", "Return");
};

/**
 * 将 RFC 5646 格式的语言标签解析为应用支持的语言代码
 * https://www.rfc-editor.org/info/rfc5646
 * @param {string[]} languageTags - 语言标签数组（如 ["zh-Hans-CN", "en-US"]）
 * @returns {string} 应用支持的语言代码
 */
const resolveAppLanguage = (languageTags) => {
    if (!languageTags || languageTags.length === 0) {
        return "en_US";
    }

    const tag = languageTags[0].toLowerCase();
    const parts = tag.replace(/_/g, "-").split("-");
    const language = parts[0];

    if (language === "zh") {
        return "zh_CN";
    }
    return "en_US";
};

const STARTUP_PAGE_DATA_URL_PATTERN = /^data:image\/(?:svg\+xml|png|jpe?g|gif|webp)(?:;[^,]*)?,/i;
const STARTUP_PAGE_REMOTE_PATTERN = /^(https?:\/\/|file:\/\/)/i;

const normalizeStartupPageImage = (value) => {
    const normalized = `${value || ""}`.trim();
    if (!normalized) {
        return "";
    }
    if (STARTUP_PAGE_DATA_URL_PATTERN.test(normalized)) {
        return normalized;
    }
    return STARTUP_PAGE_REMOTE_PATTERN.test(normalized) ? normalized : "";
};

const normalizeStartupPageOpacity = (value) => {
    const normalized = Math.round(Number(value));
    if (!Number.isFinite(normalized)) {
        return 100;
    }
    return Math.min(100, Math.max(0, normalized));
};

const normalizeStartupPageBlur = (value) => {
    const normalized = Math.round(Number(value));
    if (!Number.isFinite(normalized)) {
        return 0;
    }
    return Math.min(32, Math.max(0, normalized));
};

const readWorkspaceStateEntries = () => {
    if (!fs.existsSync(workspaceStatePath)) {
        return [];
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(workspaceStatePath).toString());
        if (Array.isArray(parsed)) {
            return parsed.filter((item) => "string" === typeof item && item.trim());
        }
        if (Array.isArray(parsed?.workspaces)) {
            return parsed.workspaces.filter((item) => "string" === typeof item && item.trim());
        }
        if ("string" === typeof parsed?.workspace && parsed.workspace.trim()) {
            return [parsed.workspace];
        }
    } catch (e) {
        writeLog(`read workspace state failed: ${e.message}`);
    }
    return [];
};

const writeWorkspaceStateEntries = (workspaceDir) => {
    const normalizedWorkspace = `${workspaceDir || ""}`.trim();
    if (!normalizedWorkspace) {
        return;
    }
    try {
        const resolvedWorkspace = path.resolve(normalizedWorkspace);
        const workspaces = [resolvedWorkspace, ...readWorkspaceStateEntries().map((item) => path.resolve(item)).filter((item) => item !== resolvedWorkspace)];
        const nextState = {
            workspace: resolvedWorkspace,
            workspaces: workspaces.slice(0, 12),
        };
        fs.mkdirSync(path.dirname(workspaceStatePath), {mode: 0o755, recursive: true});
        fs.writeFileSync(workspaceStatePath, JSON.stringify(nextState, null, 2));
    } catch (e) {
        writeLog(`write workspace state failed [${workspaceDir}]: ${e.message}`);
    }
};

const resolveBootWorkspaceDir = (workspaceArg) => {
    const candidates = [];
    if (workspaceArg && `${workspaceArg}`.trim()) {
        candidates.push(workspaceArg);
    }
    readWorkspaceStateEntries().forEach((item) => {
        candidates.push(item);
    });
    if (isPortableMode && portableWorkspaceDir) {
        candidates.push(portableWorkspaceDir);
    }
    for (const candidate of candidates) {
        const resolved = path.resolve(candidate);
        if (fs.existsSync(resolved)) {
            return resolved;
        }
    }
    return "";
};

const readBootStartupAppearance = (workspaceDir) => {
    const resolvedWorkspaceDir = resolveBootWorkspaceDir(workspaceDir);
    const defaultAppearance = {
        image: defaultBootStartupImage(),
        opacity: 100,
        blur: 0,
    };
    if (!resolvedWorkspaceDir) {
        return defaultAppearance;
    }
    try {
        const confPath = path.join(resolvedWorkspaceDir, "conf", "conf.json");
        if (!fs.existsSync(confPath)) {
            return defaultAppearance;
        }
        const parsed = JSON.parse(fs.readFileSync(confPath).toString());
        const appearance = parsed?.appearance || {};
        const startupPageImage = normalizeStartupPageImage(appearance.startupPageImage);
        if (!startupPageImage) {
            return defaultAppearance;
        }
        return {
            image: startupPageImage,
            opacity: normalizeStartupPageOpacity(appearance.startupPageOpacity),
            blur: normalizeStartupPageBlur(appearance.startupPageBlur),
        };
    } catch (e) {
        writeLog(`read boot startup appearance failed: ${e.message}`);
        return defaultAppearance;
    }
};

const sendBootStartupAppearance = (wnd, workspaceDir) => {
    if (!wnd || wnd.isDestroyed()) {
        return;
    }
    try {
        sendBrandedIPC(wnd.webContents, "sourceflow-boot-appearance", readBootStartupAppearance(workspaceDir));
    } catch (e) {
        writeLog(`send boot startup appearance failed: ${e.message}`);
    }
};

const exitApp = (port, errorWindowId, senderWebContentsId) => {
    let tray;
    let mainWindow;
    const targetWindowIds = new Set();
    let targetWorkspace = workspaces.find((item) => item.browserWindow && !item.browserWindow.isDestroyed() && senderWebContentsId === item.browserWindow.webContents.id);
    if (!targetWorkspace && port) {
        targetWorkspace = workspaces.find((item) => {
            try {
                return port.toString() === new URL(item.browserWindow.getURL()).port.toString();
            } catch (e) {
                return false;
            }
        });
    }
    if (!targetWorkspace && 1 === workspaces.length) {
        targetWorkspace = workspaces[0];
    }
    const targetPort = (() => {
        if (targetWorkspace) {
            try {
                return new URL(targetWorkspace.browserWindow.getURL()).port.toString();
            } catch (e) {
                return port ? port.toString() : "";
            }
        }
        return port ? port.toString() : "";
    })();
    if (targetWorkspace) {
        mainWindow = targetWorkspace.browserWindow;
    }

    // 关闭端口相同的所有非主窗口
    BrowserWindow.getAllWindows().forEach((item) => {
        if (mainWindow && item.id === mainWindow.id) {
            return;
        }
        try {
            const currentURL = new URL(item.getURL());
            if (targetPort && targetPort === currentURL.port.toString()) {
                markWindowClosing(item);
                targetWindowIds.add(item.id);
                item.destroy();
            }
        } catch (e) {
            // load file is not a url
        }
    });
    workspaces.find((item, index) => {
        if (mainWindow && mainWindow.id === item.browserWindow.id) {
            if (workspaces.length > 1) {
                markWindowClosing(item.browserWindow);
                targetWindowIds.add(item.browserWindow.id);
                item.browserWindow.destroy();
            }
            workspaces.splice(index, 1);
            tray = item.tray;
            return true;
        }
    });
    if (tray && ("win32" === process.platform || "linux" === process.platform)) {
        tray.destroy();
    }
    const shouldQuitApp = workspaces.length === 0 && mainWindow;
    if (shouldQuitApp) {
        isQuittingApp = true;
        try {
            if (resetWindowStateOnRestart) {
                fs.writeFileSync(windowStatePath, "{}");
            } else {
                const bounds = mainWindow.getBounds();
                fs.writeFileSync(windowStatePath, JSON.stringify({
                    isMaximized: mainWindow.isMaximized(),
                    fullscreen: mainWindow.isFullScreen(),
                    isDevToolsOpened: mainWindow.webContents.isDevToolsOpened(),
                    x: bounds.x,
                    y: bounds.y,
                    width: bounds.width,
                    height: bounds.height,
                }));
            }
        } catch (e) {
            writeLog(e);
        }

        if (errorWindowId) {
            BrowserWindow.getAllWindows().forEach((item) => {
                if (errorWindowId !== item.id) {
                    item.destroy();
                }
            });
        } else {
            app.exit();
        }
        globalShortcut.unregisterAll();
        writeLog("exited ui");
    }
    return {
        shouldQuitApp,
        targetWindowIds: Array.from(targetWindowIds),
    };
};

const forceQuitApplication = () => {
    isQuittingApp = true;
    BrowserWindow.getAllWindows().forEach((item) => {
        try {
            item.destroy();
        } catch (e) {
            writeLog("force destroy window failed: " + e);
        }
    });
    globalShortcut.unregisterAll();
    app.exit();
};

const localServer = "http://127.0.0.1";

const getServer = (port = kernelPort) => {
    return localServer + ":" + port;
};

const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

const showErrorWindow = (titleZh, titleEn, content, emoji = "⚠️") => {
    const errorHTMLPath = resolveAppFile("electron", "error.html");
    const errWindow = new BrowserWindow({
        width: Math.floor(screen.getPrimaryDisplay().size.width * 0.5),
        height: Math.floor(screen.getPrimaryDisplay().workAreaSize.height * 0.8),
        frame: "darwin" === process.platform,
        titleBarStyle: "hidden",
        fullscreenable: false,
        icon: path.join(appDir, "stage", "icon-large.png"),
        transparent: "darwin" === process.platform, // 避免深色模式关闭窗口时闪现白色背景
        webPreferences: {
            nodeIntegration: true, webviewTag: true, webSecurity: false, contextIsolation: false,
        },
    });
    errWindow.loadFile(errorHTMLPath, {
        query: {
            home: app.getPath("home"),
            v: appVer,
            title: `<h2>${titleZh}</h2><h2>${titleEn}</h2>`,
            emoji,
            content,
            icon: path.join(appDir, "stage", "icon-large.png"),
        },
    });
    errWindow.show();
    return errWindow.id;
};

const initMainWindow = () => {
    // 恢复主窗体状态
    let oldWindowState = {};
    try {
        oldWindowState = JSON.parse(fs.readFileSync(windowStatePath, "utf8"));
    } catch (e) {
        writeLog("read window state failed: " + e);
        fs.writeFileSync(windowStatePath, "{}");
    }
    let defaultWidth;
    let defaultHeight;
    let workArea;
    try {
        defaultWidth = Math.floor(screen.getPrimaryDisplay().size.width * 0.8);
        defaultHeight = Math.floor(screen.getPrimaryDisplay().workAreaSize.height * 0.8);
        workArea = screen.getPrimaryDisplay().workArea;
    } catch (e) {
        writeLog("get screen size failed: " + e);
    }
    const windowState = Object.assign({}, {
        isMaximized: false,
        fullscreen: false,
        isDevToolsOpened: false,
        x: 0,
        y: 0,
        width: defaultWidth,
        height: defaultHeight,
    }, oldWindowState);

    writeLog("window stat [x=" + windowState.x + ", y=" + windowState.y + ", width=" + windowState.width + ", height=" + windowState.height + "], " +
        "default [x=0, y=0, width=" + defaultWidth + ", height=" + defaultHeight + "], " +
        "old [x=" + oldWindowState.x + ", y=" + oldWindowState.y + ", width=" + oldWindowState.width + ", height=" + oldWindowState.height + "]");

    let resetToCenter = false;
    let x = windowState.x;
    if (-32 < x && 0 > x) {
        x = 0;
    }
    let y = windowState.y;
    if (-32 < y && 0 > y) {
        y = 0;
    }
    if (workArea) {
        // 窗口大于 workArea 时缩小会隐藏到左下角，这里使用最小值重置
        if (windowState.width > workArea.width + 32 || windowState.height > workArea.height + 32) {
            // 重启后窗口大小恢复默认问题 https://github.com/lonelyor/SourceFlow/issues/7755 https://github.com/lonelyor/SourceFlow/issues/13732
            // 这里 +32 是因为在某种情况下窗口大小会比 workArea 大几个像素导致恢复默认，+32 可以避免这种特殊情况
            windowState.width = Math.min(defaultWidth, workArea.width);
            windowState.height = Math.min(defaultHeight, workArea.height);
            writeLog("reset window size [width=" + windowState.width + ", height=" + windowState.height + "]");
        }

        if (x >= workArea.width * 0.8 || y >= workArea.height * 0.8) {
            resetToCenter = true;
            writeLog("reset window to center cause x or y >= 80% of workArea");
        }
    }

    if (x < 0 || y < 0) {
        resetToCenter = true;
        writeLog("reset window to center cause x or y < 0");
    }

    if (windowState.width < 493) {
        windowState.width = 493;
        writeLog("reset window width [493]");
    }
    if (windowState.height < 376) {
        windowState.height = 376;
        writeLog("reset window height [376]");
    }

    // 创建主窗体
    const currentWindow = new BrowserWindow({
        show: false,
        width: windowState.width,
        height: windowState.height,
        minWidth: 493,
        minHeight: 376,
        fullscreenable: true,
        fullscreen: windowState.fullscreen,
        trafficLightPosition: {x: 8, y: 8},
        transparent: "darwin" === process.platform, // 避免缩放窗口时出现边框
        webPreferences: {
            nodeIntegration: true,
            webviewTag: true,
            webSecurity: false,
            contextIsolation: false,
            autoplayPolicy: "user-gesture-required" // 桌面端禁止自动播放多媒体 https://github.com/lonelyor/SourceFlow/issues/7587
        },
        frame: "darwin" === process.platform,
        titleBarStyle: "hidden",
        icon: path.join(appDir, "stage", "icon-large.png"),
    });
    remote.enable(currentWindow.webContents);

    if (resetToCenter) {
        currentWindow.center();
    } else {
        writeLog("window position [x=" + x + ", y=" + y + "]");
        currentWindow.setPosition(x, y);
    }
    currentWindow.webContents.userAgent = `${appBrandName}/${appVer} ${appGithubURL} Electron ${currentWindow.webContents.userAgent}`;
    beginStartupGuardSession();

    let mainWindowLoaded = false;
    let mainWindowShown = false;
    let readySignalReceived = false;
    let mainWindowReadyToShow = false;
    let readyFallbackTimer = 0;
    let pendingOpenProtocolURL = "";
    const mainWindowURL = getServer() + "/stage/build/app/?v=" + new Date().getTime();
    const flushPendingProtocolURL = () => {
        if (!pendingOpenProtocolURL || currentWindow.isDestroyed()) {
            return;
        }
        const openProtocolURL = pendingOpenProtocolURL;
        pendingOpenProtocolURL = "";
        writeLog(openProtocolURL);
        sendBrandedIPC(currentWindow.webContents, "sourceflow-open-url", openProtocolURL);
    };
    const showCurrentWindow = (reason) => {
        if (mainWindowShown || currentWindow.isDestroyed()) {
            return;
        }
        mainWindowShown = true;
        writeLog(`show main window [${reason}]`);
        if (isOpenAsHidden()) {
            currentWindow.minimize();
        } else {
            currentWindow.show();
            if (windowState.isMaximized) {
                currentWindow.maximize();
            } else {
                currentWindow.unmaximize();
            }
        }
        if (bootWindow && !bootWindow.isDestroyed()) {
            bootWindow.destroy();
        }
        flushPendingProtocolURL();
    };
    const tryShowCurrentWindow = (reason) => {
        if (!mainWindowReadyToShow || !readySignalReceived) {
            return;
        }
        showCurrentWindow(reason);
    };
    const loadMainWindow = (reason) => {
        if (mainWindowLoaded || currentWindow.isDestroyed()) {
            return;
        }
        mainWindowLoaded = true;
        writeLog(`load main window [${reason}]`);
        currentWindow.loadURL(mainWindowURL);
    };
    const handleRendererReady = (event) => {
        if (event.sender.id !== currentWindow.webContents.id) {
            return;
        }
        readySignalReceived = true;
        removeBrandedIPCListener("sourceflow-ready-to-show", handleRendererReady);
        clearTimeout(readyFallbackTimer);
        tryShowCurrentWindow("renderer-ready");
    };
    onBrandedIPC("sourceflow-ready-to-show", handleRendererReady);

    loadMainWindow("startup-immediate");

    // set proxy
    net.fetch(getServer() + "/api/system/getNetwork", {method: "POST"}).then((response) => {
        return response.json();
    }).then((response) => {
        return setProxy(`${response.data.proxy.scheme}://${response.data.proxy.host}:${response.data.proxy.port}`, currentWindow.webContents);
    }).catch((e) => {
        writeLog("prepare proxy failed: " + e.message);
    }).finally(() => {
        writeLog("proxy prepared");
    });

    // 发起互联网服务请求时绕过安全策略 https://github.com/lonelyor/SourceFlow/issues/5516
    currentWindow.webContents.session.webRequest.onBeforeSendHeaders((details, cb) => {
        if (-1 < details.url.toLowerCase().indexOf("bili")) {
            // B 站不移除 Referer https://github.com/lonelyor/SourceFlow/issues/94
            cb({requestHeaders: details.requestHeaders});
            return;
        }

        if (-1 < details.url.toLowerCase().indexOf("youtube")) {
            // YouTube 设置 Referer https://github.com/lonelyor/SourceFlow/issues/16319
            details.requestHeaders["Referer"] = appGithubURL;
            cb({requestHeaders: details.requestHeaders});
            return;
        }

        for (let key in details.requestHeaders) {
            if ("referer" === key.toLowerCase()) {
                delete details.requestHeaders[key];
            }
        }
        cb({requestHeaders: details.requestHeaders});
    });
    currentWindow.webContents.session.webRequest.onHeadersReceived((details, cb) => {
        for (let key in details.responseHeaders) {
            if ("x-frame-options" === key.toLowerCase()) {
                delete details.responseHeaders[key];
            } else if ("content-security-policy" === key.toLowerCase()) {
                delete details.responseHeaders[key];
            } else if ("access-control-allow-origin" === key.toLowerCase()) {
                delete details.responseHeaders[key];
            }
        }
        cb({responseHeaders: details.responseHeaders});
    });

    currentWindow.webContents.on("did-finish-load", () => {
        writeLog(`main window did-finish-load [${currentWindow.webContents.getURL()}]`);
        const openProtocolURL = findProtocolArg(process.argv);
        if (openProtocolURL) {
            pendingOpenProtocolURL = openProtocolURL;
        }
        if (!readySignalReceived) {
            clearTimeout(readyFallbackTimer);
            readyFallbackTimer = setTimeout(() => {
                writeLog("renderer ready timeout, forcing main window show");
                showCurrentWindow("did-finish-load-fallback");
            }, 15000);
        }
    });
    currentWindow.once("ready-to-show", () => {
        mainWindowReadyToShow = true;
        tryShowCurrentWindow("browser-ready");
    });
    currentWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (isMainFrame) {
            writeLog(`main window did-fail-load [${errorCode}] ${errorDescription} ${validatedURL}`);
            recordStartupGuardFailure("did-fail-load", `${errorCode} ${errorDescription} ${validatedURL}`);
        }
    });
    currentWindow.webContents.on("render-process-gone", (_event, details) => {
        writeLog(`main window render-process-gone [${details.reason}] exitCode=${details.exitCode}`);
        recordStartupGuardFailure("render-process-gone", `${details.reason} exitCode=${details.exitCode}`);
    });
    currentWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
        if (sourceId && sourceId.includes("/stage/build/app/")) {
            writeLog(`renderer console [${level}] ${message} (${sourceId}:${line})`);
            if (message.startsWith("[startup:error]") || message.startsWith("[startup:promise]")) {
                recordStartupGuardFailure("renderer-startup", `${message} (${sourceId}:${line})`);
            }
        }
    });

    if (windowState.isDevToolsOpened) {
        currentWindow.webContents.openDevTools({mode: "bottom"});
    }

    // 菜单
    const productName = appBrandName;
    const template = [{
        label: productName, submenu: [{
            label: `About ${productName}`, role: "about",
        }, {type: "separator"}, {role: "services"}, {type: "separator"}, {
            label: `Hide ${productName}`, role: "hide",
        }, {role: "hideOthers"}, {role: "unhide"}, {type: "separator"}, {
            label: `Quit ${productName}`, role: "quit",
        },],
    }, {
        role: "editMenu", submenu: [{role: "cut"}, {role: "copy"}, {role: "paste"}, {
            role: "pasteAndMatchStyle", accelerator: "CmdOrCtrl+Shift+C"
        }, {role: "selectAll"},],
    }, {
        role: "windowMenu",
        submenu: [{role: "minimize"}, {role: "zoom"}, {role: "togglefullscreen"}, {type: "separator"}, {role: "toggledevtools"}, {type: "separator"}, {role: "front"},],
    },];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
    // 当前页面链接使用浏览器打开
    windowNavigate(currentWindow, "app");
    currentWindow.on("close", (event) => {
        if (canWindowCloseDirectly(currentWindow)) {
            return;
        }
        if (currentWindow && !currentWindow.isDestroyed()) {
            sendBrandedIPC(currentWindow.webContents, "sourceflow-save-close", false);
        }
        event.preventDefault();
    });
    currentWindow.on("closed", () => {
        clearTimeout(readyFallbackTimer);
        removeBrandedIPCListener("sourceflow-ready-to-show", handleRendererReady);
        clearWindowClosing(currentWindow);
    });
    workspaces.push({
        browserWindow: currentWindow,
    });
};

const showWindow = (wnd) => {
    if (!wnd || wnd.isDestroyed()) {
        return;
    }

    if (wnd.isMinimized()) {
        wnd.restore();
    }
    wnd.show();
};

const initKernel = (workspace, port, lang) => {
    return new Promise(async (resolve) => {
        const startupWorkspaceDir = resolveBootWorkspaceDir(workspace);
        bootWindow = new BrowserWindow({
            show: false,
            width: Math.floor(screen.getPrimaryDisplay().size.width / 2),
            height: Math.floor(screen.getPrimaryDisplay().workAreaSize.height / 2),
            frame: false,
            backgroundColor: "#101218",
            resizable: false,
            icon: path.join(appDir, "stage", "icon-large.png"),
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
            },
        });
        let bootWindowShown = false;
        const showBootWindow = () => {
            if (bootWindowShown || bootWindow.isDestroyed()) {
                return;
            }
            bootWindowShown = true;
            if (openAsHidden) {
                bootWindow.minimize();
            } else {
                bootWindow.show();
            }
        };
        bootWindow.once("ready-to-show", showBootWindow);
        bootWindow.webContents.on("did-finish-load", () => {
            sendBootStartupAppearance(bootWindow, startupWorkspaceDir);
            showBootWindow();
        });
        const bootIndex = resolveAppFile("electron", "boot.html");
        bootWindow.loadFile(bootIndex, {query: {v: appVer, workspace: startupWorkspaceDir, port: `${kernelPort || 0}`}});

        const kernelName = "win32" === process.platform ? `${kernelBinaryBaseName}.exe` : kernelBinaryBaseName;
        const kernelPath = path.join(appDir, "kernel", kernelName);
        if (!fs.existsSync(kernelPath)) {
            const kernelMissingMsg = isPortableMode ?
                `<div>内核程序丢失，请重新解压便携版文件，并将${appBrandNameCN}内核程序加入杀毒软件信任列表。</div><div>The kernel program is not found, please re-extract the portable package and add ${appBrandName} Kernel program into the trust list of your antivirus software.</div><div><i>${kernelPath}</i></div>` :
                `<div>内核程序丢失，请重新安装${appBrandNameCN}，并将${appBrandNameCN}内核程序加入杀毒软件信任列表。</div><div>The kernel program is not found, please reinstall ${appBrandName} and add ${appBrandName} Kernel program into the trust list of your antivirus software.</div><div><i>${kernelPath}</i></div>`;
            showErrorWindow("内核程序丢失", "Kernel program is missing", kernelMissingMsg);
            bootWindow.destroy();
            resolve(false);
            return;
        }

        if (!isDevEnv || workspaces.length > 0) {
            if (port && "" !== port) {
                kernelPort = port;
            } else {
                const getAvailablePort = () => {
                    // https://gist.github.com/mikeal/1840641
                    return new Promise((portResolve, portReject) => {
                        const server = gNet.createServer();
                        server.on("error", error => {
                            writeLog(error);
                            kernelPort = "";
                            portReject();
                        });
                        server.listen(0, () => {
                            kernelPort = server.address().port;
                            server.close(() => portResolve(kernelPort));
                        });
                    });
                };
                await getAvailablePort();
            }
        }
        writeLog("got kernel port [" + kernelPort + "]");
        if (!kernelPort) {
            bootWindow.destroy();
            resolve(false);
            return;
        }
        const cmds = ["--port", kernelPort, "--wd", appDir];
        if (isDevEnv && workspaces.length === 0) {
            cmds.push("--mode", "dev");
        }
        if (workspace && "" !== workspace) {
            cmds.push("--workspace", workspace);
        }
        if (port && "" !== port) {
            cmds.push("--port", port);
        }
        if (lang && "" !== lang) {
            cmds.push("--lang", lang);
        }
        let cmd = `ui version [${appVer}], booting kernel [${kernelPath} ${cmds.join(" ")}]`;
        writeLog(cmd);
        if (!isDevEnv || workspaces.length > 0) {
            const cp = require("child_process");
            const kernelProcess = cp.spawn(kernelPath, cmds, {
                detached: false, // 桌面端内核进程不再以游离模式拉起 https://github.com/lonelyor/SourceFlow/issues/6336
                env: Object.assign({}, process.env, {
                    SOURCEFLOW_DEFAULT_AI_USER_AGENT: defaultAIUserAgent,
                }),
                stdio: "ignore",
            },);

            const currentKernelPort = kernelPort;
            writeLog("booted kernel process [pid=" + kernelProcess.pid + ", port=" + kernelPort + "]");
            kernelProcess.on("close", (code) => {
                writeLog(`kernel [pid=${kernelProcess.pid}, port=${currentKernelPort}] exited with code [${code}]`);
                if (0 !== code) {
                    let errorWindowId;
                    switch (code) {
                        case 20:
                            errorWindowId = showErrorWindow("数据库不可用", "The database is unavailable", "<div>无法访问数据库文件，请查看 工作空间/temp/sourceflow.log 获取详细报错信息</div><div>Cannot access the database file. Please check workspace/temp/sourceflow.log for detailed error information.</div>");
                            break;
                        case 21:
                            errorWindowId = showErrorWindow("监听端口 " + currentKernelPort + " 失败", "Failed to listen to port " + currentKernelPort, "<div>监听 " + currentKernelPort + " 端口失败，请确保程序拥有网络权限并不受防火墙和杀毒软件阻止。</div><div>Failed to listen to port " + currentKernelPort + ", please make sure the program has network permissions and is not blocked by firewalls and antivirus software.</div>");
                            break;
                        case 24: // 工作空间已被锁定，尝试切换到第一个打开的工作空间
                            if (workspaces && 0 < workspaces.length) {
                                showWindow(workspaces[0].browserWindow);
                            }

                            errorWindowId = showErrorWindow("工作空间已被锁定", "The workspace is locked", `<div>该工作空间正在被使用，请尝试在任务管理器中结束 ${appBrandName} Kernel 进程或者重启操作系统后再启动${appBrandNameCN}。</div><div>The workspace is being used, please try to end the ${appBrandName} Kernel process in the task manager or restart the operating system and then start ${appBrandName}.</div>`);
                            break;
                        case 25:
                            errorWindowId = showErrorWindow("初始化工作空间失败", "Failed to create workspace directory", "<div>工作空间文件夹权限不足，请查看 工作空间/temp/sourceflow.log 获取详细报错信息</div><div>Insufficient permissions for the workspace folder. Please check workspace/temp/sourceflow.log for detailed error information.</div>");
                            break;
                        case 26:
                            errorWindowId = showErrorWindow("已成功避免潜在的数据损坏", "Successfully avoid potential data corruption", `<div>工作空间下的文件正在被第三方软件（比如同步网盘、杀毒软件等）打开占用，继续使用会导致数据损坏，${appBrandNameCN}内核已经安全退出。</div><div>请将工作空间移动到其他路径后再打开，停止同步盘同步工作空间，并将工作空间加入杀毒软件信任列表。如果以上步骤无法解决问题，请前往 <a href="${appGithubURL}" target="_blank">GitHub</a> 寻求帮助。</div><div>The files in the workspace are being opened and occupied by third-party software (such as synchronized network disk, antivirus software, etc.), continuing to use it will cause data corruption, and the ${appBrandName} Kernel has already shut down safely.</div><div>Move the workspace to another path and open it again, stop the network disk from syncing the workspace, and add the workspace to your antivirus trust list. If the above steps do not resolve the issue, please seek help on <a href="${appGithubURL}" target="_blank">GitHub</a>.</div>`, "🚒");
                            break;
                        case 0:
                            break;
                        default:
                            errorWindowId = showErrorWindow("内核因未知原因退出", "The kernel exited for unknown reasons", `<div>${appBrandNameCN}内核因未知原因退出 [code=${code}]，请尝试重启操作系统后再启动${appBrandNameCN}。如果该问题依然发生，请检查杀毒软件是否阻止${appBrandNameCN}内核启动。</div><div>${appBrandName} Kernel exited for unknown reasons [code=${code}]. Please reboot your operating system and then start ${appBrandName} again. If this problem still occurs, please check whether your anti-virus software blocked the ${appBrandName} Kernel.</div>`);
                            break;
                    }

                    exitApp(currentKernelPort, errorWindowId);
                    bootWindow.destroy();
                    resolve(false);
                }
            });
        }

        let apiData;
        let count = 0;
        writeLog("checking kernel version");
        for (; ;) {
            try {
                const apiResult = await net.fetch(getServer() + "/api/system/version");
                apiData = await apiResult.json();
                break;
            } catch (e) {
                writeLog("get kernel version failed: " + e.message);
                if (14 < ++count) {
                    writeLog("get kernel ver failed");
                    showErrorWindow("获取内核服务端口失败", "Failed to Obtain Kernel Service Port", `<div>获取内核服务端口失败，请确保${appBrandNameCN}拥有网络权限并不受防火墙和杀毒软件阻止。</div><div>Failed to obtain kernel service port. Please ensure ${appBrandName} has network permissions and is not blocked by firewalls or antivirus software.</div>`);
                    bootWindow.destroy();
                    resolve(false);
                    return;
                }
                await sleep(500);
            }
        }

        if (0 === apiData.code) {
            writeLog("got kernel version [" + apiData.data + "]");
            if (!isDevEnv && apiData.data !== appVer) {
                writeLog(`kernel [${apiData.data}] is running, shutdown it now and then start kernel [${appVer}]`);
                net.fetch(getServer() + "/api/system/exit", {method: "POST"});
                bootWindow.destroy();
                resolve(false);
            } else {
                let progressing = false;
                while (!progressing) {
                    try {
                        const progressResult = await net.fetch(getServer() + "/api/system/bootProgress");
                        const progressData = await progressResult.json();
                        if (progressData.data.progress >= 100) {
                            resolve(true);
                            progressing = true;
                        } else {
                            await sleep(100);
                        }
                    } catch (e) {
                        writeLog("get boot progress failed: " + e.message);
                        net.fetch(getServer() + "/api/system/exit", {method: "POST"});
                        bootWindow.destroy();
                        resolve(false);
                        progressing = true;
                    }
                }
            }
        } else {
            writeLog(`get kernel version failed: ${apiData.code}, ${apiData.msg}`);
            resolve(false);
        }
    });
};

app.whenReady().then(() => {
    const resetTrayMenu = (tray, lang, mainWindow) => {
        if (!mainWindow || mainWindow.isDestroyed()) {
            return;
        }

        const trayMenuTemplate = [{
            label: mainWindow.isVisible() ? lang.hideWindow : lang.showWindow, click: () => {
                showHideWindow(tray, lang, mainWindow);
            },
        }, {
            label: lang.officialWebsite, click: () => {
                shell.openExternal(appGithubURL);
            },
        }, {
            label: lang.openSource, click: () => {
                shell.openExternal(appGithubURL);
            },
        }, {
            label: lang.resetWindow, type: "checkbox", click: v => {
                resetWindowStateOnRestart = v.checked;
                sendBrandedIPC(mainWindow.webContents, "sourceflow-save-close", true);
            },
        }, {
            label: lang.quit, click: () => {
                sendBrandedIPC(mainWindow.webContents, "sourceflow-save-close", true);
            },
        },];

        if ("win32" === process.platform) {
            // Windows 端支持窗口置顶 https://github.com/lonelyor/SourceFlow/issues/6860
            trayMenuTemplate.splice(1, 0, {
                label: mainWindow.isAlwaysOnTop() ? lang.cancelWindowTop : lang.setWindowTop, click: () => {
                    if (!mainWindow.isAlwaysOnTop()) {
                        mainWindow.setAlwaysOnTop(true);
                    } else {
                        mainWindow.setAlwaysOnTop(false);
                    }
                    resetTrayMenu(tray, lang, mainWindow);
                },
            });
        }
        const contextMenu = Menu.buildFromTemplate(trayMenuTemplate);
        tray.setContextMenu(contextMenu);
    };
    const hideWindow = (wnd) => {
        // 通过 `Alt+M` 最小化后焦点回到先前的窗口 https://github.com/lonelyor/SourceFlow/issues/7275
        wnd.minimize();
        // Mac 隐藏后无法再 Dock 中显示
        if ("win32" === process.platform || "linux" === process.platform) {
            wnd.hide();
        }
    };
    const showHideWindow = (tray, lang, mainWindow) => {
        if (!mainWindow || mainWindow.isDestroyed()) {
            return;
        }

        if (!mainWindow.isVisible()) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            mainWindow.show();
        } else {
            hideWindow(mainWindow);
        }

        resetTrayMenu(tray, lang, mainWindow);
    };

    const getWindowByContentId = (id) => {
        return BrowserWindow.getAllWindows().find((win) => win.webContents.id === id);
    };
    onBrandedIPC("sourceflow-context-menu", (event, langs) => {
        const template = [new MenuItem({
            role: "undo", label: langs.undo
        }), new MenuItem({
            role: "redo", label: langs.redo
        }), {type: "separator"}, new MenuItem({
            role: "copy", label: langs.copy
        }), new MenuItem({
            role: "cut", label: langs.cut
        }), new MenuItem({
            role: "delete", label: langs.delete
        }), new MenuItem({
            role: "paste", label: langs.paste
        }), new MenuItem({
            role: "pasteAndMatchStyle", label: langs.pasteAsPlainText
        }), new MenuItem({
            role: "selectAll", label: langs.selectAll
        })];
        const menu = Menu.buildFromTemplate(template);
        menu.popup({window: BrowserWindow.fromWebContents(event.sender)});
    });
    onBrandedIPC("sourceflow-confirm-dialog", (event, options) => {
        event.returnValue = dialog.showMessageBoxSync(BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow(), options);
    });
    onBrandedIPC("sourceflow-alert-dialog", (event, options) => {
        dialog.showMessageBoxSync(BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow(), options);
        event.returnValue = undefined;
    });
    onBrandedIPC("sourceflow-first-quit", () => {
        app.exit();
    });
    handleBrandedIPC("sourceflow-get", async (event, data) => {
        if (data.cmd === "getStartupGuard") {
            return getStartupSafeModeState();
        }
        if (data.cmd === "clipboardRead") {
            return clipboard.read(data.format);
        }
        if (data.cmd === "showOpenDialog") {
            return dialog.showOpenDialog(data);
        }
        if (data.cmd === "readFileAsDataURL") {
            const filePath = path.resolve(String(data.filePath || "").trim());
            const stat = await fs.promises.stat(filePath);
            if (!stat.isFile()) {
                throw new Error(`Not a file: ${filePath}`);
            }
            const ext = path.extname(filePath).toLowerCase();
            const mime = supportedImageMimeByExtension[ext] || "application/octet-stream";
            const buffer = await fs.promises.readFile(filePath);
            return {
                filePath,
                fileName: path.basename(filePath),
                dataURL: `data:${mime};base64,${buffer.toString("base64")}`,
            };
        }
        if (data.cmd === "getContentsId") {
            return event.sender.id;
        }
        if (data.cmd === "isDefaultProtocolClient") {
            if ("win32" !== process.platform) {
                return false;
            }
            return app.isDefaultProtocolClient(appProtocol);
        }
        if (data.cmd === "setDefaultProtocolClient") {
            if ("win32" !== process.platform) {
                return false;
            }
            if (data.register) {
                app.setAsDefaultProtocolClient(appProtocol);
            } else {
                app.removeAsDefaultProtocolClient(appProtocol);
            }
            return app.isDefaultProtocolClient(appProtocol);
        }
        if (data.cmd === "isAlwaysOnTop") {
            const wnd = getWindowByContentId(event.sender.id);
            if (!wnd) {
                return false;
            }
            return wnd.isAlwaysOnTop();
        }
        if (data.cmd === "availableSpellCheckerLanguages") {
            return event.sender.session.availableSpellCheckerLanguages;
        }
        if (data.cmd === "setProxy") {
            return setProxy(data.proxyURL, event.sender);
        }
        if (data.cmd === "showSaveDialog") {
            return dialog.showSaveDialog(data);
        }
        if (data.cmd === "runWorkspaceMigration") {
            return runWorkspaceMigration(data.sourceWorkspace, data.targetWorkspace);
        }
        if (data.cmd === "isFullScreen") {
            const wnd = getWindowByContentId(event.sender.id);
            if (!wnd) {
                return false;
            }
            return wnd.isFullScreen();
        }
        if (data.cmd === "isMaximized") {
            const wnd = getWindowByContentId(event.sender.id);
            if (!wnd) {
                return false;
            }
            return wnd.isMaximized();
        }
        if (data.cmd === "getMicrophone") {
            return systemPreferences.getMediaAccessStatus("microphone");
        }
        if (data.cmd === "askMicrophone") {
            return systemPreferences.askForMediaAccess("microphone");
        }
        if (data.cmd === "printToPDF") {
            try {
                return getWindowByContentId(data.webContentsId).webContents.printToPDF(data.pdfOptions);
            } catch (e) {
                writeLog("printToPDF: ", e);
                throw e;
            }
        }
        if (data.cmd === "sourceflow-open-file") {
            let hasMatch = false;
            BrowserWindow.getAllWindows().find(item => {
                const url = new URL(item.webContents.getURL());
                if (item.webContents.id === event.sender.id || data.port !== url.port) {
                    return;
                }
                const ids = decodeURIComponent(url.hash.substring(1)).split("\u200b");
                const options = JSON.parse(data.options);
                if (ids.includes(options.rootID) || ids.includes(options.assetPath)) {
                    item.focus();
                    sendBrandedIPC(item.webContents, "sourceflow-open-file", options);
                    hasMatch = true;
                    return true;
                }
            });
            return hasMatch;
        }
    });

    const initEventId = [];
    onBrandedIPC("sourceflow-event", (event) => {
        if (initEventId.includes(event.sender.id)) {
            return;
        }
        initEventId.push(event.sender.id);
        const currentWindow = getWindowByContentId(event.sender.id);
        if (!currentWindow) {
            return;
        }
        latestActiveWindow = currentWindow;
        currentWindow.on("focus", () => {
            sendBrandedIPC(event.sender, "sourceflow-event", "focus");
            latestActiveWindow = currentWindow;
        });
        currentWindow.on("blur", () => {
            sendBrandedIPC(event.sender, "sourceflow-event", "blur");
        });
        if ("darwin" !== process.platform) {
            currentWindow.on("maximize", () => {
                sendBrandedIPC(event.sender, "sourceflow-event", "maximize");
            });
            currentWindow.on("unmaximize", () => {
                sendBrandedIPC(event.sender, "sourceflow-event", "unmaximize");
            });
        }
        currentWindow.on("enter-full-screen", () => {
            sendBrandedIPC(event.sender, "sourceflow-event", "enter-full-screen");
        });
        currentWindow.on("leave-full-screen", () => {
            sendBrandedIPC(event.sender, "sourceflow-event", "leave-full-screen");
        });
    });
    onBrandedIPC("sourceflow-cmd", (event, data) => {
        let cmd = data;
        let webContentsId = event.sender.id;
        if (typeof data !== "string") {
            cmd = data.cmd;
            if (data.webContentsId) {
                webContentsId = data.webContentsId;
            }
        }
        const currentWindow = getWindowByContentId(webContentsId);
        switch (cmd) {
            case "showItemInFolder":
                shell.showItemInFolder(data.filePath);
                break;
            case "syncWorkbenchReminders": {
                const workspace = workspaces.find((item) => item.browserWindow?.webContents.id === webContentsId);
                if (workspace?.workspaceDir) {
                    syncWorkbenchReminderState(workspace.workspaceDir, data.items);
                }
                break;
            }
            case "notification":
                new Notification({
                    title: data.title,
                    body: data.body,
                    timeoutType: data.timeoutType,
                }).show();
                break;
            case "setSpellCheckerLanguages":
                BrowserWindow.getAllWindows().forEach(item => {
                    item.webContents.session.setSpellCheckerLanguages(data.languages);
                });
                break;
            case "openPath":
                shell.openPath(data.filePath);
                break;
            case "openDevTools":
                event.sender.openDevTools({mode: "bottom"});
                break;
            case "unregisterGlobalShortcut":
                if (data.accelerator) {
                    globalShortcut.unregister(hotKey2Electron(data.accelerator));
                }
                break;
            case "setTrafficLightPosition":
                if (!currentWindow || !currentWindow.setWindowButtonPosition) {
                    return;
                }
                if (new URL(currentWindow.getURL()).pathname === "/stage/build/app/window.html") {
                    data.position.y += 5 * data.zoom;
                }
                currentWindow.setWindowButtonPosition(data.position);
                break;
            case "show":
                if (!currentWindow) {
                    return;
                }
                showWindow(currentWindow);
                break;
            case "hide":
                if (!currentWindow) {
                    return;
                }
                currentWindow.hide();
                break;
            case "minimize":
                if (!currentWindow) {
                    return;
                }
                currentWindow.minimize();
                break;
            case "maximize":
                if (!currentWindow) {
                    return;
                }
                currentWindow.maximize();
                break;
            case "restore":
                if (!currentWindow) {
                    return;
                }
                if (currentWindow.isFullScreen()) {
                    currentWindow.setFullScreen(false);
                } else {
                    currentWindow.unmaximize();
                }
                break;
            case "focus":
                if (!currentWindow) {
                    return;
                }
                currentWindow.focus();
                break;
            case "setAlwaysOnTopFalse":
                if (!currentWindow) {
                    return;
                }
                currentWindow.setAlwaysOnTop(false);
                break;
            case "setAlwaysOnTopTrue":
                if (!currentWindow) {
                    return;
                }
                currentWindow.setAlwaysOnTop(true);
                break;
            case "clearCache":
                event.sender.session.clearCache();
                break;
            case "redo":
                event.sender.redo();
                break;
            case "undo":
                event.sender.undo();
                break;
            case "destroy":
                if (!currentWindow) {
                    return;
                }
                currentWindow.destroy();
                break;
            case "writeLog":
                writeLog(data.msg);
                break;
            case "startupGuardFailure":
                recordStartupGuardFailure(data.type || "renderer-startup", data.detail || "");
                break;
            case "startupGuardReady":
                markStartupGuardReady();
                break;
            case "closeButtonBehavior":
                if (!currentWindow) {
                    return;
                }
                if (currentWindow.isFullScreen()) {
                    currentWindow.once("leave-full-screen", () => {
                        currentWindow.hide();
                    });
                    currentWindow.setFullScreen(false);
                } else {
                    currentWindow.hide();
                }
                break;
        }
    });
    onBrandedIPC("sourceflow-config-tray", (event, data) => {
        workspaces.find(item => {
            if (item.browserWindow.webContents.id === event.sender.id) {
                hideWindow(item.browserWindow);
                if ("win32" === process.platform || "linux" === process.platform) {
                    resetTrayMenu(item.tray, data.languages, item.browserWindow);
                }
                return true;
            }
        });
    });
    onBrandedIPC("sourceflow-export-pdf", (event, data) => {
        dialog.showOpenDialog({
            title: data.title, properties: ["createDirectory", "openDirectory"],
        }).then((result) => {
            if (result.canceled) {
                event.sender.destroy();
                return;
            }
            data.filePaths = result.filePaths;
            data.webContentsId = event.sender.id;
            sendBrandedIPC(getWindowByContentId(data.parentWindowId), "sourceflow-export-pdf", data);
        });
    });
    onBrandedIPC("sourceflow-export-newwindow", (event, data) => {
        // The PDF/Word export preview window automatically adjusts according to the size of the main window https://github.com/lonelyor/SourceFlow/issues/10554
        const wndBounds = getWindowByContentId(event.sender.id).getBounds();
        const wndScreen = screen.getDisplayNearestPoint({x: wndBounds.x, y: wndBounds.y});
        const printWin = new BrowserWindow({
            show: true,
            width: Math.floor(wndScreen.size.width * 0.8),
            height: Math.floor(wndScreen.size.height * 0.8),
            resizable: true,
            frame: "darwin" === process.platform,
            icon: path.join(appDir, "stage", "icon-large.png"),
            titleBarStyle: "hidden",
            webPreferences: {
                contextIsolation: false,
                nodeIntegration: true,
                webviewTag: true,
                webSecurity: false,
                autoplayPolicy: "user-gesture-required" // 桌面端禁止自动播放多媒体 https://github.com/lonelyor/SourceFlow/issues/7587
            },
        });
        printWin.center();
        printWin.webContents.userAgent = `${appBrandName}/${appVer} ${appGithubURL} Electron ${printWin.webContents.userAgent}`;
        printWin.loadURL(data);
        windowNavigate(printWin, "export");
    });
    onBrandedIPC("sourceflow-quit", (event, port) => {
        const exitInfo = exitApp(port, undefined, event.sender.id);
        if (exitInfo.shouldQuitApp) {
            setTimeout(() => {
                if (0 < BrowserWindow.getAllWindows().length || 0 < workspaces.length) {
                    writeLog("force quit fallback triggered");
                    forceQuitApplication();
                }
            }, 1500);
        }
    });
    onBrandedIPC("sourceflow-show-window", (event) => {
        const mainWindow = getWindowByContentId(event.sender.id);
        if (!mainWindow) {
            return;
        }

        if (mainWindow.isMinimized()) {
            mainWindow.restore();
        }
        mainWindow.show();
    });
    onBrandedIPC("sourceflow-open-window", (event, data) => {
        const mainWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
        const mainBounds = mainWindow.getBounds();
        const mainScreen = screen.getDisplayNearestPoint({x: mainBounds.x, y: mainBounds.y});
        const win = new BrowserWindow({
            show: true,
            trafficLightPosition: {x: 8, y: 13},
            width: Math.floor(data.width || mainScreen.size.width * 0.7),
            height: Math.floor(data.height || mainScreen.size.height * 0.9),
            minWidth: 493,
            minHeight: 376,
            fullscreenable: true,
            transparent: "darwin" === process.platform, // 避免缩放窗口时出现边框
            frame: "darwin" === process.platform,
            icon: path.join(appDir, "stage", "icon-large.png"),
            titleBarStyle: "hidden",
            webPreferences: {
                contextIsolation: false,
                nodeIntegration: true,
                webviewTag: true,
                webSecurity: false,
                autoplayPolicy: "user-gesture-required" // 桌面端禁止自动播放多媒体 https://github.com/lonelyor/SourceFlow/issues/7587
            },
        });
        remote.enable(win.webContents);

        if (data.position) {
            win.setPosition(data.position.x, data.position.y);
        } else {
            win.center();
        }
        win.setAlwaysOnTop(data.alwaysOnTop);
        win.webContents.userAgent = `${appBrandName}/${appVer} ${appGithubURL} Electron ${win.webContents.userAgent}`;
        win.webContents.session.setSpellCheckerLanguages(["en-US"]);
        win.loadURL(data.url);
        windowNavigate(win, "window");
        win.on("close", (event) => {
            if (canWindowCloseDirectly(win)) {
                return;
            }
            if (win && !win.isDestroyed()) {
                sendBrandedIPC(win.webContents, "sourceflow-save-close");
            }
            event.preventDefault();
        });
        win.on("closed", () => {
            clearWindowClosing(win);
        });
        const targetScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
        if (mainScreen.id !== targetScreen.id) {
            win.setBounds(targetScreen.workArea);
        }
    });
    onBrandedIPC("sourceflow-open-workspace", (event, data) => {
        writeWorkspaceStateEntries(data.workspace);
        const foundWorkspace = workspaces.find((item) => {
            if (item.workspaceDir === data.workspace) {
                showWindow(item.browserWindow);
                return true;
            }
        });
        if (!foundWorkspace) {
            initKernel(data.workspace, "", "").then((isSucc) => {
                if (isSucc) {
                    initMainWindow();
                }
            });
        }
    });
    handleBrandedIPC("sourceflow-init", async (event, data) => {
        if (data.workspaceDir) {
            writeWorkspaceStateEntries(data.workspaceDir);
        }
        const exitWS = workspaces.find(item => {
            if (event.sender.id === item.browserWindow.webContents.id && item.workspaceDir) {
                if (item.tray && "win32" === process.platform || "linux" === process.platform) {
                    // Tray menu text does not change with the appearance language https://github.com/lonelyor/SourceFlow/issues/7935
                    resetTrayMenu(item.tray, data.languages, item.browserWindow);
                }
                return true;
            }
        });
        if (exitWS) {
            return;
        }

        workspaces.find(item => {
            if (!item.workspaceDir) {
                item.workspaceDir = data.workspaceDir;
                getWorkspaceReminderState(data.workspaceDir);
                let tray;
                if ("win32" === process.platform || "linux" === process.platform) {
                    // 系统托盘
                    tray = new Tray(path.join(appDir, "stage", "icon-large.png"));
                    tray.setToolTip(`${path.basename(data.workspaceDir)} - ${appBrandName} v${appVer}`);
                    const mainWindow = getWindowByContentId(event.sender.id);
                    if (!mainWindow || mainWindow.isDestroyed()) {
                        return;
                    }
                    resetTrayMenu(tray, data.languages, mainWindow);
                    tray.on("click", () => {
                        showHideWindow(tray, data.languages, mainWindow);
                    });
                }
                item.tray = tray;
                return true;
            }
        });
        sweepWorkspaceReminderState(data.workspaceDir);
        await net.fetch(getServer(data.port) + "/api/system/uiproc?pid=" + process.pid, {method: "POST"});
    });
    onBrandedIPC("sourceflow-hotkey", (event, data) => {
        if (!data.hotkeys || data.hotkeys.length === 0) {
            return;
        }
        workspaces.find(workspaceItem => {
            if (event.sender.id === workspaceItem.browserWindow.webContents.id) {
                workspaceItem.hotkeys = data.hotkeys;
                return true;
            }
        });
        data.hotkeys.forEach((item, index) => {
            const shortcut = hotKey2Electron(item);
            if (!shortcut) {
                return;
            }
            if (globalShortcut.isRegistered(shortcut)) {
                globalShortcut.unregister(shortcut);
            }
            if (index === 0) {
                globalShortcut.register(shortcut, () => {
                    let currentWorkspace;
                    const currentWebContentsId = (latestActiveWindow && !latestActiveWindow.isDestroyed()) ? latestActiveWindow.webContents.id : undefined;
                    workspaces.find(workspaceItem => {
                        if (currentWebContentsId === workspaceItem.browserWindow.webContents.id && workspaceItem.hotkeys[0] === item) {
                            currentWorkspace = workspaceItem;
                            return true;
                        }
                    });
                    if (!currentWorkspace) {
                        workspaces.find(workspaceItem => {
                            if (workspaceItem.hotkeys[0] === item && event.sender.id === workspaceItem.browserWindow.webContents.id) {
                                currentWorkspace = workspaceItem;
                                return true;
                            }
                        });
                    }
                    if (!currentWorkspace) {
                        return;
                    }
                    const mainWindow = currentWorkspace.browserWindow;
                    if (mainWindow.isMinimized()) {
                        mainWindow.restore();
                        mainWindow.show(); // 按 `Alt+M` 后隐藏窗口，再次按 `Alt+M` 显示窗口后会卡住不能编辑 https://github.com/lonelyor/SourceFlow/issues/8456
                    } else {
                        if (mainWindow.isVisible()) {
                            if (!mainWindow.isFocused()) {
                                mainWindow.show();
                            } else {
                                hideWindow(mainWindow);
                            }
                        } else {
                            mainWindow.show();
                        }
                    }
                    if ("win32" === process.platform || "linux" === process.platform) {
                        resetTrayMenu(currentWorkspace.tray, data.languages, mainWindow);
                    }
                });
            } else {
                globalShortcut.register(shortcut, () => {
                    BrowserWindow.getAllWindows().forEach(itemB => {
                        sendBrandedIPC(itemB.webContents, "sourceflow-hotkey", {
                            hotkey: item
                        });
                    });
                });
            }
        });
    });
    onBrandedIPC("sourceflow-send-windows", (event, data) => {
        BrowserWindow.getAllWindows().forEach(item => {
            sendBrandedIPC(item.webContents, "sourceflow-send-windows", data);
        });
    });
    onBrandedIPC("sourceflow-auto-launch", (event, data) => {
        if (isPortableMode) {
            writeLog("ignore auto launch config in portable mode");
            return;
        }
        app.setLoginItemSettings({
            openAtLogin: data.openAtLogin,
            args: data.openAsHidden ? ["--openAsHidden"] : ""
        });
    });
    if (firstOpen) {
        const firstOpenWindow = new BrowserWindow({
            width: Math.floor(screen.getPrimaryDisplay().size.width * 0.6),
            height: Math.floor(screen.getPrimaryDisplay().workAreaSize.height * 0.8),
            frame: "darwin" === process.platform,
            titleBarStyle: "hidden",
            fullscreenable: false,
            icon: path.join(appDir, "stage", "icon-large.png"),
            transparent: "darwin" === process.platform,
            webPreferences: {
                nodeIntegration: true, webviewTag: true, webSecurity: false, contextIsolation: false,
            },
        });
        const initHTMLPath = resolveAppFile("electron", "init.html");

        // 改进桌面端初始化时使用的外观语言 https://github.com/lonelyor/SourceFlow/issues/6803
        const languages = app.getPreferredSystemLanguages();
        const language = resolveAppLanguage(languages);
        firstOpenWindow.loadFile(initHTMLPath, {
            query: {
                lang: language,
                home: app.getPath("home"),
                defaultWorkspace: isPortableMode ? portableWorkspaceDir : "",
                portableRoot: isPortableMode ? portableRootDir : "",
                v: appVer,
                icon: path.join(appDir, "stage", "icon-large.png"),
            },
        });
        firstOpenWindow.show();
        // 初始化启动
        onBrandedIPC("sourceflow-first-init", (event, data) => {
            writeWorkspaceStateEntries(data.workspace);
            initKernel(data.workspace, "", data.lang).then((isSucc) => {
                if (isSucc) {
                    initMainWindow();
                }
            });
            firstOpenWindow.destroy();
        });
    } else {
        const getArg = (name) => {
            for (let i = 0; i < process.argv.length; i++) {
                if (process.argv[i].startsWith(name)) {
                    return process.argv[i].split("=")[1];
                }
            }
        };

        const workspace = getArg("--workspace");
        if (workspace) {
            writeLog("got arg [--workspace=" + workspace + "]");
        }
        const port = getArg("--port");
        if (port) {
            writeLog("got arg [--port=" + port + "]");
        }
        initKernel(workspace, port, "").then((isSucc) => {
            if (isSucc) {
                initMainWindow();
            }
        });
    }

    if (!reminderSweepTimer) {
        reminderSweepTimer = setInterval(() => {
            sweepAllReminderStates();
        }, REMINDER_SWEEP_INTERVAL);
    }

    // 电源相关事件必须放在 whenReady 里面，否则会导致 Linux 端无法正常启动 Trace/breakpoint trap (core dumped) https://github.com/lonelyor/SourceFlow/issues/9347
    powerMonitor.on("suspend", () => {
        writeLog("system suspend");
    });
    powerMonitor.on("resume", async () => {
        // 桌面端系统休眠唤醒后判断网络连通性后再执行数据同步 https://github.com/lonelyor/SourceFlow/issues/6687
        writeLog("system resume");

        const isOnline = async () => {
            return net.isOnline();
        };
        let online = false;
        for (let i = 0; i < 7; i++) {
            if (await isOnline()) {
                online = true;
                break;
            }

            writeLog("network is offline");
            await sleep(1000);
        }

        if (!online) {
            writeLog("network is offline, do not sync after system resume");
            sweepAllReminderStates();
            return;
        }

        sweepAllReminderStates();
        workspaces.forEach(item => {
            const currentURL = new URL(item.browserWindow.getURL());
            const server = getServer(currentURL.port);
            writeLog("sync after system resume [" + server + "/api/sync/performSync" + "]");
            net.fetch(server + "/api/sync/performSync", {method: "POST"});
        });
    });
    powerMonitor.on("shutdown", () => {
        writeLog("system shutdown");
        workspaces.forEach(item => {
            const currentURL = new URL(item.browserWindow.getURL());
            net.fetch(getServer(currentURL.port) + "/api/system/exit", {method: "POST"});
        });
    });
    powerMonitor.on("lock-screen", () => {
        writeLog("system lock-screen");
        BrowserWindow.getAllWindows().forEach(item => {
            sendBrandedIPC(item.webContents, "sourceflow-send-windows", {cmd: "lockscreenByMode"});
        });
    });
});

app.on("open-url", async (event, url) => { // for macOS
    if (isAppProtocolURL(url)) {
        let isBackground = true;
        if (workspaces.length === 0) {
            isBackground = false;
            let index = 0;
            while (index < 10) {
                index++;
                await sleep(500);
                if (workspaces.length > 0) {
                    break;
                }
            }
        }
        if (!isBackground) {
            await sleep(1500);
        }
        workspaces.forEach(item => {
            if (item.browserWindow && !item.browserWindow.isDestroyed()) {
                sendBrandedIPC(item.browserWindow.webContents, "sourceflow-open-url", url);
            }
        });
    }
});

app.on("second-instance", (event, argv) => {
    writeLog("second-instance [" + argv + "]");
    let workspace = argv.find((arg) => arg.startsWith("--workspace="));
    if (workspace) {
        workspace = workspace.split("=")[1];
        writeLog("got second-instance arg [--workspace=" + workspace + "]");
    }
    let port = argv.find((arg) => arg.startsWith("--port="));
    if (port) {
        port = port.split("=")[1];
        writeLog("got second-instance arg [--port=" + port + "]");
    } else {
        port = 0;
    }
    const foundWorkspace = workspaces.find(item => {
        if (item.browserWindow && !item.browserWindow.isDestroyed()) {
            if (workspace && workspace === item.workspaceDir) {
                showWindow(item.browserWindow);
                return true;
            }
        }
    });
    if (foundWorkspace) {
        return;
    }
    if (workspace) {
        initKernel(workspace, port, "").then((isSucc) => {
            if (isSucc) {
                initMainWindow();
            }
        });
        return;
    }

    const sourceflowURL = findProtocolArg(argv);
    workspaces.forEach(item => {
        if (item.browserWindow && !item.browserWindow.isDestroyed() && sourceflowURL) {
            sendBrandedIPC(item.browserWindow.webContents, "sourceflow-open-url", sourceflowURL);
        }
    });

    if (!sourceflowURL && 0 < workspaces.length) {
        showWindow(workspaces[0].browserWindow);
    }
});

app.on("activate", () => {
    if (workspaces.length > 0) {
        const mainWindow = (latestActiveWindow && !latestActiveWindow.isDestroyed()) ? latestActiveWindow : workspaces[0].browserWindow;
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
        }
    }
    if (BrowserWindow.getAllWindows().length === 0) {
        initMainWindow();
    }
});

app.on("web-contents-created", (webContentsCreatedEvent, contents) => {
    contents.setWindowOpenHandler((details) => {
        // https://github.com/lonelyor/SourceFlow/issues/10567
        if (details.url.startsWith("file:///") && details.disposition === "foreground-tab") {
            return;
        }
        // 在编辑器内打开链接的处理，比如 iframe 上的打开链接。
        shell.openExternal(details.url);
        return {action: "deny"};
    });
});

app.on("before-quit", (event) => {
    if (isQuittingApp) {
        return;
    }
    workspaces.forEach(item => {
        if (item.browserWindow && !item.browserWindow.isDestroyed()) {
            event.preventDefault();
            sendBrandedIPC(item.browserWindow.webContents, "sourceflow-save-close", true);
        }
    });
});

function writeLog(out) {
    console.log(out);
    const logFile = path.join(confDir, "app.log");
    let log = "";
    const maxLogLines = 1024;
    try {
        if (fs.existsSync(logFile)) {
            log = fs.readFileSync(logFile).toString();
            let lines = log.split("\n");
            if (maxLogLines < lines.length) {
                log = lines.slice(maxLogLines / 2, maxLogLines).join("\n") + "\n";
            }
        }
        out = out.toString();
        out = new Date().toISOString().replace(/T/, " ").replace(/\..+/, "") + " " + out;
        log += out + "\n";
        fs.writeFileSync(logFile, log);
    } catch (e) {
        console.error(e);
    }
}
