import {showMessage} from "../../dialog/message";
import {genUUID} from "../../util/genID";
import {getAssistantWebSocketURL} from "../constants";
import {reportAssistantRuntimeError} from "../runtime";

interface IAssistantTerminalPending {
    resolve: (data: IWebSocketData) => void;
    reject: (error: Error) => void;
}

export class AssistantTerminalSocket {
    private ws: WebSocket | null = null;
    private reqSeq = 1;
    private readonly pending = new Map<number, IAssistantTerminalPending>();
    private readonly eventListeners = new Set<(data: IWebSocketData) => void>();
    private readonly openListeners = new Set<() => void>();
    private waiters: Array<() => void> = [];
    private reconnectTimer = 0;
    private connected = false;
    private closed = false;

    constructor() {
        this.connect();
    }

    public onEvent(listener: (data: IWebSocketData) => void) {
        this.eventListeners.add(listener);
        return () => this.eventListeners.delete(listener);
    }

    public onOpen(listener: () => void) {
        this.openListeners.add(listener);
        return () => this.openListeners.delete(listener);
    }

    public async send(cmd: string, param: Record<string, unknown>) {
        await this.waitUntilOpen();
        const ws = this.ws;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            throw new Error("Assistant terminal connection is not ready");
        }
        const reqId = this.reqSeq++;
        return new Promise<IWebSocketData>((resolve, reject) => {
            this.pending.set(reqId, {resolve, reject});
            try {
                ws.send(JSON.stringify({cmd, reqId, param}));
            } catch (error) {
                this.pending.delete(reqId);
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        });
    }

    public destroy() {
        this.closed = true;
        window.clearTimeout(this.reconnectTimer);
        this.rejectAllPending(new Error("Assistant terminal socket closed"));
        if (this.ws && this.ws.readyState < WebSocket.CLOSING) {
            this.ws.close(1000, "close websocket");
        }
        this.eventListeners.clear();
        this.openListeners.clear();
        this.waiters = [];
    }

    private emitOpen() {
        this.openListeners.forEach((listener) => {
            try {
                listener();
            } catch (error) {
                reportAssistantRuntimeError("terminal:socket-open-listener", error, false);
            }
        });
    }

    private emitEvent(data: IWebSocketData) {
        this.eventListeners.forEach((listener) => {
            try {
                listener(data);
            } catch (error) {
                reportAssistantRuntimeError("terminal:socket-event-listener", error, false);
            }
        });
    }

    private connect() {
        const ws = new WebSocket(getAssistantWebSocketURL(genUUID()));
        ws.onopen = () => {
            this.ws = ws;
            this.connected = true;
            const waiters = this.waiters.splice(0, this.waiters.length);
            waiters.forEach((resolve) => {
                try {
                    resolve();
                } catch (error) {
                    reportAssistantRuntimeError("terminal:socket-open-waiter", error, false);
                }
            });
            this.emitOpen();
        };
        ws.onmessage = (event) => {
            let response: IWebSocketData & { reqId?: number };
            try {
                response = JSON.parse(event.data);
            } catch (error) {
                console.error("assistant terminal message parse failed", error);
                return;
            }
            const reqId = typeof response.reqId === "number" ? response.reqId : 0;
            if (reqId && this.pending.has(reqId)) {
                const pending = this.pending.get(reqId);
                this.pending.delete(reqId);
                if (!pending) {
                    return;
                }
                if (response.code === 0) {
                    pending.resolve(response);
                } else {
                    const error = new Error(response.msg || "Assistant terminal request failed");
                    pending.reject(error);
                    showMessage(error.message, 5000, "error");
                }
                return;
            }
            if (response.code < 0 && response.msg) {
                showMessage(response.msg, 5000, "error");
            }
            this.emitEvent(response);
        };
        ws.onclose = (event) => {
            this.connected = false;
            this.ws = null;
            if (this.closed || event.reason.includes("unauthenticated")) {
                return;
            }
            this.rejectAllPending(new Error("Assistant terminal connection lost"));
            window.clearTimeout(this.reconnectTimer);
            this.reconnectTimer = window.setTimeout(() => {
                if (!this.closed) {
                    this.connect();
                }
            }, 3000);
        };
        ws.onerror = () => {
            if (!this.connected) {
                console.warn("assistant terminal websocket connect failed");
            }
        };
        this.ws = ws;
    }

    private async waitUntilOpen() {
        if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
            return;
        }
        await new Promise<void>((resolve) => {
            this.waiters.push(resolve);
        });
    }

    private rejectAllPending(error: Error) {
        this.pending.forEach((pending) => pending.reject(error));
        this.pending.clear();
    }
}
