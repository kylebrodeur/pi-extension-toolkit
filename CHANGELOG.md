## [0.3.0] - 2026-06-09

- **Safe upgrades:** Added manifest-based tracking (`.pi-extension-toolkit-manifest.json`) with SHA-256 hashes. Re-running `create_extension` or `retrofit_extension` now detects user modifications and safely skips them. Conflicts are reported with clear remediation instructions.
- **Dry-run support:** Both `create_extension` and `retrofit_extension` now accept `dryRun:true` to preview changes before executing.
- **Structured results:** All operations return typed result objects (`ToolkitResult`, `VerifyResult`, `DryRunResult`) with file lists, conflict info, and duration tracking.
- **Programmatic API:** New `api.ts` export (`import { createExtensionApi, retrofitApi, verifyApi } from 'pi-extension-toolkit/api'`) with typed interfaces for direct use by agents and scripts.
- **Backup on overwrite:** Files modified during updates are backed up to `.pi-toolkit-backup-{timestamp}` before overwriting.
- **Semantic exit codes:** Added `ExitCode` utility with codes 0-8 and 130 for programmatic error detection.
- **Footer status:** Commands now use `ctx.ui.setStatus` for real-time progress in the Pi TUI footer.
- **prepublishOnly:** Added safety script that runs build + check + tests before publish.

## [0.2.4] - 2026-06-09

- **Fixed:** Corrected error handling in tools — errors are now thrown instead of returning `isError: true`, which the SDK silently ignores.
- Added `label`, `promptSnippet`, and `promptGuidelines` to all three registered tools for better LLM guidance and TUI display.
- Updated template `package.json` with `peerDependencies`, `engines`, `repository`, `bugs`, `homepage`, and `CHANGELOG.md` in files array.
- Extended `verifyStandards` to check for peerDependencies, engines, license, repository, bugs, homepage, and CHANGELOG.md in distribution files.
- Added `AbortSignal` cancellation support to `create_extension` and `retrofit_extension` tool executions — long npm installs can now be cancelled.
- Added `onUpdate` progress streaming to `create_extension` and `retrofit_extension` for real-time status feedback during scaffold and retrofit operations.

## [0.2.3] - 2026-06-09

- Bumped @earendil-works/pi-coding-agent SDK from 0.78.1 to 0.79.0.
- Updated retrofit default SDK version reference from ^0.75.0 to ^0.79.0.
- Updated template package.json SDK dep to 0.79.0.

## [0.2.1] - 2026-06-05

- Bumped @earendil-works/pi-coding-agent SDK to 0.78.1.
- Updated tool `execute` signatures to match the new SDK API.

