declare module "mind-elixir" {
    import type {MindElixirData as SourceFlowMindElixirData} from "../../../protyle/render/mindmapData";

    export interface MindElixirTheme {
        cssVar?: Record<string, string>;
        [key: string]: unknown;
    }

    export interface MindElixirOptions {
        el: HTMLElement;
        direction?: number;
        editable?: boolean;
        contextMenu?: boolean;
        toolBar?: boolean;
        keypress?: boolean;
        allowUndo?: boolean;
        overflowHidden?: boolean;
        handleWheel?: boolean;
        theme?: MindElixirTheme;
    }

    export interface MindElixirBus {
        addListener(event: string, listener: (...args: any[]) => void): void;
    }

    export class MindElixir {
        constructor(options: MindElixirOptions);

        bus: MindElixirBus;

        init(data: SourceFlowMindElixirData): void;

        destroy(): void;

        getData(): SourceFlowMindElixirData;

        scaleFit(): void;

        toCenter(): void;
    }

    export type MindElixirData = SourceFlowMindElixirData;
    export type MindElixirInstance = MindElixir;

    export const SIDE: number;
    export const DARK_THEME: MindElixirTheme;
    export const THEME: MindElixirTheme;

    export default MindElixir;
}
