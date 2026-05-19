import {highlightRender} from "../protyle/render/highlightRender";
import {runMindmapRender} from "../protyle/render/mindmapEntry";
import {createProtyleRenderMethods, type TProtyleRenderMethods} from "../protyle/render/registry";
import {avRender} from "../protyle/render/av/render";

class SourceFlowProtyleMethod {
}

type TPluginProtyleMethod = typeof SourceFlowProtyleMethod & TProtyleRenderMethods & {
    avRender: typeof avRender;
};

export const ProtyleMethod = SourceFlowProtyleMethod as TPluginProtyleMethod;

Object.assign(ProtyleMethod, createProtyleRenderMethods({
    highlightRender,
    mindmapRender: (element: Element, cdn?: string) => {
        runMindmapRender(element, cdn);
    },
}), {
    avRender,
});
