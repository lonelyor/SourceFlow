import MindElixir, {
    DARK_THEME,
    SIDE,
    THEME,
    type MindElixirData as MindElixirLibraryData,
    type MindElixirInstance,
} from "mind-elixir";
import "mind-elixir/style.css";
import {Constants} from "../../constants";
import {hasClosestByAttribute, hasClosestByClassName} from "../util/hasClosest";
import {buildMindElixirAttrs, readMindElixirDataFromElement} from "../render/mindmapData";
import {LEGACY_MINDMAP_SUBTYPE, MindmapAttr, MIND_ELIXIR_SUBTYPE} from "../render/mindmapConstants";

interface IExportMindmapBlockElement extends HTMLDivElement {
    sourceflowMindElixir?: MindElixirInstance;
}

const isMindmapSubtype = (subtype: string | null) => {
    return [LEGACY_MINDMAP_SUBTYPE, MIND_ELIXIR_SUBTYPE].includes(`${subtype || ""}`);
};

const createTheme = () => {
    const baseTheme = window.sourceflow.config.appearance.mode === 1 ? DARK_THEME : THEME;
    return {
        ...baseTheme,
        cssVar: {
            ...baseTheme.cssVar,
            "--main-color": "var(--b3-theme-on-background)",
            "--main-bgcolor": "var(--b3-protyle-code-background)",
            "--main-bgcolor-transparent": "transparent",
            "--color": "var(--b3-theme-on-background)",
            "--bgcolor": "var(--b3-protyle-code-background)",
            "--selected": "var(--b3-theme-primary-lightest)",
            "--root-color": "var(--b3-theme-on-background)",
            "--root-bgcolor": "var(--b3-theme-surface)",
            "--root-border-color": "var(--b3-border-color)",
            "--panel-color": "var(--b3-theme-on-background)",
            "--panel-bgcolor": "var(--b3-theme-background)",
            "--panel-border-color": "var(--b3-border-color)",
        },
    };
};

const applyMindmapAttrsToElement = (item: IExportMindmapBlockElement, attrs: Record<string, string | null>) => {
    Object.entries(attrs).forEach(([key, value]) => {
        if (value === null || value === "") {
            item.removeAttribute(key);
        } else {
            item.setAttribute(key, value);
        }
    });
};

const getMindmapRenderElement = (item: IExportMindmapBlockElement) => {
    if (!item.firstElementChild?.classList.contains("protyle-icons")) {
        item.insertAdjacentHTML("afterbegin", "<div class=\"protyle-icons\"></div>");
    }
    return item.firstElementChild?.nextElementSibling as HTMLElement;
};

const renderMindmapBlock = (item: IExportMindmapBlockElement) => {
    item.setAttribute("data-render", "true");
    const renderElement = getMindmapRenderElement(item);
    if (!renderElement) {
        return;
    }
    const data = readMindElixirDataFromElement(item);
    if (!data) {
        renderElement.innerHTML = `<span style="position:absolute;left:0;top:0;width:1px;">${Constants.ZWSP}</span>`;
        return;
    }
    if (item.sourceflowMindElixir) {
        item.sourceflowMindElixir.destroy();
        item.sourceflowMindElixir = undefined;
    }
    applyMindmapAttrsToElement(item, buildMindElixirAttrs(data));
    const height = item.style.height || "420px";
    renderElement.innerHTML = `<span style="position:absolute;left:0;top:0;width:1px;">${Constants.ZWSP}</span><div class="protyle-mindmap" contenteditable="false" style="height:${height}"></div>`;
    const host = renderElement.lastElementChild as HTMLElement;
    try {
        const mind = new MindElixir({
            el: host,
            direction: typeof data.direction === "number" ? data.direction : SIDE,
            editable: false,
            contextMenu: false,
            toolBar: false,
            keypress: false,
            allowUndo: false,
            overflowHidden: false,
            handleWheel: true,
            theme: createTheme(),
        });
        mind.init(data as unknown as MindElixirLibraryData);
        item.sourceflowMindElixir = mind;
        window.requestAnimationFrame(() => {
            item.sourceflowMindElixir?.scaleFit();
            item.sourceflowMindElixir?.toCenter();
        });
        if (item.getAttribute("data-subtype") === LEGACY_MINDMAP_SUBTYPE && !item.getAttribute(MindmapAttr.data)) {
            applyMindmapAttrsToElement(item, buildMindElixirAttrs(data));
        }
    } catch (error) {
        renderElement.innerHTML = `<span style="position:absolute;left:0;top:0;width:1px;">${Constants.ZWSP}</span><div class="ft__error" style="height:${height}" contenteditable="false">Mind Elixir render error: <br>${error}</div>`;
    }
};

const initMindmaps = (mindmapElements: IExportMindmapBlockElement[]) => {
    if (mindmapElements.length === 0) {
        return;
    }
    mindmapElements.forEach((item) => {
        if (item.getAttribute("data-render") === "true") {
            return;
        }
        renderMindmapBlock(item);
    });
};

export const mindmapRender = (element: Element, cdn = Constants.PROTYLE_CDN) => {
    void cdn;
    let mindmapElements: IExportMindmapBlockElement[] | NodeListOf<IExportMindmapBlockElement> = [];
    if (isMindmapSubtype(element.getAttribute("data-subtype")) && element.getAttribute("data-render") !== "true") {
        mindmapElements = [element as IExportMindmapBlockElement];
    } else {
        mindmapElements = element.querySelectorAll('[data-subtype="mindmap"]:not([data-render="true"]), [data-subtype="mind-elixir"]:not([data-render="true"])');
    }
    if (mindmapElements.length === 0) {
        return;
    }
    const hiddenElements: IExportMindmapBlockElement[] = [];
    const normalElements: IExportMindmapBlockElement[] = [];
    Array.from(mindmapElements).forEach((item) => {
        if (item.firstElementChild?.clientWidth === 0) {
            hiddenElements.push(item);
        } else {
            normalElements.push(item);
        }
    });
    if (hiddenElements.length > 0) {
        const observer = new MutationObserver(() => {
            initMindmaps(hiddenElements.filter((item) => item.firstElementChild?.clientWidth !== 0));
            if (hiddenElements.every((item) => item.getAttribute("data-render") === "true")) {
                observer.disconnect();
            }
        });
        hiddenElements.forEach((item) => {
            const hideElement = hasClosestByAttribute(item, "fold", "1");
            if (hideElement instanceof HTMLElement) {
                observer.observe(hideElement, {attributeFilter: ["fold"]});
            } else {
                const cardElement = hasClosestByClassName(item, "card__block", true);
                if (cardElement instanceof HTMLElement) {
                    observer.observe(cardElement, {attributeFilter: ["class"]});
                }
            }
        });
    }
    initMindmaps(normalElements);
};
