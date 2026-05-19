export type KeydownEvent = KeyboardEvent & { target: HTMLElement };

export interface KeydownContext {
    protyle: IProtyle,
    editorElement: HTMLElement,
    event: KeydownEvent,
    range: Range,
    nodeElement: HTMLElement,
    nodeType: string,
}

export interface ActiveKeydownContext extends KeydownContext {
    selectText: string,
}

export type KeydownHandlerResult = boolean | void;
