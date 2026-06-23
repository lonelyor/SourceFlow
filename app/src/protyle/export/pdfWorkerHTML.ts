import {Constants} from "../../constants";
import {buildExportSourceflowBootstrapJS, serializeInlineScriptValue} from "./runtimeState";
import {escapeHTMLAttribute, escapeHTMLText} from "./shared";

export const buildPDFWorkerHTML = (options: {
    data: IWebSocketData;
    servePath: string;
    themeStyle: string;
    inlineStyle: string;
    pluginStyle: string;
    snippetCSS: string;
    exportHTMLContent: string;
    iconScript: string;
    runtimeLoaderJS: string;
    safetyJS: string;
    pdfConfig: {
        pageSize: string;
        pdfOptions: {
            landscape?: boolean;
            margins?: {
                top?: number;
                right?: number;
                bottom?: number;
                left?: number;
            };
            pageSize?: string | {
                width?: number;
                height?: number;
            };
            scale?: number;
        };
    };
}) => {
    const stageProtylePath = serializeInlineScriptValue("stage/protyle");
    const pdfConfigLiteral = serializeInlineScriptValue(options.pdfConfig || {});
    const workerReadyChannelLiteral = serializeInlineScriptValue(Constants.SOURCEFLOW_EXPORT_PDF_WORKER_READY);
    const workerErrorChannelLiteral = serializeInlineScriptValue(Constants.SOURCEFLOW_EXPORT_PDF_WORKER_ERROR);
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
    <title>${escapeHTMLText(options.data.data.name)}</title>
    <style>
        html, body {
          margin: 0;
          padding: 0;
          background: var(--b3-theme-background);
          color: var(--b3-theme-on-background);
          font-family: var(--b3-font-family);
          -webkit-print-color-adjust: exact;
        }

        #preview {
          margin: 0 auto;
          max-width: none;
          box-sizing: border-box;
        }

        .protyle-wysiwyg {
          box-sizing: border-box;
          padding: 0 !important;
        }

        #preview .render-node[data-subtype="plantuml"] object {
          max-width: 100%;
        }
        ${options.inlineStyle}
        ${options.pluginStyle}
    </style>
    ${options.snippetCSS}
</head>
<body>
<div class="protyle-wysiwyg${window.sourceflow.config.editor.displayBookmarkIcon ? " protyle-wysiwyg--attr" : ""}" id="preview">${options.exportHTMLContent}</div>
${options.iconScript}
<script>
    ${options.safetyJS}
    ${options.runtimeLoaderJS}
    ${buildExportSourceflowBootstrapJS(0)}
    const previewElement = document.getElementById("preview");
    const pdfConfig = ${pdfConfigLiteral};
    let pdfWorkerStatusSent = false;
    const getPDFWorkerErrorMessage = (error) => {
        if (error && (error.message || error.msg || error.reason)) {
            return String(error.message || error.msg || error.reason);
        }
        return String(error || "Unknown error");
    };
    const sendPDFWorkerStatus = (channel, payload = {}) => {
        const {ipcRenderer} = require("electron");
        ipcRenderer.send(channel, payload);
    };
    const reportPDFWorkerReady = () => {
        if (pdfWorkerStatusSent) {
            return;
        }
        pdfWorkerStatusSent = true;
        sendPDFWorkerStatus(${workerReadyChannelLiteral});
    };
    const reportPDFWorkerError = (error) => {
        if (pdfWorkerStatusSent) {
            return;
        }
        pdfWorkerStatusSent = true;
        sendPDFWorkerStatus(${workerErrorChannelLiteral}, {
            message: getPDFWorkerErrorMessage(error),
        });
    };
    window.alert = (message) => reportPDFWorkerError(message);
    const waitForAnimationFrames = (count = 2) => new Promise((resolve) => {
        const step = () => {
            if (count <= 0) {
                resolve(undefined);
                return;
            }
            count -= 1;
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    });
    const waitForMutationIdle = (root, idleMs = 180, timeoutMs = 5000) => new Promise((resolve) => {
        let idleTimer = 0;
        let timeoutTimer = 0;
        const done = () => {
            observer.disconnect();
            clearTimeout(idleTimer);
            clearTimeout(timeoutTimer);
            resolve(undefined);
        };
        const scheduleIdle = () => {
            clearTimeout(idleTimer);
            idleTimer = window.setTimeout(done, idleMs);
        };
        const observer = new MutationObserver(() => {
            scheduleIdle();
        });
        observer.observe(root, {
            subtree: true,
            childList: true,
            attributes: true,
            characterData: true,
        });
        timeoutTimer = window.setTimeout(done, timeoutMs);
        scheduleIdle();
    });
    const waitForLoadableElements = (elements, timeoutMs = 5000) => Promise.all(elements.map((element) => {
        if (!element) {
            return Promise.resolve();
        }
        if (element.tagName === "IMG" && element.complete) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            let settled = false;
            const finish = () => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                element.removeEventListener("load", finish);
                element.removeEventListener("error", finish);
                resolve(undefined);
            };
            const timer = window.setTimeout(finish, timeoutMs);
            element.addEventListener("load", finish, {once: true});
            element.addEventListener("error", finish, {once: true});
        });
    }));
    const waitForDocumentFonts = async () => {
        if (document.fonts && document.fonts.ready) {
            try {
                await document.fonts.ready;
            } catch (error) {
                console.warn("[PDF export worker fonts]", error);
            }
        }
    };
    const getPageDimensions = () => {
        const configuredPageSize = pdfConfig?.pdfOptions?.pageSize;
        if (configuredPageSize && typeof configuredPageSize === "object") {
            return {
                width: parseFloat(String(configuredPageSize.width || 0)) || 0,
                height: parseFloat(String(configuredPageSize.height || 0)) || 0,
            };
        }
        const presetPageSize = typeof configuredPageSize === "string" ? configuredPageSize : pdfConfig.pageSize;
        const preset = {
            A3: {width: 11.7, height: 16.54},
            A4: {width: 8.27, height: 11.7},
            A5: {width: 5.83, height: 8.27},
            Legal: {width: 8.5, height: 14},
            Letter: {width: 8.5, height: 11},
            Tabloid: {width: 11, height: 17},
        }[presetPageSize] || {width: 8.27, height: 11.7};
        if (pdfConfig?.pdfOptions?.landscape) {
            return {
                width: preset.height,
                height: preset.width,
            };
        }
        return preset;
    };
    const getPageMargins = () => {
        const margins = pdfConfig?.pdfOptions?.margins || {};
        return {
            top: parseFloat(String(margins.top || 0)) || 0,
            right: parseFloat(String(margins.right || 0)) || 0,
            bottom: parseFloat(String(margins.bottom || 0)) || 0,
            left: parseFloat(String(margins.left || 0)) || 0,
        };
    };
    const fitTablesToPage = () => {
        previewElement.querySelectorAll("table").forEach((item) => {
            if (item.clientWidth > item.parentElement.clientWidth) {
                item.style.zoom = (item.parentElement.clientWidth / item.clientWidth).toFixed(2) - 0.01;
                item.parentElement.style.overflow = "hidden";
            }
        });
    };
    const rerenderResponsiveBlocks = () => {
        const pageDimensions = getPageDimensions();
        const margins = getPageMargins();
        const scale = parseFloat(String(pdfConfig?.pdfOptions?.scale || 1)) || 1;
        const printableWidth = Math.max((pageDimensions.width || 8.27) - margins.left - margins.right, 0.1);
        const width = printableWidth * 96 / scale;
        previewElement.style.width = width + "px";
        const contentWidth = previewElement.clientWidth || width;
        previewElement.querySelectorAll(".hljs").forEach((item) => {
            item.parentElement.setAttribute("linewrap", "true");
            item.parentElement.style.width = "";
            item.parentElement.style.boxSizing = "border-box";
            item.parentElement.style.width = Math.min(item.parentElement.clientWidth, contentWidth) + "px";
            item.removeAttribute("data-render");
        });
        callExportProtyle("highlightRender", [previewElement, ${stageProtylePath}, scale]);
        previewElement.querySelectorAll('[data-type="NodeMathBlock"]').forEach((item) => {
            item.removeAttribute("data-render");
        });
        previewElement.querySelectorAll('[data-type="NodeCodeBlock"][data-subtype="mermaid"] svg').forEach((item) => {
            item.style.maxHeight = contentWidth * 1.414 + "px";
        });
        callExportProtyle("mathRender", [previewElement, ${stageProtylePath}, true]);
        fitTablesToPage();
    };
    const renderPDFWorkerPreview = async () => {
        await ensureExportRuntime();
        sanitizeExportExecutableContent(previewElement);
        callExportProtyle("mermaidRender", [previewElement, ${stageProtylePath}]);
        callExportProtyle("flowchartRender", [previewElement, ${stageProtylePath}]);
        callExportProtyle("graphvizRender", [previewElement, ${stageProtylePath}]);
        callExportProtyle("chartRender", [previewElement, ${stageProtylePath}]);
        callExportProtyle("mindmapRender", [previewElement, ${stageProtylePath}]);
        callExportProtyle("abcRender", [previewElement, ${stageProtylePath}]);
        callExportProtyle("htmlRender", [previewElement]);
        callExportProtyle("plantumlRender", [previewElement, ${stageProtylePath}]);
        rerenderResponsiveBlocks();
        await waitForMutationIdle(previewElement);
        await waitForDocumentFonts();
        await waitForLoadableElements([
            ...Array.from(previewElement.querySelectorAll("img")),
            ...Array.from(previewElement.querySelectorAll("object")),
        ]);
        await waitForMutationIdle(previewElement, 220, 3000);
        await waitForAnimationFrames(3);
        reportPDFWorkerReady();
    };
    renderPDFWorkerPreview().catch((error) => {
        console.error("[PDF export worker]", error);
        reportPDFWorkerError(error);
    });
</script>
</body></html>`;
};
