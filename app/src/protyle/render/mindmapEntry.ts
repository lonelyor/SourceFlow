import {Constants} from "../../constants";
import {hasClosestByClassName} from "../util/hasClosest";
import {genIconHTML} from "./util";
import {LEGACY_MINDMAP_SUBTYPE, MIND_ELIXIR_SUBTYPE} from "./mindmapConstants";

type TMindmapBlockElement = HTMLElement & {
    sourceflowMindElixir?: {
        destroy?: () => void;
    };
};

let mindmapRenderPromise: Promise<typeof import("./mindmapRender")> | null = null;
let mindmapFuseBlown = false;

const getMindmapTargets = (element: Element) => {
    if ([LEGACY_MINDMAP_SUBTYPE, MIND_ELIXIR_SUBTYPE].includes(element.getAttribute("data-subtype") || "")) {
        return [element as TMindmapBlockElement];
    }
    return Array.from(element.querySelectorAll<TMindmapBlockElement>('[data-subtype="mindmap"], [data-subtype="mind-elixir"]'));
};

const renderMindmapIsolation = (element: Element, detail = "Mind map is temporarily unavailable") => {
    getMindmapTargets(element).forEach((item) => {
        item.setAttribute("data-render", "true");
        try {
            item.sourceflowMindElixir?.destroy?.();
        } catch (error) {
            console.warn("mindmap isolation destroy failed", error);
        }
        if (!item.firstElementChild?.classList.contains("protyle-icons")) {
            const wysiwygElement = hasClosestByClassName(item, "protyle-wysiwyg", true);
            item.insertAdjacentHTML("afterbegin", genIconHTML(wysiwygElement));
        }
        const renderElement = item.firstElementChild?.nextElementSibling as HTMLElement;
        if (!renderElement) {
            return;
        }
        const height = item.style.height || "420px";
        renderElement.innerHTML = `<span style="position:absolute;left:0;top:0;width:1px;">${Constants.ZWSP}</span><div class="ft__error" style="height:${height}" contenteditable="false">${detail}</div>`;
    });
};

const reportMindmapFailure = (element: Element, error: unknown) => {
    console.error("[mindmap] render isolated", error);
    mindmapFuseBlown = true;
    renderMindmapIsolation(element, "Mind map failed to load and has been isolated.");
};

const loadMindmapRenderModule = () => {
    if (!mindmapRenderPromise) {
        mindmapRenderPromise = import("./mindmapRender");
    }
    return mindmapRenderPromise;
};

export const runMindmapRender = (element: Element, cdn = Constants.PROTYLE_CDN) => {
    if (mindmapFuseBlown) {
        renderMindmapIsolation(element, "Mind map has been isolated for this session.");
        return;
    }
    void loadMindmapRenderModule().then(({mindmapRender}) => {
        mindmapRender(element, cdn);
    }).catch((error) => {
        reportMindmapFailure(element, error);
    });
};
