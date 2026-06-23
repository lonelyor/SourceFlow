const MAX_PARALLEL_JOBS = 3;
const MAX_ASSET_FETCH_CONCURRENCY = 6;

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

const queuedJobs = [];
const runningJobs = new Map();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.target && message.target !== "offscreen") {
        return;
    }
    if (message?.type !== "queue-collect-job") {
        return;
    }

    queueCollectJob(message.payload).then((result) => {
        sendResponse({
            queued: true,
            activeCount: result.activeCount,
            queuedCount: result.queuedCount,
        });
    }).catch((error) => {
        sendResponse({ok: false, error: serializeUserFacingError(error)});
    });
    return true;
});

async function queueCollectJob(job) {
    if (!job?.id) {
        throw createUserFacingError(
            "job-missing-id",
            "后台任务无效",
            "扩展没有收到有效的后台保存任务。",
            "请重新点击一次“保存当前页”。"
        );
    }

    if (runningJobs.has(job.id) || queuedJobs.some((item) => item.id === job.id)) {
        return {
            activeCount: runningJobs.size,
            queuedCount: queuedJobs.length,
        };
    }

    queuedJobs.push(job);
    pumpCollectJobs();
    return {
        activeCount: runningJobs.size,
        queuedCount: queuedJobs.length,
    };
}

function pumpCollectJobs() {
    while (runningJobs.size < MAX_PARALLEL_JOBS && queuedJobs.length > 0) {
        const job = queuedJobs.shift();
        runningJobs.set(job.id, job);
        runCollectJob(job).finally(() => {
            runningJobs.delete(job.id);
            pumpCollectJobs();
        });
    }
}

async function runCollectJob(job) {
    const startedAt = new Date().toISOString();
    try {
        await postJobUpdate({
            jobId: job.id,
            title: job.title,
            url: job.url,
            status: "extracting",
            statusType: "info",
            detail: "正在提取网页正文。",
            hint: "可以继续浏览、切换页面或关闭弹窗，后台保存会继续进行。",
            meta: job.url,
            startedAt,
        });

        const extraction = await requestPageExtraction(job);
        const title = extraction.title || job.title || "网页导入";
        const sourceURL = extraction.url || job.url;

        const formData = new FormData();
        formData.append("dom", extraction.dom);
        formData.append("href", sourceURL);
        formData.append("notebook", job.notebook);
        formData.append("title", title);
        formData.append("pathPrefix", job.pathPrefix || "");

        const assetURLs = Array.from(new Set(extraction.assetURLs || []));
        const assetSummary = await appendAssetsToFormData(job, assetURLs, formData, sourceURL);

        await postJobUpdate({
            jobId: job.id,
            title,
            url: sourceURL,
            status: "uploading",
            statusType: "info",
            detail: "正在写入 SourceFlow。",
            hint: "网页内容已经提取完成，正在把 Markdown 和资源保存到 SourceFlow。",
            meta: buildAssetSummaryMeta(assetSummary),
            progress: {current: assetSummary.total, total: assetSummary.total},
            assetSummary,
        });

        const result = await postCollectSnapshot(job.kernelURL, job.apiToken, formData);
        const finishedAt = new Date().toISOString();
        const hasAssetFailures = assetSummary.failed > 0;
        await postJobUpdate({
            jobId: job.id,
            title: result.data?.title || title,
            url: result.data?.sourceURL || sourceURL,
            status: "success",
            statusType: hasAssetFailures ? "warning" : "success",
            detail: hasAssetFailures
                ? "网页已保存，部分资源未下载。"
                : "网页已成功保存到 SourceFlow。",
            hint: hasAssetFailures
                ? "正文已经保存成功，但有少量图片、封面或附件没有随页面一起下载。"
                : "现在可以回到 SourceFlow 继续整理、摘录或交给 AI 处理。",
            meta: result.data?.path || buildAssetSummaryMeta(assetSummary),
            path: result.data?.path,
            sourceURL: result.data?.sourceURL || sourceURL,
            assetSummary,
            finishedAt,
        });
    } catch (error) {
        const normalizedError = ensureUserFacingError(error);
        await postJobUpdate({
            jobId: job.id,
            status: "failed",
            statusType: "error",
            detail: normalizedError.detail,
            hint: normalizedError.hint,
            meta: normalizedError.meta,
            finishedAt: new Date().toISOString(),
        });
    }
}

async function requestPageExtraction(job) {
    let response;
    try {
        response = await chrome.runtime.sendMessage({
            type: "collect-job-request-extraction",
            payload: {
                jobId: job.id,
                tabId: job.tabId,
            },
        });
    } catch (error) {
        throw createUserFacingError(
            "background-unreachable",
            "后台采集通道不可用",
            error instanceof Error ? error.message : String(error || ""),
            "请重新点击一次“保存当前页”。"
        );
    }

    if (!response?.ok) {
        throw ensureUserFacingError(response?.error);
    }
    return response.data;
}

async function appendAssetsToFormData(job, assetURLs, formData, sourceURL) {
    if (!assetURLs.length) {
        return {total: 0, attached: 0, failed: 0};
    }

    const progress = {
        total: assetURLs.length,
        completed: 0,
        attached: 0,
        failed: 0,
        lastReportedAt: 0,
    };

    await postJobUpdate({
        jobId: job.id,
        status: "downloading-assets",
        statusType: "info",
        detail: "正在下载页面资源。",
        hint: "图片、封面和附件会并发下载，以提高大页面的保存速度。",
        meta: buildAssetProgressMeta(progress),
        progress: {current: 0, total: progress.total},
    });

    let nextIndex = 0;
    const workerCount = Math.min(MAX_ASSET_FETCH_CONCURRENCY, assetURLs.length);
    const workers = Array.from({length: workerCount}, async () => {
        while (true) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            if (currentIndex >= assetURLs.length) {
                return;
            }
            const assetURL = assetURLs[currentIndex];
            try {
                const response = await fetch(assetURL, {credentials: "include"});
                if (!response.ok) {
                    progress.failed += 1;
                } else {
                    const blob = await response.blob();
                    const filename = guessFileName(assetURL, response.headers.get("content-type"));
                    formData.append(assetURL, blob, filename);
                    progress.attached += 1;
                }
            } catch (_error) {
                progress.failed += 1;
            }

            progress.completed += 1;
            if (shouldReportAssetProgress(progress)) {
                await postJobUpdate({
                    jobId: job.id,
                    title: job.title,
                    url: sourceURL,
                    status: "downloading-assets",
                    statusType: "info",
                    detail: "正在下载页面资源。",
                    hint: "图片、封面和附件会并发下载，以提高大页面的保存速度。",
                    meta: buildAssetProgressMeta(progress),
                    progress: {current: progress.completed, total: progress.total},
                    assetSummary: {
                        total: progress.total,
                        attached: progress.attached,
                        failed: progress.failed,
                    },
                });
            }
        }
    });

    await Promise.all(workers);
    return {
        total: progress.total,
        attached: progress.attached,
        failed: progress.failed,
    };
}

function shouldReportAssetProgress(progress) {
    const now = Date.now();
    const reachedBoundary = progress.completed === progress.total || progress.completed === 1 || progress.completed % 5 === 0;
    const reachedInterval = now - progress.lastReportedAt >= 600;
    if (!reachedBoundary && !reachedInterval) {
        return false;
    }
    progress.lastReportedAt = now;
    return true;
}

async function postCollectSnapshot(kernelURL, apiToken, formData) {
    let response;
    try {
        response = await fetch(joinURL(kernelURL, "/api/extension/collectSnapshot"), {
            method: "POST",
            headers: {
                Authorization: `Token ${apiToken}`,
            },
            body: formData,
        });
    } catch (error) {
        throw mapKernelTransportError(error, kernelURL, "save");
    }

    const result = await parseJSONResponse(response, kernelURL, "save");
    if (result.code !== 0) {
        throw mapKernelResultError(result, kernelURL, "save");
    }
    return result;
}

async function parseJSONResponse(response, kernelURL, operation) {
    const rawText = await response.text();
    let result = {};
    if (rawText) {
        try {
            result = JSON.parse(rawText);
        } catch (_error) {
            throw mapKernelHTTPError(response.status, kernelURL, operation, rawText.trim());
        }
    }
    if (!response.ok) {
        throw mapKernelHTTPError(response.status, kernelURL, operation, result?.msg || "");
    }
    return result;
}

async function postJobUpdate(payload) {
    const response = await chrome.runtime.sendMessage({
        type: "collect-job-update",
        payload,
    });
    if (!response?.ok) {
        throw ensureUserFacingError(response?.error);
    }
    return response.data;
}

function joinURL(base, pathname) {
    return `${String(base || "").trim().replace(/\/+$/, "")}${pathname}`;
}

function guessFileName(assetURL, contentType) {
    try {
        const parsed = new URL(assetURL);
        const base = parsed.pathname.split("/").pop();
        if (base) {
            return decodeURIComponent(base);
        }
    } catch (_error) {
        // Ignore URL parse failures.
    }
    if (contentType?.includes("png")) {
        return "asset.png";
    }
    if (contentType?.includes("jpeg")) {
        return "asset.jpg";
    }
    if (contentType?.includes("svg")) {
        return "asset.svg";
    }
    if (contentType?.includes("webp")) {
        return "asset.webp";
    }
    return "asset.bin";
}

function buildAssetProgressMeta(progress) {
    return `资源下载：${progress.completed}/${progress.total}，成功 ${progress.attached}，失败 ${progress.failed}`;
}

function buildAssetSummaryMeta(summary) {
    if (!summary || !summary.total) {
        return "未发现需要下载的页面资源。";
    }
    return `资源下载：${summary.attached}/${summary.total}，失败 ${summary.failed}`;
}

function mapKernelTransportError(error, kernelURL, operation) {
    const message = error instanceof Error ? error.message : String(error || "");
    if (/failed to fetch/i.test(message) || /networkerror/i.test(message)) {
        return createUserFacingError(
            `kernel-${operation}-unreachable`,
            "无法连接 SourceFlow 内核",
            `扩展无法访问内核地址 ${kernelURL}。`,
            "确认 SourceFlow 已启动，内核地址填写正确，并且浏览器能访问这个本机地址。"
        );
    }
    return createUserFacingError(
        `kernel-${operation}-transport`,
        "请求内核失败",
        message || "浏览器和 SourceFlow 内核之间的请求没有成功完成。",
        "检查内核地址、网络代理设置，以及 SourceFlow 是否仍在运行。"
    );
}

function mapKernelHTTPError(status, kernelURL, operation, message) {
    if (status === 401 || status === 403) {
        return createUserFacingError(
            `kernel-${operation}-unauthorized`,
            "API Token 无效或已失效",
            "SourceFlow 内核拒绝了当前请求，通常是 API Token 填写错误、过期，或复制时夹带了空格。",
            "回到 SourceFlow 的 设置 -> 关于 重新复制 API Token，再点一次刷新或保存。"
        );
    }
    if (status === 404) {
        return createUserFacingError(
            `kernel-${operation}-not-found`,
            "内核地址不正确",
            `当前地址 ${kernelURL} 不是可用的 SourceFlow 内核接口。`,
            "确认地址通常是 `http://127.0.0.1:6806`，不要填成前端网页地址或其他服务端口。"
        );
    }
    if (status >= 500) {
        return createUserFacingError(
            `kernel-${operation}-server-error`,
            "内核处理失败",
            message || "SourceFlow 内核在处理请求时返回了服务器错误。",
            "稍后重试；如果持续失败，请检查 SourceFlow 日志。"
        );
    }
    return createUserFacingError(
        `kernel-${operation}-http`,
        "内核请求失败",
        message || `SourceFlow 内核返回了 HTTP ${status}。`,
        "检查内核地址和 API Token 是否正确，然后重试。"
    );
}

function mapKernelResultError(result, kernelURL, operation) {
    const message = String(result?.msg || "").trim();
    if (/page content is empty/i.test(message)) {
        return createUserFacingError(
            `kernel-${operation}-empty-page`,
            "页面内容为空",
            "扩展已经连上内核，但当前网页快照里没有提取到足够的正文内容。",
            "刷新网页并等待内容完整显示；如果页面依赖懒加载，请先滚动到正文区域后再保存。"
        );
    }
    if (/invalid capture payload/i.test(message)) {
        return createUserFacingError(
            `kernel-${operation}-invalid-payload`,
            "采集数据无效",
            "扩展传给内核的页面快照不完整，内核拒绝了这次保存。",
            "刷新当前网页后重试；如果页面刚完成登录或跳转，先等待页面稳定。"
        );
    }
    if (/url cannot be empty|enter a valid domain or http\/https url/i.test(message)) {
        return createUserFacingError(
            `kernel-${operation}-invalid-url`,
            "页面地址无效",
            "当前传入内核的网页地址不完整或不是可保存的 http/https 地址。",
            "回到网页正文页后重新打开扩展再试。"
        );
    }
    return createUserFacingError(
        `kernel-${operation}-rejected`,
        "保存被内核拒绝",
        message || "SourceFlow 内核没有接受这次保存请求。",
        "检查当前页面是否完整加载，并确认内核地址和 API Token 正确。"
    );
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
