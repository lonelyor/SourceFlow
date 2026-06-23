import {createReadOnlyKernelFetch} from "../../sandbox/kernelApi";
import {cloneSandboxData, protectSandboxAPIRecord, runSandboxedScript} from "../../sandbox/runtime";

const EMBED_SCRIPT_SCOPE = "embed-script";

const normalizeStringArray = (items: unknown[]) => {
    const results: string[] = [];
    const seen = new Set<string>();
    items.forEach((item) => {
        const text = `${item || ""}`.trim();
        if (!text || seen.has(text)) {
            return;
        }
        seen.add(text);
        results.push(text);
    });
    return results;
};

const normalizeEmbedScriptResult = (value: unknown) => {
    if (Array.isArray(value)) {
        return normalizeStringArray(value);
    }
    if (value instanceof Set) {
        return normalizeStringArray(Array.from(value));
    }
    if (value && typeof value === "object" && Array.isArray((value as {includeIDs?: unknown[]}).includeIDs)) {
        return normalizeStringArray((value as {includeIDs: unknown[]}).includeIDs);
    }
    throw new Error("Embed script must return an array of block IDs, a Set of IDs, or { includeIDs: [] }");
};

const snapshotNamedNodeMap = (attributes: NamedNodeMap) => {
    const snapshot = Object.create(null) as Record<string, string>;
    Array.from(attributes).forEach((attr) => {
        snapshot[attr.name] = attr.value;
    });
    return snapshot;
};

const snapshotDataset = (dataset: DOMStringMap) => {
    const snapshot = Object.create(null) as Record<string, string>;
    Object.keys(dataset).forEach((key) => {
        snapshot[key] = dataset[key];
    });
    return snapshot;
};

const snapshotEmbedElement = (item: HTMLElement) => {
    return cloneSandboxData({
        id: item.id || "",
        nodeId: item.getAttribute("data-node-id") || "",
        type: item.getAttribute("data-type") || "",
        subtype: item.getAttribute("data-subtype") || "",
        breadcrumb: item.getAttribute("breadcrumb") || "",
        customHeadingMode: item.getAttribute("custom-heading-mode") || "",
        updated: item.getAttribute("updated") || "",
        textContent: item.textContent || "",
        innerText: item.innerText || "",
        className: item.className || "",
        style: item.getAttribute("style") || "",
        attributes: snapshotNamedNodeMap(item.attributes),
        dataset: snapshotDataset(item.dataset),
    });
};

const snapshotProtyleState = (protyle: IProtyle, top?: number) => {
    return cloneSandboxData({
        block: {
            id: protyle.block.id || "",
            rootID: protyle.block.rootID || "",
            parentID: protyle.block.parentID || "",
            showAll: !!protyle.block.showAll,
        },
        options: {
            render: protyle.options.render,
            preview: protyle.options.preview,
            hint: {
                emojiPath: protyle.options.hint?.emojiPath || "",
            },
        },
        top: typeof top === "number" ? top : null,
    });
};

const createEmbedScriptAPI = () => {
    return protectSandboxAPIRecord({
        fetchSyncPost: createReadOnlyKernelFetch(EMBED_SCRIPT_SCOPE),
        normalizeIDs: (items: unknown[]) => normalizeStringArray(items),
    }, "EmbedScriptAPI");
};

export const runEmbedQueryScript = async (options: {
    code: string;
    item: HTMLElement;
    protyle: IProtyle;
    top?: number;
}) => {
    const source = `${options.code || ""}`;
    const itemSnapshot = snapshotEmbedElement(options.item);
    const protyleSnapshot = snapshotProtyleState(options.protyle, options.top);
    const api = createEmbedScriptAPI();
    const fetchSyncPost = api.fetchSyncPost;
    const result = runSandboxedScript<unknown>({
        label: EMBED_SCRIPT_SCOPE,
        source,
        sourceURL: `sourceflow://${EMBED_SCRIPT_SCOPE}/${encodeURIComponent(itemSnapshot.nodeId || "unknown")}.js`,
        parameterNames: ["fetchSyncPost", "item", "protyle", "top", "api", "state"],
        parameters: [
            fetchSyncPost,
            itemSnapshot,
            protyleSnapshot,
            options.top ?? null,
            api,
            cloneSandboxData({
                item: itemSnapshot,
                protyle: protyleSnapshot,
                top: options.top ?? null,
            }),
        ],
    });
    const resolved = result instanceof Promise ? await result : result;
    return normalizeEmbedScriptResult(resolved);
};
