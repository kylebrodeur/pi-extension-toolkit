# pi-extension-toolkit

A specialized Pi Coding Agent extension designed to scaffold, retrofit, and verify other Pi extensions according to the `pi-extension-template` standards.

## Features

- **Create**: Scaffold a brand new extension using the official template (Node 22, TypeBox, Biome, Husky v9).
- **Retrofit**: Automatically upgrade an existing extension to meet current standards. Fixes `biome.json` schemas, updates `.github/workflows` to Node 22, configures Husky v9, and adds the required `pi` manifest fields to `package.json`.
- **Verify**: A comprehensive linter that audits your extension structure to ensure 100% compliance with Pi extension best practices.

## Installation

\`\`\`bash
pi install npm:pi-extension-toolkit
\`\`\`

## Usage

Once installed, the toolkit provides both interactive UI commands and programmatic tools for the agent.

### Commands (Interactive)
- `/create-extension` - Prompts for a name and target directory, then scaffolds the template.
- `/retrofit-extension` - Prompts for a target directory, then applies automated fixes.
- `/verify-standards` - Audits the target directory and reports any missing standards.

### Agent Tools
Your agent can autonomously call:
- `create_extension(name, targetDir)`
- `retrofit_extension(targetDir)`
- `verify_standards(targetDir)`

## Standards Enforced

- **Runtime**: Node 22 LTS
- **Package**: `type` module, ESM exports, `pi-package` keyword, `pi.extensions` manifest.
- **Dependencies**: `@earendil-works/pi-coding-agent` (latest), `typebox` (^1.1.0) in `devDependencies`.
- **Quality**: Biome (latest schema), Husky v9 pre-commit hooks (`biome check --write` & `tsc --noEmit`).
- **CI/CD**: GitHub Actions using `node-version: "22"` and `--provenance` publishing.

## License

MIT
