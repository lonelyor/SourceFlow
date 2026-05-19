export interface SingleMenuContext {
    protyle: IProtyle,
    nodeElement: HTMLElement,
    id: string,
    type: string,
    subType: string,
}

export type PrepareSingleMenuResult =
    | {kind: "skip"}
    | {kind: "menu"}
    | {kind: "context", context: SingleMenuContext};
