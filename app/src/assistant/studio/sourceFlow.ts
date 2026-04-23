import type {App} from "../../index";
import {Dialog} from "../../dialog";
import {showMessage} from "../../dialog/message";
import {assistantText} from "../constants";
import {escapeAttr, escapeHTML, truncateText} from "../common/dom";
import {
    appendMarkdownToCurrentNote,
    getAssistantNoteContextByRootID,
    getCurrentNoteContext,
    searchAssistantNoteCandidates
} from "../common/note";
import {getAssistantAIDefaultProfile, IAssistantAIInputAttachment, streamAssistantAI} from "../ai/api";
import {saveAssistantInboxItem} from "../inbox/store";

type TAssistantStudioGoal = "summary" | "outline" | "qa" | "flashcards" | "custom";
type TAssistantStudioSourceType = "note" | "file" | "text" | "image";

interface IAssistantStudioSource {
    id: string;
    type: TAssistantStudioSourceType;
    title: string;
    subtitle: string;
    content: string;
    attachment?: IAssistantAIInputAttachment;
}

interface IAssistantStudioState {
    goal: TAssistantStudioGoal;
    customPrompt: string;
    noteSearchKeyword: string;
    noteSearchResults: Array<{
        rootID: string;
        title: string;
        path: string;
    }>;
    noteSearchLoading: boolean;
    textSourceTitle: string;
    textSourceContent: string;
    sources: IAssistantStudioSource[];
    saving: boolean;
    insertReference: boolean;
    streamPreview: string;
}

interface IOpenAssistantSourceStudioOptions {
    goal?: TAssistantStudioGoal;
    openFilePicker?: boolean;
    autoGenerateAfterUpload?: boolean;
    initialFiles?: File[];
}

const loadAssistantResultsModule = () => import("../results/ResultsDock");

const MAX_SOURCE_CHARS = 48000;
const MAX_SOURCE_CHARS_PER_ITEM = 12000;
const TEXT_FILE_EXTENSIONS = new Set([
    "txt", "md", "markdown", "json", "js", "jsx", "ts", "tsx", "css", "scss", "less", "html", "htm", "xml",
    "svg", "csv", "yaml", "yml", "toml", "ini", "conf", "go", "py", "java", "kt", "rs", "sql", "sh", "bat",
    "ps1", "php", "rb", "c", "cc", "cpp", "h", "hpp", "swift", "vue", "svelte", "log"
]);

const sourceText = (zh: string, en: string) => {
    return assistantText(zh, en);
};

const studioGoalOptions: Array<{ id: TAssistantStudioGoal, label: string, kind: string }> = [{
    id: "summary",
    label: sourceText("总结", "Summary"),
    kind: "source-summary",
}, {
    id: "outline",
    label: sourceText("提纲", "Outline"),
    kind: "source-outline",
}, {
    id: "qa",
    label: sourceText("问答", "Q&A"),
    kind: "source-qa",
}, {
    id: "flashcards",
    label: sourceText("卡片", "Flashcards"),
    kind: "source-flashcards",
}, {
    id: "custom",
    label: sourceText("自定义", "Custom"),
    kind: "source-custom",
}];

const findStudioGoal = (goal: TAssistantStudioGoal) => {
    return studioGoalOptions.find((item) => item.id === goal) || studioGoalOptions[0];
};

const studioGoalPrompt = (goal: TAssistantStudioGoal, customPrompt: string) => {
    switch (goal) {
        case "summary":
            return sourceText(
                "请只基于这些来源，输出一份结构清晰的 Markdown 总结。要求：1. 先给结论；2. 再列关键要点；3. 补充待确认信息；4. 最后给可执行下一步。不要编造来源中没有的事实。",
                "Using only these sources, produce a well-structured Markdown summary. Requirements: 1. conclusion first 2. key points 3. missing or uncertain information 4. actionable next steps. Do not invent facts not present in the sources."
            );
        case "outline":
            return sourceText(
                "请只基于这些来源，输出一份结构清晰的 Markdown 提纲。标题短、层级清楚、尽量可直接用于继续写作。",
                "Using only these sources, produce a clear Markdown outline. Keep headings concise, hierarchy clean, and the result ready for continued writing."
            );
        case "qa":
            return sourceText(
                "请只基于这些来源，生成 4-8 组适合复习的 Markdown 问答。直接输出结果，不要解释。",
                "Using only these sources, generate 4-8 Markdown Q&A pairs for review. Return only the result with no extra explanation."
            );
        case "flashcards":
            return sourceText(
                "请只基于这些来源，生成 5-10 张 Markdown 复习卡片。直接输出结果，不要解释。",
                "Using only these sources, generate 5-10 Markdown study flashcards. Return only the result with no extra explanation."
            );
        case "custom":
            return `${customPrompt || ""}`.trim();
        default:
            return "";
    }
};

const normalizeSourceContent = (value: string) => {
    return `${value || ""}`.split("\u0000").join("").trim();
};

const clampSourceContent = (value: string, max = MAX_SOURCE_CHARS_PER_ITEM) => {
    const normalized = normalizeSourceContent(value);
    if (normalized.length <= max) {
        return normalized;
    }
    return `${normalized.slice(0, max)}\n\n${sourceText("（后续内容已截断）", "(Remaining content truncated)")}`;
};

const getFileExtension = (name: string) => {
    const segments = `${name || ""}`.split(".");
    return segments.length > 1 ? segments[segments.length - 1].toLowerCase() : "";
};

const buildAssistantSourcePrompt = (state: IAssistantStudioState) => {
    const prompt = studioGoalPrompt(state.goal, state.customPrompt);
    const textSources = state.sources.filter((item) => !item.attachment);
    const imageSources = state.sources.filter((item) => !!item.attachment);
    const sourceBlocks = textSources.map((item, index) => {
        const content = clampSourceContent(item.content);
        return [
            `[${index + 1}] ${item.title}`,
            item.subtitle ? `Path: ${item.subtitle}` : "",
            "Content:",
            content,
        ].filter(Boolean).join("\n");
    });
    const imageBlock = imageSources.length ? [
        sourceText("另外已附带这些图片来源，请结合图片内容一起分析：", "The following image sources are also attached. Use their visual content in the analysis:"),
        "",
        ...imageSources.map((item, index) => `- [${sourceText("图片", "Image")} ${index + 1}] ${item.title}${item.subtitle ? ` · ${item.subtitle}` : ""}`),
    ].join("\n") : "";
    return [
        prompt,
        sourceBlocks.length ? `${sourceText("来源材料如下：", "Source materials:")}\n\n${sourceBlocks.join("\n\n")}` : "",
        imageBlock,
        sourceText("输出要求：请直接输出 Markdown 正文，不要额外寒暄。", "Output requirement: return only the Markdown result with no extra preamble."),
    ].filter(Boolean).join("\n\n");
};

const appendAssistantSourceReferences = (markdown: string, sources: IAssistantStudioSource[]) => {
    const normalized = `${markdown || ""}`.trim();
    if (!normalized) {
        return normalized;
    }
    if (normalized.includes("## " + sourceText("来源", "Sources"))) {
        return normalized;
    }
    const lines = [normalized, "", `## ${sourceText("来源", "Sources")}`, ""];
    sources.forEach((item) => {
        const kindLabel = item.type === "image"
            ? sourceText("图片", "Image")
            : (item.type === "note"
                ? sourceText("笔记", "Note")
                : (item.type === "text" ? sourceText("文本", "Text") : sourceText("文件", "File")));
        lines.push(`- ${kindLabel} · ${item.title}${item.subtitle ? ` · ${item.subtitle}` : ""}`);
    });
    return lines.join("\n").trim();
};

const buildStudioResultTitle = (state: IAssistantStudioState) => {
    const goal = findStudioGoal(state.goal);
    const firstSource = state.sources[0];
    const suffix = firstSource ? truncateText(firstSource.title, 36) : sourceText("未命名来源", "Untitled source");
    return `${goal.label} · ${suffix}`;
};

const buildReferenceMarkdown = (id: string, title: string) => {
    return `- ((${id} '${`${title || ""}`.replace(/'/g, " ")}'))`;
};

const openAssistantResultsPanel = async () => {
    const {openAssistantResultsDock} = await loadAssistantResultsModule();
    openAssistantResultsDock();
};

const ensureAssistantDefaultProfile = async () => {
    return getAssistantAIDefaultProfile();
};

const readAssistantAIImageFile = (file: File) => {
    return new Promise<IAssistantAIInputAttachment>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataURL = `${reader.result || ""}`;
            const commaIndex = dataURL.indexOf(",");
            resolve({
                id: `source-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                name: file.name || "image",
                mimeType: file.type || "image/png",
                data: commaIndex > -1 ? dataURL.slice(commaIndex + 1) : dataURL,
            });
        };
        reader.onerror = () => {
            reject(reader.error || new Error(sourceText("读取图片失败", "Failed to read the image")));
        };
        reader.readAsDataURL(file);
    });
};

const getAssistantAIAttachmentDataURL = (attachment: IAssistantAIInputAttachment) => {
    return `data:${attachment.mimeType};base64,${attachment.data}`;
};

const getSourceFilesFromDataTransfer = (dataTransfer: DataTransfer | null | undefined) => {
    if (!dataTransfer?.files?.length) {
        return [] as File[];
    }
    return Array.from(dataTransfer.files);
};

const readPDFFileAsText = async (file: File) => {
    if (!window.pdfjsLib?.getDocument) {
        throw new Error(sourceText("PDF 解析组件尚未加载完成，请稍后再试", "PDF parsing is not ready yet. Please try again later."));
    }
    const buffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({data: buffer}).promise;
    const chunks: string[] = [];
    const maxPages = Math.min(pdf.numPages, 40);
    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const pageText = (textContent.items || []).map((item: { str?: string }) => `${item?.str || ""}`.trim()).filter(Boolean).join(" ");
        if (pageText) {
            chunks.push(`## ${sourceText("第", "Page ")}${pageNumber}${sourceText("页", "")}\n\n${pageText}`);
        }
    }
    return chunks.join("\n\n").trim();
};

const readSourceFile = async (file: File): Promise<IAssistantStudioSource | null> => {
    const extension = getFileExtension(file.name);
    const title = file.name || sourceText("未命名文件", "Untitled file");
    const subtitle = sourceText("本地文件", "Local file");
    if (file.type.startsWith("image/")) {
        const attachment = await readAssistantAIImageFile(file);
        return {
            id: `image:${file.name}:${file.size}:${file.lastModified}`,
            type: "image",
            title,
            subtitle,
            content: "",
            attachment,
        };
    }
    if (extension === "pdf" || file.type === "application/pdf") {
        const content = await readPDFFileAsText(file);
        if (!content) {
            throw new Error(sourceText(`没有从 ${title} 提取到可用文本`, `No usable text could be extracted from ${title}`));
        }
        return {
            id: `file:${file.name}:${file.size}:${file.lastModified}`,
            type: "file",
            title,
            subtitle,
            content,
        };
    }
    if (TEXT_FILE_EXTENSIONS.has(extension) || file.type.startsWith("text/") || /json|xml|javascript|typescript/.test(file.type)) {
        const content = normalizeSourceContent(await file.text());
        if (!content) {
            throw new Error(sourceText(`文件 ${title} 为空`, `File ${title} is empty`));
        }
        return {
            id: `file:${file.name}:${file.size}:${file.lastModified}`,
            type: "file",
            title,
            subtitle,
            content,
        };
    }
    throw new Error(sourceText(
        `暂时只支持图片、文本、代码、Markdown、HTML、JSON、CSV、YAML、SVG 和 PDF 文件：${title}`,
        `Only images, text, code, Markdown, HTML, JSON, CSV, YAML, SVG, and PDF files are supported for now: ${title}`
    ));
};

const createStudioState = (): IAssistantStudioState => ({
    goal: "summary",
    customPrompt: "",
    noteSearchKeyword: "",
    noteSearchResults: [],
    noteSearchLoading: false,
    textSourceTitle: "",
    textSourceContent: "",
    sources: [],
    saving: false,
    insertReference: true,
    streamPreview: "",
});

const renderStudio = (state: IAssistantStudioState) => {
    const visibleSources = state.sources;
    return `<div class="assistant-studio fn__flex-column">
        <div class="assistant-studio__intro">
        <div class="assistant-studio__title">${escapeHTML(sourceText("来源创作", "Source Studio"))}</div>
        <div class="assistant-studio__summary">${escapeHTML(sourceText("把当前笔记、搜索到的笔记、粘贴文本或本地文件/图片组合成来源，一次生成总结、提纲、问答或卡片。", "Combine the current note, searched notes, pasted text, or local files/images into sources and generate a summary, outline, Q&A, or flashcards in one pass."))}</div>
    </div>
    <div class="assistant-studio__section">
        <div class="assistant-studio__label">${escapeHTML(sourceText("输出类型", "Output type"))}</div>
        <div class="assistant-studio__goal-row">
            ${studioGoalOptions.map((item) => `<button class="assistant-studio__goal${state.goal === item.id ? " assistant-studio__goal--active" : ""}" type="button" data-action="set-goal" data-goal="${escapeAttr(item.id)}"${state.saving ? " disabled" : ""}>${escapeHTML(item.label)}</button>`).join("")}
        </div>
        ${state.goal === "custom" ? `<textarea class="b3-text-field assistant-studio__textarea" data-role="custom-prompt" placeholder="${escapeAttr(sourceText("描述你想基于这些来源完成什么创作或分析", "Describe what you want to create or analyze from these sources"))}"${state.saving ? " disabled" : ""}>${escapeHTML(state.customPrompt)}</textarea>` : ""}
    </div>
    <div class="assistant-studio__section">
        <div class="assistant-studio__label">${escapeHTML(sourceText("添加来源", "Add sources"))}</div>
        <div class="assistant-studio__toolbar">
            <button class="b3-button b3-button--outline" type="button" data-action="add-current-note"${state.saving ? " disabled" : ""}>${escapeHTML(sourceText("当前笔记", "Current note"))}</button>
            <label class="b3-button b3-button--outline assistant-studio__upload${state.saving ? " assistant-studio__upload--disabled" : ""}">
                <input class="fn__none" type="file" multiple data-role="upload-file"${state.saving ? " disabled" : ""}>
                ${escapeHTML(sourceText("上传文件/图片", "Upload files/images"))}
            </label>
        </div>
        <div class="assistant-studio__hint">${escapeHTML(sourceText("支持上传、拖拽或直接粘贴截图/文件。", "You can upload, drag files in, or paste screenshots/files directly."))}</div>
        <div class="assistant-studio__search">
            <input class="b3-text-field b3-text-field--text" data-role="note-search" placeholder="${escapeAttr(sourceText("搜索并添加笔记来源", "Search and add note sources"))}" value="${escapeAttr(state.noteSearchKeyword)}"${state.saving ? " disabled" : ""}>
            ${state.noteSearchLoading ? `<div class="assistant-studio__hint">${escapeHTML(sourceText("正在搜索笔记...", "Searching notes..."))}</div>` : ""}
            ${state.noteSearchResults.length ? `<div class="assistant-studio__search-results">${state.noteSearchResults.map((item) => `<button class="assistant-studio__search-item" type="button" data-action="add-search-note" data-root-id="${escapeAttr(item.rootID)}"${state.saving ? " disabled" : ""}>
                <span class="assistant-studio__search-title">${escapeHTML(item.title)}</span>
                <span class="assistant-studio__search-path">${escapeHTML(item.path)}</span>
            </button>`).join("")}</div>` : ""}
        </div>
        <div class="assistant-studio__text-source">
            <input class="b3-text-field b3-text-field--text" data-role="text-title" placeholder="${escapeAttr(sourceText("粘贴文本标题，可选", "Optional pasted-text title"))}" value="${escapeAttr(state.textSourceTitle)}"${state.saving ? " disabled" : ""}>
            <textarea class="b3-text-field assistant-studio__textarea" data-role="text-content" placeholder="${escapeAttr(sourceText("粘贴任意文字、摘录或代码片段，然后点“加入来源”", "Paste any text, excerpt, or code snippet here, then click Add Source"))}"${state.saving ? " disabled" : ""}>${escapeHTML(state.textSourceContent)}</textarea>
            <div class="assistant-studio__toolbar">
                <button class="b3-button b3-button--outline" type="button" data-action="add-text-source"${state.saving ? " disabled" : ""}>${escapeHTML(sourceText("加入来源", "Add source"))}</button>
            </div>
        </div>
    </div>
    <div class="assistant-studio__section assistant-studio__section--grow">
        <div class="assistant-studio__label">${escapeHTML(sourceText("已选来源", "Selected sources"))}</div>
        <div class="assistant-studio__sources">${visibleSources.length ? visibleSources.map((item) => `<div class="assistant-studio__source">
            ${item.attachment ? `<div class="assistant-studio__source-thumb"><img class="assistant-studio__source-image" alt="${escapeAttr(item.title)}" src="${escapeAttr(getAssistantAIAttachmentDataURL(item.attachment))}"></div>` : ""}
            <div class="assistant-studio__source-main">
                <div class="assistant-studio__source-title">${escapeHTML(item.title)}</div>
                <div class="assistant-studio__source-meta">${escapeHTML(item.subtitle || sourceText("来源", "Source"))}${item.type === "image" ? ` · ${escapeHTML(sourceText("图片来源", "Image source"))}` : ""}</div>
                <div class="assistant-studio__source-preview">${escapeHTML(item.attachment ? sourceText("将作为原生图片来源直接发送给 AI。", "Will be sent to the AI as a native image source.") : truncateText(item.content.replace(/\s+/g, " "), 180))}</div>
            </div>
            <button class="assistant-studio__source-remove" type="button" data-action="remove-source" data-source-id="${escapeAttr(item.id)}"${state.saving ? " disabled" : ""}>${escapeHTML(sourceText("移除", "Remove"))}</button>
        </div>`).join("") : `<div class="assistant-studio__empty">${escapeHTML(sourceText("还没有来源。先加入当前笔记、搜索笔记、粘贴文本或上传文件/图片。", "No sources yet. Start with the current note, searched notes, pasted text, or uploaded files/images."))}</div>`}</div>
    </div>
    ${(state.saving || state.streamPreview.trim()) ? `<div class="assistant-studio__section">
        <div class="assistant-studio__label">${escapeHTML(sourceText("生成预览", "Live preview"))}</div>
        <div class="assistant-studio__stream-preview" data-role="stream-preview">${escapeHTML(state.streamPreview.trim() || sourceText("正在整理来源并生成结果...", "Processing the sources and generating the result..."))}</div>
    </div>` : ""}
    <div class="assistant-studio__footer">
        <label class="fn__flex assistant-studio__checkbox">
            <input type="checkbox" data-role="insert-reference"${state.insertReference ? " checked" : ""}${state.saving ? " disabled" : ""}>
            <span>${escapeHTML(sourceText("保存后在当前笔记插入成果引用", "Insert a result reference into the current note after saving"))}</span>
        </label>
        <div class="assistant-studio__footer-actions">
            <button class="b3-button b3-button--outline" type="button" data-action="clear-sources"${(state.saving || !visibleSources.length) ? " disabled" : ""}>${escapeHTML(sourceText("清空来源", "Clear sources"))}</button>
            <button class="b3-button b3-button--text" type="button" data-action="generate"${(state.saving || !visibleSources.length) ? " disabled" : ""}>${escapeHTML(state.saving ? sourceText("生成中...", "Generating...") : sourceText("生成并保存到成果", "Generate & Save to Results"))}</button>
        </div>
    </div>
</div>`;
};

const mergeSourceContent = (sources: IAssistantStudioSource[]) => {
    const merged: IAssistantStudioSource[] = [];
    let total = 0;
    sources.forEach((item) => {
        if (item.attachment) {
            merged.push({
                ...item,
                content: "",
            });
            return;
        }
        const content = clampSourceContent(item.content, MAX_SOURCE_CHARS_PER_ITEM);
        if (!content) {
            return;
        }
        if (total >= MAX_SOURCE_CHARS) {
            return;
        }
        const remaining = MAX_SOURCE_CHARS - total;
        const clipped = content.length > remaining ? `${content.slice(0, remaining)}\n\n${sourceText("（总长度已截断）", "(Total length truncated)")}` : content;
        total += clipped.length;
        merged.push({
            ...item,
            content: clipped,
        });
    });
    return merged;
};

export const openAssistantSourceStudio = (app?: App, options: IOpenAssistantSourceStudioOptions = {}) => {
    const state = createStudioState();
    if (options.goal) {
        state.goal = options.goal;
    }
    let dialog: Dialog | null = null;
    let searchTimer = 0;
    let shouldOpenFilePicker = !!options.openFilePicker;
    let shouldAutoGenerateAfterUpload = !!options.autoGenerateAfterUpload;

    const render = () => {
        const body = dialog?.element.querySelector(".b3-dialog__body") as HTMLElement;
        if (!body) {
            return;
        }
        body.innerHTML = renderStudio(state);
        if (shouldOpenFilePicker) {
            shouldOpenFilePicker = false;
            window.setTimeout(() => {
                const input = dialog?.element.querySelector("[data-role='upload-file']") as HTMLInputElement;
                input?.click();
            }, 60);
        }
    };

    const updateStreamPreview = () => {
        const preview = dialog?.element.querySelector("[data-role='stream-preview']") as HTMLElement;
        if (!preview) {
            render();
            return;
        }
        preview.textContent = state.streamPreview.trim() || sourceText("正在整理来源并生成结果...", "Processing the sources and generating the result...");
    };

    const setStudioDropActive = (active: boolean) => {
        const root = dialog?.element.querySelector(".assistant-studio") as HTMLElement;
        root?.classList.toggle("assistant-studio--drop", active);
    };

    const addSource = (source: IAssistantStudioSource) => {
        if (state.sources.find((item) => item.id === source.id)) {
            showMessage(sourceText("这个来源已经添加过了", "This source has already been added"), 3000);
            return;
        }
        state.sources = [...state.sources, source];
        render();
    };

    const handleUploadedFiles = async (files: File[]) => {
        if (!files.length) {
            return;
        }
        state.saving = true;
        render();
        try {
            const results = await Promise.allSettled(files.map((file) => readSourceFile(file)));
            let failed = 0;
            let added = 0;
            results.forEach((result) => {
                if (result.status === "fulfilled" && result.value) {
                    addSource(result.value);
                    added += 1;
                    return;
                }
                failed += 1;
                if (result.status === "rejected") {
                    showMessage(result.reason instanceof Error ? result.reason.message : String(result.reason), 5000, "error");
                }
            });
            if (failed > 0 && failed < results.length) {
                showMessage(sourceText("部分来源已加入，失败项已跳过", "Some sources were added and failed items were skipped"), 3200);
            }
            if (added > 0 && shouldAutoGenerateAfterUpload && state.goal !== "custom") {
                shouldAutoGenerateAfterUpload = false;
                window.setTimeout(() => {
                    void generate();
                }, 30);
            }
        } finally {
            state.saving = false;
            render();
        }
    };

    const refreshSearchResults = async () => {
        const keyword = state.noteSearchKeyword.trim();
        if (!keyword) {
            state.noteSearchResults = [];
            state.noteSearchLoading = false;
            render();
            return;
        }
        state.noteSearchLoading = true;
        render();
        const results = await searchAssistantNoteCandidates(keyword, 8);
        state.noteSearchResults = results.map((item) => ({
            rootID: item.rootID,
            title: item.title,
            path: item.path,
        }));
        state.noteSearchLoading = false;
        render();
    };

    const generate = async () => {
        const prompt = studioGoalPrompt(state.goal, state.customPrompt);
        if (!prompt.trim()) {
            showMessage(sourceText("请先填写自定义需求", "Please describe the custom request first"), 4000, "error");
            return;
        }
        const profile = await ensureAssistantDefaultProfile();
        if (!profile) {
            showMessage(sourceText("请先配置至少一个 AI 模型", "Configure at least one AI profile first"), 5000, "error");
            return;
        }
        const mergedSources = mergeSourceContent(state.sources);
        if (!mergedSources.length) {
            showMessage(sourceText("请先至少添加一个可用来源", "Add at least one usable source first"), 4000, "error");
            return;
        }
        state.saving = true;
        state.streamPreview = "";
        render();
        try {
            const goal = findStudioGoal(state.goal);
            const title = buildStudioResultTitle(state);
            let partialReply = "";
            let previewTimer = 0;
            const flushStreamPreview = () => {
                previewTimer = 0;
                state.streamPreview = partialReply;
                updateStreamPreview();
            };
            const attachments = mergedSources.filter((item) => !!item.attachment).map((item) => item.attachment as IAssistantAIInputAttachment);
            const result = await streamAssistantAI({
                profileId: profile.id,
                mode: "chat",
                title,
                message: buildAssistantSourcePrompt({...state, sources: mergedSources}),
                system: sourceText(
                    "你是 SourceFlow 里的来源整理助手。请严格基于给定来源输出，不要编造来源中不存在的事实。",
                    "You are a source synthesis assistant inside SourceFlow. Stay strictly grounded in the provided sources and do not invent facts."
                ),
                enableTools: false,
                attachments,
            }, {
                onDelta: (delta) => {
                    partialReply += delta;
                    if (!previewTimer) {
                        previewTimer = window.setTimeout(flushStreamPreview, 48);
                    }
                },
            });
            if (previewTimer) {
                window.clearTimeout(previewTimer);
                flushStreamPreview();
            }
            const reply = [...result.messages].reverse().find((item) => item.role === "assistant")?.content?.trim() || "";
            if (!reply) {
                showMessage(sourceText("AI 没有返回可用结果", "The AI did not return a usable result"), 4000, "error");
                return;
            }
            state.streamPreview = reply;
            const markdown = appendAssistantSourceReferences(reply, mergedSources);
            const savedID = await saveAssistantInboxItem({
                app,
                title,
                content: markdown,
                kind: goal.kind,
                query: mergedSources.map((item) => item.title).join(" + "),
                sourceTitle: mergedSources[0]?.title || "",
                sourcePath: mergedSources.map((item) => item.subtitle).filter(Boolean).slice(0, 3).join(" | "),
                goal: goal.label,
                nextStep: sourceText("回到成果侧栏继续查看、插入引用或整理进正式笔记。", "Return to the results sidebar to review, insert a reference, or move it into a note."),
            });
            if (!savedID) {
                return;
            }
            if (state.insertReference) {
                await appendMarkdownToCurrentNote(buildReferenceMarkdown(savedID, title));
            }
            await openAssistantResultsPanel();
            dialog?.destroy();
        } catch (error) {
            showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
        } finally {
            state.saving = false;
            render();
        }
    };

    dialog = new Dialog({
        title: sourceText("来源创作", "Source Studio"),
        width: "860px",
        height: "82vh",
        content: `<div class="assistant-studio__mount"></div>`,
    });
    render();
    if (options.initialFiles?.length) {
        window.setTimeout(() => {
            void handleUploadedFiles(options.initialFiles || []);
        }, 30);
    }
    dialog.element.addEventListener("click", (event) => {
        let target = event.target as HTMLElement;
        while (target && !target.isEqualNode(dialog.element)) {
            const action = target.getAttribute("data-action");
            if (!action) {
                target = target.parentElement;
                continue;
            }
            if (action === "set-goal") {
                state.goal = (target.getAttribute("data-goal") || "summary") as TAssistantStudioGoal;
                render();
                event.preventDefault();
                return;
            }
            if (action === "add-current-note") {
                void getCurrentNoteContext().then((context) => {
                    if (!context) {
                        showMessage(sourceText("当前没有可读取的笔记", "No readable current note is available"), 4000, "error");
                        return;
                    }
                    addSource({
                        id: `note:${context.rootID}`,
                        type: "note",
                        title: context.title || sourceText("当前笔记", "Current note"),
                        subtitle: context.path || sourceText("当前笔记", "Current note"),
                        content: context.markdown,
                    });
                });
                event.preventDefault();
                return;
            }
            if (action === "add-search-note") {
                const rootID = target.getAttribute("data-root-id") || "";
                void getAssistantNoteContextByRootID(rootID).then((context) => {
                    if (!context) {
                        showMessage(sourceText("读取笔记来源失败", "Failed to read the note source"), 4000, "error");
                        return;
                    }
                    addSource({
                        id: `note:${context.rootID}`,
                        type: "note",
                        title: context.title,
                        subtitle: context.path,
                        content: context.markdown,
                    });
                });
                event.preventDefault();
                return;
            }
            if (action === "add-text-source") {
                const content = normalizeSourceContent(state.textSourceContent);
                if (!content) {
                    showMessage(sourceText("请先粘贴一些文字或代码", "Paste some text or code first"), 4000, "error");
                    return;
                }
                addSource({
                    id: `text:${Date.now()}`,
                    type: "text",
                    title: state.textSourceTitle.trim() || sourceText("粘贴文本", "Pasted text"),
                    subtitle: sourceText("手动粘贴", "Manually pasted"),
                    content,
                });
                state.textSourceTitle = "";
                state.textSourceContent = "";
                render();
                event.preventDefault();
                return;
            }
            if (action === "remove-source") {
                const sourceID = target.getAttribute("data-source-id") || "";
                state.sources = state.sources.filter((item) => item.id !== sourceID);
                render();
                event.preventDefault();
                return;
            }
            if (action === "clear-sources") {
                state.sources = [];
                render();
                event.preventDefault();
                return;
            }
            if (action === "generate") {
                void generate();
                event.preventDefault();
                return;
            }
            target = target.parentElement;
        }
    });
    dialog.element.addEventListener("input", (event) => {
        const target = event.target as HTMLInputElement | HTMLTextAreaElement;
        const role = target.getAttribute("data-role");
        if (role === "note-search") {
            state.noteSearchKeyword = target.value;
            window.clearTimeout(searchTimer);
            searchTimer = window.setTimeout(() => {
                void refreshSearchResults();
            }, 180);
            return;
        }
        if (role === "custom-prompt") {
            state.customPrompt = target.value;
            return;
        }
        if (role === "text-title") {
            state.textSourceTitle = target.value;
            return;
        }
        if (role === "text-content") {
            state.textSourceContent = target.value;
            return;
        }
    });
    dialog.element.addEventListener("change", (event) => {
        const target = event.target as HTMLInputElement;
        const role = target.getAttribute("data-role");
        if (role === "insert-reference") {
            state.insertReference = target.checked;
            return;
        }
        if (role === "upload-file" && target.files?.length) {
            const files = Array.from(target.files);
            target.value = "";
            void handleUploadedFiles(files);
        }
    });

    dialog.element.addEventListener("paste", (event: ClipboardEvent) => {
        const files = getSourceFilesFromDataTransfer(event.clipboardData);
        if (!files.length) {
            return;
        }
        const text = event.clipboardData?.getData("text/plain") || "";
        if (!text.trim()) {
            event.preventDefault();
        }
        void handleUploadedFiles(files);
    });

    dialog.element.addEventListener("dragover", (event: DragEvent) => {
        const files = getSourceFilesFromDataTransfer(event.dataTransfer);
        if (!files.length) {
            return;
        }
        event.preventDefault();
        setStudioDropActive(true);
    });

    dialog.element.addEventListener("dragleave", () => {
        setStudioDropActive(false);
    });

    dialog.element.addEventListener("drop", (event: DragEvent) => {
        const files = getSourceFilesFromDataTransfer(event.dataTransfer);
        setStudioDropActive(false);
        if (!files.length) {
            return;
        }
        event.preventDefault();
        void handleUploadedFiles(files);
    });
};
