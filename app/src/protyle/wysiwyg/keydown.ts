import {handleDocumentActionKeydown} from "./keydown/documentActions";
import {handleEditingKeydown} from "./keydown/editing";
import {getContentByInlineHTML} from "./keydown/inline";
import {prepareKeydownContext} from "./keydown/preflight";
import type {ActiveKeydownContext} from "./keydown/shared";
import {handleSelectionKeydown} from "./keydown/selection";
import {handleStructureKeydown} from "./keydown/structureActions";

export {getContentByInlineHTML};

export const keydown = (protyle: IProtyle, editorElement: HTMLElement) => {
    editorElement.addEventListener("keydown", async (event: KeyboardEvent & { target: HTMLElement }) => {
        const context = prepareKeydownContext(protyle, editorElement, event);
        if (!context) {
            return;
        }

        const selectionResult = handleSelectionKeydown(context);
        if (selectionResult !== undefined) {
            return selectionResult;
        }

        const activeContext: ActiveKeydownContext = {
            ...context,
            selectText: context.range.toString(),
        };

        const editingResult = handleEditingKeydown(activeContext);
        if (editingResult !== undefined) {
            return editingResult;
        }

        const documentActionResult = handleDocumentActionKeydown(activeContext);
        if (documentActionResult !== undefined) {
            return documentActionResult;
        }

        return handleStructureKeydown(activeContext);
    });
};
