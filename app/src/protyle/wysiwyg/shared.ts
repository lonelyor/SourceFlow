export interface WYSIWYGEventContext {
    element: HTMLDivElement;
    preventKeyup: boolean;
    preventClick: boolean;
}

export interface WYSIWYGEditorEventState {
    beforeContextmenuRange?: Range;
    preventGetTopHTML: boolean;
    isComposition: boolean;
    timeout?: number;
    mobileBlur: boolean;
}
