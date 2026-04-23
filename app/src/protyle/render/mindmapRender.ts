import MindElixir, {
    DARK_THEME,
    SIDE,
    THEME,
    type MindElixirData as MindElixirLibraryData,
    type MindElixirInstance,
} from "mind-elixir";
import "mind-elixir/style.css";
import {fetchSyncPost} from "../../util/fetch";
import {Constants} from "../../constants";
import {hasClosestByAttribute, hasClosestByClassName} from "../util/hasClosest";
import {genIconHTML} from "./util";
import {
    buildMindElixirAttrs,
    buildMindElixirHTMLBlockDOM,
    formatMindElixirBlockUpdated,
    readMindElixirDataFromElement,
    serializeMindElixirData,
    type MindElixirData,
} from "./mindmapData";
import {LEGACY_MINDMAP_SUBTYPE, MindmapAttr, MIND_ELIXIR_SUBTYPE} from "./mindmapConstants";

interface IMindmapBlockElement extends HTMLDivElement {
    sourceflowMindElixir?: MindElixirInstance;
    sourceflowMindmapSaveTimer?: number;
}

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

const isEditableMindmap = (item: IMindmapBlockElement) => {
    return !!hasClosestByClassName(item, "protyle-wysiwyg", true);
};

const isMindmapSubtype = (subtype: string | null) => {
    return [LEGACY_MINDMAP_SUBTYPE, MIND_ELIXIR_SUBTYPE].includes(`${subtype || ""}`);
};

const applyMindmapAttrsToElement = (item: IMindmapBlockElement, attrs: Record<string, string | null>) => {
    Object.entries(attrs).forEach(([key, value]) => {
        if (value === null || value === "") {
            item.removeAttribute(key);
        } else {
            item.setAttribute(key, value);
        }
    });
};

const persistMindmapBlock = async (item: IMindmapBlockElement) => {
    if (!item.sourceflowMindElixir) {
        return;
    }
    const id = item.getAttribute("data-node-id") || "";
    if (!id) {
        return;
    }
    const data = item.sourceflowMindElixir.getData() as unknown as MindElixirData;
    const now = new Date();
    const attrs = buildMindElixirAttrs(data, {updated: now.toISOString()});
    applyMindmapAttrsToElement(item, attrs);
    item.setAttribute("updated", formatMindElixirBlockUpdated(now));
    item.querySelector("protyle-html")?.setAttribute("data-content", Lute.EscapeHTMLStr(serializeMindElixirData(data)));
    const response = await fetchSyncPost("/api/block/updateBlock", {
        id,
        data: buildMindElixirHTMLBlockDOM(data, {
            id,
            height: item.style.height || "420px",
            now,
        }),
        dataType: "dom",
    });
    if (response.code !== 0) {
        return;
    }
    void fetchSyncPost("/api/attr/setBlockAttrs", {
        id,
        attrs,
    });
};

const scheduleMindmapPersist = (item: IMindmapBlockElement) => {
    if (!isEditableMindmap(item)) {
        return;
    }
    window.clearTimeout(item.sourceflowMindmapSaveTimer);
    item.sourceflowMindmapSaveTimer = window.setTimeout(() => {
        void persistMindmapBlock(item);
    }, 240);
};

const migrateLegacyMindmapBlock = async (item: IMindmapBlockElement, data: MindElixirData) => {
    if (!isEditableMindmap(item) || item.getAttribute("data-subtype") !== LEGACY_MINDMAP_SUBTYPE || item.getAttribute("data-mindmap-migrating") === "true") {
        return;
    }
    const id = item.getAttribute("data-node-id") || "";
    if (!id) {
        return;
    }
    item.setAttribute("data-mindmap-migrating", "true");
    const now = new Date();
    const attrs = buildMindElixirAttrs(data, {updated: now.toISOString()});
    const response = await fetchSyncPost("/api/block/updateBlock", {
        id,
        data: buildMindElixirHTMLBlockDOM(data, {
            id,
            height: item.style.height || "420px",
            now,
        }),
        dataType: "dom",
    });
    if (response.code !== 0) {
        item.removeAttribute("data-mindmap-migrating");
        return;
    }
    await fetchSyncPost("/api/attr/setBlockAttrs", {
        id,
        attrs,
    });
};

const renderMindmapBlock = (item: IMindmapBlockElement, wysiswgElement: false | HTMLElement) => {
    item.setAttribute("data-render", "true");
    if (!item.firstElementChild.classList.contains("protyle-icons")) {
        item.insertAdjacentHTML("afterbegin", genIconHTML(wysiswgElement));
    }
    const renderElement = item.firstElementChild.nextElementSibling as HTMLElement;
    const data = readMindElixirDataFromElement(item);
    if (!data) {
        renderElement.innerHTML = `<span style="position: absolute;left:0;top:0;width:1px;">${Constants.ZWSP}</span>`;
        return;
    }
    if (item.getAttribute("data-subtype") === LEGACY_MINDMAP_SUBTYPE) {
        void migrateLegacyMindmapBlock(item, data);
    }
    if (item.sourceflowMindElixir) {
        item.sourceflowMindElixir.destroy();
        item.sourceflowMindElixir = undefined;
    }
    applyMindmapAttrsToElement(item, buildMindElixirAttrs(data));
    const height = item.style.height || "420px";
    renderElement.innerHTML = `<span style="position: absolute;left:0;top:0;width:1px;">${Constants.ZWSP}</span><div class="protyle-mindmap" contenteditable="false" style="height:${height}"></div>`;
    const host = renderElement.lastElementChild as HTMLElement;
    try {
        const mind = new MindElixir({
            el: host,
            direction: typeof data.direction === "number" ? data.direction : SIDE,
            editable: isEditableMindmap(item),
            contextMenu: isEditableMindmap(item),
            toolBar: isEditableMindmap(item),
            keypress: isEditableMindmap(item),
            allowUndo: isEditableMindmap(item),
            overflowHidden: false,
            handleWheel: true,
            theme: createTheme(),
        });
        mind.init(data as unknown as MindElixirLibraryData);
        if (isEditableMindmap(item)) {
            mind.bus.addListener("operation", () => {
                scheduleMindmapPersist(item);
            });
        }
        item.sourceflowMindElixir = mind;
        window.requestAnimationFrame(() => {
            item.sourceflowMindElixir?.scaleFit();
            item.sourceflowMindElixir?.toCenter();
        });
        if (item.getAttribute("data-subtype") === LEGACY_MINDMAP_SUBTYPE && !item.getAttribute(MindmapAttr.data)) {
            scheduleMindmapPersist(item);
        }
    } catch (error) {
        renderElement.innerHTML = `<span style="position: absolute;left:0;top:0;width:1px;">${Constants.ZWSP}</span><div class="ft__error" style="height:${height}" contenteditable="false">Mind Elixir render error: <br>${error}</div>`;
    }
};

const initMindmaps = (mindmapElements: IMindmapBlockElement[]) => {
    if (mindmapElements.length === 0) {
        return;
    }
    const wysiswgElement = hasClosestByClassName(mindmapElements[0], "protyle-wysiwyg", true) || false;
    mindmapElements.forEach((item) => {
        if (item.getAttribute("data-render") === "true") {
            return;
        }
        renderMindmapBlock(item, wysiswgElement);
    });
};

export const mindmapRender = (element: Element, cdn = Constants.PROTYLE_CDN) => {
    void cdn;
    let mindmapElements: IMindmapBlockElement[] | NodeListOf<IMindmapBlockElement> = [];
    if (isMindmapSubtype(element.getAttribute("data-subtype")) && element.getAttribute("data-render") !== "true") {
        mindmapElements = [element as IMindmapBlockElement];
    } else {
        mindmapElements = element.querySelectorAll('[data-subtype="mindmap"]:not([data-render="true"]), [data-subtype="mind-elixir"]:not([data-render="true"])');
    }
    if (mindmapElements.length === 0) {
        return;
    }
    const hiddenElements: IMindmapBlockElement[] = [];
    const normalElements: IMindmapBlockElement[] = [];
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
