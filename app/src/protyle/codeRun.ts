import {Dialog} from "../dialog";
import {hideMessage, showMessage} from "../dialog/message";
import {fetchSyncPost} from "../util/fetch";
import {escapeAttr} from "../util/escape";
import {AssistantTerminalSocket} from "../assistant/terminal/TerminalSocket";
import {createAssistantTerminalSession, deleteAssistantTerminalSession, listAssistantTerminalProfiles} from "../assistant/terminal/api";
import {isBrowser, isMobile} from "../util/functions";
import * as dayjs from "dayjs";

type TCodeRunShell = "powershell" | "cmd" | "bash";

interface ICodeRunSupport {
    ext: string;
    runCommand: (quotedPath: string) => string;
}

const codeRunText = (zh: string, en: string) => {
    return window.sourceflow.config.lang === "zh_CN" ? zh : en;
};

const CODE_RUN_SOCKET_TIMEOUT = 12000;

const CODE_RUNNERS: Record<string, ICodeRunSupport> = {
    javascript: {ext: "js", runCommand: (quotedPath) => `node ${quotedPath}`},
    js: {ext: "js", runCommand: (quotedPath) => `node ${quotedPath}`},
    node: {ext: "js", runCommand: (quotedPath) => `node ${quotedPath}`},
    mjs: {ext: "mjs", runCommand: (quotedPath) => `node ${quotedPath}`},
    cjs: {ext: "cjs", runCommand: (quotedPath) => `node ${quotedPath}`},
    python: {ext: "py", runCommand: (quotedPath) => `python ${quotedPath}`},
    py: {ext: "py", runCommand: (quotedPath) => `python ${quotedPath}`},
    bash: {ext: "sh", runCommand: (quotedPath) => `bash ${quotedPath}`},
    shell: {ext: "sh", runCommand: (quotedPath) => `bash ${quotedPath}`},
    sh: {ext: "sh", runCommand: (quotedPath) => `sh ${quotedPath}`},
    zsh: {ext: "sh", runCommand: (quotedPath) => `zsh ${quotedPath}`},
    powershell: {ext: "ps1", runCommand: (quotedPath) => `& ${quotedPath}`},
    pwsh: {ext: "ps1", runCommand: (quotedPath) => `& ${quotedPath}`},
    ps1: {ext: "ps1", runCommand: (quotedPath) => `& ${quotedPath}`},
    cmd: {ext: "cmd", runCommand: (quotedPath) => `cmd /c ${quotedPath}`},
    batch: {ext: "cmd", runCommand: (quotedPath) => `cmd /c ${quotedPath}`},
    bat: {ext: "cmd", runCommand: (quotedPath) => `cmd /c ${quotedPath}`},
    go: {ext: "go", runCommand: (quotedPath) => `go run ${quotedPath}`},
    ruby: {ext: "rb", runCommand: (quotedPath) => `ruby ${quotedPath}`},
    rb: {ext: "rb", runCommand: (quotedPath) => `ruby ${quotedPath}`},
    php: {ext: "php", runCommand: (quotedPath) => `php ${quotedPath}`},
};

const normalizeLanguage = (language: string) => {
    return `${language || ""}`.trim().toLowerCase();
};

const detectShell = (shellPath: string): TCodeRunShell | null => {
    const base = `${shellPath || ""}`.trim().toLowerCase();
    if (!base) {
        return null;
    }
    if (base.includes("pwsh") || base.includes("powershell")) {
        return "powershell";
    }
    if (base.includes("cmd.exe")) {
        return "cmd";
    }
    if (base.endsWith("/bash") || base.endsWith("\\bash.exe") || base.endsWith("/zsh") || base.endsWith("/sh") || base.endsWith("\\sh.exe")) {
        return "bash";
    }
    return null;
};

const quotePathForShell = (shell: TCodeRunShell, absolutePath: string) => {
    const normalized = absolutePath.replace(/\\/g, "/");
    if (shell === "bash") {
        return `'${normalized.replace(/'/g, `'\"'\"'`)}'`;
    }
    return `"${normalized.replace(/"/g, '""')}"`;
};

const buildWrappedCommand = (shell: TCodeRunShell, runCommand: string, token: string) => {
    const startMarker = `__SOURCEFLOW_CODE_RUN_START__${token}`;
    const endMarker = `__SOURCEFLOW_CODE_RUN_END__${token}__`;
    if (shell === "powershell") {
        return `Write-Output '${startMarker}'; ${runCommand}; $code = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }; Write-Output '${endMarker}' + $code`;
    }
    if (shell === "cmd") {
        return `echo ${startMarker} && ${runCommand} & echo ${endMarker}%ERRORLEVEL%`;
    }
    return `printf '%s\\n' '${startMarker}'; ${runCommand}; code=$?; printf '%s%s\\n' '${endMarker}' \"$code\"`;
};

const buildOutputMarkdown = (language: string, exitCode: number, output: string) => {
    return [
        `## ${codeRunText("代码运行结果", "Code Run Result")} · ${language || "plaintext"}`,
        "",
        `- ${codeRunText("时间", "Time")}：${dayjs().format("YYYY-MM-DD HH:mm:ss")}`,
        `- ${codeRunText("退出码", "Exit code")}：${exitCode}`,
        "",
        "```text",
        (output || "").trimEnd(),
        "```",
        "",
    ].join("\n");
};

const createScriptFile = async (relativePath: string, content: string) => {
    const fileName = relativePath.split("/").pop() || "code-run.txt";
    const formData = new FormData();
    formData.append("path", relativePath);
    formData.append("isDir", "false");
    formData.append("file", new File([new Blob([content], {type: "text/plain"})], fileName));
    const response = await fetchSyncPost("/api/file/putFile", formData);
    if (response.code !== 0) {
        throw new Error(response.msg || codeRunText("写入运行脚本失败", "Failed to write the runnable script"));
    }
};

const getCodeBlockLanguage = (nodeElement: HTMLElement) => {
    return (nodeElement.querySelector(".protyle-action__language") as HTMLElement)?.textContent?.trim() || "";
};

const getCodeBlockContent = (nodeElement: HTMLElement) => {
    const hljsElement = nodeElement.querySelector(".hljs") as HTMLElement;
    if (!hljsElement) {
        return "";
    }
    const contentElement = (hljsElement.lastElementChild as HTMLElement) || hljsElement;
    return contentElement.textContent || "";
};

const withTimeout = async <T>(promise: Promise<T>, timeout = CODE_RUN_SOCKET_TIMEOUT, message = codeRunText("终端连接超时", "Terminal connection timed out")) => {
    let timer = 0;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timer = window.setTimeout(() => {
                    reject(new Error(message));
                }, timeout);
            }),
        ]);
    } finally {
        window.clearTimeout(timer);
    }
};

export const canRunCodeBlock = () => {
    return !isMobile() && !isBrowser();
};

class CodeRunDialog {
    private readonly protyle: IProtyle;
    private readonly nodeElement: HTMLElement;
    private readonly language: string;
    private readonly code: string;
    private readonly dialog: Dialog;
    private readonly statusElement: HTMLElement;
    private readonly outputElement: HTMLPreElement;
    private readonly copyButton: HTMLButtonElement;
    private readonly writeBackButton: HTMLButtonElement;
    private readonly rerunButton: HTMLButtonElement;
    private socket: AssistantTerminalSocket | null = null;
    private sessionId = "";
    private scriptPath = "";
    private output = "";
    private exitCode = 0;
    private capturing = false;
    private buffer = "";
    private runToken = "";
    private disposed = false;

    constructor(protyle: IProtyle, nodeElement: HTMLElement) {
        this.protyle = protyle;
        this.nodeElement = nodeElement;
        this.language = getCodeBlockLanguage(nodeElement);
        this.code = getCodeBlockContent(nodeElement);
        this.dialog = new Dialog({
            title: codeRunText("代码运行", "Run Code"),
            content: `<div class="b3-dialog__content" style="display:flex;flex-direction:column;gap:12px;height:100%;">
    <div class="fn__flex" style="gap:8px;align-items:center;flex-wrap:wrap;">
        <span class="b3-chip b3-chip--secondary">${escapeAttr(this.language || "plaintext")}</span>
        <span data-role="status" class="ft__secondary">${codeRunText("准备运行...", "Preparing run...")}</span>
    </div>
    <pre data-role="output" class="b3-text-field" style="flex:1;min-height:320px;white-space:pre-wrap;overflow:auto;padding:12px;"></pre>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel" data-action="close">${codeRunText("关闭", "Close")}</button>
    <div class="fn__space"></div>
    <button class="b3-button b3-button--outline" data-action="copy" disabled>${codeRunText("复制输出", "Copy output")}</button>
    <button class="b3-button b3-button--outline" data-action="write-back" disabled>${codeRunText("写回笔记", "Write back")}</button>
    <button class="b3-button b3-button--text" data-action="rerun">${codeRunText("重新运行", "Run again")}</button>
</div>`,
            width: window.innerWidth < 800 ? "96vw" : "780px",
            height: window.innerHeight < 720 ? "88vh" : "640px",
            destroyCallback: () => {
                void this.dispose();
            }
        });
        this.statusElement = this.dialog.element.querySelector('[data-role="status"]') as HTMLElement;
        this.outputElement = this.dialog.element.querySelector('[data-role="output"]') as HTMLPreElement;
        this.copyButton = this.dialog.element.querySelector('[data-action="copy"]') as HTMLButtonElement;
        this.writeBackButton = this.dialog.element.querySelector('[data-action="write-back"]') as HTMLButtonElement;
        this.rerunButton = this.dialog.element.querySelector('[data-action="rerun"]') as HTMLButtonElement;
        this.bind();
    }

    public async run() {
        if (!canRunCodeBlock()) {
            showMessage(codeRunText("一键运行仅支持桌面端应用", "One-click run is only available in the desktop app"), 5000, "warning");
            this.dialog.destroy();
            return;
        }
        const support = CODE_RUNNERS[normalizeLanguage(this.language)];
        if (!support) {
            showMessage(codeRunText("当前代码语言暂不支持一键运行", "This code language is not supported for one-click run"), 5000, "warning");
            this.dialog.destroy();
            return;
        }
        if (!`${this.code || ""}`.trim()) {
            showMessage(codeRunText("代码块为空，无法运行", "The code block is empty"), 5000, "warning");
            this.dialog.destroy();
            return;
        }
        this.resetForRun();
        const loading = showMessage(codeRunText("正在启动运行环境...", "Starting runtime..."), -1);
        try {
            await this.cleanupCurrentRunResources();
            const profiles = await listAssistantTerminalProfiles();
            const profile = profiles.find((item) => item.isDefault) || profiles[0];
            if (!profile?.id) {
                throw new Error(codeRunText("没有可用的终端配置", "No terminal profile available"));
            }
            const shellKind = detectShell(profile.shell);
            if (!shellKind) {
                throw new Error(codeRunText("当前默认终端不支持代码块运行，请改用 PowerShell、CMD 或 Bash 配置", "The current default terminal profile does not support code block run. Use PowerShell, CMD, or Bash."));
            }
            this.socket = new AssistantTerminalSocket();
            this.socket.onEvent((event) => {
                this.handleSocketEvent(event);
            });
            const session = await createAssistantTerminalSession(profile.id);
            this.sessionId = session.id;
            const workspacePath = `${window.sourceflow.config.system.workspaceDir || ""}`.replace(/\\/g, "/").replace(/\/$/, "");
            if (!workspacePath) {
                throw new Error(codeRunText("工作区路径为空，无法运行代码块", "Workspace path is empty, unable to run the code block"));
            }
            const timestamp = dayjs().format("YYYYMMDD-HHmmss");
            this.scriptPath = `/temp/code-run/${session.id}-${timestamp}.${support.ext}`;
            await createScriptFile(this.scriptPath, this.code);
            const absoluteScriptPath = `${workspacePath}${this.scriptPath}`;
            this.runToken = `${session.id}-${Date.now()}`;
            const quotedPath = quotePathForShell(shellKind, absoluteScriptPath);
            const runCommand = buildWrappedCommand(shellKind, support.runCommand(quotedPath), this.runToken);
            await withTimeout(this.socket.send("assistantTerminalOpen", {
                sessionId: session.id,
                width: 120,
                height: 32,
            }), CODE_RUN_SOCKET_TIMEOUT, codeRunText("终端未能及时启动", "Terminal did not start in time"));
            this.setStatus(codeRunText("运行中...", "Running..."));
            await withTimeout(this.socket.send("assistantTerminalInput", {
                sessionId: session.id,
                data: `${runCommand}\r`,
                commandText: runCommand,
            }), CODE_RUN_SOCKET_TIMEOUT, codeRunText("发送运行命令超时", "Timed out while sending the run command"));
        } catch (error) {
            this.setStatus(codeRunText("运行失败", "Run failed"));
            this.appendOutput(error instanceof Error ? error.message : String(error));
            if (this.output.trim()) {
                this.copyButton.removeAttribute("disabled");
                this.writeBackButton.removeAttribute("disabled");
            }
            this.rerunButton.removeAttribute("disabled");
            await this.cleanupCurrentRunResources();
            showMessage(error instanceof Error ? error.message : String(error), 7000, "error");
        } finally {
            hideMessage(loading);
        }
    }

    private bind() {
        this.dialog.element.querySelector('[data-action="close"]')?.addEventListener("click", () => {
            this.dialog.destroy();
        });
        this.copyButton.addEventListener("click", async () => {
            await navigator.clipboard.writeText(this.output || "");
            showMessage(codeRunText("输出已复制", "Output copied"), 3000, "info");
        });
        this.writeBackButton.addEventListener("click", async () => {
            const markdown = buildOutputMarkdown(this.language, this.exitCode, this.output || "");
            const response = await fetchSyncPost("/api/block/insertBlock", {
                previousID: this.nodeElement.getAttribute("data-node-id"),
                data: markdown,
                dataType: "markdown",
            });
            if (response.code === 0) {
                showMessage(codeRunText("运行结果已写回笔记", "Run result written back"), 4000, "info");
                this.writeBackButton.setAttribute("disabled", "disabled");
                return;
            }
            showMessage(response.msg || codeRunText("写回笔记失败", "Failed to write back"), 7000, "error");
        });
        this.rerunButton.addEventListener("click", () => {
            void this.run();
        });
    }

    private resetForRun() {
        this.output = "";
        this.exitCode = 0;
        this.capturing = false;
        this.buffer = "";
        this.outputElement.textContent = "";
        this.copyButton.setAttribute("disabled", "disabled");
        this.writeBackButton.setAttribute("disabled", "disabled");
        this.rerunButton.setAttribute("disabled", "disabled");
    }

    private appendOutput(text: string) {
        this.output += text;
        this.outputElement.textContent = this.output;
        this.outputElement.scrollTop = this.outputElement.scrollHeight;
    }

    private setStatus(text: string) {
        this.statusElement.textContent = text;
    }

    private handleSocketEvent(event: IWebSocketData) {
        if (this.disposed || event?.data?.sessionId !== this.sessionId || event.cmd !== "assistantTerminalOutput") {
            return;
        }
        this.buffer += `${event.data.output || ""}`;
        const startMarker = `__SOURCEFLOW_CODE_RUN_START__${this.runToken}`;
        const endMarkerPrefix = `__SOURCEFLOW_CODE_RUN_END__${this.runToken}__`;
        if (!this.capturing) {
            const startIndex = this.buffer.indexOf(startMarker);
            if (startIndex === -1) {
                return;
            }
            this.capturing = true;
            this.buffer = this.buffer.slice(startIndex + startMarker.length);
        }
        const endIndex = this.buffer.indexOf(endMarkerPrefix);
        if (endIndex === -1) {
            this.flushBufferedOutput(false);
            return;
        }
        const content = this.buffer.slice(0, endIndex);
        if (content) {
            this.appendOutput(content);
        }
        const exitCodeMatch = this.buffer.slice(endIndex + endMarkerPrefix.length).match(/^(-?\d+)/);
        this.exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : 0;
        this.buffer = "";
        this.copyButton.removeAttribute("disabled");
        this.writeBackButton.removeAttribute("disabled");
        this.rerunButton.removeAttribute("disabled");
        this.setStatus(this.exitCode === 0 ? codeRunText("运行完成", "Completed") : codeRunText("运行结束，有报错", "Completed with errors"));
        void this.cleanupCurrentRunResources();
    }

    private flushBufferedOutput(force: boolean) {
        if (!this.buffer) {
            return;
        }
        if (!force) {
            const endMarkerPrefix = `__SOURCEFLOW_CODE_RUN_END__${this.runToken}__`;
            const safeLength = Math.max(0, this.buffer.length - endMarkerPrefix.length - 12);
            if (safeLength <= 0) {
                return;
            }
            this.appendOutput(this.buffer.slice(0, safeLength));
            this.buffer = this.buffer.slice(safeLength);
            return;
        }
        this.appendOutput(this.buffer);
        this.buffer = "";
    }

    private async cleanupCurrentRunResources() {
        const currentSocket = this.socket;
        const currentSessionId = this.sessionId;
        const currentScriptPath = this.scriptPath;
        this.socket = null;
        this.sessionId = "";
        this.scriptPath = "";
        this.runToken = "";
        this.capturing = false;
        this.buffer = "";
        try {
            if (currentSessionId && currentSocket) {
                await withTimeout(currentSocket.send("assistantTerminalClose", {sessionId: currentSessionId}).catch(() => null), 3000, "").catch(() => null);
            }
        } finally {
            currentSocket?.destroy();
            if (currentSessionId) {
                await deleteAssistantTerminalSession(currentSessionId).catch(() => null);
            }
            if (currentScriptPath) {
                await fetchSyncPost("/api/file/removeFile", {path: currentScriptPath}).catch(() => null);
            }
        }
    }

    private async dispose() {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.flushBufferedOutput(true);
        await this.cleanupCurrentRunResources();
    }
}

export const runCodeBlock = (protyle: IProtyle, nodeElement: HTMLElement) => {
    const dialog = new CodeRunDialog(protyle, nodeElement);
    void dialog.run();
};
