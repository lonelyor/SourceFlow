import {Constants} from "../../constants";
import {buildExportSourceflowBootstrapJS, serializeInlineScriptValue} from "./runtimeState";
import {escapeHTMLAttribute, escapeHTMLText} from "./shared";

export const buildPDFPreviewHTML = (options: {
    id: string;
    localData: Record<string, any>;
    servePath: string;
    servePathWithoutTrailingSlash: string;
    currentWindowId: number;
    themeStyle: string;
    inlineStyle: string;
    pluginStyle: string;
    snippetCSS: string;
    snippetJS: string;
    iconScript: string;
    runtimeLoaderJS: string;
    safetyJS: string;
}) => {
    const localData = options.localData || {};
    const lang = window.sourceflow.languages;
    const t = escapeHTMLText;
    const pageSizeValue = (value: string) => localData.pageSize === value ? "selected" : "";
    const marginTypeValue = (value: string) => localData.marginType === value ? "selected" : "";
    const checked = (value: boolean) => value ? "checked" : "";
    const isCustomMargin = localData.marginType === "custom" ? "" : "fn__none";
    const rootIdLiteral = serializeInlineScriptValue(options.id);
    const currentWindowIdLiteral = serializeInlineScriptValue(options.currentWindowId);
    const servePathLiteral = serializeInlineScriptValue(options.servePath);
    const servePathWithoutSlashLiteral = serializeInlineScriptValue(options.servePathWithoutTrailingSlash);
    const stageProtylePathLiteral = serializeInlineScriptValue(`${options.servePath}stage/protyle`);
    const loadingImagePathLiteral = escapeHTMLAttribute(`${options.servePath}stage/loading-pure.svg`);
    const exportPDFChannelLiteral = serializeInlineScriptValue(Constants.SOURCEFLOW_EXPORT_PDF);
    const destroyCommandChannelLiteral = serializeInlineScriptValue(Constants.SOURCEFLOW_CMD);
    const exportLabelLiteral = serializeInlineScriptValue(window.sourceflow.languages.export);
    const lowMemoryMessageLiteral = serializeInlineScriptValue(window.sourceflow.languages.exportPDFLowMemory);
    return `<!DOCTYPE html>
<html lang="${escapeHTMLAttribute(window.sourceflow.config.appearance.lang)}" data-sourceflow-export="true" data-theme-mode="light" data-light-theme="${escapeHTMLAttribute(window.sourceflow.config.appearance.themeLight)}" data-dark-theme="${escapeHTMLAttribute(window.sourceflow.config.appearance.themeDark)}">
<head>
    <base href="${escapeHTMLAttribute(options.servePath)}">
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0"/>
    <meta name="mobile-web-app-capable" content="yes"/>
    <meta name="apple-mobile-web-app-status-bar-style" content="black">
    <script>
        ${options.safetyJS}
    </script>
    <link rel="stylesheet" type="text/css" id="baseStyle" href="${escapeHTMLAttribute(`${options.servePath}stage/build/export/base.css?v=${Constants.SOURCEFLOW_VERSION}`)}"/>
    <link rel="stylesheet" type="text/css" id="themeDefaultStyle" href="${escapeHTMLAttribute(`${options.servePath}appearance/themes/daylight/theme.css?v=${Constants.SOURCEFLOW_VERSION}`)}"/>
    ${options.themeStyle}
    <title>${t(window.sourceflow.languages.export)} PDF</title>
    <style>
        body {
          margin: 0;
          font-family: var(--b3-font-family);
        }

        #action {
          width: 232px;
          background: var(--b3-theme-surface);
          padding: 12px 0;
          position: fixed;
          right: 0;
          top: 0;
          overflow-y: auto;
          bottom: 0;
          overflow-x: hidden;
          z-index: 1;
          display: flex;
          flex-direction: column;
        }

        #preview {
          max-width: 800px;
          margin: 0 auto;
          position: absolute;
          right: 232px;
          left: 0;
          box-sizing: border-box;
        }

        .b3-switch {
            margin-left: 14px;
        }

        .exporting::-webkit-scrollbar {
          width: 0;
          height: 0;
        }

        .protyle-wysiwyg {
          height: 100%;
          overflow: auto;
          box-sizing: border-box;
        }

        .b3-label {
          border-bottom: 1px solid var(--b3-theme-surface-lighter);
          display: block;
          color: var(--b3-theme-on-surface);
          padding-bottom: 12px;
          margin: 0 12px 12px 12px;
        }

        .b3-label:last-child {
            border-bottom: none;
        }

        #preview .render-node[data-subtype="plantuml"] object {
            max-width: 100%;
        }
        ${options.inlineStyle}
        ${options.pluginStyle}
    </style>
    ${options.snippetCSS}
</head>
<body style="-webkit-print-color-adjust: exact;">
<div id="action">
    <div style="flex: 1;overflow-y:auto;overflow-x:hidden">
        <div class="b3-label">
            <div>
                ${t(lang.exportPDF0)}
            </div>
            <span class="fn__hr"></span>
            <select class="b3-select" id="pageSize">
                <option ${pageSizeValue("A3")} value="A3">A3</option>
                <option ${pageSizeValue("A4")} value="A4">A4</option>
                <option ${pageSizeValue("A5")} value="A5">A5</option>
                <option ${pageSizeValue("Legal")} value="Legal">Legal</option>
                <option ${pageSizeValue("Letter")} value="Letter">Letter</option>
                <option ${pageSizeValue("Tabloid")} value="Tabloid">Tabloid</option>
            </select>
        </div>
        <div class="b3-label">
            <div>
                ${t(lang.exportPDF2)}
            </div>
            <span class="fn__hr"></span>
            <select class="b3-select" id="marginsType">
                <option ${marginTypeValue("default")} value="default">${t(lang.defaultMargin)}</option>
                <option ${marginTypeValue("none")} value="none">${t(lang.noneMargin)}</option>
                <option ${marginTypeValue("printableArea")} value="printableArea">${t(lang.minimalMargin)}</option>
                <option ${marginTypeValue("custom")} value="custom">${t(lang.customMargin)}</option>
            </select>
            <div class="${isCustomMargin}">
                <span class="fn__hr"></span>
                <small>${t(lang.marginTop)}</small>
                <div class="fn__hr--small"></div>
                <div class="fn__flex">
                    <input id="marginsTop" class="b3-text-field fn__block" value="${escapeHTMLAttribute(`${localData.marginTop || 0}`)}" type="number" min="0" step="0.01">
                    <span class="fn__space"></span>
                    <small class="fn__flex-center" style="white-space: nowrap;">${t(lang.unitInches)}</small>
                </div>
                <div class="fn__hr"></div>
                <small>${t(lang.marginRight)}</small>
                <div class="fn__hr--small"></div>
                <div class="fn__flex">
                    <input id="marginsRight" class="b3-text-field fn__block" value="${escapeHTMLAttribute(`${localData.marginRight || 0}`)}" type="number" min="0" step="0.01">
                    <span class="fn__space"></span>
                    <small class="fn__flex-center" style="white-space: nowrap;">${t(lang.unitInches)}</small>
                </div>
                <div class="fn__hr"></div>
                <small>${t(lang.marginBottom)}</small>
                <div class="fn__hr--small"></div>
                <div class="fn__flex">
                    <input id="marginsBottom" class="b3-text-field fn__block" value="${escapeHTMLAttribute(`${localData.marginBottom || 0}`)}" type="number" min="0" step="0.01">
                    <span class="fn__space"></span>
                    <small class="fn__flex-center" style="white-space: nowrap;">${t(lang.unitInches)}</small>
                </div>
                <div class="fn__hr"></div>
                <small>${t(lang.marginLeft)}</small>
                <div class="fn__hr--small"></div>
                <div class="fn__flex">
                    <input id="marginsLeft" class="b3-text-field fn__block" value="${escapeHTMLAttribute(`${localData.marginLeft || 0}`)}" type="number" min="0" step="0.01">
                    <span class="fn__space"></span>
                    <small class="fn__flex-center" style="white-space: nowrap;">${t(lang.unitInches)}</small>
                </div>
            </div>
        </div>
        <div class="b3-label">
            <div>
                ${t(lang.exportPDF3)}
                <span id="scaleTip" style="float: right;color: var(--b3-theme-on-background);">${t(`${localData.scale || 1}`)}</span>
            </div>
            <span class="fn__hr"></span>
            <input style="width: 189px" value="${escapeHTMLAttribute(`${localData.scale || 1}`)}" id="scale" step="0.1" class="b3-slider" type="range" min="0.1" max="2">
        </div>
        <label class="b3-label">
            <div>
                ${t(lang.exportPDF1)}
            </div>
            <span class="fn__hr"></span>
          <input id="landscape" class="b3-switch" type="checkbox" ${checked(!!localData.landscape)}>
        </label>
        <label class="b3-label">
            <div>
                ${t(lang.exportPDF4)}
            </div>
            <span class="fn__hr"></span>
            <input id="removeAssets" class="b3-switch" type="checkbox" ${checked(!!localData.removeAssets)}>
        </label>
        <label class="b3-label">
            <div>
                ${t(lang.exportPDF5)}
            </div>
            <span class="fn__hr"></span>
            <input id="keepFold" class="b3-switch" type="checkbox" ${checked(!!localData.keepFold)}>
        </label>
        <label class="b3-label">
            <div>
                ${t(lang.mergeSubdocs)}
            </div>
            <span class="fn__hr"></span>
            <input id="mergeSubdocs" class="b3-switch" type="checkbox" ${checked(!!localData.mergeSubdocs)}>
        </label>
        <label class="b3-label">
            <div>
                ${t(lang.export27)}
            </div>
            <span class="fn__hr"></span>
            <input id="watermark" class="b3-switch" type="checkbox" ${checked(!!localData.watermark)}>
        </label>
        <label class="b3-label">
            <div>
                ${t(lang.paged)}
            </div>
            <span class="fn__hr"></span>
            <input id="paged" class="b3-switch" type="checkbox" ${checked(typeof localData.paged === "undefined" ? true : !!localData.paged)}>
        </label>
    </div>
    <div class="fn__flex" style="padding: 0 12px">
      <div class="fn__flex-1"></div>
      <button class="b3-button b3-button--cancel">${t(lang.cancel)}</button>
      <div class="fn__space"></div>
      <button class="b3-button b3-button--text">${t(lang.confirm)}</button>
    </div>
</div>
<div style="zoom:${escapeHTMLAttribute(`${localData.scale || 1}`)}" id="preview">
    <div class="fn__loading" style="left:0;height:100vh"><img width="48px" src="${loadingImagePathLiteral}"></div>
</div>
${options.iconScript}
<script>
    ${options.safetyJS}
    ${options.runtimeLoaderJS}
    const previewElement = document.getElementById('preview');
    let pdfExportRuntimeErrorReported = false;
    const getPDFExportRuntimeErrorMessage = (error) => {
        if (error && (error.message || error.msg || error.reason)) {
            return String(error.message || error.msg || error.reason);
        }
        return String(error || "Unknown error");
    };
    const reportPDFExportRuntimeError = (error) => {
        if (pdfExportRuntimeErrorReported) {
            return;
        }
        pdfExportRuntimeErrorReported = true;
        const message = getPDFExportRuntimeErrorMessage(error);
        try {
            const {ipcRenderer} = require("electron");
            ipcRenderer.send(${exportPDFChannelLiteral}, {
                error: true,
                message,
                parentWindowId: ${currentWindowIdLiteral},
            });
        } catch (sendError) {
            console.error("[PDF export]", message, sendError);
        }
    };
    window.alert = (message) => reportPDFExportRuntimeError(message);
    const fixBlockWidth = () => {
        const isLandscape = document.querySelector("#landscape").checked;
        let width = 800;
        switch (document.querySelector("#action #pageSize").value) {
            case "A3":
              width = isLandscape ? 1587.84 : 1122.24;
              break;
            case "A4":
              width = isLandscape ? 1122.24 : 793.92;
              break;
            case "A5":
              width = isLandscape ? 793.92 : 559.68;
              break;
            case "Legal":
              width = isLandscape ? 1344 : 816;
              break;
            case "Letter":
              width = isLandscape ? 1056 : 816;
              break;
            case "Tabloid":
              width = isLandscape ? 1632 : 1056;
              break;
        }
        width = width / parseFloat(document.querySelector("#scale").value);
        previewElement.style.width = width + "px";
        width = width - parseFloat(previewElement.style.paddingLeft) * 96 * 2;
        previewElement.querySelectorAll('.hljs').forEach((item) => {
            item.parentElement.setAttribute("linewrap", "true");
            item.parentElement.style.width = "";
            item.parentElement.style.boxSizing = "border-box";
            item.parentElement.style.width = Math.min(item.parentElement.clientWidth, width) + "px";
            item.removeAttribute('data-render');
        });
        callExportProtyle("highlightRender", [previewElement, ${stageProtylePathLiteral}, document.querySelector("#scale").value]);
        previewElement.querySelectorAll('[data-type="NodeMathBlock"]').forEach((item) => {
            item.removeAttribute('data-render');
        });
        previewElement.querySelectorAll('[data-type="NodeCodeBlock"][data-subtype="mermaid"] svg').forEach((item) => {
            item.style.maxHeight = width * 1.414 + "px";
        });
        callExportProtyle("mathRender", [previewElement, ${stageProtylePathLiteral}, true]);
        previewElement.querySelectorAll("table").forEach(item => {
            if (item.clientWidth > item.parentElement.clientWidth) {
                item.style.zoom = (item.parentElement.clientWidth / item.clientWidth).toFixed(2) - 0.01;
                item.parentElement.style.overflow = "hidden";
            }
        });
    };
    const setPadding = () => {
        const isLandscape = document.querySelector("#landscape").checked;
        const topElement = document.querySelector("#marginsTop");
        const rightElement = document.querySelector("#marginsRight");
        const bottomElement = document.querySelector("#marginsBottom");
        const leftElement = document.querySelector("#marginsLeft");
        switch (document.querySelector("#marginsType").value) {
            case "default":
                if (isLandscape) {
                    topElement.value = "0.42";
                    rightElement.value = "0.42";
                    bottomElement.value = "0.42";
                    leftElement.value = "0.42";
                } else {
                    topElement.value = "1";
                    rightElement.value = "0.54";
                    bottomElement.value = "1";
                    leftElement.value = "0.54";
                }
                break;
            case "none":
                topElement.value = "0";
                rightElement.value = "0";
                bottomElement.value = "0";
                leftElement.value = "0";
                break;
            case "printableArea":
                if (isLandscape) {
                    topElement.value = ".07";
                    rightElement.value = ".07";
                    bottomElement.value = ".07";
                    leftElement.value = ".07";
                } else {
                    topElement.value = "0.58";
                    rightElement.value = "0.1";
                    bottomElement.value = "0.58";
                    leftElement.value = "0.1";
                }
                break;
        }
        document.getElementById('preview').style.padding = topElement.value + "in "
                             + rightElement.value + "in "
                             + bottomElement.value + "in "
                             + leftElement.value + "in";
        setTimeout(() => {
            fixBlockWidth();
        }, 300);
    };
    const fetchPost = (url, data, cb) => {
        fetch(${servePathWithoutSlashLiteral} + url, {
            method: "POST",
            body: JSON.stringify(data)
        }).then((response) => {
            return response.json();
        }).then((response) => {
            cb(response);
        });
    };
    const renderPreview = (data) => {
        previewElement.innerHTML = '<div style="padding:8px 0 0 0" class="protyle-wysiwyg${window.sourceflow.config.editor.displayBookmarkIcon ? " protyle-wysiwyg--attr" : ""}">' + data.content + '</div>';
        sanitizeExportExecutableContent(previewElement);
        const wysElement = previewElement.querySelector(".protyle-wysiwyg");
        wysElement.setAttribute("data-doc-type", data.type || "NodeDocument");
        Object.keys(data.attrs).forEach(key => {
            wysElement.setAttribute(key, data.attrs[key]);
        });
        wysElement.querySelectorAll('[data-node-id]').forEach((item) => {
            if (item.querySelector(".img")) {
                item.insertAdjacentHTML("beforeend", "<hr style='margin:0;border:0'>");
            }
        });
        callExportProtyle("mermaidRender", [wysElement, ${stageProtylePathLiteral}]);
        callExportProtyle("flowchartRender", [wysElement, ${stageProtylePathLiteral}]);
        callExportProtyle("graphvizRender", [wysElement, ${stageProtylePathLiteral}]);
        callExportProtyle("chartRender", [wysElement, ${stageProtylePathLiteral}]);
        callExportProtyle("mindmapRender", [wysElement, ${stageProtylePathLiteral}]);
        callExportProtyle("abcRender", [wysElement, ${stageProtylePathLiteral}]);
        callExportProtyle("htmlRender", [wysElement]);
        callExportProtyle("plantumlRender", [wysElement, ${stageProtylePathLiteral}]);
    };
    fetchPost("/api/export/exportPreviewHTML", {
        id: ${rootIdLiteral},
        keepFold: ${serializeInlineScriptValue(!!localData.keepFold)},
        merge: ${serializeInlineScriptValue(!!localData.mergeSubdocs)},
    }, async (response) => {
        try {
            if (response.code === 1) {
                reportPDFExportRuntimeError(response.msg);
                return;
            }
            document.title = response.data.name;
            ${buildExportSourceflowBootstrapJS(0)}
            const exportRuntimeReady = ensureExportRuntime();
            await exportRuntimeReady;
        } catch (error) {
            reportPDFExportRuntimeError(error);
            return;
        }
        previewElement.addEventListener("click", (event) => {
            let target = event.target;
            while (target && !target.isEqualNode(previewElement)) {
                if (target.tagName === "A") {
                    const linkAddress = target.getAttribute("href");
                    if (linkAddress.startsWith("#")) {
                        const hash = linkAddress.substring(1);
                        previewElement.querySelector('[data-node-id="' + hash + '"], [id="' + hash + '"]').scrollIntoView();
                        event.stopPropagation();
                        event.preventDefault();
                        return;
                    }
                } else if (target.classList.contains("protyle-action__copy")) {
                    navigator.clipboard.writeText(target.parentElement.nextElementSibling.textContent.trimEnd().replace(/\\u00A0/g, " ").replace(/\\u200D\\\`\\\`\\\`/g, "\\\`\\\`\\\`"));
                    event.preventDefault();
                    event.stopPropagation();
                    break;
                }
                target = target.parentElement;
            }
        });
        const actionElement = document.getElementById('action');
        const keepFoldElement = actionElement.querySelector('#keepFold');
        keepFoldElement.addEventListener('change', () => {
            refreshPreview();
        });
        const mergeSubdocsElement = actionElement.querySelector('#mergeSubdocs');
        mergeSubdocsElement.addEventListener('change', () => {
            refreshPreview();
        });
        const watermarkElement = actionElement.querySelector('#watermark');
        const refreshPreview = () => {
            previewElement.innerHTML = '<div class="fn__loading" style="left:0;height: 100vh"><img width="48px" src=${serializeInlineScriptValue(`${options.servePath}stage/loading-pure.svg`)}></div>';
            fetchPost("/api/export/exportPreviewHTML", {
                id: ${rootIdLiteral},
                keepFold: keepFoldElement.checked,
                merge: mergeSubdocsElement.checked,
            }, response2 => {
                if (response2.code === 1) {
                    reportPDFExportRuntimeError(response2.msg);
                    return;
                }
                try {
                    setPadding();
                    renderPreview(response2.data);
                } catch (error) {
                    reportPDFExportRuntimeError(error);
                }
            });
        };

        actionElement.querySelector("#scale").addEventListener("input", () => {
            const scale = actionElement.querySelector("#scale").value;
            actionElement.querySelector("#scaleTip").innerText = scale;
            previewElement.style.zoom = scale;
            fixBlockWidth();
        });
        actionElement.querySelector("#pageSize").addEventListener('change', () => {
            fixBlockWidth();
        });
        actionElement.querySelector("#marginsType").addEventListener('change', (event) => {
            setPadding();
            if (event.target.value === "custom") {
                event.target.nextElementSibling.classList.remove("fn__none");
            } else {
                event.target.nextElementSibling.classList.add("fn__none");
            }
        });
        actionElement.querySelector("#marginsTop").addEventListener('change', () => {
            setPadding();
        });
        actionElement.querySelector("#marginsRight").addEventListener('change', () => {
            setPadding();
        });
        actionElement.querySelector("#marginsBottom").addEventListener('change', () => {
            setPadding();
        });
        actionElement.querySelector("#marginsLeft").addEventListener('change', () => {
            setPadding();
        });
        actionElement.querySelector("#landscape").addEventListener('change', () => {
            setPadding();
        });
        actionElement.querySelector('.b3-button--cancel').addEventListener('click', () => {
            const {ipcRenderer}  = require("electron");
            ipcRenderer.send(${destroyCommandChannelLiteral}, "destroy");
        });
        const buildExportConfig = (unPagedPageSize) => {
            const pageSize = actionElement.querySelector("#pageSize").value;
            return {
                title: ${exportLabelLiteral} + " PDF",
                pdfOptions: {
                    printBackground: true,
                    landscape: actionElement.querySelector("#landscape").checked,
                    marginType: actionElement.querySelector("#marginsType").value,
                    margins: {
                        top: parseFloat(document.querySelector("#marginsTop").value) || 0,
                        bottom: parseFloat(document.querySelector("#marginsBottom").value) || 0,
                        left: parseFloat(document.querySelector("#marginsLeft").value) || 0,
                        right: parseFloat(document.querySelector("#marginsRight").value) || 0,
                    },
                    scale: parseFloat(actionElement.querySelector("#scale").value),
                    pageSize: unPagedPageSize || pageSize,
                },
                pageSize,
                keepFold: keepFoldElement.checked,
                mergeSubdocs: mergeSubdocsElement.checked,
                watermark: watermarkElement.checked,
                removeAssets: actionElement.querySelector("#removeAssets").checked,
                paged: !unPagedPageSize,
                rootId: ${rootIdLiteral},
                rootTitle: response.data.name,
                parentWindowId: ${currentWindowIdLiteral},
            };
        };
        const confirmButton = actionElement.querySelector('.b3-button--text');
        confirmButton.addEventListener('click', async () => {
            if (confirmButton.disabled) {
                return;
            }
            confirmButton.disabled = true;
            try {
                const isPaged = actionElement.querySelector("#paged").checked;
                let exportConfig;
                if (!isPaged) {
                    const getPageSizeDimensions = () => {
                        const pageSizes = {
                            "A3": { width: 11.7, height: 16.54 },
                            "A4": { width: 8.27, height: 11.7 },
                            "A5": { width: 5.83, height: 8.27 },
                            "Legal": { width: 8.5, height: 14 },
                            "Letter": { width: 8.5, height: 11 },
                            "Tabloid": { width: 11, height: 17 },
                        };
                        return pageSizes[actionElement.querySelector("#pageSize").value];
                    };
                    const maxUnpagedPageHeight = 200;
                    const previewHeight = Math.max(previewElement.scrollHeight / 96 - (parseFloat(document.querySelector("#marginsTop").value) || 0) - (parseFloat(document.querySelector("#marginsBottom").value) || 0), getPageSizeDimensions().height);
                    if (previewHeight > maxUnpagedPageHeight) {
                        exportConfig = buildExportConfig();
                        exportConfig.autoPagedFallback = true;
                    } else {
                        exportConfig = buildExportConfig(actionElement.querySelector("#landscape").checked ? {
                            height: getPageSizeDimensions().height,
                            width: previewHeight,
                        } : {
                            width: getPageSizeDimensions().width,
                            height: previewHeight,
                        });
                    }
                } else {
                    exportConfig = buildExportConfig();
                }
                const {ipcRenderer} = require("electron");
                ipcRenderer.send(${exportPDFChannelLiteral}, exportConfig);
            } catch (error) {
                console.error(error);
                confirmButton.disabled = false;
                const detail = error && (error.message || error.msg) ? (error.message || error.msg) : String(error || "");
                const message = /(out of memory|insufficient memory|memory.*(allocation|limit|pressure|exhaust)|allocation failed|heap out of memory|ERR_MEMORY|内存不足|可用内存不足)/i.test(detail)
                    ? ${lowMemoryMessageLiteral}
                    : (detail || "Unknown error");
                reportPDFExportRuntimeError(message);
            }
        });
        setPadding();
        renderPreview(response.data);
        window.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                const {ipcRenderer} = require("electron");
                ipcRenderer.send(${destroyCommandChannelLiteral}, "destroy");
                event.preventDefault();
            }
        });
    });
</script>
${options.snippetJS}
</body></html>`;
};
