import {Dialog} from "../../dialog";
import {confirmDialog} from "../../dialog/confirmDialog";
import {showMessage} from "../../dialog/message";
import {Custom} from "../../layout/dock/Custom";
import {App} from "../../index";
import {assistantText} from "../constants";
import {escapeAttr, escapeHTML, formatDateTime, panelEmptyHTML, truncateText} from "../common/dom";
import {reportAssistantRuntimeError} from "../runtime";
import {AssistantTerminalInstance} from "./TerminalInstance";
import {AssistantTerminalSocket} from "./TerminalSocket";
import {
    createAssistantTerminalSession,
    deleteAssistantTerminalSession,
    IAssistantTerminalProfile,
    IAssistantTerminalSession,
    listAssistantTerminalProfiles,
    listAssistantTerminalSessions,
} from "./api";

class AssistantTerminalDock {
    private readonly app: App;
    private readonly custom: Custom;
    private readonly element: HTMLElement;
    private readonly socket: AssistantTerminalSocket;
    private readonly terminals = new Map<string, AssistantTerminalInstance>();
    private profiles: IAssistantTerminalProfile[] = [];
    private sessions: IAssistantTerminalSession[] = [];
    private selectedProfileId = "";
    private activeSessionId = "";
    private searchKeyword = "";
    private profileExpanded = false;
    private sessionsExpanded = false;
    private searchExpanded = false;
    private loading = false;
    private floatDialog: Dialog | null = null;
    private floatingSessionId = "";
    private failed = false;

    constructor(custom: Custom, app: App) {
        this.app = app;
        this.custom = custom;
        this.element = custom.element as HTMLElement;
        this.element.classList.add("assistant-dock", "assistant-dock--terminal", "fn__flex-column");
        this.socket = new AssistantTerminalSocket();
        this.socket.onEvent((data) => {
            if (this.failed) {
                return;
            }
            try {
                this.handleSocketEvent(data);
            } catch (error) {
                this.failRuntime("socket-event", error);
            }
        });
        this.socket.onOpen(() => {
            if (this.failed) {
                return;
            }
            this.terminals.forEach((terminal) => {
                void this.openRuntime(terminal.session.id).catch((error) => {
                    this.failRuntime("socket-open", error);
                });
            });
        });
        this.bindEvents();
        void this.refresh();
    }

    public destroy() {
        this.floatDialog?.destroy();
        this.socket.destroy();
        this.terminals.forEach((terminal) => terminal.dispose());
        this.terminals.clear();
        this.element.innerHTML = "";
    }

    public resize() {
        if (this.failed) {
            return;
        }
        this.syncTerminalViews();
        this.terminals.get(this.activeSessionId)?.fit();
    }

    public update() {
        if (this.failed) {
            return;
        }
        void this.refresh();
    }

    private failRuntime(scope: string, error: unknown) {
        if (this.failed) {
            return;
        }
        this.failed = true;
        reportAssistantRuntimeError(`terminal:${scope}`, error);
        try {
            this.floatDialog?.destroy();
        } catch (dialogError) {
            console.warn("assistant terminal float dialog destroy failed", dialogError);
        }
        this.floatDialog = null;
        this.floatingSessionId = "";
        try {
            this.socket.destroy();
        } catch (socketError) {
            console.warn("assistant terminal socket destroy failed", socketError);
        }
        this.terminals.forEach((terminal) => {
            try {
                terminal.dispose();
            } catch (disposeError) {
                console.warn("assistant terminal dispose failed", disposeError);
            }
        });
        this.terminals.clear();
        this.render();
    }

    private bindEvents() {
        this.element.addEventListener("click", (event: MouseEvent) => {
            if (this.failed) {
                return;
            }
            let target = event.target as HTMLElement;
            while (target && !target.isEqualNode(this.element)) {
                const sessionId = target.getAttribute("data-session-id");
                if (sessionId) {
                    void this.selectSession(sessionId).catch((error) => {
                        this.failRuntime("select-session", error);
                    });
                    event.preventDefault();
                    return;
                }
                const profileId = target.getAttribute("data-profile-id");
                if (profileId) {
                    this.selectProfile(profileId);
                    event.preventDefault();
                    return;
                }
                const action = target.getAttribute("data-action");
                if (action) {
                    void this.handleAction(action).catch((error) => {
                        this.failRuntime(`action:${action}`, error);
                    });
                    event.preventDefault();
                    return;
                }
                target = target.parentElement;
            }
        });

        this.element.addEventListener("input", (event: Event) => {
            if (this.failed) {
                return;
            }
            const target = event.target as HTMLInputElement;
            const role = target.getAttribute("data-role");
            if (role === "search") {
                this.searchKeyword = target.value;
            }
        });

        this.element.addEventListener("keydown", (event: KeyboardEvent) => {
            if (this.failed) {
                return;
            }
            const target = event.target as HTMLElement;
            if (target.getAttribute("data-role") === "search" && event.key === "Enter") {
                event.preventDefault();
                void this.handleAction("search-terminal").catch((error) => {
                    this.failRuntime("action:search-terminal", error);
                });
                return;
            }
            if (target.getAttribute("data-role") === "search" && event.key === "Escape") {
                event.preventDefault();
                if (this.searchKeyword) {
                    this.searchKeyword = "";
                    this.render();
                    this.focusSearch();
                    return;
                }
                this.searchExpanded = false;
                this.render();
                return;
            }
            if (event.key === "Escape" && (this.profileExpanded || this.sessionsExpanded)) {
                event.preventDefault();
                this.profileExpanded = false;
                this.sessionsExpanded = false;
                this.render();
            }
        });
    }

    private async handleAction(action: string) {
        switch (action) {
            case "new-session":
                await this.createSession();
                return;
            case "delete-session":
                await this.deleteActiveSession();
                return;
            case "float-terminal":
                this.openFloatingDialog();
                return;
            case "toggle-profile-panel":
                this.profileExpanded = !this.profileExpanded;
                if (this.profileExpanded) {
                    this.sessionsExpanded = false;
                    this.searchExpanded = false;
                }
                this.render();
                return;
            case "dismiss-profile-panel":
                this.profileExpanded = false;
                this.render();
                return;
            case "toggle-sessions":
                this.sessionsExpanded = !this.sessionsExpanded;
                if (this.sessionsExpanded) {
                    this.profileExpanded = false;
                    this.searchExpanded = false;
                }
                this.render();
                return;
            case "dismiss-sessions":
                this.sessionsExpanded = false;
                this.render();
                return;
            case "toggle-search":
                this.searchExpanded = !this.searchExpanded;
                if (this.searchExpanded) {
                    this.profileExpanded = false;
                    this.sessionsExpanded = false;
                }
                this.render();
                if (this.searchExpanded) {
                    this.focusSearch();
                }
                return;
            case "dismiss-search":
                this.searchExpanded = false;
                this.render();
                return;
            case "search-terminal":
                this.searchInActiveTerminal();
                return;
            default:
                return;
        }
    }

    private async refresh() {
        if (this.failed) {
            this.render();
            return;
        }
        this.loading = true;
        this.render();
        try {
            const [profiles, sessions] = await Promise.all([
                listAssistantTerminalProfiles(),
                listAssistantTerminalSessions(),
            ]);
            this.profiles = profiles;
            this.sessions = sessions;
            if (!this.selectedProfileId || !this.profiles.find((item) => item.id === this.selectedProfileId)) {
                this.selectedProfileId = this.profiles.find((item) => item.isDefault)?.id || this.profiles[0]?.id || "";
            }
            if (!this.activeSessionId || !this.sessions.find((item) => item.id === this.activeSessionId)) {
                this.activeSessionId = this.sessions[0]?.id || "";
            }
        } catch (error) {
            showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
        } finally {
            this.loading = false;
            this.render();
            this.syncTerminalViews();
            if (this.activeSessionId) {
                void this.openRuntime(this.activeSessionId).catch((error) => {
                    this.failRuntime("refresh-open-runtime", error);
                });
            }
        }
    }

    private async createSession() {
        const profileId = this.selectedProfileId || this.profiles[0]?.id;
        if (!profileId) {
            showMessage(assistantText("没有可用的终端配置", "No terminal profile available"), 5000, "error");
            return;
        }
        try {
            const session = await createAssistantTerminalSession(profileId);
            this.sessions.unshift(session);
            this.activeSessionId = session.id;
            this.profileExpanded = false;
            this.sessionsExpanded = false;
            this.searchExpanded = false;
            this.render();
            this.syncTerminalViews();
            await this.openRuntime(session.id);
        } catch (error) {
            showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
        }
    }

    private async deleteActiveSession() {
        const session = this.sessions.find((item) => item.id === this.activeSessionId);
        if (!session) {
            return;
        }
        confirmDialog(window.sourceflow.languages.deleteOpConfirm || assistantText("关闭终端", "Close terminal"), assistantText("删除当前终端会话并结束对应进程？", "Delete the current terminal session and stop its process?"), async () => {
            try {
                await this.socket.send("assistantTerminalClose", {sessionId: session.id}).catch(() => null);
                await deleteAssistantTerminalSession(session.id);
                if (this.floatingSessionId === session.id) {
                    this.floatDialog?.destroy();
                }
                this.terminals.get(session.id)?.dispose();
                this.terminals.delete(session.id);
                this.sessions = this.sessions.filter((item) => item.id !== session.id);
                this.activeSessionId = this.sessions[0]?.id || "";
                this.render();
                this.syncTerminalViews();
                if (this.activeSessionId) {
                    await this.openRuntime(this.activeSessionId);
                }
            } catch (error) {
                showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
            }
        }, true);
    }

    private async selectSession(sessionId: string) {
        if (!sessionId) {
            return;
        }
        if (sessionId === this.activeSessionId) {
            if (this.sessionsExpanded) {
                this.sessionsExpanded = false;
                this.render();
            }
            return;
        }
        if (this.floatingSessionId && this.floatingSessionId !== sessionId) {
            this.floatDialog?.destroy();
        }
        this.activeSessionId = sessionId;
        this.profileExpanded = false;
        this.sessionsExpanded = false;
        this.searchExpanded = false;
        this.render();
        this.syncTerminalViews();
        await this.openRuntime(sessionId);
    }

    private selectProfile(profileId: string) {
        if (!profileId || profileId === this.selectedProfileId) {
            this.profileExpanded = false;
            this.render();
            return;
        }
        this.selectedProfileId = profileId;
        this.profileExpanded = false;
        this.render();
    }

    private focusSearch() {
        const input = this.element.querySelector("[data-role='search']") as HTMLInputElement;
        if (!input) {
            return;
        }
        input.focus();
        input.select();
    }

    private getSelectedProfile() {
        return this.profiles.find((item) => item.id === this.selectedProfileId) || this.profiles.find((item) => item.isDefault) || this.profiles[0];
    }

    private getActiveSession() {
        return this.sessions.find((item) => item.id === this.activeSessionId);
    }

    private getCompactPathLabel(cwd?: string) {
        const value = `${cwd || ""}`.trim();
        if (!value) {
            return "";
        }
        const segments = value.split(/[\\/]+/).filter(Boolean);
        if (!segments.length) {
            return truncateText(value, 28);
        }
        const tail = segments.slice(-2).join("/");
        return truncateText(tail || segments[segments.length - 1], 28);
    }

    private buildHoverHint(summary: string, action: string) {
        return `${summary} · ${action}`;
    }

    private getSessionStatusLabel(status?: string) {
        switch (`${status || ""}`) {
            case "running":
                return assistantText("运行中", "Running");
            case "exited":
                return assistantText("已退出", "Exited");
            case "closed":
                return assistantText("已关闭", "Closed");
            case "idle":
                return assistantText("空闲", "Idle");
            default:
                return assistantText("准备中", "Starting");
        }
    }

    private getProfileLauncherHint(selectedProfile?: IAssistantTerminalProfile) {
        if (!selectedProfile) {
            return this.buildHoverHint(
                assistantText("没有可用终端配置", "No terminal profile available"),
                assistantText("请先配置", "Configure first")
            );
        }
        return this.buildHoverHint(
            `${assistantText("当前配置", "Current profile")} · ${selectedProfile.name}`,
            this.profileExpanded ? assistantText("点击收起", "Click to hide") : assistantText("点击切换", "Click to switch")
        );
    }

    private getNewSessionHint() {
        return assistantText("新建终端会话", "Start a new terminal session");
    }

    private getSessionLauncherHint(activeSession?: IAssistantTerminalSession) {
        if (!activeSession) {
            return this.buildHoverHint(
                assistantText("还没有终端会话", "No terminal sessions yet"),
                assistantText("点击查看或新建", "Click to view or create")
            );
        }
        return this.buildHoverHint(
            `${activeSession.title || activeSession.shell || assistantText("终端", "Terminal")} · ${this.getSessionStatusLabel(activeSession.status)}`,
            this.sessionsExpanded ? assistantText("点击收起", "Click to hide") : assistantText("点击切换", "Click to switch")
        );
    }

    private getSearchToggleHint() {
        return this.buildHoverHint(
            this.searchExpanded ? assistantText("搜索已展开", "Search shown") : assistantText("搜索已收起", "Search hidden"),
            this.searchExpanded ? assistantText("点击收起", "Click to hide") : assistantText("点击展开", "Click to show")
        );
    }

    private getSearchRunHint() {
        return this.buildHoverHint(
            this.searchKeyword.trim()
                ? `${assistantText("关键字", "Keyword")} · ${truncateText(this.searchKeyword.trim(), 18)}`
                : assistantText("还没有输入关键字", "No keyword entered yet"),
            assistantText("点击搜索", "Click to search")
        );
    }

    private getDismissSearchHint() {
        return this.buildHoverHint(
            assistantText("搜索已展开", "Search shown"),
            assistantText("点击收起", "Click to hide")
        );
    }

    private getFloatHint(activeSession?: IAssistantTerminalSession) {
        return this.buildHoverHint(
            activeSession ? `${assistantText("当前终端", "Current terminal")} · ${activeSession.title || activeSession.shell || assistantText("终端", "Terminal")}` : assistantText("没有活动终端", "No active terminal"),
            assistantText("点击悬浮打开", "Click to float")
        );
    }

    private getDeleteHint(activeSession?: IAssistantTerminalSession) {
        return this.buildHoverHint(
            activeSession ? `${assistantText("当前终端", "Current terminal")} · ${activeSession.title || activeSession.shell || assistantText("终端", "Terminal")}` : assistantText("没有活动终端", "No active terminal"),
            assistantText("点击关闭", "Click to close")
        );
    }

    private getProfileItemHint(profile: IAssistantTerminalProfile, isActive: boolean) {
        if (isActive) {
            return this.buildHoverHint(
                `${assistantText("当前配置", "Current profile")} · ${profile.name}`,
                assistantText("点击收起", "Click to hide")
            );
        }
        return this.buildHoverHint(profile.name, assistantText("点击切换", "Click to switch"));
    }

    private getProfilePanelDismissHint() {
        return this.buildHoverHint(
            assistantText("配置列表已展开", "Profile list shown"),
            assistantText("点击收起", "Click to hide")
        );
    }

    private getSessionItemHint(session: IAssistantTerminalSession, isActive: boolean) {
        const title = session.title || session.shell || assistantText("终端", "Terminal");
        if (isActive) {
            return this.buildHoverHint(
                `${assistantText("当前终端", "Current terminal")} · ${title}`,
                assistantText("点击收起", "Click to hide")
            );
        }
        return this.buildHoverHint(title, assistantText("点击切换", "Click to switch"));
    }

    private getSessionPanelDismissHint() {
        return this.buildHoverHint(
            assistantText("会话列表已展开", "Session list shown"),
            assistantText("点击收起", "Click to hide")
        );
    }

    private ensureTerminal(session: IAssistantTerminalSession) {
        let terminal = this.terminals.get(session.id);
        if (terminal) {
            return terminal;
        }
        terminal = new AssistantTerminalInstance(session, (data, commandText) => {
            void this.socket.send("assistantTerminalInput", {
                sessionId: session.id,
                data,
                commandText,
            }).catch((error) => {
                showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
            });
        });
        this.terminals.set(session.id, terminal);
        return terminal;
    }

    private async openRuntime(sessionId: string) {
        const session = this.sessions.find((item) => item.id === sessionId);
        if (!session) {
            return;
        }
        const terminal = this.ensureTerminal(session);
        const size = terminal.getSize();
        try {
            await this.socket.send("assistantTerminalOpen", {
                sessionId,
                width: size.width,
                height: size.height,
            });
        } catch (error) {
            showMessage(error instanceof Error ? error.message : String(error), 5000, "error");
            return;
        }
        this.markSessionStatus(sessionId, "running");
        terminal.fit();
        terminal.focus();
    }

    private handleSocketEvent(data: IWebSocketData) {
        const payload = data.data || {};
        const sessionId = payload.sessionId;
        if (!sessionId) {
            return;
        }
        if (data.cmd === "assistantTerminalOutput") {
            this.terminals.get(sessionId)?.write(payload.output || "");
            return;
        }
        if (data.cmd === "assistantTerminalReady") {
            this.markSessionStatus(sessionId, payload.status || "running");
            this.terminals.get(sessionId)?.fit();
            return;
        }
        if (data.cmd === "assistantTerminalResize") {
            this.terminals.get(sessionId)?.fit();
            return;
        }
        if (data.cmd === "assistantTerminalExit") {
            this.markSessionStatus(sessionId, payload.status || "exited");
        }
    }

    private markSessionStatus(sessionId: string, status: string) {
        const session = this.sessions.find((item) => item.id === sessionId);
        if (!session) {
            return;
        }
        session.status = status;
        session.updatedAt = Date.now();
        if (status === "running" && !session.startedAt) {
            session.startedAt = Date.now();
        }
        if ((status === "exited" || status === "closed") && !session.endedAt) {
            session.endedAt = Date.now();
        }
        this.render();
        this.syncTerminalViews();
    }

    private render() {
        if (this.failed) {
            this.element.innerHTML = `<div class="assistant-dock__header">
    <div class="assistant-dock__header-main">
        <div class="assistant-dock__headline">
            <div class="assistant-dock__title">${assistantText("终端", "Terminal")}</div>
            <div class="assistant-dock__summary">${assistantText("已隔离", "Isolated")}</div>
        </div>
    </div>
</div>
<div class="assistant-terminal fn__flex-1 fn__flex-column">
    <div class="assistant-terminal__empty">${assistantText("终端功能运行时出错，已自动隔离，不影响笔记使用。", "Terminal runtime failed and has been isolated. Notes remain usable.")}</div>
</div>`;
            return;
        }
        const activeSession = this.getActiveSession();
        const selectedProfile = this.getSelectedProfile();
        const headerSummary = activeSession
            ? `${this.getCompactPathLabel(activeSession.cwd) || truncateText(activeSession.shell || assistantText("终端", "Terminal"), 18)} · ${truncateText(activeSession.shell || selectedProfile?.shell || assistantText("Shell", "Shell"), 12)}`
            : assistantText("PowerShell / CMD / WSL", "PowerShell / CMD / WSL");
        const sessionCountHTML = this.sessions.length > 1
            ? `<span class="assistant-terminal__session-launcher-count">${this.sessions.length}</span>`
            : "";
        const profileLauncherHint = this.getProfileLauncherHint(selectedProfile);
        const newSessionHint = this.getNewSessionHint();
        const sessionLauncherHint = this.getSessionLauncherHint(activeSession);
        const searchToggleHint = this.getSearchToggleHint();
        const searchRunHint = this.getSearchRunHint();
        const dismissSearchHint = this.getDismissSearchHint();
        const floatHint = this.getFloatHint(activeSession);
        const deleteHint = this.getDeleteHint(activeSession);
        this.element.innerHTML = `<div class="assistant-dock__header">
    <div class="assistant-dock__header-main">
        <div class="assistant-dock__headline">
            <div class="assistant-dock__title">${assistantText("终端", "Terminal")}</div>
            <div class="assistant-dock__summary" title="${escapeAttr(activeSession?.cwd || headerSummary)}">${escapeHTML(headerSummary)}</div>
        </div>
    </div>
</div>
<div class="assistant-terminal fn__flex-1 fn__flex-column">
    <div class="assistant-terminal__toolbar">
        <div class="assistant-terminal__toolbar-strip">
        <div class="assistant-terminal__toolbar-group assistant-terminal__toolbar-group--profile">
            <button type="button" class="assistant-terminal__profile-launcher${this.profileExpanded ? " assistant-terminal__profile-launcher--active" : ""}" data-action="toggle-profile-panel"${selectedProfile ? "" : " disabled"} aria-label="${escapeAttr(profileLauncherHint)}" title="${escapeAttr(profileLauncherHint)}">
                <span class="assistant-terminal__profile-copy">
                    <span class="assistant-terminal__profile-name">${escapeHTML(truncateText(selectedProfile?.name || assistantText("没有配置", "No profile"), 18))}</span>
                </span>
                <svg><use xlink:href="#iconDown"></use></svg>
            </button>
            <button type="button" class="assistant-terminal__control-button assistant-terminal__control-button--icon" data-action="new-session"${this.profiles.length ? "" : " disabled"} aria-label="${escapeAttr(newSessionHint)}" title="${escapeAttr(newSessionHint)}">
                <svg><use xlink:href="#iconAdd"></use></svg>
            </button>
            <button type="button" class="assistant-terminal__session-launcher${this.sessionsExpanded ? " assistant-terminal__session-launcher--active" : ""}" data-action="toggle-sessions"${activeSession ? "" : " disabled"} aria-label="${escapeAttr(sessionLauncherHint)}" title="${escapeAttr(sessionLauncherHint)}">
                <span class="assistant-terminal__tab-status assistant-terminal__tab-status--${activeSession?.status || "idle"}"></span>
                <span class="assistant-terminal__session-launcher-title">${escapeHTML(truncateText(activeSession?.title || activeSession?.shell || assistantText("终端", "Terminal"), 14))}</span>
                ${sessionCountHTML}
                <svg><use xlink:href="#iconDown"></use></svg>
            </button>
        </div>
        <div class="assistant-terminal__toolbar-group assistant-terminal__toolbar-group--actions">
            <button type="button" class="assistant-terminal__control-button assistant-terminal__control-button--icon${this.searchExpanded ? " assistant-terminal__control-button--active" : ""}" data-action="toggle-search"${this.activeSessionId ? "" : " disabled"} aria-label="${escapeAttr(searchToggleHint)}" title="${escapeAttr(searchToggleHint)}">
                <svg><use xlink:href="#iconSearch"></use></svg>
            </button>
            <button type="button" class="assistant-terminal__control-button assistant-terminal__control-button--icon" data-action="float-terminal"${this.activeSessionId ? "" : " disabled"} aria-label="${escapeAttr(floatHint)}" title="${escapeAttr(floatHint)}">
                <svg><use xlink:href="#iconOpenWindow"></use></svg>
            </button>
            <button type="button" class="assistant-terminal__control-button assistant-terminal__control-button--icon" data-action="delete-session"${this.activeSessionId ? "" : " disabled"} aria-label="${escapeAttr(deleteHint)}" title="${escapeAttr(deleteHint)}">
                <svg><use xlink:href="#iconTrashcan"></use></svg>
            </button>
        </div>
        </div>
        ${this.profileExpanded ? this.renderProfilePanel(selectedProfile) : ""}
        ${this.sessionsExpanded ? this.renderSessionPanel() : ""}
        ${this.searchExpanded ? `<div class="assistant-terminal__search-panel">
            <input class="b3-text-field assistant-terminal__search" data-role="search" value="${escapeAttr(this.searchKeyword)}" placeholder="${escapeAttr(assistantText("搜索当前终端输出", "Search current terminal output"))}">
            <button type="button" class="assistant-terminal__control-button assistant-terminal__control-button--icon" data-action="search-terminal"${this.activeSessionId ? "" : " disabled"} aria-label="${escapeAttr(searchRunHint)}" title="${escapeAttr(searchRunHint)}">
                <svg><use xlink:href="#iconSearch"></use></svg>
            </button>
            <button type="button" class="assistant-terminal__control-button assistant-terminal__control-button--icon" data-action="dismiss-search" aria-label="${escapeAttr(dismissSearchHint)}" title="${escapeAttr(dismissSearchHint)}">
                <svg><use xlink:href="#iconCloseRound"></use></svg>
            </button>
        </div>` : ""}
    </div>
    <div class="assistant-terminal__viewport fn__flex-1">${this.renderViewportPlaceholder()}</div>
</div>`;
    }

    private renderProfilePanel(selectedProfile?: IAssistantTerminalProfile) {
        if (!this.profiles.length) {
            return `<div class="assistant-terminal__profile-panel">
    <div class="assistant-terminal__profile-empty">${assistantText("没有可用终端配置", "No terminal profile available")}</div>
</div>`;
        }
        return `<div class="assistant-terminal__profile-panel">
    <div class="assistant-terminal__profile-list">${this.profiles.map((profile) => {
            const profileHint = this.getProfileItemHint(profile, profile.id === selectedProfile?.id);
            return `
        <button type="button" class="assistant-terminal__profile-item${profile.id === selectedProfile?.id ? " assistant-terminal__profile-item--active" : ""}" data-profile-id="${escapeAttr(profile.id)}" aria-label="${escapeAttr(profileHint)}" title="${escapeAttr(profileHint)}">
            <span class="assistant-terminal__profile-item-name">${escapeHTML(profile.name)}</span>
            <span class="assistant-terminal__profile-item-meta">${escapeHTML(profile.shell)}${profile.isDefault ? ` · ${escapeHTML(assistantText("默认", "Default"))}` : ""}</span>
        </button>`;
        }).join("")}</div>
    <button type="button" class="assistant-terminal__profile-dismiss" data-action="dismiss-profile-panel" aria-label="${escapeAttr(this.getProfilePanelDismissHint())}" title="${escapeAttr(this.getProfilePanelDismissHint())}">${assistantText("收起", "Hide")}</button>
</div>`;
    }

    private renderSessionPanel() {
        if (this.loading) {
            return `<div class="assistant-terminal__loading">${assistantText("加载中...", "Loading...")}</div>`;
        }
        if (!this.sessions.length) {
            return `<div class="assistant-terminal__session-panel">${panelEmptyHTML(assistantText("还没有终端会话", "No terminal sessions"), assistantText("点击“新终端”创建第一个 PTY 会话。", "Create your first PTY session by clicking New Terminal."))}</div>`;
        }
        return `<div class="assistant-terminal__session-panel">
    <div class="assistant-terminal__session-list">${this.sessions.map((session) => {
            const sessionHint = this.getSessionItemHint(session, session.id === this.activeSessionId);
            return `
        <button type="button" class="assistant-terminal__session-item${session.id === this.activeSessionId ? " assistant-terminal__session-item--active" : ""}" data-session-id="${escapeAttr(session.id)}" aria-label="${escapeAttr(sessionHint)}" title="${escapeAttr(sessionHint)}">
            <span class="assistant-terminal__session-item-row">
                <span class="assistant-terminal__tab-status assistant-terminal__tab-status--${session.status || "idle"}"></span>
                <span class="assistant-terminal__session-item-title">${escapeHTML(truncateText(session.title || session.shell || assistantText("终端", "Terminal"), 28))}</span>
            </span>
            <span class="assistant-terminal__session-item-meta">${formatDateTime(session.updatedAt || session.createdAt)}</span>
        </button>`;
        }).join("")}</div>
    <button type="button" class="assistant-terminal__profile-dismiss" data-action="dismiss-sessions" aria-label="${escapeAttr(this.getSessionPanelDismissHint())}" title="${escapeAttr(this.getSessionPanelDismissHint())}">${assistantText("收起", "Hide")}</button>
</div>`;
    }

    private renderViewportPlaceholder() {
        if (this.sessions.length) {
            return "";
        }
        return `<div class="assistant-terminal__empty">${assistantText("终端输出会显示在这里", "Terminal output will appear here")}</div>`;
    }

    private getViewportElement() {
        return this.element.querySelector(".assistant-terminal__viewport") as HTMLElement;
    }

    private syncTerminalViews() {
        if (this.failed) {
            return;
        }
        const viewport = this.getViewportElement();
        if (!viewport) {
            return;
        }
        this.sessions.forEach((session) => {
            const terminal = this.terminals.get(session.id);
            if (!terminal) {
                return;
            }
            if (this.floatingSessionId === session.id) {
                const floatBody = this.floatDialog?.element.querySelector(".assistant-terminal__float-body") as HTMLElement;
                if (floatBody) {
                    terminal.attach(floatBody);
                    terminal.setVisible(true);
                    return;
                }
            }
            terminal.attach(viewport);
            terminal.setVisible(session.id === this.activeSessionId);
        });
    }

    private searchInActiveTerminal() {
        const keyword = this.searchKeyword.trim();
        if (!keyword) {
            return;
        }
        const matched = this.terminals.get(this.activeSessionId)?.search(keyword);
        if (!matched) {
            showMessage(assistantText("当前终端输出中没有匹配内容", "No match found in the current terminal output"));
        }
    }

    private openFloatingDialog() {
        if (this.failed) {
            return;
        }
        const session = this.sessions.find((item) => item.id === this.activeSessionId);
        if (!session) {
            return;
        }
        this.ensureTerminal(session);
        this.floatDialog?.destroy();
        this.floatingSessionId = session.id;
        this.floatDialog = new Dialog({
            title: `${assistantText("终端", "Terminal")} · ${session.title}`,
            content: `<div class="assistant-terminal__float-wrap fn__flex-column">
    <div class="assistant-terminal__float-toolbar">
        <button type="button" class="b3-button b3-button--outline" data-action="toggle-float-fullscreen">${assistantText("全屏", "Fullscreen")}</button>
        <button type="button" class="b3-button b3-button--text" data-action="return-dock">${assistantText("返回侧栏", "Return to Dock")}</button>
    </div>
    <div class="assistant-terminal__float-body fn__flex-1"></div>
</div>`,
            width: "92vw",
            height: "86vh",
            containerClassName: "assistant-terminal-dialog",
            resizeCallback: () => {
                this.terminals.get(session.id)?.fit();
            },
            destroyCallback: () => {
                this.floatingSessionId = "";
                this.floatDialog = null;
                this.syncTerminalViews();
                this.terminals.get(this.activeSessionId)?.fit();
            },
        });
        this.floatDialog.element.addEventListener("click", (event: MouseEvent) => {
            let target = event.target as HTMLElement;
            while (target && !target.isEqualNode(this.floatDialog.element)) {
                const action = target.getAttribute("data-action");
                if (action === "toggle-float-fullscreen") {
                    this.toggleFloatFullscreen();
                    event.preventDefault();
                    return;
                }
                if (action === "return-dock") {
                    this.floatDialog?.destroy();
                    event.preventDefault();
                    return;
                }
                target = target.parentElement;
            }
        });
        this.syncTerminalViews();
        this.terminals.get(session.id)?.fit();
        this.terminals.get(session.id)?.focus();
    }

    private toggleFloatFullscreen() {
        const container = this.floatDialog?.element.querySelector(".b3-dialog__container") as HTMLElement;
        if (!container) {
            return;
        }
        const isFullscreen = container.getAttribute("data-assistant-fullscreen") === "true";
        if (isFullscreen) {
            container.style.width = container.getAttribute("data-width") || "92vw";
            container.style.height = container.getAttribute("data-height") || "86vh";
            container.style.left = container.getAttribute("data-left") || "auto";
            container.style.top = container.getAttribute("data-top") || "auto";
            container.setAttribute("data-assistant-fullscreen", "false");
        } else {
            container.setAttribute("data-width", container.style.width || "92vw");
            container.setAttribute("data-height", container.style.height || "86vh");
            container.setAttribute("data-left", container.style.left || "auto");
            container.setAttribute("data-top", container.style.top || "auto");
            container.style.width = "calc(100vw - 24px)";
            container.style.height = "calc(100vh - 24px)";
            container.style.left = "12px";
            container.style.top = "12px";
            container.setAttribute("data-assistant-fullscreen", "true");
        }
        this.terminals.get(this.floatingSessionId)?.fit();
    }
}

let terminalDockInstance: AssistantTerminalDock | null = null;

export const mountAssistantTerminalDock = (custom: Custom, app: App) => {
    terminalDockInstance?.destroy();
    terminalDockInstance = new AssistantTerminalDock(custom, app);
};

export const destroyAssistantTerminalDock = () => {
    terminalDockInstance?.destroy();
    terminalDockInstance = null;
};

export const resizeAssistantTerminalDock = () => {
    terminalDockInstance?.resize();
};

export const updateAssistantTerminalDock = () => {
    terminalDockInstance?.update();
};
