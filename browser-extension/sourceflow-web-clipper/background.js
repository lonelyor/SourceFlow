const DEFAULT_SETTINGS = {
    kernelURL: "http://127.0.0.1:6806",
    apiToken: "",
    notebook: "",
    pathPrefix: "收件箱/网页导入",
};
const EXTRACT_PAGE_MESSAGE = {
    type: "extract-page",
    clipType: "full",
};
const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";
const COLLECT_JOBS_STORAGE_KEY = "collectJobs";
const MAX_STORED_JOBS = 24;

class UserFacingError extends Error {
    constructor(code, title, detail, hint = "", meta = "") {
        super(detail || title || "操作失败");
        this.name = "UserFacingError";
        this.code = code || "unknown";
        this.title = title || "操作失败";
        this.detail = detail || title || "出现未预期错误";
        this.hint = hint;
        this.meta = meta;
    }
}

const collectJobs = new Map();
let jobsReadyPromise = null;
let creatingOffscreenDocumentPromise = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message?.type) {
        return;
    }

    if (message.type === "enqueue-collect-job") {
        enqueueCollectJob(message.payload).then((result) => {
            sendResponse({ok: true, data: result});
        }).catch((error) => {
            sendResponse({ok: false, error: serializeUserFacingError(error)});
        });
        return true;
    }

    if (message.type === "list-collect-jobs") {
        listCollectJobs().then((jobs) => {
            sendResponse({ok: true, data: jobs});
        }).catch((error) => {
            sendResponse({ok: false, error: serializeUserFacingError(error)});
        });
        return true;
    }

    if (message.type === "collect-job-request-extraction") {
        requestCollectJobExtraction(message.payload).then((result) => {
            sendResponse({ok: true, data: result});
        }).catch((error) => {
            sendResponse({ok: false, error: serializeUserFacingError(error)});
        });
        return true;
    }

    if (message.type === "collect-job-update") {
        applyCollectJobUpdate(message.payload).then((job) => {
            sendResponse({ok: true, data: job});
        }).catch((error) => {
            sendResponse({ok: false, error: serializeUserFacingError(error)});
        });
        return true;
    }
});

async function enqueueCollectJob(payload) {
    await ensureCollectJobsLoaded();

    const settings = await loadSettings();
    const kernelURL = normalizeKernelURL(payload?.kernelURL || settings.kernelURL);
    const apiToken = String(payload?.apiToken || settings.apiToken || "").trim();
    if (!apiToken) {
        throw createUserFacingError(
            "config-missing-token",
            "缺少 API Token",
            "还没有填写 API Token，扩展无法调用 SourceFlow 内核。",
            "在 SourceFlow 的 设置 -> 关于 中复制 API Token，然后回到扩展重试。"
        );
    }

    const notebook = String(payload?.notebook || settings.notebook || "").trim();
    if (!notebook) {
        throw createUserFacingError(
            "config-missing-notebook",
            "未选择目标笔记本",
            "当前还没有指定保存到哪个笔记本。",
            "先点击“刷新”获取笔记本列表，再选择一个目标笔记本。"
        );
    }

    const tab = await resolveTargetTab(payload?.tabId);
    if (!tab?.id || !tab.url) {
        throw createUserFacingError(
            "page-not-found",
            "未找到当前标签页",
            "扩展没有拿到当前正在浏览的网页标签页。",
            "关闭弹窗后重新点开扩展，或切换到要保存的网页标签页后再试。"
        );
    }
    if (!/^https?:\/\//i.test(tab.url)) {
        throw createUnsupportedPageError(tab.url);
    }

    const duplicatedJob = findDuplicatedCollectJob(tab.id, tab.url);
    if (duplicatedJob) {
        return {
            job: duplicatedJob,
            alreadyQueued: true,
        };
    }

    const jobId = crypto.randomUUID();
    const title = normalizeTabTitle(tab.title);
    const job = await upsertCollectJob(jobId, {
        id: jobId,
        tabId: tab.id,
        url: tab.url,
        title,
        status: "queued",
        statusType: "info",
        detail: "已加入后台保存队列。",
        hint: "现在可以关闭弹窗，任务会继续在后台运行。",
        meta: tab.url,
        createdAt: new Date().toISOString(),
    });

    await ensureOffscreenDocument();

    try {
        const queueResult = await chrome.runtime.sendMessage({
            type: "queue-collect-job",
            target: "offscreen",
            payload: {
                id: jobId,
                tabId: tab.id,
                url: tab.url,
                title,
                kernelURL,
                apiToken,
                notebook,
                pathPrefix: String(payload?.pathPrefix || settings.pathPrefix || "").trim(),
            },
        });
        if (!queueResult || queueResult.ok === false) {
            throw ensureUserFacingError(queueResult?.error);
        }
        const queuedJob = await upsertCollectJob(jobId, {
            detail: queueResult?.queued
                ? "后台保存任务已开始排队。"
                : "后台保存任务已创建。",
            hint: "可以继续浏览或切换到其他页面，任务会在后台继续处理。",
            meta: buildQueueMeta(queueResult, tab.url),
        });
        return {
            job: queuedJob,
            alreadyQueued: false,
        };
    } catch (error) {
        const normalizedError = ensureUserFacingError(error);
        await upsertCollectJob(jobId, {
            status: "failed",
            statusType: "error",
            detail: normalizedError.detail,
            hint: normalizedError.hint,
            meta: normalizedError.meta,
            finishedAt: new Date().toISOString(),
        });
        throw normalizedError;
    }
}

async function listCollectJobs() {
    await ensureCollectJobsLoaded();
    return getSortedCollectJobs();
}

async function requestCollectJobExtraction(payload) {
    await ensureCollectJobsLoaded();

    const jobId = String(payload?.jobId || "").trim();
    if (!jobId) {
        throw createUserFacingError(
            "job-missing-id",
            "后台任务无效",
            "缺少保存任务标识，无法继续采集网页内容。",
            "请重新点击一次“保存当前页”。"
        );
    }

    const tab = await resolveTargetTab(payload?.tabId);
    if (!tab?.id || !tab.url) {
        throw createUserFacingError(
            "page-missing-after-queue",
            "网页标签页已不可用",
            "后台开始处理时，原始网页标签页已经不存在或无法访问。",
            "请重新打开目标网页后再次保存。"
        );
    }
    if (!/^https?:\/\//i.test(tab.url)) {
        throw createUnsupportedPageError(tab.url);
    }

    const extraction = await requestPageExtraction(tab);
    if (!extraction?.dom) {
        throw createUserFacingError(
            "page-empty",
            "页面提取失败",
            extraction?.error || "扩展没有提取到可保存的网页内容。",
            "请刷新当前网页，等待页面完全加载后再试；如果是动态页，先把正文滚动加载出来。"
        );
    }

    await upsertCollectJob(jobId, {
        title: extraction.title || normalizeTabTitle(tab.title),
        url: extraction.url || tab.url,
        meta: extraction.url || tab.url,
    });

    return extraction;
}

async function applyCollectJobUpdate(payload) {
    await ensureCollectJobsLoaded();

    const jobId = String(payload?.jobId || "").trim();
    if (!jobId) {
        throw createUserFacingError(
            "job-missing-id",
            "后台任务无效",
            "后台任务更新缺少任务标识。",
            "请重新点击一次“保存当前页”。"
        );
    }

    const patch = {
        title: payload?.title,
        url: payload?.url,
        status: payload?.status,
        statusType: payload?.statusType,
        detail: payload?.detail,
        hint: payload?.hint,
        meta: payload?.meta,
        progress: payload?.progress,
        path: payload?.path,
        sourceURL: payload?.sourceURL,
        assetSummary: payload?.assetSummary,
        startedAt: payload?.startedAt,
        finishedAt: payload?.finishedAt,
    };
    return upsertCollectJob(jobId, patch);
}

async function ensureCollectJobsLoaded() {
    if (!jobsReadyPromise) {
        jobsReadyPromise = chrome.storage.local.get(COLLECT_JOBS_STORAGE_KEY).then((stored) => {
            const jobs = Array.isArray(stored?.[COLLECT_JOBS_STORAGE_KEY]) ? stored[COLLECT_JOBS_STORAGE_KEY] : [];
            collectJobs.clear();
            for (const job of jobs) {
                if (job?.id) {
                    collectJobs.set(job.id, job);
                }
            }
        });
    }
    await jobsReadyPromise;
}

async function persistCollectJobs() {
    const jobs = getSortedCollectJobs().slice(0, MAX_STORED_JOBS);
    await chrome.storage.local.set({
        [COLLECT_JOBS_STORAGE_KEY]: jobs,
    });
}

async function upsertCollectJob(jobId, patch) {
    const current = collectJobs.get(jobId) || {id: jobId, createdAt: new Date().toISOString()};
    const next = {
        ...current,
        ...compactObject(patch),
        id: jobId,
        updatedAt: new Date().toISOString(),
    };
    if (isTerminalCollectJobStatus(next.status) && !next.finishedAt) {
        next.finishedAt = new Date().toISOString();
    }
    collectJobs.set(jobId, next);
    trimCollectJobs();
    await persistCollectJobs();
    return next;
}

function trimCollectJobs() {
    const jobs = getSortedCollectJobs();
    if (jobs.length <= MAX_STORED_JOBS) {
        return;
    }
    for (const job of jobs.slice(MAX_STORED_JOBS)) {
        collectJobs.delete(job.id);
    }
}

function getSortedCollectJobs() {
    return Array.from(collectJobs.values()).sort((left, right) => {
        const rightTime = Date.parse(right.updatedAt || right.createdAt || 0);
        const leftTime = Date.parse(left.updatedAt || left.createdAt || 0);
        return rightTime - leftTime;
    });
}

function findDuplicatedCollectJob(tabId, url) {
    return getSortedCollectJobs().find((job) => {
        if (job.tabId !== tabId || job.url !== url) {
            return false;
        }
        return !isTerminalCollectJobStatus(job.status);
    }) || null;
}

function isTerminalCollectJobStatus(status) {
    return status === "success" || status === "failed";
}

async function ensureOffscreenDocument() {
    const offscreenURL = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
    if (chrome.runtime.getContexts) {
        const existingContexts = await chrome.runtime.getContexts({
            contextTypes: ["OFFSCREEN_DOCUMENT"],
            documentUrls: [offscreenURL],
        });
        if (existingContexts.length > 0) {
            return;
        }
    }

    if (!creatingOffscreenDocumentPromise) {
        creatingOffscreenDocumentPromise = chrome.offscreen.createDocument({
            url: OFFSCREEN_DOCUMENT_PATH,
            reasons: ["BLOBS"],
            justification: "Run long-lived page save tasks after the popup closes and upload large page blobs in the background.",
        }).finally(() => {
            creatingOffscreenDocumentPromise = null;
        });
    }
    await creatingOffscreenDocumentPromise;
}

async function loadSettings() {
    const data = await chrome.storage.local.get(DEFAULT_SETTINGS);
    return {...DEFAULT_SETTINGS, ...data};
}

async function resolveTargetTab(tabId) {
    if (Number.isInteger(tabId) && tabId > 0) {
        try {
            return await chrome.tabs.get(tabId);
        } catch (_error) {
            // Fall through to the active tab lookup.
        }
    }
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    return tab || null;
}

async function requestPageExtraction(tab) {
    try {
        return await chrome.tabs.sendMessage(tab.id, EXTRACT_PAGE_MESSAGE);
    } catch (error) {
        if (!isMissingReceiverError(error)) {
            throw toUserFacingExtractionError(error);
        }
    }

    await injectContentScript(tab);

    try {
        return await chrome.tabs.sendMessage(tab.id, EXTRACT_PAGE_MESSAGE);
    } catch (error) {
        throw toUserFacingExtractionError(error);
    }
}

function isMissingReceiverError(error) {
    const message = error instanceof Error ? error.message : String(error || "");
    return /receiving end does not exist/i.test(message) || /could not establish connection/i.test(message);
}

async function injectContentScript(tab) {
    if (!chrome.scripting?.executeScript) {
        throw createUserFacingError(
            "page-inject-unsupported",
            "当前扩展环境不支持自动注入页面脚本",
            "浏览器没有提供当前页面所需的脚本注入能力。",
            "请刷新当前网页后重试，或升级到较新的 Chrome/Edge 版本。"
        );
    }

    try {
        await chrome.scripting.executeScript({
            target: {tabId: tab.id},
            files: ["content.js"],
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "");
        if (
            /cannot access contents of url/i.test(message) ||
            /cannot access a chrome/i.test(message) ||
            /cannot access this page/i.test(message) ||
            /frame with id 0 is showing error page/i.test(message)
        ) {
            throw createUserFacingError(
                "page-restricted",
                "当前页面不允许读取",
                "浏览器限制了扩展对这个页面的访问，例如 `chrome://`、扩展页、新标签页或内置 PDF 阅读页。",
                "请切换到普通的 http/https 网页后再保存。"
            );
        }
        throw createUserFacingError(
            "page-inject-failed",
            "页面脚本注入失败",
            message || "扩展无法向当前页面注入采集脚本。",
            "刷新当前网页后再试；如果页面刚刚完成登录，等页面稳定后再保存。"
        );
    }
}

function toUserFacingExtractionError(error) {
    if (error instanceof UserFacingError) {
        return error;
    }
    const message = error instanceof Error ? error.message : String(error || "");
    if (isMissingReceiverError(error)) {
        return createUserFacingError(
            "page-script-not-ready",
            "页面脚本未就绪",
            "当前标签页还没有挂上采集脚本，扩展暂时无法读取页面内容。",
            "刷新当前网页后重新打开扩展再试。"
        );
    }
    if (/the message port closed before a response was received/i.test(message)) {
        return createUserFacingError(
            "page-navigation-changed",
            "页面在采集时发生变化",
            "网页在采集中发生了跳转、刷新或重新渲染，导致扩展拿到的内容中断。",
            "等待页面稳定后重新保存一次。"
        );
    }
    return createUserFacingError(
        "page-extraction-failed",
        "页面提取失败",
        message || "扩展未能从当前网页提取正文内容。",
        "请刷新网页后重试；如果正文需要滚动加载，请先让内容完整显示。"
    );
}

function normalizeKernelURL(kernelURL) {
    return String(kernelURL || DEFAULT_SETTINGS.kernelURL).trim().replace(/\/+$/, "");
}

function normalizeTabTitle(title) {
    const normalized = String(title || "").trim();
    return normalized || "网页导入";
}

function buildQueueMeta(queueResult, fallbackURL) {
    const activeCount = Number(queueResult?.activeCount || 0);
    const queuedCount = Number(queueResult?.queuedCount || 0);
    const metrics = [];
    if (activeCount > 0) {
        metrics.push(`并发运行：${activeCount}`);
    }
    if (queuedCount > 0) {
        metrics.push(`排队中：${queuedCount}`);
    }
    if (metrics.length > 0) {
        return metrics.join(" / ");
    }
    return fallbackURL || "";
}

function compactObject(value) {
    const result = {};
    for (const [key, entry] of Object.entries(value || {})) {
        if (typeof entry === "undefined") {
            continue;
        }
        result[key] = entry;
    }
    return result;
}

function createUserFacingError(code, title, detail, hint = "", meta = "") {
    return new UserFacingError(code, title, detail, hint, meta);
}

function ensureUserFacingError(error) {
    if (error instanceof UserFacingError) {
        return error;
    }
    if (error && typeof error === "object" && "title" in error && "detail" in error) {
        return createUserFacingError(error.code, error.title, error.detail, error.hint, error.meta);
    }
    const message = error instanceof Error ? error.message : String(error || "");
    return createUserFacingError(
        "unknown",
        "保存失败",
        message || "出现未预期错误，当前页面还没有成功保存。",
        "请刷新网页和扩展后重试；如果持续失败，再检查内核地址和 API Token。"
    );
}

function serializeUserFacingError(error) {
    const normalized = ensureUserFacingError(error);
    return {
        code: normalized.code,
        title: normalized.title,
        detail: normalized.detail,
        hint: normalized.hint,
        meta: normalized.meta,
    };
}

function createUnsupportedPageError(url) {
    let scheme = "";
    try {
        scheme = new URL(url).protocol.replace(":", "");
    } catch (_error) {
        scheme = "";
    }
    return createUserFacingError(
        "page-unsupported",
        "当前页面不支持保存",
        "浏览器扩展目前只能保存普通的 http/https 网页，不能直接读取系统页、扩展页或本地受限页面。",
        "请切换到需要保存的网页正文页后再试。",
        scheme ? `当前页面协议：${scheme}://` : ""
    );
}
