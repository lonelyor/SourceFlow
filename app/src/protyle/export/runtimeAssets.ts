import {Constants} from "../../constants";
import {fetchSyncPost} from "../../util/fetch";
import {getFrontend} from "../../util/functions";
import {PROTYLE_RENDER_METHOD_NAMES} from "../render/registry";

export const getPluginStyle = async () => {
    const response = await fetchSyncPost("/api/plugins/loadPlugins", {frontend: getFrontend()});
    let css = "";
    response.data.forEach((item: IPluginData) => {
        css += item.css || "";
    });
    return css;
};

export const getIconScript = (servePath: string) => {
    const isBuiltInIcon = ["ant", "material"].includes(window.sourceflow.config.appearance.icon);
    const html = isBuiltInIcon ? "" : `<script src="${servePath}appearance/icons/material/icon.js?v=${Constants.SOURCEFLOW_VERSION}"></script>`;
    return html + `<script src="${servePath}appearance/icons/${window.sourceflow.config.appearance.icon}/icon.js?v=${Constants.SOURCEFLOW_VERSION}"></script>`;
};

const getExportRuntimeAssetQuery = () => {
    return `${Constants.SOURCEFLOW_VERSION}-${Constants.SOURCEFLOW_APPID}`;
};

export const getExportRuntimeLoaderJS = (servePath: string) => {
    const assetQuery = getExportRuntimeAssetQuery();
    return `
        const requiredProtyleMethods = ${JSON.stringify(PROTYLE_RENDER_METHOD_NAMES)};
        const loadExportScript = (src, id, label, validate) => new Promise((resolve, reject) => {
            const existing = document.getElementById(id);
            if (existing) {
                try {
                    if (!validate || validate()) {
                        resolve();
                        return;
                    }
                    existing.remove();
                } catch (error) {
                    existing.remove();
                }
            }
            const script = document.createElement("script");
            script.id = id;
            script.src = src;
            script.async = false;
            script.onload = () => {
                try {
                    if (validate && !validate()) {
                        reject(new Error((label || src) + " loaded but did not initialize correctly"));
                        return;
                    }
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };
            script.onerror = () => {
                reject(new Error("Failed to load export runtime script: " + (label || src)));
            };
            document.head.appendChild(script);
        });
        const callExportProtyle = (method, args = []) => {
            const protyleApi = window.Protyle;
            if (!protyleApi || typeof protyleApi[method] !== "function") {
                throw new Error("Export runtime is missing Protyle." + method + "()");
            }
            return protyleApi[method].apply(protyleApi, args);
        };
        const ensureExportRuntime = () => {
            if (!window.__sourceflowExportRuntimeReady) {
                window.__sourceflowExportRuntimeReady = (async () => {
                    if (!window.sourceflow || !window.sourceflow.config || !window.sourceflow.config.editor) {
                        throw new Error("Export runtime requires window.sourceflow before initialization");
                    }
                    await loadExportScript("${servePath}stage/protyle/js/lute/lute.min.js?v=${assetQuery}", "sourceflowExportLuteScript", "Lute", () => typeof window.Lute !== "undefined");
                    await loadExportScript("${servePath}stage/protyle/js/protyle-html.js?v=${assetQuery}", "sourceflowExportHTMLBlockScript", "ProtyleHtml");
                    await loadExportScript("${servePath}stage/build/export/protyle-method.js?v=${assetQuery}", "sourceflowExportRuntimeScript", "Protyle", () => {
                        return !!window.Protyle && requiredProtyleMethods.every((method) => typeof window.Protyle[method] === "function");
                    });
                })().catch((error) => {
                    window.__sourceflowExportRuntimeReady = undefined;
                    throw error;
                });
            }
            return window.__sourceflowExportRuntimeReady;
        };
    `;
};

export const getExportSafetyJS = () => `
    (() => {
        if (window.__sourceflowExportSafetyInstalled) {
            return;
        }
        window.__sourceflowExportSafetyInstalled = true;
        window.__sourceflowExportSafeMode = true;
        window.__sourceflowExportErrors = window.__sourceflowExportErrors || [];
        const recordSourceflowExportError = (error) => {
            const message = error && (error.message || error.reason || error) ? (error.message || error.reason || error) : "";
            window.__sourceflowExportErrors.push(String(message));
        };
        window.addEventListener("error", (event) => {
            recordSourceflowExportError(event.error || event.message);
        });
        window.addEventListener("unhandledrejection", (event) => {
            recordSourceflowExportError(event.reason);
        });
        window.sourceflowSanitizeExportExecutableContent = (root) => {
            root.querySelectorAll("script").forEach((item) => {
                item.remove();
            });
            root.querySelectorAll("*").forEach((item) => {
                Array.from(item.attributes).forEach((attr) => {
                    const name = attr.name.toLowerCase();
                    const value = attr.value.trim().toLowerCase();
                    if (name.startsWith("on") ||
                        ((name === "href" || name === "src" || name === "xlink:href") &&
                            (value.startsWith("javascript:") || value.startsWith("vbscript:"))) ||
                        (name === "style" && (value.includes("expression(") || value.includes("url(javascript:") || value.includes("url(vbscript:")))) {
                        item.removeAttribute(attr.name);
                    }
                });
            });
        };
    })();
    var sanitizeExportExecutableContent = window.sourceflowSanitizeExportExecutableContent;
`;
