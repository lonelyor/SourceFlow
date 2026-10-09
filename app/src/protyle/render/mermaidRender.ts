import {addScript} from "../util/addScript";
import {Constants} from "../../constants";
import {hasClosestByAttribute, hasClosestByClassName} from "../util/hasClosest";
import {genIconHTML} from "./util";

let mermaidRegistered = false;
let mermaidInitMode = -1;

export const mermaidRender = (element: Element, cdn = Constants.PROTYLE_CDN) => {
    let mermaidElements: Element[] | NodeListOf<Element> = [];
    if (element.getAttribute("data-subtype") === "mermaid" && element.getAttribute("data-render") !== "true") {
        mermaidElements = [element];
    } else {
        mermaidElements = element.querySelectorAll('[data-subtype="mermaid"]:not([data-render="true"])');
    }
    if (mermaidElements.length === 0) {
        return;
    }
    addScript(`${cdn}/js/mermaid/mermaid.min.js?v=11.13.0`, "protyleMermaidScript").then(() => {
        addScript(`${cdn}/js/mermaid/mermaid-zenuml.min.js?v=0.2.2`, "protyleMermaidZenumlScript").then(async () => {
            const mode = window.sourceflow.config.appearance.mode;
            // 主题只在 initialize 时生效，亮暗切换后需重新 initialize 才能按新主题渲染
            if (!mermaidRegistered || mermaidInitMode !== mode) {
                await window.mermaid.registerExternalDiagrams([window.zenuml]);
                window.mermaid.registerIconPacks([
                    {
                        name: "logos",
                        loader: () =>
                            fetch(`${cdn}/js/mermaid/icons.json?v=11.11.0`).then((res) => res.json()),
                    },
                ]);
                const fontFamily = getComputedStyle(document.documentElement).getPropertyValue("--b3-font-family").trim() || "sans-serif";
                const config: any = {
                    securityLevel: "loose", // 升级后无 https://github.com/lonelyor/SourceFlow/issues/3587，可使用该选项
                    altFontFamily: fontFamily,
                    fontFamily,
                    startOnLoad: false,
                    flowchart: {
                        htmlLabels: true,
                        useMaxWidth: !0
                    },
                    sequence: {
                        useMaxWidth: true,
                        diagramMarginX: 8,
                        diagramMarginY: 8,
                        boxMargin: 8,
                        showSequenceNumbers: true // Mermaid 时序图增加序号 https://github.com/lonelyor/SourceFlow/pull/6992 https://mermaid.js.org/syntax/sequenceDiagram.html#sequencenumbers
                    },
                    gantt: {
                        leftPadding: 75,
                        rightPadding: 20
                    }
                };
                if (mode === 1) {
                    config.theme = "dark";
                }
                window.mermaid.initialize(config);
                mermaidRegistered = true;
                mermaidInitMode = mode;
            }
            const hideElements: Element[] = [];
            const normalElements: Element[] = [];
            mermaidElements.forEach(item => {
                if (item.firstElementChild.clientWidth === 0) {
                    hideElements.push(item);
                } else {
                    normalElements.push(item);
                }
            });
            if (hideElements.length > 0) {
                const observer = new MutationObserver(() => {
                    initMermaid(hideElements);
                    observer.disconnect();
                });
                hideElements.forEach(item => {
                    const hideElement = hasClosestByAttribute(item, "fold", "1");
                    if (hideElement) {
                        observer.observe(hideElement, {attributeFilter: ["fold"]});
                    } else {
                        const cardElement = hasClosestByClassName(item, "card__block", true);
                        if (cardElement) {
                            observer.observe(cardElement, {attributeFilter: ["class"]});
                        } else {
                            // 隐藏标签页等场景：data-render 已清除但容器不可见，等块进入视口时再渲染
                            const io = new IntersectionObserver(entries => {
                                if (entries.some(entry => entry.isIntersecting)) {
                                    io.disconnect();
                                    initMermaid([item]);
                                }
                            });
                            io.observe(item);
                        }
                    }
                });
            }
            initMermaid(normalElements);
        });
    });
};

// 亮暗切换后重绘当前窗口已渲染的 mermaid 图；隐藏标签页中的块仅清除标记并保留旧图，
// 待下一次 processRender 时按新主题自然重绘
export const rerenderMermaidBlocks = () => {
    const renderedElements = document.querySelectorAll('[data-subtype="mermaid"][data-render="true"]');
    if (renderedElements.length === 0) {
        return;
    }
    renderedElements.forEach(item => {
        item.removeAttribute("data-render");
    });
    mermaidRender(document.body);
};

const initMermaid = (mermaidElements: Element[]) => {
    const wysiswgElement = hasClosestByClassName(mermaidElements[0], "protyle-wysiwyg", true);
    mermaidElements.forEach(async (item: HTMLElement) => {
        if (item.getAttribute("data-render") === "true") {
            return;
        }
        item.setAttribute("data-render", "true");
        if (!item.firstElementChild.classList.contains("protyle-icons")) {
            item.insertAdjacentHTML("afterbegin", genIconHTML(wysiswgElement, ["refresh", "edit", "more"]));
        }
        const renderElement = item.firstElementChild.nextElementSibling as HTMLElement;
        if (!item.getAttribute("data-content")) {
            renderElement.innerHTML = `<span style="position: absolute;left:0;top:0;width: 1px;">${Constants.ZWSP}</span>`;
            return;
        }
        const id = "mermaid" + Lute.NewNodeID();
        try {
            renderElement.innerHTML = `<span style="position: absolute;left:0;top:0;width: 1px;">${Constants.ZWSP}</span><div contenteditable="false"><span id="${id}"></span></div>`;
            const mermaidData = await window.mermaid.render(id, Lute.UnEscapeHTMLStr(item.getAttribute("data-content")));
            renderElement.lastElementChild.innerHTML = mermaidData.svg;
        } catch (e) {
            const errorElement = document.querySelector("#" + id);
            const errorMessage = (e instanceof Error ? e.message : String(e)).replace(/\n/g, "<br>");
            renderElement.lastElementChild.innerHTML = `${errorElement ? errorElement.outerHTML : ""}<div class="fn__hr"></div><div class="ft__error">${errorMessage}</div>`;
            if (errorElement) {
                errorElement.parentElement.remove();
            }
            // 渲染失败时清除标记，使后续 processRender 或手动刷新可以重试
            item.removeAttribute("data-render");
        }
    });
};
