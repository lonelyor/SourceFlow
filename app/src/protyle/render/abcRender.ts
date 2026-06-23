import {addScript} from "../util/addScript";
import {Constants} from "../../constants";
import {genIconHTML} from "./util";
import {hasClosestByClassName} from "../util/hasClosest";
import {parseStructuredDataObject} from "../../util/structuredData";

const ABCJS_PARAMS_KEY = "%%params";

// Read the abcjsParams from the content if it exists.
// The params *must* be the first line of the content in the form:
// %%params JSON or a JSON-like object literal
const getAbcParams = (abcString: string): any => {
    let params: Record<string, any> = {
        responsive: "resize",
    };
    const firstLine = abcString.substring(0, abcString.indexOf("\n"));
    if (firstLine.startsWith(ABCJS_PARAMS_KEY)) {
        try {
            params = parseStructuredDataObject(firstLine.substring(ABCJS_PARAMS_KEY.length), "ABCJS params");
        } catch (e) {
            console.error(`Failed to parse ABCJS params: ${e}`);
        }
    }
    return params;
};

export const abcRender = (element: Element, cdn = Constants.PROTYLE_CDN) => {
    let abcElements: Element[] | NodeListOf<Element> = [];
    if (element.getAttribute("data-subtype") === "abc" && element.getAttribute("data-render") !== "true") {
        abcElements = [element];
    } else {
        abcElements = element.querySelectorAll('[data-subtype="abc"]:not([data-render="true"])');
    }
    if (abcElements.length === 0) {
        return;
    }
    addScript(`${cdn}/js/abcjs/abcjs-basic-min.js?v=6.5.0`, "protyleAbcjsScript").then(() => {
        const wysiwygElement = hasClosestByClassName(element, "protyle-wysiwyg", true);
        abcElements.forEach((e: HTMLDivElement) => {
            e.setAttribute("data-render", "true");
            if (!e.firstElementChild.classList.contains("protyle-icons")) {
                e.insertAdjacentHTML("afterbegin", genIconHTML(wysiwygElement));
            }
            const renderElement = e.firstElementChild.nextElementSibling as HTMLElement;
            renderElement.innerHTML = `<span style="position: absolute;left:0;top:0;width: 1px;">${Constants.ZWSP}</span><div contenteditable="false"></div>`;
            const abcString = Lute.UnEscapeHTMLStr(e.getAttribute("data-content"));
            window.ABCJS.renderAbc(renderElement.lastElementChild, abcString, getAbcParams(abcString));
        });
    });
};
