import {abcRender} from "./abcRender";
import {chartRender} from "./chartRender";
import {flowchartRender} from "./flowchartRender";
import {graphvizRender} from "./graphvizRender";
import {htmlRender} from "./htmlRender";
import {mathRender} from "./mathRender";
import {mermaidRender} from "./mermaidRender";
import {plantumlRender} from "./plantumlRender";

export const PROTYLE_RENDER_METHOD_NAMES = [
    "highlightRender",
    "mathRender",
    "mermaidRender",
    "flowchartRender",
    "graphvizRender",
    "chartRender",
    "mindmapRender",
    "abcRender",
    "htmlRender",
    "plantumlRender",
] as const;

export type TProtyleRenderMethodName = typeof PROTYLE_RENDER_METHOD_NAMES[number];

export type TProtyleElementRender = (element: Element, ...args: any[]) => void;

export type TProtyleRenderMethods = Record<TProtyleRenderMethodName, TProtyleElementRender>;

export const PROTYLE_BLOCK_SUBTYPE_TO_RENDER_METHOD: Record<string, Exclude<TProtyleRenderMethodName, "highlightRender" | "htmlRender">> = {
    abc: "abcRender",
    plantuml: "plantumlRender",
    mermaid: "mermaidRender",
    flowchart: "flowchartRender",
    echarts: "chartRender",
    "mind-elixir": "mindmapRender",
    mindmap: "mindmapRender",
    graphviz: "graphvizRender",
    math: "mathRender",
};

export const createProtyleRenderMethods = (options: {
    highlightRender: TProtyleElementRender;
    mindmapRender: TProtyleElementRender;
}): TProtyleRenderMethods => {
    return {
        graphvizRender,
        highlightRender: options.highlightRender,
        mathRender,
        mermaidRender,
        flowchartRender,
        chartRender,
        abcRender,
        mindmapRender: options.mindmapRender,
        plantumlRender,
        htmlRender,
    };
};

export const createBlockSubtypeRenderMap = (renderMethods: TProtyleRenderMethods) => {
    return Object.entries(PROTYLE_BLOCK_SUBTYPE_TO_RENDER_METHOD).reduce((map, [subtype, methodName]) => {
        map[subtype] = renderMethods[methodName];
        return map;
    }, {} as Record<string, TProtyleElementRender>);
};
