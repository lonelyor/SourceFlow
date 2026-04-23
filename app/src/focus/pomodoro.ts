import {showMessage} from "../dialog/message";
import {sendNotification} from "../plugin/platformUtils";
import {assistantText} from "../assistant/constants";

export type TPomodoroPhase = "idle" | "work" | "break";

export interface IPomodoroState {
    phase: TPomodoroPhase;
    running: boolean;
    workMinutes: number;
    breakMinutes: number;
    remainingMs: number;
    cycleCount: number;
    lastTickAt: number;
}

const MINUTE_MS = 60 * 1000;
const TICK_INTERVAL = 250;

const normalizeMinutes = (value: number, fallback: number, min: number, max: number) => {
    const rounded = Math.round(Number(value));
    if (!Number.isFinite(rounded)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, rounded));
};

const getDefaultPomodoroState = (): IPomodoroState => ({
    phase: "idle",
    running: false,
    workMinutes: 25,
    breakMinutes: 5,
    remainingMs: 25 * MINUTE_MS,
    cycleCount: 0,
    lastTickAt: 0,
});

let pomodoroState = getDefaultPomodoroState();
let pomodoroTimer = 0;
const pomodoroListeners = new Set<(state: IPomodoroState) => void>();

const cloneState = (): IPomodoroState => ({...pomodoroState});

const emitPomodoroState = () => {
    const snapshot = cloneState();
    pomodoroListeners.forEach((listener) => {
        listener(snapshot);
    });
};

const clearPomodoroTicker = () => {
    if (!pomodoroTimer) {
        return;
    }
    window.clearInterval(pomodoroTimer);
    pomodoroTimer = 0;
};

const ensurePomodoroTicker = () => {
    if (pomodoroTimer) {
        return;
    }
    pomodoroTimer = window.setInterval(() => {
        tickPomodoro();
    }, TICK_INTERVAL);
};

const getPhaseText = (phase: TPomodoroPhase) => {
    switch (phase) {
        case "work":
            return assistantText("专注", "Focus");
        case "break":
            return assistantText("休息", "Break");
        default:
            return assistantText("待开始", "Ready");
    }
};

const notifyPomodoroPhase = (phase: TPomodoroPhase) => {
    if (phase === "work") {
        const title = pomodoroState.breakMinutes > 0
            ? assistantText("专注结束，开始休息", "Focus session complete, take a break")
            : assistantText("专注结束，下一轮已开始", "Focus session complete, next round started");
        const body = pomodoroState.breakMinutes > 0
            ? assistantText(
                `已完成第 ${pomodoroState.cycleCount} 轮专注，休息 ${pomodoroState.breakMinutes} 分钟。`,
                `Completed focus round ${pomodoroState.cycleCount}. Take a ${pomodoroState.breakMinutes}-minute break.`
            )
            : assistantText(
                `已完成第 ${pomodoroState.cycleCount} 轮专注，下一轮 ${pomodoroState.workMinutes} 分钟已开始。`,
                `Completed focus round ${pomodoroState.cycleCount}. The next ${pomodoroState.workMinutes}-minute session has started.`
            );
        showMessage(title, 4000);
        void sendNotification({
            channel: "SourceFlow Focus",
            title,
            body,
            delayInSeconds: 0,
        });
        return;
    }
    if (phase === "break") {
        const title = assistantText("休息结束，回到专注", "Break complete, back to focus");
        const body = assistantText(
            `下一轮专注 ${pomodoroState.workMinutes} 分钟已开始。`,
            `The next ${pomodoroState.workMinutes}-minute focus session has started.`
        );
        showMessage(title, 4000);
        void sendNotification({
            channel: "SourceFlow Focus",
            title,
            body,
            delayInSeconds: 0,
        });
    }
};

const enterPomodoroPhase = (phase: Exclude<TPomodoroPhase, "idle">, notifyFromPhase?: TPomodoroPhase) => {
    pomodoroState.phase = phase;
    pomodoroState.running = true;
    pomodoroState.remainingMs = Math.max((phase === "work" ? pomodoroState.workMinutes : pomodoroState.breakMinutes) * MINUTE_MS, MINUTE_MS);
    pomodoroState.lastTickAt = Date.now();
    ensurePomodoroTicker();
    if (notifyFromPhase) {
        notifyPomodoroPhase(notifyFromPhase);
    }
    emitPomodoroState();
};

const completePomodoroPhase = (manual = false) => {
    const finishedPhase = pomodoroState.phase;
    if (finishedPhase === "idle") {
        return;
    }
    if (finishedPhase === "work") {
        pomodoroState.cycleCount += 1;
        if (pomodoroState.breakMinutes > 0) {
            enterPomodoroPhase("break", manual ? undefined : "work");
            return;
        }
        enterPomodoroPhase("work", manual ? undefined : "work");
        return;
    }
    enterPomodoroPhase("work", manual ? undefined : "break");
};

const tickPomodoro = () => {
    if (!pomodoroState.running || pomodoroState.phase === "idle") {
        clearPomodoroTicker();
        return;
    }
    const now = Date.now();
    const elapsed = Math.max(0, now - pomodoroState.lastTickAt);
    pomodoroState.lastTickAt = now;
    pomodoroState.remainingMs -= elapsed;
    if (pomodoroState.remainingMs > 0) {
        emitPomodoroState();
        return;
    }
    completePomodoroPhase(false);
};

export const getPomodoroState = () => cloneState();

export const subscribePomodoroState = (listener: (state: IPomodoroState) => void) => {
    pomodoroListeners.add(listener);
    listener(cloneState());
    return () => {
        pomodoroListeners.delete(listener);
    };
};

export const setPomodoroDurations = (workMinutes: number, breakMinutes: number) => {
    const nextWork = normalizeMinutes(workMinutes, pomodoroState.workMinutes, 1, 180);
    const nextBreak = normalizeMinutes(breakMinutes, pomodoroState.breakMinutes, 0, 60);
    pomodoroState.workMinutes = nextWork;
    pomodoroState.breakMinutes = nextBreak;
    if (!pomodoroState.running && pomodoroState.phase === "idle") {
        pomodoroState.remainingMs = nextWork * MINUTE_MS;
    }
    emitPomodoroState();
};

export const startPomodoro = () => {
    if (pomodoroState.running) {
        return;
    }
    if (pomodoroState.phase === "idle") {
        pomodoroState.phase = "work";
        pomodoroState.remainingMs = pomodoroState.workMinutes * MINUTE_MS;
    }
    pomodoroState.running = true;
    pomodoroState.lastTickAt = Date.now();
    ensurePomodoroTicker();
    emitPomodoroState();
};

export const pausePomodoro = () => {
    if (!pomodoroState.running) {
        return;
    }
    if (pomodoroState.lastTickAt) {
        pomodoroState.remainingMs = Math.max(0, pomodoroState.remainingMs - (Date.now() - pomodoroState.lastTickAt));
    }
    pomodoroState.running = false;
    pomodoroState.lastTickAt = 0;
    clearPomodoroTicker();
    emitPomodoroState();
};

export const resetPomodoro = () => {
    clearPomodoroTicker();
    pomodoroState = {
        ...pomodoroState,
        phase: "idle",
        running: false,
        remainingMs: pomodoroState.workMinutes * MINUTE_MS,
        cycleCount: 0,
        lastTickAt: 0,
    };
    emitPomodoroState();
};

export const skipPomodoroPhase = () => {
    if (pomodoroState.phase === "idle") {
        startPomodoro();
        return;
    }
    completePomodoroPhase(true);
};

export const formatPomodoroTime = (remainingMs: number) => {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts = [
        minutes.toString().padStart(2, "0"),
        seconds.toString().padStart(2, "0"),
    ];
    if (hours > 0) {
        parts.unshift(hours.toString().padStart(2, "0"));
    }
    return parts.join(":");
};

export const getPomodoroPhaseText = (phase: TPomodoroPhase) => getPhaseText(phase);
