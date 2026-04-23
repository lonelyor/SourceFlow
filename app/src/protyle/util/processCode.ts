import {abcRender} from "../render/abcRender";
import {chartRender} from "../render/chartRender";
import {graphvizRender} from "../render/graphvizRender";
import {mathRender} from "../render/mathRender";
import {mermaidRender} from "../render/mermaidRender";
import {flowchartRender} from "../render/flowchartRender";
import {plantumlRender} from "../render/plantumlRender";
import {htmlRender} from "../render/htmlRender";
import {runMindmapRender} from "../render/mindmapEntry";
import {isStartupFuseEnabled} from "../../stability/startupGuard";

export const processPasteCode = (html: string, text: string, originalTextHTML: string, protyle: IProtyle) => {
    const tempElement = document.createElement("div");
    tempElement.innerHTML = html;
    let isCode = false;
    if (tempElement.childElementCount === 1 &&
        (tempElement.lastElementChild as HTMLElement).style.fontFamily.indexOf("monospace") > -1) {
        // VS Code
        isCode = true;
    } else if (tempElement.childElementCount === 1 && tempElement.querySelectorAll("pre").length === 1) {
        // IDE
        isCode = true;
    } else if (tempElement.childElementCount === 1 && tempElement.firstElementChild.tagName === "TABLE" &&
        tempElement.querySelector(".line-number") && tempElement.querySelector(".line-content")) {
        // 网页源码
        isCode = true;
    } else if (originalTextHTML.indexOf('<meta name="Generator" content="Cocoa HTML Writer">') > -1 &&
        html.indexOf('\n<p class="p1">') === 0 &&
        //  ChatGPT app 目前没有此标识
        originalTextHTML.indexOf('<style type="text/css">\np.p1') > -1) {
        // Xcode
        isCode = true;
    }

    if (isCode) {
        let code = text || html;
        if (/\n/.test(code)) {
            return protyle.lute.Md2BlockDOM(code);
        } else {
            // Paste code from IDE no longer escape `<` and `>` https://github.com/lonelyor/SourceFlow/issues/8340
            code = code.replace("<", "&lt;").replace(">", "&gt;");
            return "`" + code + "`";
        }
    }
    return false;
};

const lazyMindmapRender = (previewPanel: Element) => {
    const shouldRenderMindmap = ["mindmap", "mind-elixir"].includes(previewPanel.getAttribute("data-subtype") || "") ||
        !!previewPanel.querySelector('[data-subtype="mindmap"]:not([data-render="true"]), [data-subtype="mind-elixir"]:not([data-render="true"])');
    if (!shouldRenderMindmap) {
        return;
    }
    runMindmapRender(previewPanel);
};

const runRenderSafely = (name: string, render: (previewPanel: Element) => void, previewPanel: Element) => {
    try {
        render(previewPanel);
    } catch (error) {
        console.error(`${name} render failed`, error);
    }
};

const RENDER_MAP: Record<string, (previewPanel: Element) => void> = {
    abc: abcRender,
    plantuml: plantumlRender,
    mermaid: mermaidRender,
    flowchart: flowchartRender,
    echarts: chartRender,
    "mind-elixir": lazyMindmapRender,
    mindmap: lazyMindmapRender,
    graphviz: graphvizRender,
    math: mathRender,
};

export const processRender = (previewPanel: Element) => {
    if (isStartupFuseEnabled("richRender")) {
        return;
    }
    const language = previewPanel.getAttribute("data-subtype");
    if (RENDER_MAP[language]) {
        runRenderSafely(language, RENDER_MAP[language], previewPanel);
        return;
    }
    if (previewPanel.getAttribute("data-type") === "NodeHTMLBlock") {
        runRenderSafely("html", htmlRender, previewPanel);
        return;
    }
    for (const [name, render] of Object.entries(RENDER_MAP)) {
        runRenderSafely(name, render, previewPanel);
    }
    runRenderSafely("html", htmlRender, previewPanel);
};
