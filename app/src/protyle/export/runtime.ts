import {highlightRender} from "./runtimeHighlightRender";
import {mindmapRender} from "./runtimeMindmap";
import {createProtyleRenderMethods, type TProtyleRenderMethods} from "../render/registry";
import "../../assets/scss/export.scss";

class Protyle {
}

const ProtyleRuntime = Protyle as typeof Protyle & TProtyleRenderMethods;

Object.assign(ProtyleRuntime, createProtyleRenderMethods({
    highlightRender,
    mindmapRender,
}));

window.Protyle = ProtyleRuntime;

export default ProtyleRuntime;
