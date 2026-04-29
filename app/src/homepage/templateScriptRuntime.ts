import {createContainerFacade} from "../sandbox/domFacade";
import {cloneSandboxData, protectSandboxAPIRecord, runSandboxedScript} from "../sandbox/runtime";

interface IHomepageTemplateRuntimeAPI {
    config: Record<string, any>;
    escape: (text: string) => string;
    escapeAttr: (text: string) => string;
    openExternal: (url: string) => void;
    searchWeb: (keyword: string, searchURL: string) => void;
    invoke: (action: string) => Promise<void> | void;
}

export const runHomepageTemplateScript = (options: {
    source: string;
    sourceURL: string;
    container: HTMLElement;
    api: IHomepageTemplateRuntimeAPI;
    state: Record<string, any>;
}) => {
    const source = `${options.source || ""}`.trim();
    if (!source) {
        return;
    }
    const container = createContainerFacade(options.container);
    const api = protectSandboxAPIRecord({
        ...options.api,
        config: cloneSandboxData(options.api.config || {}),
    }, "HomepageTemplateAPI");
    const state = cloneSandboxData(options.state || {});
    return runSandboxedScript<void>({
        label: "homepage-template",
        source,
        sourceURL: options.sourceURL,
        parameterNames: ["container", "api", "state"],
        parameters: [container, api, state],
    });
};
