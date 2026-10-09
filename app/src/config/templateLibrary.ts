import {fetchPost} from "../util/fetch";
import {escapeHtml, escapeAttr} from "../util/escape";
import {showMessage} from "../dialog/message";

interface ITemplateItem {
    path: string;
    content: string;
}

const BUILTIN_TEMPLATES: { name: string; content: string }[] = [
    {
        name: "会议纪要",
        content: `# 会议纪要\n\n**日期**：{{.now | date "2006-01-02"}}\n**参会人**：\n\n## 议题\n\n1. \n\n## 决议\n\n-\n\n## 待办\n\n- [ ] \n`,
    },
    {
        name: "周报",
        content: `# 周报 {{.now | date "2006-W01"}}\n\n## 本周完成\n\n- \n\n## 下周计划\n\n- \n\n## 风险与问题\n\n- \n`,
    },
    {
        name: "读书笔记",
        content: `# 读书笔记\n\n**书名**：\n**作者**：\n**评分**：⭐⭐⭐⭐⭐\n\n## 核心观点\n\n-\n\n## 精彩摘录\n\n> \n\n## 个人思考\n\n\n`,
    },
    {
        name: "复盘",
        content: `# 复盘\n\n**项目**：\n**周期**：\n\n## 目标回顾\n\n-\n\n## 实际结果\n\n-\n\n## 差异分析\n\n-\n\n## 经验教训\n\n-\n`,
    },
    {
        name: "TODO",
        content: `# TODO\n\n## 紧急重要\n\n- [ ] \n\n## 重要不紧急\n\n- [ ] \n\n## 紧急不重要\n\n- [ ] \n\n## 不紧急不重要\n\n- [ ] \n`,
    },
];

// 与后端 kernel/util/file.go FilterFileName 对齐：非法字符替换为下划线
const sanitizeTemplateName = (name: string): string => {
    const cleaned = name.replace(/[\\/:*?"'<>|]/g, "_").trim();
    return cleaned || "template";
};

const getTemplateName = (path: string): string => {
    return (path.split(/[\\/]/).pop() || path).replace(/\.md$/i, "");
};

const findDuplicateTemplate = (templates: ITemplateItem[], name: string, excludeIndex?: number) => {
    const normalizedName = sanitizeTemplateName(name).toLowerCase();
    return templates.find((item, index) =>
        index !== excludeIndex && getTemplateName(item.path).toLowerCase() === normalizedName);
};

const downloadTemplate = (item: ITemplateItem) => {
    const blob = new Blob([item.content], {type: "text/markdown;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${sanitizeTemplateName(getTemplateName(item.path))}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const genCardHTML = (item: ITemplateItem, index: number) => {
    const name = escapeHtml(item.path.split(/[\\/]/).pop() || item.path);
    const preview = escapeHtml(item.content.slice(0, 120));
    return `<div class="template-library__card" data-index="${index}" data-path="${escapeAttr(item.path)}">
    <div class="template-library__card-name">${name}</div>
    <div class="template-library__card-preview">${preview}</div>
    <div class="template-library__card-actions">
        <button class="b3-button b3-button--small" data-action="export" data-index="${index}">${window.sourceflow.languages.export || "Export"}</button>
        <button class="b3-button b3-button--small" data-action="edit" data-index="${index}">${window.sourceflow.languages.edit || "Edit"}</button>
        <button class="b3-button b3-button--small b3-button--error" data-action="delete" data-index="${index}">${window.sourceflow.languages.remove || "Delete"}</button>
    </div>
</div>`;
};

const genEditorDialogHTML = (name?: string, content?: string, titleText?: string) => {
    const title = titleText || (name
        ? (window.sourceflow.languages.edit || "Edit Template")
        : (window.sourceflow.languages.newFile || "New Template"));
    return `<div class="template-library__editor">
    <div class="template-library__editor-title">${escapeHtml(title)}</div>
    <label class="fn__flex-column">
        <span>${window.sourceflow.languages.name || "Name"}</span>
        <input class="b3-text-field fn__flex-1" id="templateEditorName" value="${escapeAttr(name || "")}" spellcheck="false" />
    </label>
    <label class="fn__flex-column">
        <span>Markdown</span>
        <textarea class="b3-text-field fn__flex-1" id="templateEditorContent" rows="12" spellcheck="false">${escapeHtml(content || "")}</textarea>
    </label>
    <div class="template-library__editor-actions">
        <button class="b3-button" id="templateEditorSave">${window.sourceflow.languages.save || "Save"}</button>
        <button class="b3-button b3-button--cancel" id="templateEditorCancel">${window.sourceflow.languages.cancel || "Cancel"}</button>
    </div>
</div>`;
};

let editorDialog: HTMLDivElement | null = null;

const loadTemplates = (): Promise<ITemplateItem[]> => {
    return new Promise((resolve) => {
        fetchPost("/api/search/searchTemplate", {k: ""}, (response) => {
            const templates: ITemplateItem[] = response.data?.templates || [];
            resolve(templates);
        });
    });
};

const renderTemplateGrid = (container: HTMLElement, templates: ITemplateItem[]) => {
    if (templates.length === 0) {
        container.innerHTML = `<div class="template-library__empty">${window.sourceflow.languages.emptyContent || "No templates"}</div>`;
        return;
    }
    container.innerHTML = templates.map((item, index) => genCardHTML(item, index)).join("");
};

interface IEditorOptions {
    presetName?: string;
    presetContent?: string;
    title?: string;
    preventDuplicate?: boolean;
    onClose?: () => void;
    grid?: HTMLElement;
}

const openEditor = (parentElement: HTMLElement, templates: ITemplateItem[], editIndex?: number, options?: IEditorOptions) => {
    if (editorDialog) {
        editorDialog.remove();
    }
    const item = editIndex !== undefined ? templates[editIndex] : undefined;
    const name = options?.presetName ?? (item ? getTemplateName(item.path) : "");
    const content = options?.presetContent ?? (item ? item.content : "");

    editorDialog = document.createElement("div");
    editorDialog.className = "template-library__editor-overlay";
    editorDialog.innerHTML = genEditorDialogHTML(name, content, options?.title);
    parentElement.appendChild(editorDialog);

    const closeEditor = () => {
        if (editorDialog) {
            editorDialog.remove();
            editorDialog = null;
        }
        if (options?.onClose) {
            options.onClose();
        }
    };

    editorDialog.querySelector("#templateEditorCancel").addEventListener("click", closeEditor);
    editorDialog.querySelector("#templateEditorSave").addEventListener("click", () => {
        const inputName = (editorDialog.querySelector("#templateEditorName") as HTMLInputElement).value.trim();
        const inputContent = (editorDialog.querySelector("#templateEditorContent") as HTMLTextAreaElement).value;
        if (!inputName) {
            return;
        }
        const isEdit = editIndex !== undefined && templates[editIndex];
        // 后端 saveTemplate 会直接覆盖同名文件，这里先拦截重名，避免导入/新建时静默覆盖已有模板
        if (options?.preventDuplicate) {
            const duplicate = findDuplicateTemplate(templates, inputName, isEdit ? editIndex : undefined);
            if (duplicate) {
                showMessage((window.sourceflow.languages.templateNameDuplicate || 'Template "${x}" already exists, please rename it')
                    .replace("${x}", inputName));
                return;
            }
        }
        if (isEdit) {
            const oldItem = templates[editIndex];
            if (oldItem.path) {
                fetchPost("/api/search/removeTemplate", {path: oldItem.path});
            }
        }
        fetchPost("/api/search/saveTemplate", {name: inputName, content: inputContent}, (response) => {
            const savedPath = response.data?.path || inputName;
            const savedItem: ITemplateItem = {path: savedPath, content: inputContent};
            if (isEdit) {
                templates[editIndex] = savedItem;
            } else {
                templates.push(savedItem);
            }
            closeEditor();
            renderTemplateGrid(
                (options?.grid || parentElement.querySelector(".template-library__grid--custom")) as HTMLElement,
                templates
            );
        });
    });
};

export const templateLibrary = {
    element: undefined as Element,

    genHTML: () => {
        return `<div class="template-library fn__flex-column">
    <div class="template-library__header">
        <span class="template-library__title">${window.sourceflow.languages.template || "Templates"}</span>
        <button class="b3-button b3-button--outline" id="templateImportBtn">
            <svg><use xlink:href="#iconDownload"></use></svg>${window.sourceflow.languages.import || "Import"}
        </button>
        <input type="file" id="templateImportInput" accept=".md,.txt" multiple class="fn__none" />
        <button class="b3-button b3-button--outline" id="templateNewBtn">
            <svg><use xlink:href="#iconAdd"></use></svg>${window.sourceflow.languages.newFile || "New Template"}
        </button>
    </div>
    <div class="template-library__section">
        <div class="template-library__section-title">${window.sourceflow.languages.builtIn || "Built-in"}</div>
        <div class="template-library__grid template-library__grid--builtin"></div>
    </div>
    <div class="template-library__section">
        <div class="template-library__section-title">${window.sourceflow.languages.custom || "Custom"}</div>
        <div class="template-library__grid template-library__grid--custom"></div>
    </div>
</div>`;
    },

    bindEvent: () => {
        const container = templateLibrary.element as HTMLElement;
        if (!container) {
            return;
        }

        const builtinGrid = container.querySelector(".template-library__grid--builtin") as HTMLElement;
        const customGrid = container.querySelector(".template-library__grid--custom") as HTMLElement;

        const builtinCards = BUILTIN_TEMPLATES.map((item) => ({
            path: item.name,
            content: item.content,
        }));
        renderTemplateGrid(builtinGrid, builtinCards);

        void loadTemplates().then((templates) => {
            renderTemplateGrid(customGrid, templates);

            container.querySelector("#templateNewBtn").addEventListener("click", () => {
                openEditor(container, templates, undefined, {preventDuplicate: true, grid: customGrid});
            });

            const importQueue: File[] = [];
            let importing = false;
            const processImportQueue = () => {
                const file = importQueue.shift();
                if (!file) {
                    importing = false;
                    return;
                }
                importing = true;
                const reader = new FileReader();
                reader.onload = () => {
                    const content = typeof reader.result === "string" ? reader.result : "";
                    openEditor(container, templates, undefined, {
                        presetName: sanitizeTemplateName(file.name.replace(/\.(md|txt)$/i, "")),
                        presetContent: content,
                        title: window.sourceflow.languages.import || "Import",
                        preventDuplicate: true,
                        onClose: processImportQueue,
                        grid: customGrid,
                    });
                };
                reader.onerror = () => {
                    showMessage(window.sourceflow.languages.templateImportFailed || "Failed to import template");
                    processImportQueue();
                };
                reader.readAsText(file);
            };

            container.querySelector("#templateImportBtn").addEventListener("click", () => {
                (container.querySelector("#templateImportInput") as HTMLInputElement).click();
            });
            container.querySelector("#templateImportInput").addEventListener("change", (event) => {
                const input = event.target as HTMLInputElement;
                const files = Array.from(input.files || []);
                input.value = "";
                if (files.length === 0) {
                    return;
                }
                importQueue.push(...files);
                if (!importing) {
                    processImportQueue();
                }
            });

            customGrid.addEventListener("click", (event) => {
                const target = event.target as HTMLElement;
                const actionBtn = target.closest("[data-action]") as HTMLElement;
                if (!actionBtn) {
                    return;
                }
                const action = actionBtn.getAttribute("data-action");
                const index = parseInt(actionBtn.getAttribute("data-index") || "0", 10);
                if (action === "export") {
                    const item = templates[index];
                    if (item) {
                        downloadTemplate(item);
                    }
                } else if (action === "edit") {
                    openEditor(container, templates, index, {grid: customGrid});
                } else if (action === "delete") {
                    const item = templates[index];
                    if (!item) {
                        return;
                    }
                    fetchPost("/api/search/removeTemplate", {path: item.path}, () => {
                        templates.splice(index, 1);
                        renderTemplateGrid(customGrid, templates);
                    });
                }
            });
        });

        builtinGrid.addEventListener("click", (event) => {
            const target = event.target as HTMLElement;
            const card = target.closest(".template-library__card") as HTMLElement;
            if (!card) {
                return;
            }
            const actionBtn = target.closest("[data-action]") as HTMLElement;
            if (!actionBtn) {
                return;
            }
            const action = actionBtn.getAttribute("data-action");
            const index = parseInt(card.getAttribute("data-index") || "0", 10);
            const item = builtinCards[index];
            if (!item) {
                return;
            }
            if (action === "export") {
                downloadTemplate(item);
            } else if (action === "edit") {
                openEditor(container, builtinCards, index, {grid: builtinGrid});
            }
        });
    },
};
