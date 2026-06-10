# pi-extension-toolkit

A specialized Pi Coding Agent extension designed to scaffold, retrofit, and verify other Pi extensions according to the `pi-extension-template` standards.

## Installation

```bash
pi install npm:pi-extension-toolkit
```

## Commands

`/ext-toolkit` — Tab-completable subcommand dispatch:

| Subcommand | Description |
|-----------|-------------|
| `create` | Scaffold a new extension from the standard template |
| `retrofit` | Upgrade an existing extension to current standards |
| `verify` | Run the rule-based linter against a target directory |

## Features

- **Safe upgrades**: Manifest-based tracking (`.pi-extension-toolkit-manifest.json`) with SHA-256 hashes. Re-running operations detects and preserves user modifications. Conflicts are reported with remediation instructions.
- **Dry-run preview**: Both create and retrofit accept `dryRun:true` to preview changes before applying.
- **Rule-based linter**: 22 named rules organized by category (`package-json`, `config-files`, `tooling`, `ci-cd`, `source-code`). Adding a rule is a one-line addition to the `RULES` array.
- **Structured results**: All operations return typed result objects with file lists, conflict info, and duration tracking.
- **Programmatic API**: Import `createExtensionApi`, `retrofitApi`, `verifyApi`, `verifyRules` from `pi-extension-toolkit/api`.
- **Backup + safety**: Automatic backups before overwrites, semantic exit codes, and `prepublishOnly` CI gate.

## Agent Tools

```typescript
// Scaffold or safely update
create_extension(name, targetDir, { dryRun?, force? })

// Upgrade to current standards
retrofit_extension(targetDir, { dryRun?, force? })

// Run the rule-based linter
verify_standards(targetDir)

// Programmatic import
import { createExtensionApi, retrofitApi, verifyApi, verifyRules } from 'pi-extension-toolkit/api';
```

## Standards Enforced

- **Runtime**: Node 22 LTS
- **Package**: `type` module, ESM exports, `pi-package` keyword, `pi.extensions` manifest.
- **Dependencies**: `@earendil-works/pi-coding-agent` (latest), `typebox` (^1.1.0) in `devDependencies`.
- **Quality**: Biome (latest schema), Husky v9 pre-commit hooks (`biome check --write` & `tsc --noEmit`).
- **CI/CD**: GitHub Actions using `node-version: "22"` and `--provenance` publishing.

## License

MIT
