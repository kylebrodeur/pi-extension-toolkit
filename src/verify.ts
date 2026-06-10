/**
 * Pi Extension Linter — rule-based verification of extension standards.
 *
 * Rules are defined as data objects with an id, description, check function, and severity.
 * Adding new rules is a single-line addition to the RULES array.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------

/** Severity level for a rule violation */
type Severity = "error" | "warning";

/** A single verification rule */
interface Rule {
	/** Unique identifier for the rule */
	id: string;
	/** Human-readable description of what this rule checks */
	description: string;
	/** Category for grouping */
	category: "package-json" | "config-files" | "tooling" | "ci-cd" | "source-code";
	/** Severity: error = must-fix, warning = recommended */
	severity: Severity;
	/** Check function returns a violation message or null if passed */
	check(targetDir: string, pkg: Record<string, unknown> | null): Promise<string | null>;
}

/** Result of running a single rule */
interface RuleResult {
	rule: Rule;
	passed: boolean;
	message: string | null;
}

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------

const RULES: Rule[] = [
	// --- package.json: critical ---
	{
		id: "package-exists",
		description: "package.json must exist and be valid JSON",
		category: "package-json",
		severity: "error",
		async check(targetDir, pkg) {
			return pkg ? null : "Could not read package.json. Is this a Pi extension directory?";
		},
	},
	{
		id: "package-exports",
		description: "Must have exports field for ESM and CJS consumers",
		category: "package-json",
		severity: "error",
		async check(_targetDir, pkg) {
			if (!pkg?.exports) return "Missing 'exports' in package.json";
			return null;
		},
	},
	{
		id: "package-files-dist",
		description: "files array must include dist/ so npm publish ships built output",
		category: "package-json",
		severity: "error",
		async check(_targetDir, pkg) {
			if (!Array.isArray(pkg?.files) || !pkg.files.includes("dist"))
				return "Missing 'dist' in 'files' array in package.json";
			return null;
		},
	},
	{
		id: "package-files-changelog",
		description: "files array should include CHANGELOG.md for transparency",
		category: "package-json",
		severity: "warning",
		async check(_targetDir, pkg) {
			if (Array.isArray(pkg?.files) && !pkg.files.includes("CHANGELOG.md"))
				return "Missing 'CHANGELOG.md' in 'files' array";
			return null;
		},
	},
	{
		id: "package-keywords-pi",
		description: "keywords must include pi-package for Pi registry discoverability",
		category: "package-json",
		severity: "error",
		async check(_targetDir, pkg) {
			if (!Array.isArray(pkg?.keywords) || !pkg.keywords.includes("pi-package"))
				return "Missing 'pi-package' in 'keywords' array";
			return null;
		},
	},
	{
		id: "package-pi-extensions",
		description: "pi.extensions must include ./dist for Pi auto-discovery",
		category: "package-json",
		severity: "error",
		async check(_targetDir, pkg) {
			const pi = pkg?.pi as Record<string, string[]> | undefined;
			if (!pi?.extensions?.includes("./dist")) return "Missing './dist' in 'pi.extensions' array";
			return null;
		},
	},
	{
		id: "package-type-module",
		description: "type must be module for ESM compatibility",
		category: "package-json",
		severity: "error",
		async check(_targetDir, pkg) {
			if (pkg?.type !== "module") return "'type' is not 'module' in package.json";
			return null;
		},
	},
	{
		id: "package-prepare-husky",
		description: "prepare script must be husky for git hooks",
		category: "package-json",
		severity: "error",
		async check(_targetDir, pkg) {
			const scripts = pkg?.scripts as Record<string, string> | undefined;
			if (scripts && scripts.prepare !== "husky") return "'prepare' script is not 'husky'";
			return null;
		},
	},
	{
		id: "package-typebox-devdep",
		description: "typebox must be in devDependencies, not dependencies",
		category: "package-json",
		severity: "error",
		async check(_targetDir, pkg) {
			const deps = (pkg?.dependencies as Record<string, string>) || {};
			if (deps["@sinclair/typebox"] || deps.typebox)
				return "typebox should be in devDependencies, not dependencies";
			return null;
		},
	},
	{
		id: "package-typebox-present",
		description: "typebox must be in devDependencies for schema definitions",
		category: "package-json",
		severity: "error",
		async check(_targetDir, pkg) {
			const devDeps = (pkg?.devDependencies as Record<string, string>) || {};
			if (!devDeps.typebox)
				return "Missing 'typebox' in devDependencies (must be ^1.x for Pi >=0.70.2)";
			return null;
		},
	},
	{
		id: "package-sdk-devdep",
		description: "@earendil-works/pi-coding-agent must be in devDependencies",
		category: "package-json",
		severity: "error",
		async check(_targetDir, pkg) {
			const devDeps = (pkg?.devDependencies as Record<string, string>) || {};
			if (!devDeps["@earendil-works/pi-coding-agent"])
				return "Missing '@earendil-works/pi-coding-agent' in devDependencies";
			return null;
		},
	},

	// --- package.json: metadata ---
	{
		id: "package-license",
		description: "license field should be present for open-source clarity",
		category: "package-json",
		severity: "warning",
		async check(_targetDir, pkg) {
			if (!pkg?.license) return "Missing 'license' in package.json (recommended: MIT)";
			return null;
		},
	},
	{
		id: "package-engines",
		description: "engines.node should specify minimum Node.js version",
		category: "package-json",
		severity: "warning",
		async check(_targetDir, pkg) {
			const engines = pkg?.engines as Record<string, string> | undefined;
			if (!engines?.node) return "Missing 'engines.node' in package.json (recommended: >=22.0.0)";
			return null;
		},
	},
	{
		id: "package-repository",
		description: "repository field improves discoverability on npm/GitHub",
		category: "package-json",
		severity: "warning",
		async check(_targetDir, pkg) {
			if (!pkg?.repository) return "Missing 'repository' in package.json";
			return null;
		},
	},
	{
		id: "package-bugs",
		description: "bugs URL gives users a place to report issues",
		category: "package-json",
		severity: "warning",
		async check(_targetDir, pkg) {
			if (!pkg?.bugs) return "Missing 'bugs' in package.json";
			return null;
		},
	},
	{
		id: "package-homepage",
		description: "homepage points to documentation or repo",
		category: "package-json",
		severity: "warning",
		async check(_targetDir, pkg) {
			if (!pkg?.homepage) return "Missing 'homepage' in package.json";
			return null;
		},
	},
	{
		id: "package-peer-sdk",
		description: "@earendil-works/pi-coding-agent should be in peerDependencies",
		category: "package-json",
		severity: "warning",
		async check(_targetDir, pkg) {
			const peerDeps = (pkg?.peerDependencies as Record<string, string>) || {};
			if (!peerDeps["@earendil-works/pi-coding-agent"])
				return "Missing '@earendil-works/pi-coding-agent' in peerDependencies";
			return null;
		},
	},

	// --- config files ---
	{
		id: "biome-schema",
		description: "biome.json must use the full schema URL",
		category: "config-files",
		severity: "error",
		async check(targetDir, _pkg) {
			const biomePath = path.join(targetDir, "biome.json");
			try {
				const biome = JSON.parse(await fs.readFile(biomePath, "utf-8"));
				if (biome.$schema !== "https://biomejs.dev/schemas/latest/schema.json")
					return "biome.json $schema is not 'https://biomejs.dev/schemas/latest/schema.json'";
				return null;
			} catch {
				return "Could not read biome.json or invalid JSON";
			}
		},
	},
	{
		id: "tsconfig-module",
		description: "tsconfig.json should use NodeNext module/moduleResolution",
		category: "config-files",
		severity: "error",
		async check(targetDir, _pkg) {
			const tsconfigPath = path.join(targetDir, "tsconfig.json");
			try {
				const tsconfigStr = await fs.readFile(tsconfigPath, "utf-8");
				const rules: string[] = [];
				if (
					/"module"\s*:\s*"CommonJS"/.test(tsconfigStr) ||
					/"module"\s*:\s*"Node"/.test(tsconfigStr)
				)
					rules.push("'module' should be 'NodeNext', not 'CommonJS' or 'Node'");
				if (/"moduleResolution"\s*:\s*"Node"/.test(tsconfigStr))
					rules.push("'moduleResolution' should be 'NodeNext', not 'Node'");
				if (/"target"\s*:\s*"ES2022"/.test(tsconfigStr)) rules.push("'target' should be 'ESNext'");
				return rules.length > 0 ? `tsconfig.json: ${rules.join("; ")}` : null;
			} catch {
				return "Could not read tsconfig.json";
			}
		},
	},

	// --- tooling ---
	{
		id: "husky-hook",
		description: "Husky pre-commit hook must run biome + tsc",
		category: "tooling",
		severity: "error",
		async check(targetDir, _pkg) {
			const precommitPath = path.join(targetDir, ".husky", "pre-commit");
			try {
				const precommit = await fs.readFile(precommitPath, "utf-8");
				if (!precommit.includes("biome check --write"))
					return "Husky pre-commit hook missing 'biome check --write'";
				if (!precommit.includes("git add -A")) return "Husky pre-commit hook missing 'git add -A'";
				if (!precommit.includes("tsc --noEmit"))
					return "Husky pre-commit hook missing 'tsc --noEmit'";
				return null;
			} catch {
				return "Could not read .husky/pre-commit. Husky v9 might not be configured.";
			}
		},
	},

	// --- CI/CD ---
	{
		id: "github-node-version",
		description: "GitHub Actions must use Node 22 (active LTS)",
		category: "ci-cd",
		severity: "error",
		async check(targetDir, _pkg) {
			const workflowPath = path.join(targetDir, ".github", "workflows", "release.yml");
			try {
				const workflow = await fs.readFile(workflowPath, "utf-8");
				if (workflow.includes('node-version: "20"'))
					return ".github/workflows/release.yml uses node-version: 20 (EOL), should be 22";
				if (workflow.includes('registry-url: "https://npmjs.org"'))
					return '.github/workflows/release.yml registry-url should be "https://registry.npmjs.org" for provenance';
				if (!workflow.includes("--provenance"))
					return "npm publish missing --provenance flag in release.yml";
				return null;
			} catch {
				return "Could not read .github/workflows/release.yml (Optional, but recommended for CI)";
			}
		},
	},

	// --- source code ---
	{
		id: "source-exists",
		description: "Extensions should have source code in src/",
		category: "source-code",
		severity: "warning",
		async check(targetDir, _pkg) {
			const srcDir = path.join(targetDir, "src");
			try {
				await fs.access(srcDir);
				return null;
			} catch {
				return "No src/ directory found. Pi extensions should have source code in src/.";
			}
		},
	},
	{
		id: "source-export-pattern",
		description: "index.ts should export a default function",
		category: "source-code",
		severity: "warning",
		async check(targetDir, _pkg) {
			const indexPath = path.join(targetDir, "src", "index.ts");
			try {
				const content = await fs.readFile(indexPath, "utf-8");
				if (!/export\s+default\s+(async\s+)?function/.test(content))
					return "index.ts should export a default function (e.g., export default function(pi: ExtensionAPI))";
				return null;
			} catch {
				return null; // skip if no index.ts
			}
		},
	},
	{
		id: "source-command-naming",
		description:
			"Commands should use kebab-case with namespace prefix and include getArgumentCompletions",
		category: "source-code",
		severity: "warning",
		async check(targetDir, _pkg) {
			const srcDir = path.join(targetDir, "src");
			try {
				const srcFiles = (await fs.readdir(srcDir)).filter((f) => f.endsWith(".ts"));
				const warnings: string[] = [];
				for (const file of srcFiles) {
					const content = await fs.readFile(path.join(srcDir, file), "utf-8");
					const cmdMatches = content.matchAll(/registerCommand\s*\(\s*"([^"]+)"\s*,/g);
					for (const match of cmdMatches) {
						const cmdName = match[1];
						// Allow known single-word commands from SDK examples
						if (["tools", "preset", "handoff", "summarize", "snake", "hello"].includes(cmdName))
							continue;
						if (cmdName.includes("-")) {
							// kebab-case: good, but should have autocomplete for subcommands
							if (!content.includes("getArgumentCompletions"))
								warnings.push(`/${cmdName} uses kebab-case but has no getArgumentCompletions`);
						} else {
							// bare name
							warnings.push(
								`/${cmdName} should use a prefixed namespace (e.g., /ext-toolkit ${cmdName})`
							);
						}
					}
				}
				return warnings.length > 0 ? warnings.join("; ") : null;
			} catch {
				return null;
			}
		},
	},
];

// ---------------------------------------------------------------------------
// Verification engine
// ---------------------------------------------------------------------------

export interface VerifyResult {
	passed: boolean;
	errors: { id: string; description: string; severity: Severity; message: string }[];
	warnings: { id: string; description: string; severity: Severity; message: string }[];
}

/**
 * Run all verification rules against a target directory.
 * Returns structured results with errors (must-fix) and warnings (recommended).
 */
export async function verifyStandards(targetDir: string): Promise<string> {
	return formatText(await verifyRules(targetDir));
}

/**
 * Run verification rules and return structured results.
 */
export async function verifyRules(targetDir: string): Promise<VerifyResult> {
	const absoluteTarget = path.resolve(targetDir);

	// Load package.json once for all rules
	let pkg: Record<string, unknown> | null = null;
	try {
		pkg = JSON.parse(await fs.readFile(path.join(absoluteTarget, "package.json"), "utf-8"));
	} catch {
		// pkg remains null — package-exists rule will catch this
	}

	const results: RuleResult[] = [];
	for (const rule of RULES) {
		const message = await rule.check(absoluteTarget, pkg);
		results.push({ rule, passed: message === null, message });
	}

	const errors = results
		.filter(
			(r): r is RuleResult & { message: string } =>
				!r.passed && r.message !== null && r.rule.severity === "error"
		)
		.map((r) => ({
			id: r.rule.id,
			description: r.rule.description,
			severity: r.rule.severity as Severity,
			message: r.message,
		}));

	const warnings = results
		.filter(
			(r): r is RuleResult & { message: string } =>
				!r.passed && r.message !== null && r.rule.severity === "warning"
		)
		.map((r) => ({
			id: r.rule.id,
			description: r.rule.description,
			severity: r.rule.severity as Severity,
			message: r.message,
		}));

	return {
		passed: errors.length === 0,
		errors,
		warnings,
	};
}

/**
 * Format verification results as human-readable text.
 */
export function formatText(result: VerifyResult): string {
	if (result.passed && result.warnings.length === 0) {
		return "✅ All checks passed! Extension follows the pi-extension-template standards.";
	}

	const lines: string[] = [];
	if (result.passed && result.warnings.length > 0) {
		lines.push(`✅ Core checks passed — ${result.warnings.length} recommendation(s):`);
	} else {
		lines.push(
			`Verification found ${result.errors.length} error(s) and ${result.warnings.length} warning(s):`
		);
	}

	for (const e of [...result.errors, ...result.warnings]) {
		const icon = e.severity === "error" ? "❌" : "⚠️";
		lines.push(`${icon} ${e.message}`);
	}

	return lines.join("\n");
}
