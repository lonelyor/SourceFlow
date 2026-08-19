import {Constants} from "../constants";
import {addScript} from "../protyle/util/addScript";
import {addStyle} from "../protyle/util/addStyle";
/// #if !BROWSER
import {ipcRenderer} from "electron";
/// #endif
/// #if !MOBILE
import {getAllModels} from "../layout/getAll";
import {exportLayout} from "../layout/util";
/// #endif
import {fetchPost} from "./fetch";
import {
    isInAndroid,
    isInHarmony,
    isInIOS,
    isInMobileApp,
    isIPad,
    isIPhone,
    isMac,
    isWin11
} from "../protyle/util/compatibility";
import {setCodeTheme} from "../protyle/render/util";
import {rerenderMermaidBlocks} from "../protyle/render/mermaidRender";
import {getBackend, getFrontend} from "./functions";
import {applyEditorCursor, normalizeEditorCursorColor, shouldUseCustomEditorCursorOverlay} from "../editor/cursor";
import {
    applyEditorNoteBackground,
    normalizeEditorNoteBackgroundBlur,
    normalizeEditorNoteBackgroundImage,
    normalizeEditorNoteBackgroundOpacity
} from "../editor/noteBackground";
import {applyMascotWidget} from "../appearance/mascot";
import {getActiveCodeBlockSkin} from "../appearance/codeBlockSkin";

let rendererReadyToShowSent = false;

const notifyRendererReadyToShowOnNextPaint = () => {
    if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                notifyRendererReadyToShow();
            });
        });
        return;
    }
    window.setTimeout(() => {
        notifyRendererReadyToShow();
    }, 0);
};

const notifyRendererReadyToShow = () => {
    if (rendererReadyToShowSent) {
        return;
    }
    rendererReadyToShowSent = true;
    /// #if !BROWSER
    ipcRenderer.send(Constants.SOURCEFLOW_READY_TO_SHOW);
    /// #endif
};

const safelyRunAppearanceFeature = (feature: string, handler: () => void) => {
    try {
        handler();
    } catch (error) {
        console.error(`[appearance] ${feature} failed`, error);
    }
};

const applyCodeBlockSkinAppearance = (appearanceData: Config.IAppearance = window.sourceflow.config.appearance) => {
    document.documentElement.setAttribute("data-code-block-skin", getActiveCodeBlockSkin(appearanceData));
};

export const loadAssets = (data: Config.IAppearance) => {
    const htmlElement = document.getElementsByTagName("html")[0];
    htmlElement.setAttribute("lang", window.sourceflow.config.appearance.lang);
    htmlElement.setAttribute("data-frontend", getFrontend()); // https://github.com/lonelyor/SourceFlow/issues/12549
    htmlElement.setAttribute("data-backend", getBackend());
    htmlElement.setAttribute("data-theme-mode", getThemeMode());
    htmlElement.setAttribute("data-light-theme", window.sourceflow.config.appearance.themeLight);
    htmlElement.setAttribute("data-dark-theme", window.sourceflow.config.appearance.themeDark);
    const OSTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    if (window.sourceflow.config.appearance.modeOS && (
        (window.sourceflow.config.appearance.mode === 1 && OSTheme === "light") ||
        (window.sourceflow.config.appearance.mode === 0 && OSTheme === "dark")
    )) {
        fetchPost("/api/system/setAppearanceMode", {mode: OSTheme === "light" ? 0 : 1});
        window.sourceflow.config.appearance.mode = (OSTheme === "light" ? 0 : 1);
    }
    const defaultStyleElement = document.getElementById("themeDefaultStyle");
    const defaultThemeAddress = `/appearance/themes/${data.mode === 1 ? "midnight" : "daylight"}/theme.css?v=${Constants.SOURCEFLOW_VERSION}`;
    if (defaultStyleElement) {
        if (!defaultStyleElement.getAttribute("href").startsWith(defaultThemeAddress)) {
            const newStyleElement = document.createElement("link");
            // 等待新样式表加载完成再移除旧样式表
            new Promise((resolve) => {
                newStyleElement.rel = "stylesheet";
                newStyleElement.href = defaultThemeAddress;
                newStyleElement.onload = resolve;
                defaultStyleElement.parentNode.insertBefore(newStyleElement, defaultStyleElement);
            }).then(() => {
                defaultStyleElement.remove();
                newStyleElement.id = "themeDefaultStyle";
            });
        }
    } else {
        addStyle(defaultThemeAddress, "themeDefaultStyle");
    }
    const styleElement = document.getElementById("themeStyle");
    if ((data.mode === 1 && data.themeDark !== "midnight") || (data.mode === 0 && data.themeLight !== "daylight")) {
        const themeAddress = `/appearance/themes/${data.mode === 1 ? data.themeDark : data.themeLight}/theme.css?v=${data.themeVer}`;
        if (styleElement) {
            if (!styleElement.getAttribute("href").startsWith(themeAddress)) {
                styleElement.setAttribute("href", themeAddress);
            }
        } else {
            addStyle(themeAddress, "themeStyle");
        }
    } else if (styleElement) {
        styleElement.remove();
    }
    /// #if !MOBILE
    getAllModels().graph.forEach(item => {
        item.searchGraph(false);
    });
    const pdfTheme = window.sourceflow.config.appearance.mode === 0 ? window.sourceflow.storage[Constants.LOCAL_PDFTHEME].light :
        window.sourceflow.storage[Constants.LOCAL_PDFTHEME].dark;
    document.querySelectorAll(".pdf__outer").forEach(item => {
        const darkElement = item.querySelector("#pdfDark");
        const lightElement = item.querySelector("#pdfLight");
        if (pdfTheme === "dark") {
            item.classList.add("pdf__outer--dark");
            lightElement.classList.remove("toggled");
            darkElement.classList.add("toggled");
        } else {
            item.classList.remove("pdf__outer--dark");
            lightElement.classList.add("toggled");
            darkElement.classList.remove("toggled");
        }
    });
    /// #endif

    /// #if BROWSER
    if (!window.webkit?.messageHandlers && !window.JSAndroid && !window.JSHarmony &&
        ("serviceWorker" in window.navigator) && ("caches" in window) && ("fetch" in window) && navigator.serviceWorker) {
        document.head.insertAdjacentHTML("afterbegin", `<meta name="theme-color" content="${getComputedStyle(document.body).getPropertyValue("--b3-toolbar-background").trim()}">`);
    }
    /// #endif
    setCodeTheme();
    safelyRunAppearanceFeature("codeBlockSkin", () => applyCodeBlockSkinAppearance(data));
    safelyRunAppearanceFeature("mascot", () => applyMascotWidget(data));

    const themeScriptElement = document.getElementById("themeScript");
    const themeScriptAddress = `/appearance/themes/${data.mode === 1 ? data.themeDark : data.themeLight}/theme.js?v=${data.themeVer}`;
    if (themeScriptElement) {
        if (!themeScriptElement.getAttribute("src").startsWith(themeScriptAddress)) {
            themeScriptElement.remove();
            addScript(themeScriptAddress, "themeScript");
        }
    } else {
        addScript(themeScriptAddress, "themeScript");
    }

    // load icons
    const isBuiltInIcon = ["ant", "material"].includes(data.icon);
    const iconScriptElement = document.getElementById("iconScript");
    const iconDefaultScriptElement = document.getElementById("iconDefaultScript");
    // 不能使用 data.iconVer，因为其他主题也需要加载默认图标，此时 data.iconVer 为其他图标的版本号
    const iconDefaultURL = `/appearance/icons/${isBuiltInIcon ? data.icon : "material"}/icon.js?v=${Constants.SOURCEFLOW_VERSION}`;
    const iconThirdURL = `/appearance/icons/${data.icon}/icon.js?v=${data.iconVer}`;

    if ((isBuiltInIcon && iconDefaultScriptElement && iconDefaultScriptElement.getAttribute("src").startsWith(iconDefaultURL)) ||
        (!isBuiltInIcon && iconScriptElement && iconScriptElement.getAttribute("src").startsWith(iconThirdURL))) {
        // 第三方图标切换到 material
        if (isBuiltInIcon) {
            iconScriptElement?.remove();
            Array.from(document.body.children).forEach((item) => {
                if (item.tagName === "svg" &&
                    !item.getAttribute("data-name") &&
                    !["iconsMaterial", "iconsAnt"].includes(item.id)) {
                    item.remove();
                }
            });
        }
        return;
    }
    if (iconDefaultScriptElement && !iconDefaultScriptElement.getAttribute("src").startsWith(iconDefaultURL)) {
        iconDefaultScriptElement.remove();
        if (data.icon === "ant") {
            document.querySelectorAll("#iconsMaterial").forEach(item => {
                item.remove();
            });
        } else {
            document.querySelectorAll("#iconsAnt").forEach(item => {
                item.remove();
            });
        }
    }
    addScript(iconDefaultURL, "iconDefaultScript").then(() => {
        iconScriptElement?.remove();
        if (!isBuiltInIcon) {
            addScript(iconThirdURL, "iconScript").then(() => {
                Array.from(document.body.children).forEach((item, index) => {
                    if (item.tagName === "svg" &&
                        index !== 0 &&
                        !item.getAttribute("data-name") &&
                        !["iconsMaterial", "iconsAnt"].includes(item.id)) {
                        item.remove();
                    }
                });
            });
        }
    });
};

export const initAssets = () => {
    const loadingElement = document.getElementById("loading");
    if (loadingElement) {
        if (loadingElement.getAttribute("data-startup-sentinel") === "true") {
            if (loadingElement.isConnected) {
                loadingElement.remove();
            }
            notifyRendererReadyToShowOnNextPaint();
        } else {
            const removeLoadingElement = () => {
                if (!loadingElement.isConnected) {
                    notifyRendererReadyToShowOnNextPaint();
                    return;
                }
                loadingElement.style.transition = "opacity 180ms ease";
                loadingElement.style.opacity = "0";
                window.setTimeout(() => {
                    loadingElement.remove();
                    notifyRendererReadyToShowOnNextPaint();
                }, 180);
            };
            const startupState = loadingElement.getAttribute("data-startup-state");
            const shouldWaitStartupImage = loadingElement.getAttribute("data-startup-page") === "custom" &&
                startupState !== "loaded" &&
                startupState !== "error";
            if (shouldWaitStartupImage) {
                const finalize = () => {
                    loadingElement.removeEventListener("sourceflow-startup-image-state", handleStartupState);
                    window.setTimeout(removeLoadingElement, 180);
                };
                const handleStartupState = () => {
                    window.setTimeout(finalize, 180);
                };
                loadingElement.addEventListener("sourceflow-startup-image-state", handleStartupState, {once: true});
                window.setTimeout(finalize, 1400);
            } else {
                window.setTimeout(removeLoadingElement, loadingElement.getAttribute("data-startup-page") === "custom" ? 280 : 80);
            }
        }
    } else {
        notifyRendererReadyToShowOnNextPaint();
    }
    updateMobileTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", event => {
        const OSTheme = event.matches ? "dark" : "light";
        updateMobileTheme(OSTheme);
        if (!window.sourceflow.config.appearance.modeOS) {
            return;
        }
        if ((window.sourceflow.config.appearance.mode === 0 && OSTheme === "light") ||
            (window.sourceflow.config.appearance.mode === 1 && OSTheme === "dark")) {
            return;
        }
        fetchPost("/api/system/setAppearanceMode", {
            mode: OSTheme === "light" ? 0 : 1
        }, async response => {
            if (window.sourceflow.config.appearance.themeJS) {
                if (window.destroyTheme) {
                    try {
                        await window.destroyTheme();
                        window.destroyTheme = undefined;
                        document.getElementById("themeScript").remove();
                    } catch (e) {
                        console.error("destroyTheme error: " + e);
                    }
                } else {
                    /// #if !MOBILE
                    exportLayout({
                        cb() {
                            window.location.reload();
                        },
                        errorExit: false,
                    });
                    /// #else
                    window.location.reload();
                    /// #endif
                    return;
                }
            }
            window.sourceflow.config.appearance = response.data.appearance;
            loadAssets(response.data.appearance);
            rerenderMermaidBlocks();
        });
    });
};

export const setInlineStyle = async (set = true, servePath = "../../../") => {
    let style;
    // Emojis Reset: 字体中包含了 emoji，需重置
    // Emojis Additional： 苹果/win11 字体中没有的 emoji
    if (isMac() || isIPad() || isIPhone()) {
        style = `@font-face {
  font-family: "Emojis Additional";
  src: url(${servePath}appearance/fonts/Noto-COLRv1-2.047/Noto-COLRv1.woff2) format("woff2");
  unicode-range: U+1fae9, U+1fac6, U+1fabe, U+1fadc, U+e50a, U+1fa89, U+1fadf, U+1f1e6-1f1ff, U+1fa8f;
}
@font-face {
  font-family: "Emojis Reset";
  src: local("Apple Color Emoji"),
  local("Segoe UI Emoji"),
  local("Segoe UI Symbol");
  unicode-range: U+21a9, U+21aa, U+2122, U+2194-2199, U+23cf, U+25b6, U+25c0, U+25fb, U+25fc, U+25aa, U+25ab, U+2600-2603,
  U+260e, U+2611, U+261d, U+2639, U+263a, U+2640, U+2642, U+2660, U+2663, U+2665, U+2666, U+2668, U+267b, U+26aa, U+26ab,
  U+2702, U+2708, U+2934, U+2935, U+1f170, U+1f171, U+1f17e, U+1f17f, U+1f202, U+1f21a, U+1f22f, U+1f232-1f23a, U+1f250,
  U+1f251, U+1fae4, U+2049, U+203c, U+3030, U+303d, U+24c2, U+26a0, U+26a1, U+26be, U+27a1, U+2b05-2b07, U+3297, U+3299, U+a9, U+ae;
  size-adjust: 115%;
}
@font-face {
  font-family: "Emojis";
  src: local("Apple Color Emoji"),
  local("Segoe UI Emoji"),
  local("Segoe UI Symbol");
  size-adjust: 115%;
}`;
    } else if (await isWin11()) {
        // Win11 Browser
        style = `@font-face {
  font-family: "Emojis Additional";
  src: url(${servePath}appearance/fonts/Noto-COLRv1-2.047/Noto-COLRv1.woff2) format("woff2");
  unicode-range: U+1fae9, U+1fac6, U+1fabe, U+1fadc, U+e50a, U+1fa89, U+1fadf, U+1f1e6-1f1ff, U+1f3f4, U+e0067, U+e0062,
  U+e0065, U+e006e, U+e007f, U+e0073, U+e0063, U+e0074, U+e0077, U+e006c;
  size-adjust: 85%;
}
@font-face {
  font-family: "Emojis Reset";
  src: local("Segoe UI Emoji"),
  local("Segoe UI Symbol");
  unicode-range: U+263a, U+21a9, U+2642, U+303d, U+2197, U+2198, U+2199, U+2196, U+2195, U+2194, U+2660, U+2665, U+2666,
  U+2663, U+3030, U+21aa, U+25b6, U+25c0, U+2640, U+203c, U+a9, U+ae, U+2122;
  size-adjust: 85%;
}
@font-face {
  font-family: "Emojis";
  src: local("Segoe UI Emoji"),
  local("Segoe UI Symbol");
  size-adjust: 85%;
}`;
    } else {
        style = `@font-face {
  font-family: "Emojis Reset";
  src: url(${servePath}appearance/fonts/Noto-COLRv1-2.047/Noto-COLRv1.woff2) format("woff2");
  unicode-range: U+1f170-1f171, U+1f17e, U+1f17f, U+1f21a, U+1f22f, U+1f232-1f23a, U+1f250, U+1f251, U+1f32b, U+1f3bc,
  U+1f411, U+1f42d, U+1f42e, U+1f431, U+1f435, U+1f441, U+1f4a8, U+1f4ab, U+1f525, U+1f600-1f60d, U+1f60f-1f623,
  U+1f625-1f62b, U+1f62d-1f63f, U+1F643, U+1F640, U+1f79, U+1f8f, U+1fa79, U+1fae4, U+1fae9, U+1fac6, U+1fabe, U+1fadf,
  U+200d, U+203c, U+2049, U+2122, U+2139, U+2194-2199, U+21a9, U+21aa, U+23cf, U+25aa, U+25ab, U+25b6, U+25c0, U+25fb-25fe,
  U+2611, U+2615, U+2618, U+261d, U+2620, U+2622, U+2623, U+2626, U+262a, U+262e, U+2638-263a, U+2640, U+2642, U+2648-2653,
  U+265f, U+2660, U+2663, U+2665, U+2666, U+267b, U+267e, U+267f, U+2692-2697, U+2699, U+269b, U+269c, U+26a0, U+26a1,
  U+26a7, U+26aa, U+26ab, U+26b0, U+26b1, U+2702, U+2708, U+2709, U+270c, U+270d, U+2712, U+2714, U+2716, U+271d, U+2733,
  U+2734, U+2744, U+2747, U+2763, U+2764, U+2934-2935, U+3030, U+303d, U+3297, U+3299, U+fe0f, U+e50a, U+a9, U+ae;
  size-adjust: 92%;
}
@font-face {
  font-family: "Emojis";
  src: url(${servePath}appearance/fonts/Noto-COLRv1-2.047/Noto-COLRv1.woff2) format("woff2"),
  local("Segoe UI Emoji"),
  local("Segoe UI Symbol"),
  local("Apple Color Emoji"),
  local("Twemoji Mozilla"),
  local("Noto Color Emoji"),
  local("Android Emoji"),
  local("EmojiSymbols");
  size-adjust: 92%;
}`;
    }
    style += `\n:root { --b3-font-size-editor: ${window.sourceflow.config.editor.fontSize}px }
.b3-typography code:not(.hljs), .protyle-wysiwyg span[data-type~=code] { font-variant-ligatures: ${window.sourceflow.config.editor.codeLigatures ? "normal" : "none"} }${window.sourceflow.config.editor.justify ? "\n.protyle-wysiwyg [data-node-id] { text-align: justify }" : ""}`;
    const cursorColor = normalizeEditorCursorColor(window.sourceflow.config.editor.cursorColor);
    style += `\n:root { --editor-cursor-color: ${cursorColor}; }\nhtml { --editor-cursor-color: ${cursorColor}; }`;
    const hiddenBlockColor = `${window.sourceflow.config.editor.hiddenBlockColor || ""}`.trim();
    style += `\n:root { --editor-hidden-block-color: ${hiddenBlockColor || "var(--b3-theme-primary)"}; }\nhtml { --editor-hidden-block-color: ${hiddenBlockColor || "var(--b3-theme-primary)"}; }`;
    document.documentElement.setAttribute("data-editor-cursor-style", shouldUseCustomEditorCursorOverlay(window.sourceflow.config.editor) ? "custom" : "bar");
    const noteBackgroundImage = normalizeEditorNoteBackgroundImage(window.sourceflow.config.editor.noteBackgroundImage);
    const noteBackgroundOpacity = normalizeEditorNoteBackgroundOpacity(window.sourceflow.config.editor.noteBackgroundOpacity);
    const noteBackgroundBlur = normalizeEditorNoteBackgroundBlur(window.sourceflow.config.editor.noteBackgroundBlur);
    document.documentElement.setAttribute("data-editor-note-background", noteBackgroundImage ? "on" : "off");
    if (set) {
        document.documentElement.style.setProperty("--editor-note-background-opacity", `${noteBackgroundOpacity / 100}`);
        document.documentElement.style.setProperty("--editor-note-background-blur", `${noteBackgroundBlur}px`);
    } else {
        style += `\n:root { --editor-note-background-opacity: ${noteBackgroundOpacity / 100}; --editor-note-background-blur: ${noteBackgroundBlur}px; }`;
    }
    if (window.sourceflow.config.editor.rtl) {
        style += `\n.protyle-title__input,
.protyle-wysiwyg .p,
.protyle-wysiwyg .table table,
.protyle-wysiwyg .render-node protyle-html,
.protyle-wysiwyg [data-type="NodeHeading"] {direction: rtl}
.protyle-wysiwyg [data-node-id].li > .protyle-action {
    right: 0;
    left: auto;
    direction: rtl;
}
.protyle-wysiwyg [data-node-id].li > [data-node-id] {
    margin-right: 34px;
    margin-left: 0;
}
.protyle-wysiwyg [data-node-id].li::before {
    right: 17px;
    left: auto;
}
.b3-typography table:not([style*="text-align: left"]) {
  margin-left: auto;
}`;
    }
    if (window.sourceflow.config.editor.fontFamily) {
        style += `\n.b3-typography:not(.b3-typography--default), .protyle-wysiwyg, .protyle-title {font-family: "Emojis Additional", "Emojis Reset", "${window.sourceflow.config.editor.fontFamily}", var(--b3-font-family)}`;
    }
    // pad 端菜单移除显示，如工作空间
    if ("ontouchend" in document) {
        style += "\n.b3-menu .b3-menu__action {opacity: 0.68;}";
    }
    if (set) {
        const sourceflowStyle = document.getElementById("sourceflowStyle");
        if (sourceflowStyle) {
            sourceflowStyle.textContent = style;
        } else {
            const styleElement = document.createElement("style");
            styleElement.id = "sourceflowStyle";
            styleElement.textContent = style;
            const pluginsStyle = document.getElementById("pluginsStyle");
            if (pluginsStyle?.parentElement) {
                pluginsStyle.before(styleElement);
            } else {
                document.head.appendChild(styleElement);
            }
        }
    }
    applyEditorCursor();
    applyEditorNoteBackground();
    return style;
};

export const setMode = (modeElementValue: number) => {
    /// #if !MOBILE
    let mode = modeElementValue;
    if (modeElementValue === 2) {
        if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
            mode = 1;
        } else {
            mode = 0;
        }
    }
    fetchPost("/api/setting/setAppearance", Object.assign({}, window.sourceflow.config.appearance, {
        mode,
        modeOS: modeElementValue === 2,
    }));
    /// #endif
};

const rgba2hex = (rgba: string) => {
    if (rgba.startsWith("#")) {
        return rgba;
    }
    let a: any;
    const rgb: any = rgba.replace(/\s/g, "").match(/^rgba?\((\d+),(\d+),(\d+),?([^,\s)]+)?/i);
    const alpha = (rgb && rgb[4] || "").trim();
    let hex = rgb ?
        (rgb[1] | 1 << 8).toString(16).slice(1) +
        (rgb[2] | 1 << 8).toString(16).slice(1) +
        (rgb[3] | 1 << 8).toString(16).slice(1) : rgba;

    if (alpha !== "") {
        a = alpha;
    } else {
        a = 0o1;
    }
    a = ((a * 255) | 1 << 8).toString(16).slice(1);
    hex = hex + a;
    return hex;
};

const updateMobileTheme = (OSTheme: string) => {
    if (isInMobileApp()) {
        setTimeout(() => {
            const backgroundColor = rgba2hex(getComputedStyle(document.body).getPropertyValue("--b3-theme-background").trim());
            let mode = window.sourceflow.config.appearance.mode;
            if (window.sourceflow.config.appearance.modeOS) {
                if (OSTheme === "dark") {
                    mode = 1;
                } else {
                    mode = 0;
                }
            }
            if (isInIOS()) {
                window.webkit.messageHandlers.changeStatusBar.postMessage((backgroundColor || (mode === 0 ? "#fff" : "#1e1e1e")) + " " + mode);
            } else if (isInAndroid()) {
                window.JSAndroid.changeStatusBarColor(backgroundColor, mode);
            } else if (isInHarmony()) {
                window.JSHarmony.changeStatusBarColor(backgroundColor, mode);
            }
        }, 500); // 移动端需要加载完才可以获取到颜色
    }
};

export const getThemeMode = () => {
    const OSTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    if (window.sourceflow.config.appearance.modeOS) {
        return OSTheme;
    } else {
        return window.sourceflow.config.appearance.mode === 0 ? "light" : "dark";
    }
};
