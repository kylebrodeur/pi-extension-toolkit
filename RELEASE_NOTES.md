# Release v0.3.0

## Highlights

### Safe Upgrades
Re-running `create_extension` or `retrofit_extension` on an existing project now uses manifest-based tracking (`.pi-extension-toolkit-manifest.json`) with SHA-256 hashes. User-modified files are detected and preserved. Conflicts are reported with clear remediation instructions. Use `force:true` to overwrite.

### Dry-Run Previews
Both `create_extension` and `retrofit_extension` accept `dryRun:true` to preview all changes before executing. Shows exactly which files would be created, updated, or skipped.

### Rule-Based Linter
`verify_standards` has been refactored to 22 named rules organized by category (`package-json`, `config-files`, `tooling`, `ci-cd`, `source-code`). Every rule has a severity (`error`/`warning`). Adding a new rule is a single object in the `RULES` array.

New checks include:
- Command naming conventions (kebab-case with namespace prefix)
- `getArgumentCompletions` presence for discoverable subcommands
- Export patterns (`export default function(pi: ExtensionAPI)`)
- Source directory existence

### Programmatic API
```typescript
import { createExtensionApi, retrofitApi, verifyApi, verifyRules } from 'pi-extension-toolkit/api';

// Structured verification
const check = await verifyApi('./my-extension');
console.log(`${check.errors.length} errors, ${check.warnings.length} warnings`);

// Safe scaffold or update
const result = await createExtensionApi({ name: 'pi-my-tool', targetDir: './' });
```

### Backup on Overwrite
Files modified during updates are backed up to `.pi-toolkit-backup-{timestamp}` before overwriting.

### Command Refactor: `/ext-toolkit`
Commands consolidated under a single namespace with tab-completion via `getArgumentCompletions`:

| Before | After |
|--------|-------|
| `/create-extension` | `/ext-toolkit create` |
| `/retrofit-extension` | `/ext-toolkit retrofit` |
| `/verify-standards` | `/ext-toolkit verify` |

### Documentation
- New `AGENTS.md` for project-level agent guidelines
- New `AGENTS.template.md` included in scaffolded projects
- Updated `README.md` with all new features and API examples
- Updated `docs/pi-extension-toolkit-learnings.md` with completed feature status

## Installation

```bash
pi install npm:pi-extension-toolkit
```

## Programmatic Usage

```bash
npm install pi-extension-toolkit
```

```typescript
import { verifyApi, retrofitApi } from 'pi-extension-toolkit/api';

const check = await verifyApi('./my-extension');
if (!check.passed) {
  await retrofitApi({ targetDir: './my-extension' });
}
```

## Breaking Changes
- Command names changed: `/create-extension` → `/ext-toolkit create`, `/retrofit-extension` → `/ext-toolkit retrofit`, `/verify-standards` → `/ext-toolkit verify`
- `verifyStandards` still returns human-readable text; `verifyRules` and `verifyApi` return structured `{ passed, errors[], warnings[] }`
- Function signatures use options objects instead of positional parameters
