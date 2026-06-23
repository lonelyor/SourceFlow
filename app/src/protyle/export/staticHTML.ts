import {Constants} from "../../constants";
import {getThemeMode} from "../../util/assets";
import {buildExportSourceflowBootstrapJS, serializeInlineScriptValue} from "./runtimeState";
import {escapeHTMLAttribute, escapeHTMLText} from "./shared";

export const buildStaticExportHTML = (options: {
    data: IWebSocketData;
    servePath: string;
    exportOption: IExportOptions;
    themeName: string;
    mode: number;
    themeStyle: string;
    inlineStyle: string;
    pluginStyle: string;
    snippetCSS: string;
    snippetJS: string;
    mobileJS: string;
    mobileCSS: string;
    exportHTMLContent: string;
    iconScript: string;
    runtimeLoaderJS: string;
    safetyJS: string;
}) => {
    const isTypography = ["htmlmd", "word"].includes(options.exportOption.type);
    const previewClassName = isTypography ?
        "b3-typography" :
        "protyle-wysiwyg" + (window.sourceflow.config.editor.displayBookmarkIcon ? " protyle-wysiwyg--attr" : "");
    const stageProtylePath = serializeInlineScriptValue("stage/protyle");
    const previewMathIsPDF = serializeInlineScriptValue(options.exportOption.type === "pdf");
    return `<!DOCTYPE html>
<html lang="${escapeHTMLAttribute(window.sourceflow.config.appearance.lang)}" data-sourceflow-export="true" data-theme-mode="${escapeHTMLAttribute(options.mobileJS ? "light" : getThemeMode())}" data-light-theme="${escapeHTMLAttribute(window.sourceflow.config.appearance.themeLight)}" data-dark-theme="${escapeHTMLAttribute(window.sourceflow.config.appearance.themeDark)}">
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
    <link rel="stylesheet" type="text/css" id="themeDefaultStyle" href="${escapeHTMLAttribute(`${options.servePath}appearance/themes/${options.themeName}/theme.css?v=${Constants.SOURCEFLOW_VERSION}`)}"/>
    ${options.themeStyle}
    <title>${escapeHTMLText(options.data.data.name)}</title>
    <!-- Exported by SourceFlow v${Constants.SOURCEFLOW_VERSION} -->
    <style>
        body {font-family: var(--b3-font-family);background-color: var(--b3-theme-background);color: var(--b3-theme-on-background)}
        ${options.inlineStyle}
        ${options.pluginStyle}
        ${options.mobileCSS}
    </style>
    ${options.snippetCSS}
</head>
<body>
<div class="${previewClassName}" style="max-width: 800px;margin: 0 auto;" id="preview">${options.exportHTMLContent}</div>
${options.iconScript}
<script>
    ${options.safetyJS}
    ${options.runtimeLoaderJS}
    ${options.mobileJS}
    ${buildExportSourceflowBootstrapJS(options.mode)}
    const previewElement = document.getElementById('preview');
    (async () => {
        await ensureExportRuntime();
        sanitizeExportExecutableContent(previewElement);
        callExportProtyle("highlightRender", [previewElement, ${stageProtylePath}]);
        callExportProtyle("mathRender", [previewElement, ${stageProtylePath}, ${previewMathIsPDF}]);
        callExportProtyle("mermaidRender", [previewElement, ${stageProtylePath}]);
        callExportProtyle("flowchartRender", [previewElement, ${stageProtylePath}]);
        callExportProtyle("graphvizRender", [previewElement, ${stageProtylePath}]);
        callExportProtyle("chartRender", [previewElement, ${stageProtylePath}]);
        callExportProtyle("mindmapRender", [previewElement, ${stageProtylePath}]);
        callExportProtyle("abcRender", [previewElement, ${stageProtylePath}]);
        callExportProtyle("htmlRender", [previewElement]);
        callExportProtyle("plantumlRender", [previewElement, ${stageProtylePath}]);
        document.querySelectorAll(".protyle-action__copy").forEach((item) => {
            item.addEventListener("click", (event) => {
                navigator.clipboard.writeText(item.parentElement.nextElementSibling.textContent.trimEnd().replace(/\\u00A0/g, " ").replace(/\\u200D\\\`\\\`\\\`/g, "\\\`\\\`\\\`"));
                event.preventDefault();
                event.stopPropagation();
            });
        });
    })().catch((error) => {
        console.error("[Export runtime]", error);
        previewElement.innerHTML = '<div class="ft__error" style="padding:24px">Export runtime load failed: ' + String(error?.message || error || "Unknown error") + '</div>';
    });
</script>
${options.snippetJS}</body></html>`;
};
