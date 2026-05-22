export const applyEditorStructureGuideClasses = (element: HTMLElement) => {
    const editorConfig = window.sourceflow.config.editor;
    element.classList.toggle("protyle-wysiwyg--block-lines", editorConfig.displayBlockLineNumber);
    element.classList.toggle("protyle-wysiwyg--heading-levels", editorConfig.displayHeadingLevel !== false);
};
