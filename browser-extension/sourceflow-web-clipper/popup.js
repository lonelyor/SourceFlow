const DEFAULT_SETTINGS = {
    kernelURL: "http://127.0.0.1:6806",
    apiToken: "",
    notebook: "",
    pathPrefix: "收件箱/网页导入",
};

const state = {
    tab: null,
    jobsTimer: null,
};

const BUTTON_LABELS = {
    refresh: "刷新",
    refreshing: "刷新中…",
    collect: "保存当前页",
    collecting: "加入后台…",
};

const STATUS_EMPTY = {
    type: "",
    title: "",
    detail: "",
    hint: "",
    meta: "",
};

document.addEventListener("DOMContentLoaded", async () => {
    bindEvents();
    await loadActiveTab();
    await loadSettings();
    await refreshNotebooks();
    await refreshCollectJobs();
    state.jobsTimer = window.setInterval(() => {
        void refreshCollectJobs();
    }, 1500);
});

window.addEventListener("beforeunload", () => {
    if (state.jobsTimer) {
        window.clearInterval(state.jobsTimer);
        state.jobsTimer = null;
    }
});

function bindEvents() {
    document.getElementById("refreshNotebooks").addEventListener("click", refreshNotebooks);
    document.getElementById("collectPage").addEventListener("click", collectCurrentPage);
}

async function loadActiveTab() {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    state.tab = tab || null;
    document.getElementById("pageInfo").textContent = tab?.url || "未检测到可保存的网页";
}

async function loadSettings() {
    const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
    document.getElementById("kernelURL").value = settings.kernelURL || DEFAULT_SETTINGS.kernelURL;
    document.getElementById("apiToken").value = settings.apiToken || "";
    document.getElementById("pathPrefix").value = settings.pathPrefix || DEFAULT_SETTINGS.pathPrefix;
    document.getElementById("notebook").dataset.savedValue = settings.notebook || "";
}

async function refreshNotebooks() {
    const settings = readFormSettings();
    if (!settings.apiToken) {
        setNotebookOptions([]);
        setStatus(createStatus(
            "error",
            "缺少 API Token",
            "还没有填写 API Token，扩展无法读取笔记本列表。",
            "在 SourceFlow 的 设置 -> 关于 中复制 API Token 后再点“刷新”。"
        ));
        return;
    }

    setBusy(true, "refresh");
    try {
        const result = await postJSON(settings.kernelURL, "/api/notebook/lsNotebooks", {flashcard: false}, settings.apiToken);
        const notebooks = (result.data?.notebooks || []).filter((item) => !item.closed);
        setNotebookOptions(notebooks);
        if (!notebooks.length) {
            setStatus(createStatus(
                "warning",
                "没有可用的打开笔记本",
                "SourceFlow 已连通，但当前没有处于打开状态的笔记本可供保存。",
                "先在 SourceFlow 中打开至少一个笔记本，再回到扩展点“刷新”。"
            ));
            return;
        }
        setStatus(createStatus(
            "success",
            "笔记本列表已刷新",
            `已获取到 ${notebooks.length} 个可用笔记本。`,
            "选择目标笔记本后即可把网页加入后台保存队列。"
        ));
    } catch (error) {
        setNotebookOptions([]);
        setStatus(normalizePopupError(error, "notebook", settings.kernelURL));
    } finally {
        setBusy(false);
    }
}

async function refreshCollectJobs() {
    try {
        const response = await chrome.runtime.sendMessage({type: "list-collect-jobs"});
        if (!response?.ok) {
            throw response?.error || createStatus("error", "读取后台任务失败", "扩展没有返回任务列表。");
        }
        renderCollectJobs(Array.isArray(response.data) ? response.data : []);
    } catch (_error) {
        renderCollectJobs([]);
    }
}

function setNotebookOptions(notebooks) {
    const select = document.getElementById("notebook");
    const currentValue = select.value || "";
    const savedValue = currentValue || select.dataset.savedValue || "";
    select.innerHTML = "";
    notebooks.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.name;
        select.appendChild(option);
    });
    const nextValue = notebooks.find((item) => item.id === savedValue)?.id || notebooks[0]?.id || "";
    select.value = nextValue;
    select.dataset.savedValue = nextValue;
}

async function collectCurrentPage() {
    const settings = readFormSettings();
    if (!state.tab?.url || !/^https?:\/\//i.test(state.tab.url)) {
        setStatus(createUnsupportedPageStatus(state.tab?.url || ""));
        return;
    }
    if (!settings.apiToken) {
        setStatus(createStatus(
            "error",
            "缺少 API Token",
            "还没有填写 API Token，扩展无法把网页保存到 SourceFlow。",
            "在 SourceFlow 的 设置 -> 关于 中复制 API Token 后再试。"
        ));
        return;
    }
    if (!settings.notebook) {
        setStatus(createStatus(
            "error",
            "未选择目标笔记本",
            "当前还没有指定要保存到哪个笔记本。",
            "先点击“刷新”获取笔记本列表，再选择目标笔记本。"
        ));
        return;
    }

    await chrome.storage.local.set(settings);
    setBusy(true, "collect");
    setStatus(createStatus(
        "info",
        "正在创建后台任务",
        "扩展正在把当前网页加入后台保存队列。",
        "这一步完成后，你可以直接关闭弹窗，保存会继续进行。"
    ));

    try {
        const response = await chrome.runtime.sendMessage({
            type: "enqueue-collect-job",
            payload: {
                ...settings,
                tabId: state.tab?.id || null,
            },
        });
        if (!response?.ok) {
            throw response?.error || createStatus("error", "后台任务创建失败", "扩展没有返回成功结果。");
        }

        const result = response.data || {};
        if (result.alreadyQueued) {
            setStatus(createStatus(
                "warning",
                "当前页面已有后台任务",
                "这个网页已经在后台保存队列中，无需重复提交。",
                "你可以关闭弹窗，稍后重新打开查看任务状态。",
                result.job?.meta || ""
            ));
        } else {
            setStatus(createStatus(
                "success",
                "已加入后台保存队列",
                "当前网页已经转入后台保存，关闭弹窗后仍会继续执行。",
                "现在可以切换到其他网页继续保存，扩展支持多个页面并发处理。",
                result.job?.meta || ""
            ));
        }
        await refreshCollectJobs();
    } catch (error) {
        setStatus(normalizePopupError(error, "collect", settings.kernelURL));
    } finally {
        setBusy(false);
    }
}

function readFormSettings() {
    return {
        kernelURL: document.getElementById("kernelURL").value.trim() || DEFAULT_SETTINGS.kernelURL,
        apiToken: document.getElementById("apiToken").value.trim(),
        notebook: document.getElementById("notebook").value,
        pathPrefix: document.getElementById("pathPrefix").value.trim() || DEFAULT_SETTINGS.pathPrefix,
    };
}

function setStatus(status) {
    const normalized = status && typeof status === "object"
        ? {...STATUS_EMPTY, ...status}
        : {...STATUS_EMPTY, detail: String(status || "")};
    const element = document.getElementById("status");
    const title = document.getElementById("statusTitle");
    const detail = document.getElementById("statusDetail");
    const hint = document.getElementById("statusHint");
    const meta = document.getElementById("statusMeta");

    const isEmpty = !normalized.title && !normalized.detail && !normalized.hint && !normalized.meta;
    element.hidden = isEmpty;
    element.className = `status ${normalized.type || ""}`.trim();

    title.hidden = !normalized.title;
    detail.hidden = !normalized.detail;
    hint.hidden = !normalized.hint;
    meta.hidden = !normalized.meta;

    title.textContent = normalized.title;
    detail.textContent = normalized.detail;
    hint.textContent = normalized.hint;
    meta.textContent = normalized.meta;
}

function setBusy(isBusy, action = "collect") {
    document.querySelectorAll("input, select, button").forEach((element) => {
        element.disabled = isBusy;
    });
    document.getElementById("refreshNotebooks").textContent = isBusy && action === "refresh" ? BUTTON_LABELS.refreshing : BUTTON_LABELS.refresh;
    document.getElementById("collectPage").textContent = isBusy && action === "collect" ? BUTTON_LABELS.collecting : BUTTON_LABELS.collect;
}

function renderCollectJobs(jobs) {
    const container = document.getElementById("jobList");
    container.innerHTML = "";

    const visibleJobs = jobs.slice(0, 5);
    if (visibleJobs.length === 0) {
        const empty = document.createElement("div");
        empty.className = "job-card empty";
        empty.textContent = "暂无后台任务";
        container.appendChild(empty);
        return;
    }

    visibleJobs.forEach((job) => {
        const card = document.createElement("article");
        card.className = `job-card ${job.statusType || "info"}`.trim();

        const title = document.createElement("p");
        title.className = "job-title";
        title.textContent = job.title || job.url || "网页导入";
        card.appendChild(title);

        if (job.detail) {
            const detail = document.createElement("p");
            detail.className = "job-detail";
            detail.textContent = job.detail;
            card.appendChild(detail);
        }

        if (job.hint) {
            const hint = document.createElement("p");
            hint.className = "job-hint";
            hint.textContent = job.hint;
            card.appendChild(hint);
        }

        if (job.meta) {
            const meta = document.createElement("p");
            meta.className = "job-meta";
            meta.textContent = job.meta;
            card.appendChild(meta);
        }

        const updatedAt = formatRelativeTime(job.updatedAt || job.createdAt);
        if (updatedAt) {
            const time = document.createElement("p");
            time.className = "job-time";
            time.textContent = updatedAt;
            card.appendChild(time);
        }

        container.appendChild(card);
    });
}

async function postJSON(kernelURL, pathname, body, apiToken) {
    let response;
    try {
        response = await fetch(`${kernelURL.replace(/\/+$/, "")}${pathname}`, {
            method: "POST",
            headers: {
                Authorization: `Token ${apiToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });
    } catch (_error) {
        throw createStatus(
            "error",
            "无法连接 SourceFlow 内核",
            `扩展无法访问内核地址 ${kernelURL.replace(/\/+$/, "")}。`,
            "确认 SourceFlow 已启动，内核地址填写正确，并且浏览器能访问这个地址。"
        );
    }

    const rawText = await response.text();
    let result = {};
    if (rawText) {
        try {
            result = JSON.parse(rawText);
        } catch (_error) {
            throw mapKernelHTTPStatusToStatus(response.status, kernelURL, rawText.trim());
        }
    }

    if (!response.ok || result.code !== 0) {
        throw mapKernelHTTPStatusToStatus(response.status, kernelURL, result.msg || "");
    }
    return result;
}

function createStatus(type, title, detail, hint = "", meta = "") {
    return {type, title, detail, hint, meta};
}

function createUnsupportedPageStatus(url) {
    let scheme = "";
    try {
        scheme = new URL(url).protocol.replace(":", "");
    } catch (_error) {
        scheme = "";
    }
    return createStatus(
        "error",
        "当前页面不支持保存",
        "浏览器扩展目前只能保存普通的 http/https 网页，不能直接保存系统页、扩展页、新标签页或受限页面。",
        "请切换到需要保存的网页正文页后再试。",
        scheme ? `当前页面协议：${scheme}://` : ""
    );
}

function normalizePopupError(error, context, kernelURL) {
    if (error && typeof error === "object" && ("title" in error || "detail" in error)) {
        return {...STATUS_EMPTY, ...error, type: error.type || "error"};
    }

    const message = error instanceof Error ? error.message : String(error || "");
    if (/api token/i.test(message)) {
        return createStatus(
            "error",
            "API Token 无效或已失效",
            "SourceFlow 内核拒绝了当前请求，通常是 Token 错误、过期，或复制时夹带了空格。",
            "回到 SourceFlow 的 设置 -> 关于 重新复制 API Token，再试一次。"
        );
    }
    if (/当前页面不支持保存|页面不允许扩展读取/i.test(message)) {
        return createUnsupportedPageStatus(state.tab?.url || "");
    }
    if (/failed to fetch|networkerror/i.test(message)) {
        return createStatus(
            "error",
            "无法连接 SourceFlow 内核",
            `扩展无法访问内核地址 ${kernelURL.replace(/\/+$/, "")}。`,
            "确认 SourceFlow 已启动，内核地址正确，并且没有被本机代理或防火墙拦截。"
        );
    }

    return createStatus(
        "error",
        context === "notebook" ? "获取笔记本失败" : "后台保存失败",
        message || "出现未预期错误，当前操作没有成功完成。",
        "请刷新网页和扩展后重试；如果持续失败，再检查内核地址和 API Token。"
    );
}

function mapKernelHTTPStatusToStatus(status, kernelURL, message) {
    if (status === 401 || status === 403) {
        return createStatus(
            "error",
            "API Token 无效或已失效",
            "SourceFlow 内核拒绝了当前请求，通常是 Token 错误、过期，或复制时夹带了空格。",
            "回到 SourceFlow 的 设置 -> 关于 重新复制 API Token，再点一次刷新或保存。"
        );
    }
    if (status === 404) {
        return createStatus(
            "error",
            "内核地址不正确",
            `当前地址 ${kernelURL.replace(/\/+$/, "")} 不是可用的 SourceFlow 内核接口。`,
            "确认地址通常是 `http://127.0.0.1:6806`，不要填成前端网页地址或其他服务端口。"
        );
    }
    if (status >= 500) {
        return createStatus(
            "error",
            "内核处理失败",
            message || "SourceFlow 内核在处理请求时返回了服务器错误。",
            "稍后重试；如果持续失败，请检查 SourceFlow 日志。"
        );
    }
    return createStatus(
        "error",
        "请求失败",
        message || `SourceFlow 内核返回了 HTTP ${status}。`,
        "检查内核地址和 API Token 是否正确，然后重试。"
    );
}

function formatRelativeTime(value) {
    const timestamp = Date.parse(value || "");
    if (!timestamp) {
        return "";
    }
    const diff = Date.now() - timestamp;
    if (diff < 10 * 1000) {
        return "刚刚更新";
    }
    if (diff < 60 * 1000) {
        return `${Math.max(1, Math.round(diff / 1000))} 秒前更新`;
    }
    if (diff < 60 * 60 * 1000) {
        return `${Math.round(diff / 60000)} 分钟前更新`;
    }
    return new Date(timestamp).toLocaleString("zh-CN", {
        hour12: false,
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}
