export const setBrandedAppState = <T extends ISourceFlow>(state: T): T => {
    window.sourceflow = state;
    return state;
};

export const getBrandedAppState = (): ISourceFlow => {
    return window.sourceflow;
};

export const dispatchBrandedWindowEvent = (eventName: string, detail?: unknown) => {
    window.dispatchEvent(new CustomEvent(eventName, {detail}));
};
