import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { createExtension } from "./core.js";
import { retrofitExtension } from "./retrofit.js";
import { verifyStandards } from "./verify.js";
import type { ToolkitResult } from "./lib/types.js";

const TEMPLATE_DIR = path.resolve(import.meta.dirname, "..", "template");

function formatCreateSummary(result: ToolkitResult): string {
	const verb = result.isUpdate ? "Updated" : "Created";
	let summary = `${verb} extension: ${result.filesCreated.length} files created`;
	if (result.filesUpdated.length > 0) summary += `, ${result.filesUpdated.length} updated`;
	if (result.filesSkipped.length > 0) summary += `, ${result.filesSkipped.length} preserved`;
	if (result.conflicts.length > 0) summary += `, ⚠ ${result.conflicts.length} conflicts`;
	return summary;
}

function formatRetrofitSummary(result: ToolkitResult): string {
	if (result.filesCreated.length === 0 && result.filesUpdated.length === 0) {
		return "No changes needed.";
	}
	let summary = `Retrofit: ${result.filesUpdated.length} files updated`;
	if (result.filesCreated.length > 0) summary += `, ${result.filesCreated.length} created`;
	return summary;
}

export function registerCommands(api: ExtensionAPI) {
	api.registerCommand("create-extension", {
		description: "Scaffold a new Pi extension using the standard template.",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const name = await ctx.ui.input("Extension name (e.g. pi-my-tool):");
			if (!name) return;

			const targetDir = await ctx.ui.input("Target directory:", `./${name}`);
			if (!targetDir) return;

			try {
				ctx.ui.setStatus("toolkit-create", `Creating ${name}...`);
				const result = await createExtension(TEMPLATE_DIR, {
					name,
					targetDir,
					force: false,
					backup: true,
				});
				ctx.ui.notify(formatCreateSummary(result), "info");
				ctx.ui.setStatus("toolkit-create", undefined);
			} catch (e) {
				ctx.ui.notify(`Failed: ${(e as Error).message}`, "error");
				ctx.ui.setStatus("toolkit-create", undefined);
			}
		},
	});

	api.registerCommand("retrofit-extension", {
		description: "Automate the 6-step checklist from RETROFIT.md.",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const targetDir = await ctx.ui.input("Target directory:", ".");
			if (!targetDir) return;

			try {
				ctx.ui.setStatus("toolkit-retrofit", `Retrofitting ${targetDir}...`);
				const result = await retrofitExtension({
					targetDir,
					force: false,
					backup: true,
				});
				ctx.ui.notify(formatRetrofitSummary(result), "info");
				ctx.ui.setStatus("toolkit-retrofit", undefined);
			} catch (e) {
				ctx.ui.notify(`Failed: ${(e as Error).message}`, "error");
				ctx.ui.setStatus("toolkit-retrofit", undefined);
			}
		},
	});

	api.registerCommand("verify-standards", {
		description: "Verify an extension against pi-extension-template standards.",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const targetDir = await ctx.ui.input("Target directory:", ".");
			if (!targetDir) return;

			try {
				const result = await verifyStandards(targetDir);
				if (result.includes("✅")) {
					ctx.ui.notify(result, "info");
				} else {
					ctx.ui.notify(`Verification failed:\n${result}`, "error");
				}
			} catch (e) {
				ctx.ui.notify(`Failed: ${(e as Error).message}`, "error");
			}
		},
	});
}
