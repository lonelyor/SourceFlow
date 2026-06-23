import {highlightRender} from "./render/highlightRender";
import {runMindmapRender} from "./render/mindmapEntry";
import {createProtyleRenderMethods, type TProtyleRenderMethods} from "./render/registry";
import "../assets/scss/export.scss";

class Protyle {
}

const ProtyleRuntime = Protyle as typeof Protyle & TProtyleRenderMethods;

Object.assign(ProtyleRuntime, createProtyleRenderMethods({
    highlightRender,
    mindmapRender: (element: Element, cdn?: string) => {
        runMindmapRender(element, cdn);
    },
}));

// 由于 https://github.com/lonelyor/SourceFlow/issues/7800，先临时解决一下
window.Protyle = ProtyleRuntime;

export default ProtyleRuntime;
