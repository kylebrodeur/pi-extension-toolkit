---
change_log:
  - timestamp: 2026-06-09T22:00:00Z
    agent_id: "pi-agent"
    note: "Initial creation of AGENTS.md for pi-extension-toolkit. Added AGENTS.template.md to template/ for scaffolded projects. Added RELEASE_NOTES.md for v0.3.0."
---
# Agent Operating Guidelines for pi-extension-toolkit

This document provides instructions for agents working within the `pi-extension-toolkit` project. It describes the architecture, conventions, and workflow for maintaining and extending the toolkit.

## Project Purpose

`pi-extension-toolkit` is a Pi Coding Agent extension that scaffolds, retrofits, and verifies other Pi extensions. It provides:

- **Tools**: `create_extension`, `retrofit_extension`, `verify_standards` — callable by the LLM
- **Commands**: `/ext-toolkit <create|retrofit|verify>` — interactive user commands with tab completion
- **Programmatic API**: Importable functions via `pi-extension-toolkit/api`

## Architecture

```
src/
├── index.ts              # Extension entry point (export default function(api))
├── commands.ts           # Slash command registration (/ext-toolkit)
├── tools.ts              # Tool registration + human-readable formatting
├── core.ts               # createExtension — scaffold + safe update logic
├── retrofit.ts           # retrofitExtension — package.json/biome/husky fixes
├── verify.ts             # verifyStandards — rule-based linter (22 rules)
├── api.ts                # Programmatic API export (createExtensionApi, etc.)
├── lib/
│   ├── types.ts          # Shared type definitions (ToolkitResult, etc.)
│   └── updater.ts        # Manifest tracking, computeChanges, applyChanges
└── utils/
    └── exit-codes.ts     # Semantic exit codes (0-8, 130)
```

### Layer Dependencies

```
Pi Extension (index.ts, commands.ts, tools.ts)  ← User-facing
        ↓
Programmatic API (api.ts)                       ← Importable exports
        ↓
Core Logic (core.ts, retrofit.ts, verify.ts)   ← Business logic
        ↓
Engine + Types (lib/updater.ts, lib/types.ts)  ← Foundation
```

## Conventions

### Adding a New Rule to the Linter

Add a single object to the `RULES` array in `src/verify.ts`:

```typescript
{
  id: "category-rule-name",
  description: "What this checks",
  category: "package-json" | "config-files" | "tooling" | "ci-cd" | "source-code",
  severity: "error" | "warning",
  async check(targetDir, pkg) {
    // Return violation message or null if passed
    return condition ? "Issue description" : null;
  },
}
```

### Adding a New Tool or Command

- **Tools**: Add to `src/tools.ts` with `label`, `promptSnippet`, `promptGuidelines`, `parameters`, `execute`
- **Commands**: Add a subcommand case to `/ext-toolkit` handler in `src/commands.ts`, and add the subcommand name to the `SUBCOMMANDS` array for autocomplete

### Manifest Tracking

The safe upgrade system writes `.pi-extension-toolkit-manifest.json` to target directories. This file tracks:
- `version`: toolkit version used
- `operation`: `"create"` or `"retrofit"`
- `files`: array of `{ path, hash }` for each file

On re-run, `computeChanges()` compares file hashes against the manifest to detect user modifications.

## Testing

```bash
npm run build    # TypeScript compilation
npm run check    # Biome + tsc --noEmit
npm run test     # node test.js (7 scenarios)
npm run prepublishOnly  # Full CI: build + check + test
```

The test suite (`test.js`) validates:
1. Fresh scaffold → passes all verification
2. Retrofit on fresh project → no changes needed
3. Dry-run on existing → detects safe update
4. Sabotage (broken package.json/biome.json) → verification catches issues
5. Recovery via retrofit → fixes are applied
6. Final verification → passes

## Documentation Updates

When modifying this project:
- Update `CHANGELOG.md` with changes under the current version
- Update `README.md` if user-facing features change
- Update `docs/pi-extension-toolkit-learnings.md` if new patterns are adopted

## Publishing

```bash
npm publish --access public
```

The `prepublishOnly` script gates publication on build + check + test passing.
