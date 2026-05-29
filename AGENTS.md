# SourceFlow Development Guide

## Verification Commands

### Full verification (run before commit)
```bash
# Frontend typecheck + modularity + all structural checks
pnpm run typecheck:app

# Lint (existing warnings are pre-existing, errors must not increase)
pnpm run lint

# Go backend tests
cd ../kernel && go test ./conf/ -v

# Editor structure guide tests (alwaysShowGutter, displayBlockLineNumber, displayHeadingLevel)
pnpm run test:editor-structure-guide
pnpm run test:editor-structure-guide-bugfix
```

### Quick verification (changed files only)
```bash
pnpm run typecheck:app
```

## Architecture: Editor Config Access Pattern

### Single source of truth for null-safe config access

All editor config fields related to structure guide features must be accessed through
the centralized helper module at `protyle/util/structureGuide.ts`:

- `getEditorConfig()` — null-safe access to `window.sourceflow?.config?.editor`
- `isGutterAlwaysShow()` — null-safe check for `alwaysShowGutter` with `false` fallback
- `applyEditorStructureGuideClasses(element)` — applies CSS classes based on config

**Rule**: Never access `window.sourceflow.config.editor.alwaysShowGutter` directly.
Always import `isGutterAlwaysShow` from `structureGuide.ts`.

This prevents `TypeError: Cannot read properties of null` when backend returns invalid config,
which was the root cause of "notes fail to load after enabling settings".

## Editor Settings: Checklist for New Features

When adding a new boolean editor setting, ALL of these must be updated:

1. **Go backend**: `kernel/conf/editor.go` — field + JSON tag + default in `NewEditor()`
2. **Go backend test**: `kernel/conf/editor_test.go` — default value assertion
3. **Go API**: `kernel/api/setting.go` — `setEditor` unmarshals all fields automatically via `NewEditor()`
4. **Go model**: `kernel/model/conf.go` — add migration/normalization if needed in `InitConfBag`
5. **TypeScript types**: `app/src/types/config.d.ts` — add boolean field to `IEditor` interface
6. **Desktop settings UI**: `app/src/config/editor.ts` — HTML switch + save assignment
7. **Mobile settings UI**: `app/src/mobile/settings/editor.ts` — HTML switch + save assignment
8. **i18n**: `app/appearance/langs/zh_CN.json` + `en_US.json` — label + tip
9. **Search index**: `app/src/config/search.ts` — add key + tip to search index
10. **Runtime apply**: `app/src/protyle/util/structureGuide.ts` or equivalent — null-safe access
11. **Test**: Add test in `app/scripts/` covering Go config, TS type, i18n, UI, save, and null safety

## CSS Layout Rules

### overflow-x and pseudo-elements

`.protyle-wysiwyg` has `overflow-x: clip` and `.protyle-content` has `overflow: auto`.
Any feature using `::before` pseudo-elements positioned outside content bounds must:

1. Override `overflow-x: visible` on `.protyle-content > .protyle-wysiwyg--feature-class`
2. Downgrade `contain: layout style` to `contain: style` on affected `[data-node-id]` elements

### contain property

`[data-node-id]` uses `contain: layout style`. `layout` implies a new formatting context
that clips overflow. When features need `overflow: visible`, downgrade to `contain: style`.
