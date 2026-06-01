# Changelog

All notable changes to SourceFlow will be documented in this file.

## [0.1.6] - 2026-06-01

### Stability And Safety

- `.sf` persistence now uses safe writes instead of truncating the original file before writing.
- Read, index, and document-list paths no longer move or delete note files automatically when IAL data or filenames look abnormal.
- Document tree cache no longer reuses mutable AST instances, avoiding cross-load contamination during indexing and rendering.
- Existing non-empty notes cannot be overwritten by an empty AST.
- Large insert/delete transaction failures now roll back and return errors instead of partially writing note state.
- Transaction queue waits, per-transaction waits, and SQL write queue waits now have timeout diagnostics.

### Security

- `/api/filetree/listDocTree` paths are constrained to the target notebook root.
- Document search uses parameterized SQL for keywords and excluded IDs.
- `.sf.zip`, `.zip`, and local Markdown imports validate notebook IDs before import.
- Zip extraction limits file count, single-file size, total uncompressed size, compression ratio, and path traversal.
- Regular asset uploads limit per-request file count, single-file size, and total upload size.
- AI patch writes cannot delete or replace the current note root, and external Markdown writes regenerate block IDs.

### File Tree

- Recently edited and frequent document shortcut groups start collapsed on first use while preserving saved local collapse state.
- Added **Settings -> Appearance -> Doc tree appearance -> Doc tree font size**. Leaving it empty keeps the current theme default; custom values are clamped to 10-20 px.

### Build And Release

- Fixed a case-sensitive Protyle background import mismatch that broke Linux/WSL typecheck builds.
- Release assets now include Windows x64 installer/portable outputs and WSL Arch Linux x64 outputs.

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
