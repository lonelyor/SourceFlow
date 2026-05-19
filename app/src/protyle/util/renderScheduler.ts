const BATCH_SIZE = 16;
const FRAME_BUDGET_MS = 12;

type RenderTask = () => void;

interface ScheduledJob {
    tasks: RenderTask[];
    label: string;
}

const queue: ScheduledJob[] = [];
let running = false;
let currentJobIndex = 0;
let currentTaskIndex = 0;
let rafId = 0;

const isInViewport = (element: Element, container: HTMLElement): boolean => {
    if (!element.getBoundingClientRect) {
        return true;
    }
    const containerRect = container.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const margin = containerRect.height * 2;
    return rect.bottom >= containerRect.top - margin && rect.top <= containerRect.bottom + margin;
};

const splitByViewport = (elements: Element[], container: HTMLElement): { visible: Element[], hidden: Element[] } => {
    const visible: Element[] = [];
    const hidden: Element[] = [];
    for (const el of elements) {
        if (isInViewport(el, container)) {
            visible.push(el);
        } else {
            hidden.push(el);
        }
    }
    return { visible, hidden };
};

const runFrame = () => {
    if (queue.length === 0) {
        running = false;
        return;
    }
    const start = performance.now();

    while (currentJobIndex < queue.length) {
        const job = queue[currentJobIndex];
        while (currentTaskIndex < job.tasks.length) {
            job.tasks[currentTaskIndex]();
            currentTaskIndex++;
            if (performance.now() - start > FRAME_BUDGET_MS) {
                rafId = requestAnimationFrame(runFrame);
                return;
            }
        }
        currentJobIndex++;
        currentTaskIndex = 0;
    }

    queue.length = 0;
    currentJobIndex = 0;
    currentTaskIndex = 0;
    running = false;
};

const flush = () => {
    if (!running) {
        running = true;
        rafId = requestAnimationFrame(runFrame);
    }
};

export const scheduleRender = (label: string, tasks: RenderTask[]) => {
    if (tasks.length === 0) {
        return;
    }
    queue.push({ label, tasks });
    flush();
};

export const cancelScheduledRenders = () => {
    if (rafId) {
        cancelAnimationFrame(rafId);
    }
    queue.length = 0;
    currentJobIndex = 0;
    currentTaskIndex = 0;
    running = false;
};

export { isInViewport, splitByViewport, BATCH_SIZE };
