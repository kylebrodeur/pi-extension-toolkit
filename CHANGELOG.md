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

