import {Dialog} from "../dialog";
import {assistantText} from "../assistant/constants";
import {
    formatPomodoroTime,
    getPomodoroPhaseText,
    getPomodoroState,
    pausePomodoro,
    resetPomodoro,
    setPomodoroDurations,
    skipPomodoroPhase,
    startPomodoro,
    subscribePomodoroState,
} from "./pomodoro";

const POMODORO_DIALOG_KEY = "dialog-pomodoro";

const getPomodoroTexts = () => ({
    title: assistantText("番茄闹钟", "Pomodoro Timer"),
    summary: assistantText("开始后即使关闭弹窗也会继续计时，阶段切换会走系统通知。", "The timer keeps running after you close the dialog, and phase changes use system notifications."),
    workMinutes: assistantText("专注时长", "Focus"),
    breakMinutes: assistantText("休息时长", "Break"),
    cycles: assistantText("已完成轮次", "Rounds"),
    start: assistantText("开始", "Start"),
    pause: assistantText("暂停", "Pause"),
    resume: assistantText("继续", "Resume"),
    reset: assistantText("重置", "Reset"),
    skip: assistantText("跳过阶段", "Skip"),
    ready: assistantText("待开始", "Ready"),
});

class PomodoroDialogController {
    private readonly dialog: Dialog;
    private readonly element: HTMLElement;
    private readonly workInput: HTMLInputElement;
    private readonly breakInput: HTMLInputElement;
    private readonly timeElement: HTMLElement;
    private readonly phaseElement: HTMLElement;
    private readonly cycleElement: HTMLElement;
    private readonly startButton: HTMLButtonElement;
    private readonly pauseButton: HTMLButtonElement;
    private readonly resetButton: HTMLButtonElement;
    private readonly skipButton: HTMLButtonElement;
    private readonly texts = getPomodoroTexts();
    private readonly unsubscribe: () => void;

    constructor(dialog: Dialog) {
        this.dialog = dialog;
        this.element = dialog.element.querySelector(".pomodoro-dialog") as HTMLElement;
        this.workInput = this.element.querySelector('[data-role="work-minutes"]') as HTMLInputElement;
        this.breakInput = this.element.querySelector('[data-role="break-minutes"]') as HTMLInputElement;
        this.timeElement = this.element.querySelector('[data-role="time"]') as HTMLElement;
        this.phaseElement = this.element.querySelector('[data-role="phase"]') as HTMLElement;
        this.cycleElement = this.element.querySelector('[data-role="cycles"]') as HTMLElement;
        this.startButton = this.element.querySelector('[data-action="start"]') as HTMLButtonElement;
        this.pauseButton = this.element.querySelector('[data-action="pause"]') as HTMLButtonElement;
        this.resetButton = this.element.querySelector('[data-action="reset"]') as HTMLButtonElement;
        this.skipButton = this.element.querySelector('[data-action="skip"]') as HTMLButtonElement;
        this.bindEvents();
        this.unsubscribe = subscribePomodoroState((state) => {
            this.render(state);
        });
    }

    public destroy() {
        this.unsubscribe();
    }

    private bindEvents() {
        this.element.addEventListener("click", (event: MouseEvent) => {
            let target = event.target as HTMLElement;
            while (target && !target.isEqualNode(this.element)) {
                const preset = target.getAttribute("data-preset");
                if (preset) {
                    const [workMinutes, breakMinutes] = preset.split(":").map((item) => parseInt(item, 10));
                    setPomodoroDurations(workMinutes, breakMinutes);
                    event.preventDefault();
                    return;
                }
                const action = target.getAttribute("data-action");
                if (action === "start") {
                    startPomodoro();
                    event.preventDefault();
                    return;
                }
                if (action === "pause") {
                    pausePomodoro();
                    event.preventDefault();
                    return;
                }
                if (action === "reset") {
                    resetPomodoro();
                    event.preventDefault();
                    return;
                }
                if (action === "skip") {
                    skipPomodoroPhase();
                    event.preventDefault();
                    return;
                }
                target = target.parentElement;
            }
        });

        this.element.addEventListener("change", (event: Event) => {
            const target = event.target as HTMLInputElement;
            if (target.getAttribute("data-role") === "work-minutes" || target.getAttribute("data-role") === "break-minutes") {
                setPomodoroDurations(parseInt(this.workInput.value, 10), parseInt(this.breakInput.value, 10));
            }
        });
    }

    private render(state: ReturnType<typeof getPomodoroState>) {
        const isIdle = state.phase === "idle";
        this.workInput.value = `${state.workMinutes}`;
        this.breakInput.value = `${state.breakMinutes}`;
        this.workInput.disabled = state.running;
        this.breakInput.disabled = state.running;
        this.timeElement.textContent = formatPomodoroTime(state.remainingMs);
        this.phaseElement.textContent = isIdle ? this.texts.ready : getPomodoroPhaseText(state.phase);
        this.cycleElement.textContent = `${state.cycleCount}`;
        this.startButton.textContent = state.running ? this.texts.resume : (isIdle ? this.texts.start : this.texts.resume);
        this.startButton.classList.toggle("fn__none", state.running);
        this.pauseButton.classList.toggle("fn__none", !state.running);
        this.resetButton.disabled = isIdle && state.cycleCount === 0;
        this.skipButton.disabled = isIdle;
        this.element.setAttribute("data-phase", state.phase);
    }
}

const createPomodoroDialogHTML = () => {
    const texts = getPomodoroTexts();
    return `<div class="pomodoro-dialog fn__flex-column">
    <div class="pomodoro-dialog__hero">
        <div class="pomodoro-dialog__phase" data-role="phase">${texts.ready}</div>
        <div class="pomodoro-dialog__time" data-role="time">${formatPomodoroTime(getPomodoroState().remainingMs)}</div>
        <div class="pomodoro-dialog__summary">${texts.summary}</div>
    </div>
    <div class="pomodoro-dialog__presets">
        <button type="button" class="b3-button b3-button--outline" data-preset="25:5">25 / 5</button>
        <button type="button" class="b3-button b3-button--outline" data-preset="50:10">50 / 10</button>
        <button type="button" class="b3-button b3-button--outline" data-preset="90:15">90 / 15</button>
    </div>
    <div class="pomodoro-dialog__settings">
        <label class="pomodoro-dialog__field fn__flex-column">
            <span>${texts.workMinutes}</span>
            <input class="b3-text-field" type="number" min="1" max="180" step="1" data-role="work-minutes" value="${getPomodoroState().workMinutes}">
        </label>
        <label class="pomodoro-dialog__field fn__flex-column">
            <span>${texts.breakMinutes}</span>
            <input class="b3-text-field" type="number" min="0" max="60" step="1" data-role="break-minutes" value="${getPomodoroState().breakMinutes}">
        </label>
        <div class="pomodoro-dialog__field fn__flex-column">
            <span>${texts.cycles}</span>
            <div class="pomodoro-dialog__cycles" data-role="cycles">${getPomodoroState().cycleCount}</div>
        </div>
    </div>
    <div class="pomodoro-dialog__actions">
        <button type="button" class="b3-button b3-button--blue" data-action="start">${texts.start}</button>
        <button type="button" class="b3-button b3-button--outline fn__none" data-action="pause">${texts.pause}</button>
        <button type="button" class="b3-button b3-button--outline" data-action="skip">${texts.skip}</button>
        <button type="button" class="b3-button b3-button--outline" data-action="reset">${texts.reset}</button>
    </div>
</div>`;
};

export const openPomodoroDialog = () => {
    const existing = window.sourceflow.dialogs.find((item) => item.element.getAttribute("data-key") === POMODORO_DIALOG_KEY);
    if (existing) {
        (existing.element.querySelector(".pomodoro-dialog") as HTMLElement)?.focus();
        return existing;
    }
    const dialog = new Dialog({
        title: getPomodoroTexts().title,
        content: createPomodoroDialogHTML(),
        width: "520px",
        height: "520px",
        positionId: "pomodoro",
        containerClassName: "pomodoro-dialog__container",
    });
    dialog.element.setAttribute("data-key", POMODORO_DIALOG_KEY);
    dialog.data = dialog.data || {};
    const controller = new PomodoroDialogController(dialog);
    dialog.data.pomodoroController = controller;
    const oldDestroy = dialog.destroy.bind(dialog);
    dialog.destroy = (options?: IObject) => {
        controller.destroy();
        oldDestroy(options);
    };
    return dialog;
};
