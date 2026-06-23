import {FitAddon} from "@xterm/addon-fit";
import {SearchAddon} from "@xterm/addon-search";
import {WebLinksAddon} from "@xterm/addon-web-links";
import {Terminal} from "xterm";
import {reportAssistantRuntimeError} from "../runtime";
import {IAssistantTerminalSession} from "./api";

const updateInputBuffer = (buffer: string, data: string) => {
    if (data === "\r") {
        return {buffer: "", commandText: buffer.trim()};
    }
    if (data === "\u0003") {
        return {buffer: "", commandText: ""};
    }
    if (data === "\u007F") {
        return {buffer: buffer.slice(0, -1), commandText: ""};
    }
    if (data.startsWith("\u001B")) {
        return {buffer, commandText: ""};
    }
    if (data === "\n") {
        return {buffer, commandText: ""};
    }
    return {buffer: buffer + data, commandText: ""};
};

export class AssistantTerminalInstance {
    public readonly session: IAssistantTerminalSession;
    public readonly wrapper: HTMLDivElement;
    private readonly terminal: Terminal;
    private readonly fitAddon: FitAddon;
    private readonly searchAddon: SearchAddon;
    private readonly webLinksAddon: WebLinksAddon;
    private inputBuffer = "";

    constructor(session: IAssistantTerminalSession, onData: (data: string, commandText: string) => void) {
        this.session = session;
        this.wrapper = document.createElement("div");
        this.wrapper.className = "assistant-terminal__session";
        this.wrapper.setAttribute("data-session-id", session.id);

        const host = document.createElement("div");
        host.className = "assistant-terminal__host";
        this.wrapper.append(host);

        this.terminal = new Terminal({
            allowProposedApi: false,
            cursorBlink: true,
            fontFamily: "'SFMono-Regular', 'JetBrains Mono', 'Cascadia Mono', Consolas, 'Liberation Mono', monospace",
            fontSize: 12,
            fontWeight: "400",
            lineHeight: 1.2,
            letterSpacing: 0.2,
            scrollback: 5000,
            theme: {
                background: "#00000000",
                foreground: "#d8dee9",
                cursor: "#7dd3fc",
                cursorAccent: "#081018",
                selectionBackground: "rgba(125, 211, 252, 0.2)",
                black: "#0f1720",
                red: "#f87171",
                green: "#4ade80",
                yellow: "#fbbf24",
                blue: "#60a5fa",
                magenta: "#c084fc",
                cyan: "#22d3ee",
                white: "#e5e7eb",
                brightBlack: "#475569",
                brightRed: "#fca5a5",
                brightGreen: "#86efac",
                brightYellow: "#fcd34d",
                brightBlue: "#93c5fd",
                brightMagenta: "#d8b4fe",
                brightCyan: "#67e8f9",
                brightWhite: "#f8fafc",
            },
        });
        this.fitAddon = new FitAddon();
        this.searchAddon = new SearchAddon();
        this.webLinksAddon = new WebLinksAddon();
        this.terminal.loadAddon(this.fitAddon);
        this.terminal.loadAddon(this.searchAddon);
        this.terminal.loadAddon(this.webLinksAddon);
        this.terminal.open(host);
        this.terminal.onData((data) => {
            try {
                const next = updateInputBuffer(this.inputBuffer, data);
                this.inputBuffer = next.buffer;
                onData(data, next.commandText);
            } catch (error) {
                reportAssistantRuntimeError("terminal:input", error, false);
            }
        });
    }

    public attach(container: HTMLElement) {
        if (this.wrapper.parentElement !== container) {
            container.append(this.wrapper);
        }
    }

    public setVisible(visible: boolean) {
        this.wrapper.classList.toggle("fn__none", !visible);
        if (visible) {
            this.fit();
            this.focus();
        }
    }

    public write(output: string) {
        try {
            this.terminal.write(output);
        } catch (error) {
            reportAssistantRuntimeError("terminal:write", error, false);
        }
    }

    public clear() {
        this.terminal.clear();
    }

    public fit() {
        try {
            this.fitAddon.fit();
        } catch (error) {
            console.warn("assistant terminal fit failed", error);
        }
    }

    public focus() {
        try {
            this.terminal.focus();
        } catch (error) {
            reportAssistantRuntimeError("terminal:focus", error, false);
        }
    }

    public getSize() {
        return {width: this.terminal.cols || 120, height: this.terminal.rows || 40};
    }

    public search(keyword: string) {
        if (!keyword.trim()) {
            return false;
        }
        return this.searchAddon.findNext(keyword, {incremental: false, caseSensitive: false});
    }

    public dispose() {
        try {
            this.terminal.dispose();
        } catch (error) {
            reportAssistantRuntimeError("terminal:dispose", error, false);
        }
        this.wrapper.remove();
    }
}
