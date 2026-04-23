import {Constants} from "../../constants";
import {genIconHTML} from "./util";
import {MindmapAttr, MIND_ELIXIR_SIDE, MIND_ELIXIR_SUBTYPE} from "./mindmapConstants";

export type MindElixirBranchDirection = 0 | 1;
export type MindElixirDirection = MindElixirBranchDirection | 2;

export interface NodeObj {
    id?: string;
    topic?: string;
    expanded?: boolean;
    direction?: MindElixirBranchDirection;
    children?: NodeObj[];
    [key: string]: unknown;
}

export interface MindElixirData {
    direction: MindElixirDirection;
    nodeData: NodeObj;
    arrows?: unknown[];
    summaries?: unknown[];
    [key: string]: unknown;
}

interface IMindmapTreeNode {
    name?: string;
    topic?: string;
    collapsed?: boolean;
    expanded?: boolean;
    direction?: 0 | 1;
    children?: IMindmapTreeNode[];
}

interface IMindElixirAttrsOptions {
    updated?: string;
    clearLegacyData?: boolean;
}

interface IMindElixirBlockDOMOptions {
    id?: string;
    height?: string;
    now?: Date;
}

const cloneNode = (node: NodeObj): NodeObj => {
    const nextNode: NodeObj = {
        ...node,
        topic: `${node.topic || ""}`.trim(),
    };
    if (node.children?.length) {
        nextNode.children = node.children.map((child) => cloneNode(child));
    }
    return nextNode;
};

const createNode = (node: IMindmapTreeNode, depth = 0, direction?: 0 | 1): NodeObj => {
    const topic = `${node.topic || node.name || ""}`.replace(/\s+/g, " ").trim() || window.sourceflow.languages.mindmap;
    const children = (node.children || []).map((child, index) => {
        const childDirection = depth === 0 ? (typeof child.direction === "number" ? child.direction : (index % 2 === 0 ? 1 : 0)) : child.direction;
        return createNode(child, depth + 1, childDirection);
    });
    const ret: NodeObj = {
        id: `mindmap-${Lute.NewNodeID()}`,
        topic,
        expanded: node.collapsed !== true && node.expanded !== false,
    };
    if (typeof direction === "number") {
        ret.direction = direction;
    }
    if (children.length > 0) {
        ret.children = children;
    }
    return ret;
};

const normalizeParsedJSON = (parsed: unknown): MindElixirData | null => {
    if (!parsed || typeof parsed !== "object") {
        return null;
    }
    const candidate = parsed as Record<string, unknown>;
    if (candidate.nodeData && typeof candidate.nodeData === "object") {
        const nextData = candidate as MindElixirData;
        return {
            direction: typeof nextData.direction === "number" ? nextData.direction as MindElixirDirection : MIND_ELIXIR_SIDE,
            nodeData: cloneNode(nextData.nodeData),
            arrows: Array.isArray(nextData.arrows) ? nextData.arrows : [],
            summaries: Array.isArray(nextData.summaries) ? nextData.summaries : [],
        };
    }
    if (Array.isArray(parsed)) {
        return {
            direction: MIND_ELIXIR_SIDE,
            nodeData: createNode({
                topic: window.sourceflow.languages.mindmap,
                children: parsed as IMindmapTreeNode[],
            }),
            arrows: [],
            summaries: [],
        };
    }
    return {
        direction: MIND_ELIXIR_SIDE,
        nodeData: createNode(candidate as unknown as IMindmapTreeNode),
        arrows: [],
        summaries: [],
    };
};

export const createDefaultMindElixirData = (topic = window.sourceflow.languages.mindmap): MindElixirData => {
    return {
        direction: MIND_ELIXIR_SIDE,
        nodeData: createNode({topic}),
        arrows: [],
        summaries: [],
    };
};

export const serializeMindElixirData = (data: MindElixirData) => {
    return JSON.stringify(data, null, 2);
};

export const parseMindElixirData = (text: string): MindElixirData | null => {
    const normalized = `${text || ""}`.trim();
    if (!normalized) {
        return null;
    }
    const fencedMatch = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const payload = fencedMatch ? fencedMatch[1].trim() : normalized;
    try {
        return normalizeParsedJSON(JSON.parse(payload));
    } catch (e) {
        const objectMatch = payload.match(/\{[\s\S]*\}$/);
        if (!objectMatch) {
            return null;
        }
        try {
            return normalizeParsedJSON(JSON.parse(objectMatch[0]));
        } catch (error) {
            return null;
        }
    }
};

export const buildMindElixirDataFromLegacyContent = (content: string): MindElixirData | null => {
    const normalized = `${content || ""}`.trim();
    if (!normalized) {
        return null;
    }
    try {
        const raw = JSON.parse(Lute.EChartsMindmapStr(Lute.UnEscapeHTMLStr(normalized))) as IMindmapTreeNode | IMindmapTreeNode[];
        return normalizeParsedJSON(Array.isArray(raw) ? {
            topic: window.sourceflow.languages.mindmap,
            children: raw,
        } : raw);
    } catch (error) {
        return null;
    }
};

export const readMindElixirDataFromElement = (element: Element): MindElixirData | null => {
    const stored = element.getAttribute(MindmapAttr.data) || "";
    const parsedStored = parseMindElixirData(stored);
    if (parsedStored) {
        return parsedStored;
    }
    const htmlPayload = element.querySelector("protyle-html")?.getAttribute("data-content") || "";
    const parsedPayload = parseMindElixirData(Lute.UnEscapeHTMLStr(htmlPayload));
    if (parsedPayload) {
        return parsedPayload;
    }
    return buildMindElixirDataFromLegacyContent(element.getAttribute("data-content") || "");
};

const collectTopics = (node: NodeObj, acc: string[]) => {
    const topic = `${node.topic || ""}`.replace(/\s+/g, " ").trim();
    if (topic) {
        acc.push(topic);
    }
    node.children?.forEach((child) => collectTopics(child, acc));
};

export const buildMindElixirIndex = (data: MindElixirData) => {
    const topics: string[] = [];
    collectTopics(data.nodeData, topics);
    return Array.from(new Set(topics)).join(" / ");
};

export const buildMindElixirAttrs = (data: MindElixirData, options: IMindElixirAttrsOptions = {}) => {
    const now = options.updated || new Date().toISOString();
    return {
        [MindmapAttr.engine]: "mind-elixir",
        [MindmapAttr.schema]: "mind-elixir@5",
        [MindmapAttr.data]: options.clearLegacyData === false ? serializeMindElixirData(data) : null,
        [MindmapAttr.index]: buildMindElixirIndex(data),
        [MindmapAttr.updated]: now,
    };
};

export const getMindElixirRootTopic = (data: MindElixirData) => {
    return `${data?.nodeData?.topic || window.sourceflow.languages.mindmap}`.replace(/\s+/g, " ").trim() || window.sourceflow.languages.mindmap;
};

export const formatMindElixirBlockUpdated = (date = new Date()) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    const hour = `${date.getHours()}`.padStart(2, "0");
    const minute = `${date.getMinutes()}`.padStart(2, "0");
    const second = `${date.getSeconds()}`.padStart(2, "0");
    return `${year}${month}${day}${hour}${minute}${second}`;
};

export const buildMindElixirHTMLBlockDOM = (data: MindElixirData, options: IMindElixirBlockDOMOptions = {}) => {
    const now = options.now || new Date();
    const nodeId = options.id || Lute.NewNodeID();
    const height = options.height || "420px";
    const attrs = buildMindElixirAttrs(data, {updated: now.toISOString()});
    const attrsHTML = Object.entries(attrs)
        .filter(([, value]) => typeof value === "string" && value !== "")
        .map(([key, value]) => ` ${key}="${Lute.EscapeHTMLStr(value)}"`)
        .join("");
    return `<div data-node-id="${nodeId}" data-type="NodeHTMLBlock" class="render-node" data-subtype="${MIND_ELIXIR_SUBTYPE}" updated="${formatMindElixirBlockUpdated(now)}"${attrsHTML} style="height:${height}">${genIconHTML()}<div><protyle-html data-content="${Lute.EscapeHTMLStr(serializeMindElixirData(data))}"></protyle-html><span style="position: absolute">${Constants.ZWSP}</span></div><div class="protyle-attr" contenteditable="false">${Constants.ZWSP}</div></div>`;
};
