import {escapeHtml} from "../util/escape";

export type WebDAVPresetId = "synology" | "generic";

export const detectWebDAVPresetId = (endpoint: string): WebDAVPresetId => {
    const value = (endpoint || "").toLowerCase();
    return !value || value.includes(":5005") || value.includes(":5006") || value.includes(".synology.me")
        ? "synology"
        : "generic";
};

export const renderWebDAVPresetOptions = (presetId: WebDAVPresetId) => {
    return `<option value="synology"${presetId === "synology" ? " selected" : ""}>${escapeHtml(window.sourceflow.languages.syncWebDAVPresetSynology)}</option>
<option value="generic"${presetId === "generic" ? " selected" : ""}>${escapeHtml(window.sourceflow.languages.syncWebDAVPresetGeneric)}</option>`;
};

export const renderWebDAVPresetHint = (presetId: WebDAVPresetId) => {
    const hint = presetId === "synology"
        ? window.sourceflow.languages.syncWebDAVPresetSynologyTip
        : window.sourceflow.languages.syncWebDAVPresetGenericTip;
    return `<div class="b3-label__text">${escapeHtml(hint)}</div>`;
};

export const applyWebDAVPresetToPanel = (providerPanelElement: Element, presetId: WebDAVPresetId) => {
    const endpointElement = providerPanelElement.querySelector<HTMLInputElement>("#endpoint");
    if (endpointElement) {
        endpointElement.placeholder = presetId === "synology"
            ? "https://nas.example.com:5006/sourceflow"
            : "https://dav.example.com/sourceflow";
    }
    const hintElement = providerPanelElement.querySelector("#webdavPresetHint");
    if (hintElement) {
        hintElement.innerHTML = renderWebDAVPresetHint(presetId);
    }
};

export const normalizeWebDAVEndpoint = (rawEndpoint: string, presetId: WebDAVPresetId) => {
    let endpoint = rawEndpoint.trim().replace("http://http(s)://", "https://");
    endpoint = endpoint.replace("http(s)://", "https://");
    if (!endpoint) {
        return "";
    }
    if (!/^https?:\/\//i.test(endpoint)) {
        endpoint = "https://" + endpoint;
    }
    if (presetId === "synology") {
        try {
            const url = new URL(endpoint);
            if (!url.port) {
                url.port = url.protocol === "http:" ? "5005" : "5006";
            }
            endpoint = url.toString();
        } catch (e) {
            // The backend returns the actionable validation error.
        }
    }
    return endpoint;
};

export const collectWebDAVConfigFromPanel = (providerPanelElement: Element) => {
    let timeout = parseInt((providerPanelElement.querySelector("#timeout") as HTMLInputElement).value, 10);
    if (!Number.isFinite(timeout)) {
        timeout = 30;
    }
    timeout = Math.min(300, Math.max(7, timeout));
    let concurrentReqs = parseInt((providerPanelElement.querySelector("#webdavConcurrentReqs") as HTMLInputElement).value, 10);
    if (!Number.isFinite(concurrentReqs)) {
        concurrentReqs = 4;
    }
    concurrentReqs = Math.min(16, Math.max(1, concurrentReqs));
    (providerPanelElement.querySelector("#timeout") as HTMLInputElement).value = timeout.toString();
    (providerPanelElement.querySelector("#webdavConcurrentReqs") as HTMLInputElement).value = concurrentReqs.toString();
    const presetId = (providerPanelElement.querySelector("#webdavPresetProvider") as HTMLSelectElement)?.value as WebDAVPresetId || "generic";
    return {
        endpoint: normalizeWebDAVEndpoint((providerPanelElement.querySelector("#endpoint") as HTMLInputElement).value, presetId),
        username: (providerPanelElement.querySelector("#username") as HTMLInputElement).value.trim(),
        password: (providerPanelElement.querySelector("#password") as HTMLInputElement).value.trim(),
        skipTlsVerify: (providerPanelElement.querySelector("#webdavSkipTlsVerify") as HTMLInputElement).value === "true",
        timeout,
        concurrentReqs,
    };
};

export const renderMultiDeviceSyncGuide = () => {
    return `<div class="b3-label b3-label--inner">
    <div>${escapeHtml(window.sourceflow.languages.syncMultiDeviceTitle)}</div>
    <div class="b3-label__text">${escapeHtml(window.sourceflow.languages.syncMultiDeviceTip)}</div>
    <div class="b3-label__text ft__error">${escapeHtml(window.sourceflow.languages.syncMultiDeviceConflictTip)}</div>
</div>`;
};
