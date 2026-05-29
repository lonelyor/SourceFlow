# Changelog

All notable changes to SourceFlow will be documented in this file.

## [Unreleased]

### Editor

- **Block numbers moved to left margin** — block numbers no longer appear as inline badges mixed with content. They now display in the left margin area (similar to VSCode line numbers), right-aligned and unobtrusive. Combined block-number + heading-level labels (e.g. "42 H1") are also displayed in the margin.
- **Always show block type icon** — new setting **Settings → Editor → Always show block type icon**. When enabled, the block type gutter icon persists in the left margin after hovering instead of disappearing on scroll or mouse leave. When disabled (default), the icon only appears on hover as before.
- Added `testEditorStructureGuide` — automated checks for config field, type declaration, settings UI, i18n, search index, SCSS positioning, `hideElements` logic, and global event handling.

## [0.1.5] - 2026-05-28

### Editor

- **Right-click inline format menu** — select text and access Bold, Italic, Underline, Strikethrough, Inline Code, Keyboard, Highlight, Super/Subscript, and Clear Format from a cascading submenu. Each item shows its keyboard shortcut.
- **Right-click block insertion menu** — insert Code Block, Math Block, Table, Blockquote, Divider, Headings (H1-H4), Bullet/Ordered/Task List, Hyperlink, Tag, Memo, Block Ref, Inline Math without leaving the context menu.
- **AI selection bar repositioned** — the assistant floating bar (Translate / Summarize / Rewrite / More) now appears **below** the text selection to avoid overlapping with the editor toolbar.

### File Tree

- **Active document highlight** — the currently open document is automatically highlighted in the file tree. The highlight color can be customized in **Settings → Appearance → Doc tree appearance → Active doc highlight**, with a color picker and reset button.

### Hyperlink

- **Fix: long encoded URLs display incorrectly** — URLs containing percent-encoded characters (e.g. `%5E`, `%3A`, `%2F`) no longer cause garbled rendering (mixed font sizes, missing characters). `genLinkText` no longer decodes percent-encoding and truncation guards against splitting `%XX` sequences or multi-byte characters.

### Shortcut Keys

- **Fix: shortcut settings page blank** — opening the shortcut key settings page no longer shows a blank panel. The root cause was `keymap.plugin[name]` being `undefined` when plugins register custom toolbar items or docks; optional chaining and null guards were added.
- **Fix: right-click menu crash** — the inline format submenu referenced a non-existent keymap key `editor.insert.strong` (correct: `editor.insert.bold`) causing a `TypeError`. All keymap key names have been verified against `SOURCEFLOW_KEYMAP`.
- **Added accelerators** — all inline format menu items now display their keyboard shortcut.

### Test & Quality

- Added `testKeymapConsistency` — 21 automated checks that verify keymap key name correctness, plugin access safety, menu ordering, and link text handling. Integrated into the typecheck pipeline.
- Comprehensive audit of all commits since v0.1.5 — verified safe property access for `config.keymap`, `config.appearance`, `languages`, and `storage`.

### AI Assistant

- Agent task executor, task review flow, operation audit history
- Inline editing, ghost draft, patch review, skill context, tool previews
- Provider presets, connectivity test, model list API
- Fake provider smoke coverage

### Features

- First-launch security notice and repo key copy
- File tree blank area context menu
- Backup tips, recent edits collapse, accent color, AI persona
- Templates, AI charts, batch ops, smart tags, highlights, desensitize, note styles
- Select-for-AI, inline translation, full-text translate
- Semantic search infrastructure (embedding + vector store + search UI)

### Fixes

- Zen mode exit button replaced with native breadcrumb bar
- Mobile build guard for zen mode exit button
- Shortcut conflict fix, Z-mode exit fix
- Kernel go vet warnings resolved
