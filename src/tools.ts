import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createExtension } from "./core.js";
import type { DryRunResult, ToolkitResult } from "./lib/types.js";
import { retrofitExtension } from "./retrofit.js";
import { verifyStandards } from "./verify.js";

const TEMPLATE_DIR = path.resolve(import.meta.dirname, "..", "template");

/** Format a ToolkitResult as a human-readable text report */
function formatCreateResult(result: ToolkitResult): string {
	const lines: string[] = [];
	const verb = result.isUpdate ? "Updated" : "Created";

	lines.push(`# Extension ${verb}`);
	lines.push("");
	lines.push(`Target: ${result.targetDir}`);
	lines.push(`Duration: ${result.durationMs}ms`);
	lines.push(`Files created: ${result.filesCreated.length}`);

	if (result.filesUpdated.length > 0) {
		lines.push(`Files updated: ${result.filesUpdated.length}`);
		for (const f of result.filesUpdated.slice(0, 10)) {
			lines.push(`  - ${f}`);
		}
	}
	if (result.filesSkipped.length > 0) {
		lines.push(`Files preserved: ${result.filesSkipped.length} (user-modified)`);
		for (const f of result.filesSkipped.slice(0, 10)) {
			lines.push(`  - ${f}`);
		}
	}
	if (result.conflicts.length > 0) {
		lines.push("");
		lines.push(`⚠ ${result.conflicts.length} conflict(s) — re-run with force:true to overwrite:`);
		for (const c of result.conflicts.slice(0, 5)) {
			lines.push(`  - ${c}`);
		}
	}
	if (result.backupDir) {
		lines.push("");
		lines.push(`Backup: ${result.backupDir}`);
	}

	lines.push("");
	lines.push("## Next Steps");
	lines.push("1. Run `verify_standards` to check compliance");
	lines.push("2. Review `package.json` for project-specific settings");
	lines.push("3. Edit `src/index.ts` with your extension logic");
	lines.push("4. Run `npm run build` to compile");

	return lines.join("\n");
}

function formatRetrofitResult(result: ToolkitResult): string {
	const lines: string[] = [];
	lines.push(
		result.filesUpdated.length > 0 || result.filesCreated.length > 0
			? "# Retrofit Complete"
			: "# No Changes Needed"
	);

	if (result.filesCreated.length > 0) {
		lines.push("");
		lines.push("## Created");
		for (const f of result.filesCreated) lines.push(`- ${f}`);
	}
	if (result.filesUpdated.length > 0) {
		lines.push("");
		lines.push("## Updated");
		for (const f of result.filesUpdated) lines.push(`- ${f}`);
	}
	if (result.filesSkipped.length > 0) {
		lines.push("");
		lines.push("## Skipped");
		for (const f of result.filesSkipped) lines.push(`- ${f}`);
	}
	if (result.conflicts.length > 0) {
		lines.push("");
		lines.push(`⚠ ${result.conflicts.length} conflict(s) — re-run with force:true to overwrite:`);
		for (const c of result.conflicts) lines.push(`- ${c}`);
	}

	return lines.join("\n");
}

function formatDryRun(dryRun: DryRunResult): string {
	const lines: string[] = [
		`# Dry Run — ${dryRun.operation === "create" ? "Create Extension" : "Retrofit"}`,
		"",
		"## Changes that would be applied",
	];
	for (const change of dryRun.changes) {
		const icon =
			change.action === "created"
				? "+"
				: change.action === "updated"
					? "~"
					: change.action === "skipped"
						? "⊙"
						: "⚠";
		lines.push(`  ${icon} ${change.relativePath} (${change.reason})`);
	}
	lines.push("");
	lines.push("Run without dryRun:true to apply these changes.");
	return lines.join("\n");
}

export function registerTools(api: ExtensionAPI) {
	api.registerTool({
		name: "create_extension",
		label: "Create Extension",
		description:
			"Scaffold a new Pi extension using the pi-extension-template, or safely update an existing one. When re-run on an existing project, detects and preserves user modifications via manifest tracking.",
		promptSnippet: "Scaffold or safely update a Pi extension from the standard template",
		promptGuidelines: [
			"Use create_extension when the user asks to create, scaffold, or bootstrap a new Pi extension or Pi Coding Agent extension.",
			"Use create_extension with dryRun:true to preview changes before applying.",
		],
		parameters: Type.Object({
			name: Type.String({ description: "The name of the new package (e.g. pi-my-tool)" }),
			targetDir: Type.String({ description: "Directory to scaffold the extension in" }),
			dryRun: Type.Optional(
				Type.Boolean({ description: "Preview changes without executing. Default: false" })
			),
			force: Type.Optional(
				Type.Boolean({ description: "Overwrite user modifications. Default: false" })
			),
		}),
		async execute(
			toolCallId: string,
			{
				name,
				targetDir,
				dryRun,
				force,
			}: { name: string; targetDir: string; dryRun?: boolean; force?: boolean },
			signal?: AbortSignal,
			onUpdate?: (update: {
				content: Array<{ type: "text"; text: string }>;
				details?: unknown;
			}) => void
		) {
			const result = await createExtension(TEMPLATE_DIR, {
				name,
				targetDir,
				signal,
				onUpdate: (msg: string) => onUpdate?.({ content: [{ type: "text", text: msg }] }),
				dryRun,
				force,
				backup: true,
			});

			// Check if result contains a dry-run report
			if (result.conflicts.length === 1 && result.conflicts[0].startsWith("{")) {
				try {
					const dryRun = JSON.parse(result.conflicts[0]) as DryRunResult;
					return { content: [{ type: "text", text: formatDryRun(dryRun) }], details: dryRun };
				} catch {
					/* fall through */
				}
			}

			return {
				content: [{ type: "text", text: formatCreateResult(result) }],
				details: result,
			};
		},
		// biome-ignore lint/suspicious/noExplicitAny: Required for TypeBox 1.x deep inference bypass
	} as any);

	api.registerTool({
		name: "retrofit_extension",
		label: "Retrofit Extension",
		description:
			"Automate the 6-step checklist from RETROFIT.md (Biome, Husky, package.json updates). Uses manifest tracking for safe updates that preserve user modifications.",
		promptSnippet:
			"Upgrade an existing Pi extension to current standards with safe update tracking",
		promptGuidelines: [
			"Use retrofit_extension when the user asks to upgrade, fix, or modernize an existing Pi extension to meet current template standards.",
			"Use retrofit_extension with dryRun:true to preview changes before applying.",
		],
		parameters: Type.Object({
			targetDir: Type.String({ description: "Directory of the extension to retrofit" }),
			dryRun: Type.Optional(
				Type.Boolean({ description: "Preview changes without executing. Default: false" })
			),
			force: Type.Optional(
				Type.Boolean({ description: "Overwrite user modifications. Default: false" })
			),
		}),
		async execute(
			toolCallId: string,
			{ targetDir, dryRun, force }: { targetDir: string; dryRun?: boolean; force?: boolean },
			signal?: AbortSignal,
			onUpdate?: (update: {
				content: Array<{ type: "text"; text: string }>;
				details?: unknown;
			}) => void
		) {
			const result = await retrofitExtension({
				targetDir,
				signal,
				onUpdate: (msg: string) => onUpdate?.({ content: [{ type: "text", text: msg }] }),
				dryRun,
				force,
				backup: true,
			});

			// Check if result contains a dry-run report
			if (result.conflicts.length === 1 && result.conflicts[0].startsWith("{")) {
				try {
					const dryRun = JSON.parse(result.conflicts[0]) as DryRunResult;
					return { content: [{ type: "text", text: formatDryRun(dryRun) }], details: dryRun };
				} catch {
					/* fall through */
				}
			}

			return {
				content: [{ type: "text", text: formatRetrofitResult(result) }],
				details: result,
			};
		},
		// biome-ignore lint/suspicious/noExplicitAny: Required for TypeBox 1.x deep inference bypass
	} as any);

	api.registerTool({
		name: "verify_standards",
		label: "Verify Standards",
		description:
			"Verify if a Pi extension follows the template standards (Node 22, Husky v9, typebox devDep, Biome schema).",
		promptSnippet: "Audit a Pi extension for standards compliance",
		promptGuidelines: [
			"Use verify_standards when the user asks to audit, check, or validate a Pi extension against the template standards.",
		],
		parameters: Type.Object({
			targetDir: Type.String({ description: "Directory of the extension to verify" }),
		}),
		execute: async (toolCallId: string, { targetDir }: { targetDir: string }) => {
			const result = await verifyStandards(targetDir);
			return { content: [{ type: "text", text: result }] };
		},
		// biome-ignore lint/suspicious/noExplicitAny: Required for TypeBox 1.x deep inference bypass
	} as any);
}
